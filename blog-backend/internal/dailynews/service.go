package dailynews

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	"github.com/rushairer/blog-backend/internal/service"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

var ErrNotReady = errors.New("daily news is not ready to publish")

const (
	maxPerFeed    = 12
	maxCandidates = 50
)

type Feed struct {
	Name, URL string
	Hosts     []string
}

var DefaultFeeds = []Feed{
	{"OpenAI 官方公告", "https://openai.com/news/rss.xml", []string{"openai.com", "www.openai.com"}},
	{"Google AI 官方公告", "https://blog.google/technology/ai/rss/", []string{"blog.google", "www.blog.google"}},
	{"Microsoft AI 官方公告", "https://blogs.microsoft.com/blog/tag/ai/feed/", []string{"blogs.microsoft.com", "www.microsoft.com"}},
	{"TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/", []string{"techcrunch.com", "www.techcrunch.com"}},
	{"MIT Technology Review AI", "https://www.technologyreview.com/topic/artificial-intelligence/feed/", []string{"technologyreview.com", "www.technologyreview.com"}},
}

type Service struct {
	repo   *Repository
	agents *agentservice.ManagementService
	posts  *service.PostService
	http   *http.Client
	now    func() time.Time
	feeds  []Feed
}

func NewService(repo *Repository, agents *agentservice.ManagementService, posts *service.PostService) *Service {
	return &Service{repo: repo, agents: agents, posts: posts, http: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error { return nil }}, now: time.Now, feeds: DefaultFeeds}
}
func location(name string) *time.Location {
	l, e := time.LoadLocation(name)
	if e != nil {
		return time.UTC
	}
	return l
}

// RunWorkflow executes the same guarded RSS-to-post operation synchronously as
// a normal Workflow step. The Workflow owns triggering, scheduling and UI.
func (s *Service) RunWorkflow(ctx context.Context) (*domain.DailyNewsRun, error) {
	job, err := s.repo.Job(ctx)
	if err != nil {
		return nil, err
	}
	loc := location(job.Timezone)
	day := s.now().In(loc)
	date := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, loc)
	run, claimed, err := s.repo.Claim(ctx, date, "workflow")
	if err != nil {
		return nil, err
	}
	if !claimed {
		if run.Status == "succeeded" {
			return run, nil
		}
		if run.Status == "running" {
			return nil, errors.New("daily news is already running")
		}
	}
	s.execute(ctx, run, date, job)
	result, err := s.repo.RunForDate(ctx, date)
	if err != nil {
		return nil, err
	}
	if result.Status == "failed" {
		return result, errors.New(result.ErrorMessage)
	}
	return result, nil
}
func (s *Service) execute(ctx context.Context, run *domain.DailyNewsRun, date time.Time, job *domain.DailyNewsJob) {
	values, err := s.Fetch(ctx)
	if err == nil {
		err = s.repo.SaveSources(ctx, run.ID, values)
	}
	if err != nil {
		s.fail(ctx, run, err)
		return
	}
	if len(values) < 3 {
		s.fail(ctx, run, fmt.Errorf("only %d verified RSS items were available; at least 3 are required", len(values)))
		return
	}
	if len(values) > 5 {
		values = values[:5]
	}
	profile, client, err := s.agents.DefaultWritingClient(ctx)
	if err != nil {
		s.fail(ctx, run, fmt.Errorf("default writing Provider: %w", err))
		return
	}
	content, attempts, err := generate(ctx, client, date, values, profile.MaxOutputTokens)
	if err != nil {
		s.failWith(ctx, run, len(values), profile, max(attempts-1, 0), err)
		return
	}
	if err = validate(content, date, values); err != nil {
		s.failWith(ctx, run, len(values), profile, max(attempts-1, 0), err)
		return
	}
	title := titleFor(date)
	post := &domain.Post{Title: title, Content: content, Status: domain.PostStatusPublished, Tags: []string{"AI", "每日资讯"}}
	if err = s.posts.CreatePost(ctx, post); err != nil {
		s.failWith(ctx, run, len(values), profile, max(attempts-1, 0), fmt.Errorf("publish daily news: %w", err))
		return
	}
	_ = s.repo.Finish(ctx, run.ID, "succeeded", len(values), &post.ID, string(profile.ProviderType), profile.Model, attempts-1, "")
	_ = s.repo.MarkSuccessDate(ctx, date)
}
func (s *Service) fail(ctx context.Context, run *domain.DailyNewsRun, err error) {
	s.failWith(ctx, run, 0, nil, 0, err)
}
func (s *Service) failWith(ctx context.Context, run *domain.DailyNewsRun, count int, p *domain.ProviderProfile, retries int, err error) {
	providerName, model := "", ""
	if p != nil {
		providerName = string(p.ProviderType)
		model = p.Model
	}
	msg := err.Error()
	_ = s.repo.Finish(ctx, run.ID, "failed", count, nil, providerName, model, retries, msg)
}
func (s *Service) Fetch(ctx context.Context) ([]domain.DailyNewsSource, error) {
	out := []domain.DailyNewsSource{}
	seen := map[string]bool{}
	for _, feed := range s.feeds {
		items, err := s.fetchFeed(ctx, feed)
		if err != nil {
			continue
		}
		for _, v := range items {
			if !seen[v.DedupeKey] {
				seen[v.DedupeKey] = true
				out = append(out, v)
				if len(out) >= maxCandidates {
					break
				}
			}
		}
		if len(out) >= maxCandidates {
			break
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i].PublishedAt, out[j].PublishedAt
		if a == nil {
			return false
		}
		if b == nil {
			return true
		}
		return a.After(*b)
	})
	return out, nil
}

