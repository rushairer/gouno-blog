package provider

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
)

// GenerateImage uses Gemini's native interactions endpoint. Image work remains
// separate from Agent text/tool turns, so it cannot bypass approval policies.
func (p *HTTPProvider) GenerateImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	if req.Prompt = strings.TrimSpace(req.Prompt); req.Prompt == "" || len([]rune(req.Prompt)) > 12000 {
		return ImageResult{}, errors.New("invalid image prompt")
	}
	if p.name == "openai" {
		return p.generateOpenAIImage(ctx, req)
	}
	if p.name != "gemini" {
		return ImageResult{}, errors.New("provider does not support image generation")
	}
	if req.AspectRatio == "" {
		req.AspectRatio = "1:1"
	}
	if req.ImageSize == "" {
		req.ImageSize = "1K"
	}
	ratios := map[string]bool{"1:1": true, "16:9": true, "9:16": true, "4:3": true, "3:4": true, "4:5": true, "5:4": true, "3:2": true, "2:3": true, "21:9": true, "1:4": true, "4:1": true, "1:8": true, "8:1": true}
	sizes := map[string]bool{"0.5K": true, "1K": true, "2K": true, "4K": true}
	if !ratios[req.AspectRatio] || !sizes[req.ImageSize] {
		return ImageResult{}, errors.New("unsupported image dimensions")
	}
	resp, err := p.do(ctx, "/v1beta/interactions", map[string]any{"model": p.model, "input": req.Prompt, "response_format": map[string]any{"type": "image", "mime_type": "image/png", "aspect_ratio": req.AspectRatio, "image_size": req.ImageSize}})
	if err != nil {
		return ImageResult{}, err
	}
	defer resp.Body.Close()
	var decoded struct {
		OutputImage struct {
			Data     string `json:"data"`
			MIMEType string `json:"mime_type"`
		} `json:"output_image"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return ImageResult{}, err
	}
	data, err := base64.StdEncoding.DecodeString(decoded.OutputImage.Data)
	if err != nil || len(data) == 0 {
		return ImageResult{}, errors.New("Gemini response did not contain an image")
	}
	if decoded.OutputImage.MIMEType != "image/png" && decoded.OutputImage.MIMEType != "image/jpeg" && decoded.OutputImage.MIMEType != "image/webp" {
		return ImageResult{}, errors.New("Gemini returned an unsupported image type")
	}
	return ImageResult{Data: data, MIMEType: decoded.OutputImage.MIMEType}, nil
}

// generateOpenAIImage asks an OpenAI Responses model to invoke its hosted
// image_generation tool. The output item contains the rendered image as base64.
func (p *HTTPProvider) generateOpenAIImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	resp, err := p.do(ctx, "/v1/responses", map[string]any{
		"model":       p.model,
		"input":       req.Prompt,
		"tools":       []map[string]any{{"type": "image_generation"}},
		"tool_choice": map[string]any{"type": "image_generation"},
	})
	if err != nil {
		return ImageResult{}, err
	}
	defer resp.Body.Close()
	var decoded struct {
		Output []struct {
			Type   string `json:"type"`
			Result string `json:"result"`
		} `json:"output"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return ImageResult{}, err
	}
	for _, output := range decoded.Output {
		if output.Type != "image_generation_call" || output.Result == "" {
			continue
		}
		data, decodeErr := base64.StdEncoding.DecodeString(output.Result)
		if decodeErr != nil || len(data) == 0 {
			return ImageResult{}, errors.New("OpenAI response did not contain a valid image")
		}
		return ImageResult{Data: data, MIMEType: "image/png"}, nil
	}
	return ImageResult{}, errors.New("OpenAI response did not contain an image")
}
