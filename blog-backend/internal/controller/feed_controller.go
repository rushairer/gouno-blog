package controller

import (
	"database/sql"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type FeedController struct {
	svc BlogService
	db  *sql.DB
}

func NewFeedController(svc BlogService, db *sql.DB) *FeedController {
	return &FeedController{svc: svc, db: db}
}

// RSS 2.0 Structs
type RSS struct {
	XMLName xml.Name   `xml:"rss"`
	Version string     `xml:"version,attr"`
	Channel RSSChannel `xml:"channel"`
}

type RSSChannel struct {
	Title       string    `xml:"title"`
	Link        string    `xml:"link"`
	Description string    `xml:"description"`
	Language    string    `xml:"language"`
	Items       []RSSItem `xml:"item"`
}

type RSSItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Description string `xml:"description"`
	PubDate     string `xml:"pubDate"`
	GUID        string `xml:"guid"`
}

// Sitemap Structs
type SitemapURLSet struct {
	XMLName xml.Name     `xml:"http://www.sitemaps.org/schemas/sitemap/0.9 urlset"`
	URLs    []SitemapURL `xml:"url"`
}

type SitemapURL struct {
	Loc        string `xml:"loc"`
	LastMod    string `xml:"lastmod,omitempty"`
	ChangeFreq string `xml:"changefreq,omitempty"`
	Priority   string `xml:"priority,omitempty"`
}

func (ctrl *FeedController) GetRSS(c *gin.Context) {
	posts, _, err := ctrl.svc.ListPosts(c.Request.Context(), "", "", 1, 50)
	if err != nil {
		c.String(http.StatusInternalServerError, "Error generating RSS feed")
		return
	}

	baseURL := getBaseURL(c)
	title, description := ctrl.siteIdentity(c)
	items := make([]RSSItem, 0, len(posts))
	for _, p := range posts {
		pubDate := ""
		if p.PublishedAt != nil {
			pubDate = p.PublishedAt.Format(time.RFC1123Z)
		} else {
			pubDate = p.CreatedAt.Format(time.RFC1123Z)
		}
		link := fmt.Sprintf("%s/articles/%s", baseURL, p.Slug)
		items = append(items, RSSItem{
			Title:       p.Title,
			Link:        link,
			Description: plainText(p.Summary),
			PubDate:     pubDate,
			GUID:        link,
		})
	}

	rss := RSS{
		Version: "2.0",
		Channel: RSSChannel{
			Title:       title,
			Link:        baseURL,
			Description: description,
			Language:    "zh-CN",
			Items:       items,
		},
	}

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.XML(http.StatusOK, rss)
}

func (ctrl *FeedController) GetSitemap(c *gin.Context) {
	posts, _, err := ctrl.svc.ListPosts(c.Request.Context(), "", "", 1, 500)
	if err != nil {
		c.String(http.StatusInternalServerError, "Error generating Sitemap")
		return
	}

	baseURL := getBaseURL(c)
	urls := []SitemapURL{
		{Loc: baseURL + "/", ChangeFreq: "daily", Priority: "1.0"},
		{Loc: baseURL + "/articles", ChangeFreq: "daily", Priority: "0.9"},
		{Loc: baseURL + "/categories", ChangeFreq: "weekly", Priority: "0.6"},
		{Loc: baseURL + "/tags", ChangeFreq: "weekly", Priority: "0.6"},
		{Loc: baseURL + "/archive", ChangeFreq: "weekly", Priority: "0.6"},
		{Loc: baseURL + "/about", ChangeFreq: "monthly", Priority: "0.5"},
	}

	for _, p := range posts {
		lastMod := p.UpdatedAt.Format("2006-01-02")
		urls = append(urls, SitemapURL{
			Loc:        fmt.Sprintf("%s/articles/%s", baseURL, p.Slug),
			LastMod:    lastMod,
			ChangeFreq: "weekly",
			Priority:   "0.8",
		})
	}

	sitemap := SitemapURLSet{
		URLs: urls,
	}

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.XML(http.StatusOK, sitemap)
}

func getBaseURL(c *gin.Context) string {
	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := c.GetHeader("X-Forwarded-Host")
	if host == "" {
		host = c.Request.Host
	}
	if host == "" {
		host = "localhost:8443"
	}
	return fmt.Sprintf("%s://%s", scheme, host)
}

func (ctrl *FeedController) siteIdentity(c *gin.Context) (string, string) {
	title := "Gouno Blog"
	description := "记录、思考与分享。"
	if ctrl.db == nil {
		return title, description
	}
	var raw []byte
	if err := ctrl.db.QueryRowContext(c.Request.Context(), `SELECT settings FROM site_settings WHERE id=1`).Scan(&raw); err != nil {
		return title, description
	}
	var settings map[string]string
	if err := json.Unmarshal(raw, &settings); err != nil {
		return title, description
	}
	if value := strings.TrimSpace(settings["site_title"]); value != "" {
		title = value
	}
	if value := strings.TrimSpace(settings["site_description"]); value != "" {
		description = value
	}
	return title, description
}

var markdownSyntax = regexp.MustCompile(`(?m)!\[[^\]]*\]\([^)]+\)|\[([^\]]+)\]\([^)]+\)|[#>*_~` + "`" + `-]+`)

func plainText(value string) string {
	value = markdownSyntax.ReplaceAllString(value, "$1")
	return strings.Join(strings.Fields(value), " ")
}
