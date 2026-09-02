package agent

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/media"
	"github.com/rushairer/blog-backend/internal/provider"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
)

const editorTemplateVersion = 1

// GenerationService is the shared, non-Agent execution layer for interactive
// editor assistance and governed media-generation tasks. It deliberately does
// not create Agent Runs or grant Tool capabilities.
type GenerationService struct {
	repo       *repository.AgentRepository
	management *ManagementService
	growth     *service.GrowthService
	media      media.Store
}

type EditorTextRequest struct {
	Task       string
	Title      string
	Summary    string
	Content    string
	Prompt     string
	Categories []string
}

type TextGenerationResult struct {
	Text     string
	Provider string
	Model    string
}

type ImageGenerationRequest struct {
	Prompt             string
	AltText            string
	CreatorPrincipalID int64
	Source             string
	Operation          string
	Deadline           time.Duration
	AgentRunID         *int64
	WorkflowRunID      *int64
	MediaCandidateID   *int64
	Filename           string
}

func NewGenerationService(repo *repository.AgentRepository, management *ManagementService, growth *service.GrowthService, store media.Store) *GenerationService {
	return &GenerationService{repo: repo, management: management, growth: growth, media: store}
}

func (s *GenerationService) GenerateEditorText(ctx context.Context, req EditorTextRequest) (*TextGenerationResult, error) {
	req.Task = strings.TrimSpace(req.Task)
	req.Title, req.Summary, req.Content, req.Prompt = strings.TrimSpace(req.Title), strings.TrimSpace(req.Summary), strings.TrimSpace(req.Content), strings.TrimSpace(req.Prompt)
	template, ok := editorTemplate(req.Task)
	if !ok || len([]rune(req.Content)) > 50000 || (req.Title == "" && req.Content == "" && req.Prompt == "") {
		return nil, errors.New("task and article context or prompt are required")
	}
	if s.management == nil {
		return nil, ErrInvalid
	}
	profile, client, err := s.management.DefaultWritingClient(ctx)
	if err != nil {
		return nil, err
	}
	content := truncateEditorContent(req.Task, req.Content)
	payload := editorPayload(req, content)
	result, err := client.Generate(ctx, provider.Request{
		Instructions: template.instructions,
		Messages:     []provider.Message{{Role: "user", Content: payload}},
		MaxTokens:    template.maxTokens(profile.MaxOutputTokens),
	})
	s.record(domain.GenerationAudit{
		Source: "editor", Operation: "editor." + req.Task, TemplateVersion: editorTemplateVersion,
		Provider: string(profile.ProviderType), Model: profile.Model, InputTokens: result.InputTokens, OutputTokens: result.OutputTokens,
		Status: generationStatus(err), ErrorCode: generationErrorCode(err),
	})
	if err != nil {
		return nil, err
	}
	return &TextGenerationResult{Text: result.Text, Provider: profile.Name, Model: profile.Model}, nil
}