type rss struct {
	Channel struct {
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
	Entries []rssItem `xml:"entry"`
}
type rssLink struct {
	Href string `xml:"href,attr"`
	Text string `xml:",chardata"`
}
type rssItem struct {
	Title       string  `xml:"title"`
	Link        rssLink `xml:"link"`
	GUID        string  `xml:"guid"`
	Description string  `xml:"description"`
	PubDate     string  `xml:"pubDate"`
	Updated     string  `xml:"updated"`
	Published   string  `xml:"published"`
}

func (s *Service) fetchFeed(ctx context.Context, feed Feed) ([]domain.DailyNewsSource, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GounoDailyNews/1.0")
	client := *s.http
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many feed redirects")
		}
		if req.URL.Scheme != "https" || !allowed(req.URL.Hostname(), feed.Hosts) {
			return errors.New("feed redirected outside allowlist")
		}
		return nil
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s returned %d", feed.Name, resp.StatusCode)
	}
	if resp.Request.URL.Scheme != "https" || !allowed(resp.Request.URL.Hostname(), feed.Hosts) {
		return nil, errors.New("feed redirected outside allowlist")
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, (2<<20)+1))
	if err != nil {
		return nil, err
	}
	if len(body) > 2<<20 {
		return nil, errors.New("feed response exceeds 2 MiB")
	}
	var parsed rss
	if err = xml.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	items := parsed.Channel.Items
	if len(items) == 0 {
		items = parsed.Entries
	}
	out := []domain.DailyNewsSource{}
	for _, item := range items {
		if len(out) >= maxPerFeed {
			break
		}
		raw := strings.TrimSpace(item.Link.Href)
		if raw == "" {
			raw = strings.TrimSpace(item.Link.Text)
		}
		u, e := url.Parse(raw)
		if e != nil || u.Scheme != "https" || !allowed(u.Hostname(), feed.Hosts) {
			continue
		}
		published := parseTime(item.PubDate, item.Updated, item.Published)
		identity := strings.TrimSpace(item.GUID)
		if identity == "" {
			identity = normalize(raw)
		}
		if identity == "" {
			identity = strings.TrimSpace(item.Title) + "|" + published.Format(time.RFC3339)
		}
		key := hash(identity)
		out = append(out, domain.DailyNewsSource{SourceName: feed.Name, FeedURL: feed.URL, OriginalURL: raw, GUID: strings.TrimSpace(item.GUID), Title: strings.TrimSpace(item.Title), PublishedAt: &published, FetchedAt: s.now().UTC(), Summary: strip(item.Description), DedupeKey: key})
	}
	return out, nil
}
func allowed(host string, hosts []string) bool {
	host = strings.ToLower(host)
	for _, h := range hosts {
		if host == h {
			return true
		}
	}
	return false
}
func parseTime(values ...string) time.Time {
	for _, v := range values {
		for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC3339} {
			if d, e := time.Parse(layout, strings.TrimSpace(v)); e == nil {
				return d
			}
		}
	}
	return time.Time{}
}
func normalize(v string) string {
	u, e := url.Parse(v)
	if e != nil {
		return v
	}
	u.Fragment = ""
	return u.String()
}
func hash(v string) string { h := sha256.Sum256([]byte(v)); return fmt.Sprintf("%x", h[:]) }
func strip(v string) string {
	return strings.TrimSpace(strings.NewReplacer("<p>", "", "</p>", "", "<br>", " ", "<br/>", " ").Replace(v))
}
func titleFor(d time.Time) string {
	return fmt.Sprintf("AI每日资讯 - %04d年%02d月%02d日", d.Year(), d.Month(), d.Day())
}

