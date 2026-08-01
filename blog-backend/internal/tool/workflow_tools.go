package tool

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const maxRSSBody = 2 << 20

var rssAllowedHosts = map[string]bool{
	"openai.com": true, "www.openai.com": true, "blog.google": true,
	"www.blog.google": true, "blogs.microsoft.com": true, "www.microsoft.com": true,
	"techcrunch.com": true, "www.techcrunch.com": true,
	"technologyreview.com": true, "www.technologyreview.com": true,
}

type rssFeed struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}
type rssRequest struct {
	Feeds      []rssFeed `json:"feeds"`
	MaxPerFeed int       `json:"max_per_feed"`
	MaxItems   int       `json:"max_items"`
}
type feedDoc struct {
	Channel struct {
		Items []feedItem `xml:"item"`
	} `xml:"channel"`
	Entries []feedItem `xml:"entry"`
}
type feedItem struct {
	Title string `xml:"title"`
	Link  struct {
		Href string `xml:"href,attr"`
		Text string `xml:",chardata"`
	} `xml:"link"`
	ID          string `xml:"guid"`
	Description string `xml:"description"`
	Published   string `xml:"published"`
	Updated     string `xml:"updated"`
	PubDate     string `xml:"pubDate"`
}

func fetchRSS(ctx context.Context, raw json.RawMessage) (any, error) {
	var args rssRequest
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	if args.MaxPerFeed == 0 {
		args.MaxPerFeed = 10
	}
	if args.MaxItems == 0 {
		args.MaxItems = 50
	}
	if len(args.Feeds) == 0 || len(args.Feeds) > 10 || args.MaxPerFeed < 1 || args.MaxPerFeed > 20 || args.MaxItems < 1 || args.MaxItems > 50 {
		return nil, ErrInvalidArgument
	}
	client := &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 || req.URL.Scheme != "https" || !rssAllowedHosts[strings.ToLower(req.URL.Hostname())] {
			return errors.New("RSS redirect outside configured allowlist")
		}
		return nil
	}}
	seen := map[string]bool{}
	items := make([]map[string]any, 0)
	for _, feed := range args.Feeds {
		u, err := url.Parse(feed.URL)
		if err != nil || u.Scheme != "https" || !rssAllowedHosts[strings.ToLower(u.Hostname())] {
			return nil, fmt.Errorf("%w: RSS feed is outside configured allowlist", ErrInvalidArgument)
		}
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
		req.Header.Set("User-Agent", "GounoAgent/1.0")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxRSSBody+1))
		resp.Body.Close()
		if readErr != nil || resp.StatusCode < 200 || resp.StatusCode >= 300 || len(body) > maxRSSBody {
			continue
		}
		var doc feedDoc
		if xml.Unmarshal(body, &doc) != nil {
			continue
		}
		values := doc.Channel.Items
		if len(values) == 0 {
			values = doc.Entries
		}
		for i, item := range values {
			if i >= args.MaxPerFeed || len(items) >= args.MaxItems {
				break
			}
			link := strings.TrimSpace(item.Link.Href)
			if link == "" {
				link = strings.TrimSpace(item.Link.Text)
			}
			linkURL, err := url.Parse(link)
			if err != nil || linkURL.Scheme != "https" || !rssAllowedHosts[strings.ToLower(linkURL.Hostname())] {
				continue
			}
			key := item.ID
			if key == "" {
				key = link
			}
			sum := sha256.Sum256([]byte(key))
			hash := fmt.Sprintf("%x", sum[:])
			if seen[hash] {
				continue
			}
			seen[hash] = true
			items = append(items, map[string]any{"source_name": feed.Name, "feed_url": feed.URL, "url": link, "title": strings.TrimSpace(item.Title), "summary": strings.TrimSpace(item.Description), "published_at": firstRSSDate(item.Published, item.Updated, item.PubDate)})
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		return fmt.Sprint(items[i]["published_at"]) > fmt.Sprint(items[j]["published_at"])
	})
	return map[string]any{"items": items}, nil
}

func firstRSSDate(values ...string) string {
	for _, value := range values {
		for _, layout := range []string{time.RFC3339, time.RFC1123Z, time.RFC1123} {
			if parsed, err := time.Parse(layout, strings.TrimSpace(value)); err == nil {
				return parsed.UTC().Format(time.RFC3339)
			}
		}
	}
	return ""
}

func parseJSON(_ context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		Text string `json:"text"`
	}
	if err := decodeArguments(raw, &args); err != nil || len(args.Text) > 50000 {
		return nil, ErrInvalidArgument
	}
	start, end := strings.Index(args.Text, "{"), strings.LastIndex(args.Text, "}")
	if start < 0 || end <= start {
		return nil, ErrInvalidArgument
	}
	var value map[string]any
	if err := json.Unmarshal([]byte(args.Text[start:end+1]), &value); err != nil {
		return nil, ErrInvalidArgument
	}
	return value, nil
}
