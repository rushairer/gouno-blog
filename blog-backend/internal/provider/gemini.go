package provider

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

func toGeminiToolName(name string) string {
	return strings.ReplaceAll(name, ".", "__")
}

func fromGeminiToolName(name string, nameMap map[string]string) string {
	if original, ok := nameMap[name]; ok {
		return original
	}
	return strings.ReplaceAll(name, "__", ".")
}

func (p *HTTPProvider) geminiGenerate(ctx context.Context, req Request) (Result, error) {
	nameMap := make(map[string]string, len(req.Tools))
	for _, tool := range req.Tools {
		nameMap[toGeminiToolName(tool.Name)] = tool.Name
	}

	contents := make([]map[string]any, 0, len(req.Messages))
	for _, message := range req.Messages {
		if message.Role == "tool" {
			contents = append(contents, map[string]any{
				"role": "function",
				"parts": []map[string]any{
					{
						"functionResponse": map[string]any{
							"name":     message.ToolCallID,
							"response": map[string]any{"output": message.Content},
						},
					},
				},
			})
			continue
		}

		parts := make([]map[string]any, 0, len(message.ToolCalls)+1)
		if message.Content != "" {
			parts = append(parts, map[string]any{"text": message.Content})
		}
		for _, call := range message.ToolCalls {
			var args any
			if len(call.Arguments) > 0 {
				_ = json.Unmarshal(call.Arguments, &args)
			}
			if args == nil {
				args = map[string]any{}
			}
			parts = append(parts, map[string]any{
				"functionCall": map[string]any{
					"name": toGeminiToolName(call.Name),
					"args": args,
				},
			})
		}
		if len(parts) == 0 {
			continue
		}

		role := "user"
		if message.Role == "assistant" {
			role = "model"
		}
		contents = append(contents, map[string]any{
			"role":  role,
			"parts": parts,
		})
	}

	body := map[string]any{
		"contents": contents,
	}

	if req.Instructions != "" {
		body["systemInstruction"] = map[string]any{
			"parts": []map[string]any{{"text": req.Instructions}},
		}
	}

	if len(req.Tools) > 0 {
		declarations := make([]map[string]any, 0, len(req.Tools))
		for _, tool := range req.Tools {
			var parameters any
			if err := json.Unmarshal(tool.Parameters, &parameters); err != nil {
				return Result{}, err
			}
			declarations = append(declarations, map[string]any{
				"name":        toGeminiToolName(tool.Name),
				"description": tool.Description,
				"parameters":  parameters,
			})
		}
		body["tools"] = []map[string]any{
			{"functionDeclarations": declarations},
		}
	}

	if req.MaxTokens > 0 {
		body["generationConfig"] = map[string]any{
			"maxOutputTokens": req.MaxTokens,
		}
	}

	path := fmt.Sprintf("/v1beta/models/%s:generateContent", p.model)
	resp, err := p.do(ctx, path, body)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()

	var decoded struct {
		Candidates []struct {
			Content struct {
				Role  string `json:"role"`
				Parts []struct {
					Text         string `json:"text"`
					FunctionCall *struct {
						Name string          `json:"name"`
						Args json.RawMessage `json:"args"`
					} `json:"functionCall"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		UsageMetadata struct {
			PromptTokenCount     int64 `json:"promptTokenCount"`
			CandidatesTokenCount int64 `json:"candidatesTokenCount"`
		} `json:"usageMetadata"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return Result{}, err
	}

	result := Result{
		InputTokens:  decoded.UsageMetadata.PromptTokenCount,
		OutputTokens: decoded.UsageMetadata.CandidatesTokenCount,
	}

	if len(decoded.Candidates) > 0 {
		cand := decoded.Candidates[0]
		result.StopReason = cand.FinishReason
		for idx, part := range cand.Content.Parts {
			if part.Text != "" {
				result.Text += part.Text
			}
			if part.FunctionCall != nil {
				callID := fmt.Sprintf("call_%d", idx)
				args := part.FunctionCall.Args
				if len(args) == 0 {
					args = json.RawMessage(`{}`)
				}
				result.ToolCalls = append(result.ToolCalls, ToolCall{
					ID:        callID,
					Name:      fromGeminiToolName(part.FunctionCall.Name, nameMap),
					Arguments: args,
				})
			}
		}
	}

	return result, nil
}

func (p *HTTPProvider) geminiGenerateImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	if req.AspectRatio == "" {
		req.AspectRatio = "1:1"
	}
	if req.ImageSize == "" {
		req.ImageSize = "1K"
	}

	if p.protocolMode == "predict" {
		return p.geminiPredictImage(ctx, req)
	}
	if p.protocolMode == "generate_content" {
		return p.geminiGenerateContentImage(ctx, req)
	}

	modelLower := strings.ToLower(p.model)
	var strategies []func(context.Context, ImageRequest) (ImageResult, error)

	if strings.Contains(modelLower, "imagen") {
		strategies = []func(context.Context, ImageRequest) (ImageResult, error){
			p.geminiPredictImage,
			p.geminiGenerateContentImage,
		}
	} else {
		strategies = []func(context.Context, ImageRequest) (ImageResult, error){
			p.geminiGenerateContentImage,
			p.geminiPredictImage,
		}
	}

	var firstErr error
	for i, strategy := range strategies {
		if res, err := strategy(ctx, req); err == nil && len(res.Data) > 0 {
			return res, nil
		} else if err != nil && i == 0 {
			firstErr = err
		}
	}

	if firstErr != nil {
		return ImageResult{}, fmt.Errorf("gemini image generation failed: %w", firstErr)
	}
	return ImageResult{}, errors.New("Gemini response did not contain a valid image")
}

func (p *HTTPProvider) geminiPredictImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	predictPath := fmt.Sprintf("/v1beta/models/%s:predict", p.model)
	resp, err := p.do(ctx, predictPath, map[string]any{
		"instances": []map[string]any{
			{"prompt": req.Prompt},
		},
		"parameters": map[string]any{
			"sampleCount":    1,
			"aspectRatio":    req.AspectRatio,
			"outputMimeType": "image/png",
		},
	})
	if err != nil {
		return ImageResult{}, err
	}
	defer resp.Body.Close()

	var decoded struct {
		Predictions []struct {
			BytesBase64Encoded string `json:"bytesBase64Encoded"`
			MIMEType           string `json:"mimeType"`
		} `json:"predictions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil || len(decoded.Predictions) == 0 {
		return ImageResult{}, errors.New("invalid predict response")
	}

	data, decodeErr := base64.StdEncoding.DecodeString(decoded.Predictions[0].BytesBase64Encoded)
	if decodeErr != nil || len(data) == 0 {
		return ImageResult{}, errors.New("predict response contained invalid image data")
	}

	mime := decoded.Predictions[0].MIMEType
	if mime == "" {
		mime = "image/png"
	}
	return ImageResult{Data: data, MIMEType: mime}, nil
}

func (p *HTTPProvider) geminiGenerateContentImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	generatePath := fmt.Sprintf("/v1beta/models/%s:generateContent", p.model)
	resp, err := p.do(ctx, generatePath, map[string]any{
		"contents": []map[string]any{
			{
				"role": "user",
				"parts": []map[string]any{
					{"text": req.Prompt},
				},
			},
		},
		"generationConfig": map[string]any{
			"responseModalities": []string{"IMAGE", "TEXT"},
		},
	})
	if err != nil {
		return ImageResult{}, err
	}
	defer resp.Body.Close()

	var decoded struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text       string `json:"text"`
					InlineData *struct {
						MIMEType string `json:"mimeType"`
						Data     string `json:"data"`
					} `json:"inlineData"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil || len(decoded.Candidates) == 0 {
		return ImageResult{}, errors.New("invalid generateContent response")
	}

	for _, part := range decoded.Candidates[0].Content.Parts {
		if part.InlineData != nil && part.InlineData.Data != "" {
			data, decodeErr := base64.StdEncoding.DecodeString(part.InlineData.Data)
			if decodeErr == nil && len(data) > 0 {
				mime := part.InlineData.MIMEType
				if mime == "" {
					mime = "image/png"
				}
				return ImageResult{Data: data, MIMEType: mime}, nil
			}
		}
		if part.Text != "" {
			if img, ok := parseImageDataOrBase64(part.Text); ok {
				return img, nil
			}
		}
	}
	return ImageResult{}, errors.New("generateContent response did not contain an image")
}