type generatedNews struct {
	Items  []generatedNewsItem `json:"items"`
	Trends []string            `json:"trends"`
}

type generatedNewsItem struct {
	SourceIndex    int    `json:"source_index"`
	Title          string `json:"title"`
	Fact           string `json:"fact"`
	Impact         string `json:"impact"`
	Interpretation string `json:"interpretation"`
}

func parseGenerated(text string, sourceCount int) (*generatedNews, error) {
	start, end := strings.Index(text, "{"), strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return nil, errors.New("response does not contain a JSON object")
	}
	var value generatedNews
	if err := json.Unmarshal([]byte(text[start:end+1]), &value); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	if len(value.Items) != sourceCount {
		return nil, fmt.Errorf("expected %d items, got %d", sourceCount, len(value.Items))
	}
	if len(value.Trends) < 1 || len(value.Trends) > 3 {
		return nil, fmt.Errorf("expected 1-3 trends, got %d", len(value.Trends))
	}
	used := make(map[int]bool, sourceCount)
	for i := range value.Items {
		item := &value.Items[i]
		if item.SourceIndex < 1 || item.SourceIndex > sourceCount || used[item.SourceIndex] {
			return nil, fmt.Errorf("item %d has invalid or duplicate source_index %d", i+1, item.SourceIndex)
		}
		used[item.SourceIndex] = true
		fields := []*string{&item.Title, &item.Fact, &item.Impact, &item.Interpretation}
		for _, field := range fields {
			*field = strings.Join(strings.Fields(*field), " ")
			if *field == "" {
				return nil, fmt.Errorf("item %d contains an empty content field", i+1)
			}
		}
	}
	for i := range value.Trends {
		value.Trends[i] = strings.Join(strings.Fields(value.Trends[i]), " ")
		if value.Trends[i] == "" {
			return nil, fmt.Errorf("trend %d is empty", i+1)
		}
	}
	return &value, nil
}

func renderGenerated(date time.Time, sources []domain.DailyNewsSource, value *generatedNews) string {
	var out strings.Builder
	fmt.Fprintf(&out, "# %s\n\n> 今日速览：%d 条最值得关注的 AI 行业动态。\n", titleFor(date), len(value.Items))
	for i, item := range value.Items {
		source := sources[item.SourceIndex-1]
		name := strings.TrimSpace(source.SourceName)
		if name == "" {
			name = "官方公告"
		}
		fmt.Fprintf(&out, "\n## %d. %s\n**来源**：%s｜[原文链接](%s)\n**发生了什么**：%s\n**为什么值得关注**：%s\n**Gouno 解读**：解读：%s\n", i+1, item.Title, name, source.OriginalURL, item.Fact, item.Impact, item.Interpretation)
	}
	out.WriteString("\n## 今日趋势\n")
	for _, trend := range value.Trends {
		fmt.Fprintf(&out, "- %s\n", trend)
	}
	out.WriteString("\n---\n**说明**：内容由公开资讯源汇总生成；原始信息以链接来源为准。")
	return out.String()
}

