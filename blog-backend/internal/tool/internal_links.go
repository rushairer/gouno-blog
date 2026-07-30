package tool

import (
	"context"
	"encoding/json"
	"net/url"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/rushairer/blog-backend/internal/domain"
)

type internalLinkCandidate struct {
	PostID     int64    `json:"post_id"`
	Title      string   `json:"title"`
	Slug       string   `json:"slug"`
	Summary    string   `json:"summary"`
	Tags       []string `json:"tags"`
	Score      int      `json:"score"`
	MatchHints []string `json:"match_hints"`
}

func (t *BlogTools) findInternalLinks(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		ID    int64 `json:"id"`
		Limit int   `json:"limit"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	if args.Limit <= 0 {
		args.Limit = 5
	}
	if args.Limit > 10 {
		return nil, ErrInvalidArgument
	}
	source, err := t.posts.GetAdminPost(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	candidates, _, err := t.posts.ListPosts(ctx, "", "", 1, 100)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"post_id":     source.ID,
		"suggestions": rankInternalLinkCandidates(source, candidates, args.Limit),
	}, nil
}

func rankInternalLinkCandidates(source *domain.Post, candidates []*domain.Post, limit int) []internalLinkCandidate {
	if source == nil || limit <= 0 {
		return []internalLinkCandidate{}
	}
	sourceText := strings.ToLower(source.Title + "\n" + source.Summary + "\n" + source.Content)
	sourceTags := make(map[string]struct{}, len(source.Tags))
	for _, tag := range source.Tags {
		if normalized := normalizeMatchText(tag); normalized != "" {
			sourceTags[normalized] = struct{}{}
		}
	}
	existing := linkedSlugs(source.Content)
	result := make([]internalLinkCandidate, 0)
	for _, candidate := range candidates {
		if candidate == nil || candidate.ID == source.ID || candidate.Slug == "" {
			continue
		}
		if _, alreadyLinked := existing[candidate.Slug]; alreadyLinked {
			continue
		}
		score, hints := internalLinkScore(sourceText, sourceTags, candidate)
		if score == 0 {
			continue
		}
		result = append(result, internalLinkCandidate{
			PostID: candidate.ID, Title: candidate.Title, Slug: candidate.Slug, Summary: candidate.Summary,
			Tags: candidate.Tags, Score: score, MatchHints: hints,
		})
	}
	slices.SortFunc(result, func(a, b internalLinkCandidate) int {
		if a.Score != b.Score {
			return b.Score - a.Score
		}
		return strings.Compare(a.Slug, b.Slug)
	})
	if len(result) > limit {
		result = result[:limit]
	}
	return result
}

func internalLinkScore(sourceText string, sourceTags map[string]struct{}, candidate *domain.Post) (int, []string) {
	score := 0
	hints := make([]string, 0, 3)
	for _, tag := range candidate.Tags {
		if _, matches := sourceTags[normalizeMatchText(tag)]; matches {
			score += 4
			hints = append(hints, "shared tag: "+tag)
		}
	}
	title := strings.ToLower(strings.TrimSpace(candidate.Title))
	if utf8.RuneCountInString(title) >= 4 && strings.Contains(sourceText, title) {
		score += 4
		hints = append(hints, "title mentioned in source")
	}
	for _, keyword := range matchKeywords(candidate.Title) {
		if strings.Contains(sourceText, keyword) {
			score++
			if len(hints) < 3 {
				hints = append(hints, "keyword: "+keyword)
			}
		}
	}
	return score, hints
}

func linkedSlugs(markdown string) map[string]struct{} {
	result := make(map[string]struct{})
	for _, match := range markdownLinkTarget.FindAllStringSubmatch(markdown, -1) {
		if len(match) < 2 || strings.HasPrefix(match[0], "!") {
			continue
		}
		parsed, err := url.Parse(strings.TrimSpace(match[1]))
		if err != nil || parsed.IsAbs() {
			continue
		}
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		if len(parts) == 2 && (parts[0] == "articles" || parts[0] == "posts") && parts[1] != "" {
			result[parts[1]] = struct{}{}
		}
	}
	return result
}

func matchKeywords(value string) []string {
	return strings.FieldsFunc(strings.ToLower(value), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
}

func normalizeMatchText(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}