func (s *GenerationService) GenerateImage(ctx context.Context, req ImageGenerationRequest) (*domain.MediaAsset, error) {
	if s.management == nil || s.growth == nil || s.media == nil || strings.TrimSpace(req.Prompt) == "" {
		return nil, ErrInvalid
	}
	if req.Deadline <= 0 {
		return nil, ErrInvalid
	}
	generationCtx, cancel := context.WithTimeout(ctx, req.Deadline)
	defer cancel()
	profiles, err := s.management.ListProviders(generationCtx)
	if err != nil {
		s.recordImageAudit(req, "", "", 0, 0, nil, err)
		return nil, err
	}
	var selected *domain.ProviderProfile
	for _, item := range profiles {
		if item.IsDefaultImage && item.Enabled {
			selected = item
			break
		}
	}
	if selected == nil {
		err = errors.New("no enabled default image provider")
		s.recordImageAudit(req, "", "", 0, 0, nil, err)
		return nil, err
	}
	client, err := s.management.ProviderClient(generationCtx, selected.ID)
	if err != nil {
		s.recordImageAudit(req, string(selected.ProviderType), selected.Model, 0, 0, nil, err)
		return nil, err
	}
	generator, ok := client.(provider.ImageGenerator)
	if !ok {
		err = errors.New("provider does not support image generation")
		s.recordImageAudit(req, string(selected.ProviderType), selected.Model, 0, 0, nil, err)
		return nil, err
	}
	image, err := generator.GenerateImage(generationCtx, provider.ImageRequest{Prompt: cleanImagePrompt(req.Prompt)})
	if err != nil || len(image.Data) == 0 || len(image.Data) > 10<<20 || (image.MIMEType != "image/jpeg" && image.MIMEType != "image/png" && image.MIMEType != "image/webp") {
		if errors.Is(generationCtx.Err(), context.DeadlineExceeded) {
			err = errors.New("image generation timed out")
		} else if err != nil {
			err = errors.New("image provider response: " + safeError(err))
		} else {
			err = errors.New("provider returned an invalid image")
		}
		s.recordImageAudit(req, string(selected.ProviderType), selected.Model, 0, 0, nil, err)
		return nil, err
	}
	ext := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[image.MIMEType]
	nameBytes := make([]byte, 16)
	if _, err = rand.Read(nameBytes); err != nil {
		s.recordImageAudit(req, string(selected.ProviderType), selected.Model, 0, 0, nil, err)
		return nil, err
	}
	storageName := fmt.Sprintf("ai-%x%s", nameBytes, ext)
	if err = s.media.Put(ctx, storageName, bytes.NewReader(image.Data), image.MIMEType); err != nil {
		s.recordImageAudit(req, string(selected.ProviderType), selected.Model, 0, 0, nil, err)
		return nil, err
	}
	filename := req.Filename
	if filename == "" {
		filename = "ai-" + storageName
	} else if strings.Contains(filename, "%s") {
		filename = fmt.Sprintf(filename, ext)
	}
	asset := &domain.MediaAsset{Filename: filename, StorageName: storageName, URL: s.media.URL(storageName), ContentType: image.MIMEType, SizeBytes: int64(len(image.Data)), AltText: req.AltText}
	if req.CreatorPrincipalID > 0 {
		asset.CreatedByPrincipalID = &req.CreatorPrincipalID
	}
	if err = s.growth.CreateMedia(ctx, asset); err != nil {
		_ = s.media.Delete(ctx, storageName)
		s.recordImageAudit(req, string(selected.ProviderType), selected.Model, 0, 0, nil, err)
		return nil, err
	}
	s.recordImageAudit(req, string(selected.ProviderType), selected.Model, 0, 0, &asset.ID, nil)
	return asset, nil
}

type editorTemplateDefinition struct {
	instructions string
	maxTokens    func(int) int
}

func fixedTokens(value int) func(int) int { return func(int) int { return value } }