func generate(ctx context.Context, c provider.Provider, date time.Time, sources []domain.DailyNewsSource, max int) (string, int, error) {
	payload, _ := json.Marshal(sources)
	instruction := `Use only the supplied source snapshots to prepare a Chinese AI daily-news draft. Never invent a source or fact. Return one JSON object only, without Markdown or code fences, using exactly this schema:
{"items":[{"source_index":1,"title":"资讯标题","fact":"1–2句事实摘要","impact":"对开发者、产品或行业的影响","interpretation":"明确属于推断的Gouno解读"}],"trends":["跨资讯归纳"]}
Requirements: output exactly one item for every supplied source; source_index is the 1-based position in Sources and each index is used exactly once; fact contains facts supported by that source snapshot; interpretation must be cautious and clearly distinguish inference from fact; return 1-3 non-invented trends. Do not return URLs, source names, headings, Markdown, commentary, or any keys outside the schema. The server will attach verified sources and render the fixed Markdown format.`
	var last error
	for attempt := 1; attempt <= 3; attempt++ {
		r, e := c.Generate(ctx, provider.Request{Instructions: instruction, Messages: []provider.Message{{Role: "user", Content: fmt.Sprintf("Date: %s\nSources: %s", date.Format("2006-01-02"), payload)}}, MaxTokens: min(max, 2200)})
		if e == nil {
			value, parseErr := parseGenerated(r.Text, len(sources))
			if parseErr == nil {
				content := renderGenerated(date, sources, value)
				if validateErr := validate(content, date, sources); validateErr == nil {
					return content, attempt, nil
				} else {
					parseErr = validateErr
				}
			}
			last = fmt.Errorf("Provider returned invalid structured daily-news content: %w", parseErr)
		} else {
			last = e
			if !retryable(e) {
				return "", attempt, fmt.Errorf("provider failed after %d attempt(s): %w", attempt, last)
			}
		}
		if attempt == 3 {
			return "", attempt, fmt.Errorf("provider failed after %d attempt(s): %w", attempt, last)
		}
		select {
		case <-ctx.Done():
			return "", attempt, ctx.Err()
		case <-time.After(time.Duration(1<<(attempt-1)) * time.Second):
		}
	}
	return "", 3, fmt.Errorf("provider failed after 3 attempts: %w", last)
}
func retryable(e error) bool {
	s := strings.ToLower(e.Error())
	return strings.Contains(s, "timeout") || strings.Contains(s, "deadline") || strings.Contains(s, "429") || strings.Contains(s, "returned 5")
}
func validate(content string, date time.Time, sources []domain.DailyNewsSource) error {
	if len(sources) < 3 || len(sources) > 5 {
		return fmt.Errorf("daily news must use 3-5 sources, got %d", len(sources))
	}
	expectedOverview := fmt.Sprintf("> 今日速览：%d 条最值得关注的 AI 行业动态。", len(sources))
	footer := "---\n**说明**：内容由公开资讯源汇总生成；原始信息以链接来源为准。"
	if !strings.HasPrefix(content, "# "+titleFor(date)+"\n") || !strings.Contains(content, expectedOverview) || !strings.Contains(content, "\n## 今日趋势\n") || !strings.HasSuffix(strings.TrimSpace(content), footer) {
		return errors.New("default writing Provider returned non-compliant Markdown (header, overview count, trend section, or fixed footer differs); retry this Workflow, or test/change the default writing Provider")
	}
	heading := regexp.MustCompile(`(?m)^## ([1-5])\. .+$`)
	matches := heading.FindAllStringSubmatchIndex(content, -1)
	if len(matches) != len(sources) {
		return fmt.Errorf("model output must contain %d numbered news items, got %d", len(sources), len(matches))
	}
	used := map[string]bool{}
	for i, match := range matches {
		if content[match[2]:match[3]] != fmt.Sprint(i+1) {
			return errors.New("model output news headings must be sequential")
		}
		end := len(content)
		if i+1 < len(matches) {
			end = matches[i+1][0]
		} else if trend := strings.Index(content[match[1]:], "\n## 今日趋势\n"); trend >= 0 {
			end = match[1] + trend
		}
		section := content[match[0]:end]
		for _, marker := range []string{"**来源**：", "**发生了什么**：", "**为什么值得关注**：", "**Gouno 解读**："} {
			if strings.Count(section, marker) != 1 {
				return fmt.Errorf("news item %d must contain exactly one %s field", i+1, marker)
			}
		}
		matched := ""
		for _, source := range sources {
			if strings.Contains(section, source.OriginalURL) {
				if matched != "" {
					return fmt.Errorf("news item %d contains multiple source links", i+1)
				}
				matched = source.OriginalURL
			}
		}
		if matched == "" {
			return fmt.Errorf("news item %d does not map to a verified source", i+1)
		}
		if used[matched] {
			return fmt.Errorf("source link is reused: %s", matched)
		}
		used[matched] = true
	}
	for _, source := range sources {
		if !used[source.OriginalURL] {
			return fmt.Errorf("model output omitted source link: %s", source.OriginalURL)
		}
	}
	return nil
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
