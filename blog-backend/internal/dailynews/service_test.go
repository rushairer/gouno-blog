package dailynews

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
)

type retryProvider struct{ calls int }

func (p *retryProvider) Name() string  { return "test" }
func (p *retryProvider) Model() string { return "test" }
func (p *retryProvider) Generate(context.Context, provider.Request) (provider.Result, error) {
	p.calls++
	if p.calls < 3 {
		return provider.Result{}, errors.New("request timeout")
	}
	return provider.Result{Text: `{"items":[{"source_index":1,"title":"标题1","fact":"事实1","impact":"影响1","interpretation":"推断1"},{"source_index":2,"title":"标题2","fact":"事实2","impact":"影响2","interpretation":"推断2"},{"source_index":3,"title":"标题3","fact":"事实3","impact":"影响3","interpretation":"推断3"}],"trends":["趋势"]}`}, nil
}

func TestGenerateRetriesTimeoutAtMostThreeTimes(t *testing.T) {
	p := &retryProvider{}
	sources := []domain.DailyNewsSource{{SourceName: "官方", OriginalURL: "https://example.com/a"}, {SourceName: "官方", OriginalURL: "https://example.com/b"}, {SourceName: "官方", OriginalURL: "https://example.com/c"}}
	text, attempts, err := generate(context.Background(), p, time.Now(), sources, 20)
	if err != nil || !strings.Contains(text, "[原文链接](https://example.com/a)") || attempts != 3 || p.calls != 3 {
		t.Fatalf("generate retry result text=%q attempts=%d calls=%d err=%v", text, attempts, p.calls, err)
	}
}

type structuredProvider struct{ text string }

func (p structuredProvider) Name() string  { return "test" }
func (p structuredProvider) Model() string { return "test" }
func (p structuredProvider) Generate(context.Context, provider.Request) (provider.Result, error) {
	return provider.Result{Text: p.text}, nil
}

func TestGenerateRendersFixedMarkdownAndServerOwnedSourceLinks(t *testing.T) {
	date := time.Date(2026, 8, 1, 0, 0, 0, 0, time.Local)
	sources := []domain.DailyNewsSource{
		{SourceName: "One", OriginalURL: "https://example.com/1"},
		{SourceName: "Two", OriginalURL: "https://example.com/2"},
		{SourceName: "Three", OriginalURL: "https://example.com/3"},
	}
	raw := `Here is the JSON:\n\n\x60\x60\x60json\n{"items":[{"source_index":2,"title":"B","fact":"事实B","impact":"影响B","interpretation":"推断B"},{"source_index":1,"title":"A","fact":"事实A","impact":"影响A","interpretation":"推断A"},{"source_index":3,"title":"C","fact":"事实C","impact":"影响C","interpretation":"推断C"}],"trends":["趋势"]}\n\x60\x60\x60`
	raw = strings.ReplaceAll(raw, `\x60`, "`")
	content, attempts, err := generate(context.Background(), structuredProvider{text: raw}, date, sources, 2200)
	if err != nil || attempts != 1 {
		t.Fatalf("generate attempts=%d err=%v", attempts, err)
	}
	if err := validate(content, date, sources); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(content, "**来源**：Two｜[原文链接](https://example.com/2)") || strings.Contains(content, "```") {
		t.Fatalf("server did not render verified fixed Markdown: %s", content)
	}
}

func TestFetchDeduplicatesRSSItemsAndRejectsExternalLinks(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><item><title>One</title><link>` + "https://" + r.Host + `/one</link><guid>same</guid><pubDate>Mon, 02 Jan 2006 15:04:05 -0700</pubDate></item><item><title>One duplicate</title><link>` + "https://" + r.Host + `/one</link><guid>same</guid></item><item><title>Bad</title><link>https://evil.example/bad</link></item></channel></rss>`))
	}))
	defer server.Close()
	host, _, _ := net.SplitHostPort(strings.TrimPrefix(server.URL, "https://"))
	s := &Service{http: server.Client(), now: time.Now, feeds: []Feed{{Name: "test", URL: server.URL, Hosts: []string{host}}}}
	items, err := s.Fetch(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].OriginalURL != server.URL+"/one" {
		t.Fatalf("items=%+v", items)
	}
}

func TestValidateRequiresFixedFormatAndAllSourceLinks(t *testing.T) {
	date := time.Date(2026, 8, 1, 0, 0, 0, 0, time.Local)
	sources := []domain.DailyNewsSource{{OriginalURL: "https://example.com/1"}, {OriginalURL: "https://example.com/2"}, {OriginalURL: "https://example.com/3"}}
	content := "# " + titleFor(date) + "\n\n> 今日速览：3 条最值得关注的 AI 行业动态。\n\n## 1. A\n**来源**：官方｜[原文链接](https://example.com/1)\n**发生了什么**：事实。\n**为什么值得关注**：影响。\n**Gouno 解读**：推断。\n\n## 2. B\n**来源**：官方｜[原文链接](https://example.com/2)\n**发生了什么**：事实。\n**为什么值得关注**：影响。\n**Gouno 解读**：推断。\n\n## 3. C\n**来源**：官方｜[原文链接](https://example.com/3)\n**发生了什么**：事实。\n**为什么值得关注**：影响。\n**Gouno 解读**：推断。\n\n## 今日趋势\n- 仅归纳。\n\n---\n**说明**：内容由公开资讯源汇总生成；原始信息以链接来源为准。"
	if err := validate(content, date, sources); err != nil {
		t.Fatal(err)
	}
	if err := validate(strings.Replace(content, "https://example.com/3", "", 1), date, sources); err == nil {
		t.Fatal("expected missing source link to be rejected")
	}
	duplicate := strings.Replace(content, "https://example.com/2", "https://example.com/1", 1)
	if err := validate(duplicate, date, sources); err == nil {
		t.Fatal("expected reused source link to be rejected")
	}
}

func TestFetchParsesAtomHrefLinks(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/atom+xml")
		_, _ = w.Write([]byte(`<?xml version="1.0"?><feed><entry><title>Atom item</title><link href="https://` + r.Host + `/atom"/><id>atom-guid</id><updated>2026-08-01T08:00:00Z</updated></entry></feed>`))
	}))
	defer server.Close()
	host, _, _ := net.SplitHostPort(strings.TrimPrefix(server.URL, "https://"))
	s := &Service{http: server.Client(), now: time.Now, feeds: []Feed{{Name: "atom", URL: server.URL, Hosts: []string{host}}}}
	items, err := s.Fetch(context.Background())
	if err != nil || len(items) != 1 || items[0].OriginalURL != server.URL+"/atom" {
		t.Fatalf("items=%+v err=%v", items, err)
	}
}