func editorTemplate(task string) (editorTemplateDefinition, bool) {
	base := "You are an editorial assistant for a blog. Return only valid JSON in the form {\"suggestions\":[\"...\"]}."
	templates := map[string]editorTemplateDefinition{
		"title":        {base + " Produce exactly three concise candidates. Do not explain, use Markdown, or change the article. Create specific Chinese article titles that accurately reflect the supplied draft.", fixedTokens(1000)},
		"summary":      {base + " Produce exactly three concise candidates. Do not explain, use Markdown, or change the article. Create Chinese summaries, each at most 300 Chinese characters, that accurately reflect the supplied draft.", fixedTokens(2000)},
		"slug":         {base + " Produce exactly three concise candidates. Do not explain, use Markdown, or change the article. Create lowercase URL slugs using ASCII letters, numbers, and hyphens only.", fixedTokens(800)},
		"tags":         {base + " Produce 3 to 5 highly relevant, concise Chinese topic tags (1-4 words each) reflecting the core themes of this draft. Return only valid JSON: {\"suggestions\":[\"tag1\", \"tag2\", \"tag3\"]}. Do not explain.", fixedTokens(800)},
		"seo":          {"You are an SEO specialist. Analyze the draft and produce optimal SEO metadata. Return only valid JSON in the form: {\"seo_title\": \"...\", \"seo_description\": \"...\", \"slug\": \"...\"}. Ensure seo_title is under 60 characters with core keywords, seo_description is under 160 characters engaging search snippet, and slug is lowercase ASCII words with hyphens.", fixedTokens(2000)},
		"alt":          {base + " Produce 3 concise, descriptive Chinese image alt texts (accessibility scene descriptions) suitable for the cover image of this article. Return only valid JSON: {\"suggestions\":[\"alt 1\", \"alt 2\", \"alt 3\"]}. Do not explain.", fixedTokens(800)},
		"category":     {"You are a blog editor. Given the candidate categories list in the request, select the single most appropriate category name for this draft. Return only valid JSON in the form: {\"suggestions\":[\"category_name\"]}.", fixedTokens(500)},
		"cover_prompt": {"You are an AI art director. Generate 3 distinct, highly creative, and detailed text-to-image prompts in English (each followed by a concise Chinese summary in brackets: [中文说明: ...]) for generating an eye-catching, modern blog cover image suitable for Midjourney or DALL-E 3. Provide 3 different visual directions (e.g. 1. Futuristic Surreal Tech, 2. Minimalist Conceptual Graphic, 3. Cinematic 3D Scene). Return only valid JSON: {\"suggestions\":[\"Prompt 1... [中文说明: ...]\", \"Prompt 2... [中文说明: ...]\", \"Prompt 3... [中文说明: ...]\"]}.", fixedTokens(2500)},
		"metadata_all": {"You are a senior blog managing editor. Analyze the draft and generate all publishing metadata in a single valid JSON object with format:\n{\"summary\":\"...\",\"tags\":[\"...\"],\"slug\":\"...\",\"seo_title\":\"...\",\"seo_description\":\"...\",\"category\":\"...\",\"cover_alt\":\"...\"}.\nEnsure summary is ~150-250 Chinese chars, tags has 3-5 keywords, slug is ASCII lowercase words with hyphens, seo_title is <=60 chars, seo_description is <=160 chars, category matches the best choice from candidate categories (if supplied), and cover_alt describes the cover scene.", fixedTokens(3000)},
		"content": {"You are a professional blog writer and editor. Generate a complete, comprehensive, well-structured Chinese blog article in Markdown format based on the supplied context and user prompt. Ensure the article is fully written and completed with an introduction, detailed body sections, and a solid conclusion. Output the raw Markdown content directly without JSON wrapping, without markdown code fence wrappers, and without conversational preamble.", func(providerMax int) int {
			if providerMax < 6000 {
				return 6000
			}
			return providerMax
		}},
	}
	value, ok := templates[task]
	return value, ok
}

func editorPayload(req EditorTextRequest, content string) string {
	// Keep JSON encoding identical to the former controller implementation.
	b, _ := json.Marshal(map[string]any{"title": req.Title, "summary": req.Summary, "content": content, "prompt": req.Prompt, "categories": req.Categories})
	var value map[string]any
	_ = json.Unmarshal(b, &value)
	if req.Prompt == "" {
		delete(value, "prompt")
	}
	if len(req.Categories) == 0 {
		delete(value, "categories")
	}
	b, _ = json.Marshal(value)
	return string(b)
}

func truncateEditorContent(task, content string) string {
	if task == "content" {
		return content
	}
	runes := []rune(content)
	if len(runes) <= 4000 {
		return content
	}
	return string(runes[:4000]) + "\n\n...(余下文章内容已省略)..."
}

func cleanImagePrompt(prompt string) string {
	if idx := strings.Index(prompt, "[中文说明"); idx != -1 && strings.TrimSpace(prompt[:idx]) != "" {
		return strings.TrimSpace(prompt[:idx])
	}
	if idx := strings.Index(prompt, "(中文说明"); idx != -1 && strings.TrimSpace(prompt[:idx]) != "" {
		return strings.TrimSpace(prompt[:idx])
	}
	return prompt
}

func generationStatus(err error) string {
	if err != nil {
		return "failed"
	}
	return "succeeded"
}
func generationErrorCode(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) || strings.Contains(err.Error(), "timed out") {
		return "timeout"
	}
	return "generation_failed"
}

func (s *GenerationService) recordImageAudit(req ImageGenerationRequest, providerName, model string, inputTokens, outputTokens int64, assetID *int64, err error) {
	s.record(domain.GenerationAudit{Source: req.Source, Operation: req.Operation, TemplateVersion: editorTemplateVersion, Provider: providerName, Model: model, InputTokens: inputTokens, OutputTokens: outputTokens, Status: generationStatus(err), ErrorCode: generationErrorCode(err), AgentRunID: req.AgentRunID, WorkflowRunID: req.WorkflowRunID, MediaCandidateID: req.MediaCandidateID, MediaAssetID: assetID})
}

func (s *GenerationService) record(value domain.GenerationAudit) {
	if s != nil && s.repo != nil {
		_ = s.repo.RecordGenerationAudit(context.Background(), &value)
	}
}
