package provider

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

func (p *HTTPProvider) openAIGenerate(ctx context.Context, req Request) (Result, error) {
	if p.protocolMode == "responses" {
		return p.openAIResponses(ctx, req)
	}
	if p.protocolMode == "chat_completions" {
		return p.openAIChatCompletions(ctx, req)
	}
	resResp, errResp := p.openAIResponses(ctx, req)
	if errResp == nil {
		return resResp, nil
	}
	res, err := p.openAIChatCompletions(ctx, req)
	if err == nil {
		return res, nil
	}
	return Result{}, errResp
}

func (p *HTTPProvider) openAIChatCompletions(ctx context.Context, req Request) (Result, error) {
	messages := make([]map[string]any, 0, len(req.Messages)+1)
	if req.Instructions != "" {
		messages = append(messages, map[string]any{"role": "system", "content": req.Instructions})
	}
	for _, msg := range req.Messages {
		if msg.Role == "tool" {
			messages = append(messages, map[string]any{
				"role": "tool", "tool_call_id": msg.ToolCallID, "content": msg.Content,
			})
			continue
		}
		m := map[string]any{"role": msg.Role, "content": msg.Content}
		if len(msg.ToolCalls) > 0 {
			tcs := make([]map[string]any, 0, len(msg.ToolCalls))
			for _, tc := range msg.ToolCalls {
				tcs = append(tcs, map[string]any{
					"id": tc.ID, "type": "function",
					"function": map[string]any{
						"name": tc.Name, "arguments": string(tc.Arguments),
					},
				})
			}
			m["tool_calls"] = tcs
		}
		messages = append(messages, m)
	}
	body := map[string]any{
		"model": p.model, "messages": messages,
	}
	if req.MaxTokens > 0 {
		body["max_tokens"] = req.MaxTokens
	}
	if len(req.Tools) > 0 {
		tools := make([]any, 0, len(req.Tools))
		for _, tool := range req.Tools {
			var parameters any
			_ = json.Unmarshal(tool.Parameters, &parameters)
			tools = append(tools, map[string]any{
				"type": "function",
				"function": map[string]any{
					"name": tool.Name, "description": tool.Description, "parameters": parameters,
				},
			})
		}
		body["tools"] = tools
		if req.ToolChoice != "" {
			body["tool_choice"] = map[string]any{"type": "function", "function": map[string]any{"name": req.ToolChoice}}
		} else {
			body["tool_choice"] = "auto"
		}
	}
	if p.streamMode == "always" {
		body["stream"] = true
		resp, err := p.do(ctx, "/v1/chat/completions", body)
		if err != nil {
			return Result{}, err
		}
		defer resp.Body.Close()
		return decodeOpenAIChatStream(resp)
	}
	resp, err := p.do(ctx, "/v1/chat/completions", body)
	if err != nil {
		if p.streamMode != "never" && strings.Contains(strings.ToLower(err.Error()), "stream") {
			body["stream"] = true
			streamResp, streamErr := p.do(ctx, "/v1/chat/completions", body)
			if streamErr == nil {
				defer streamResp.Body.Close()
				return decodeOpenAIChatStream(streamResp)
			}
		}
		return Result{}, err
	}
	defer resp.Body.Close()

	var decoded struct {
		Choices []struct {
			Message struct {
				Role      string `json:"role"`
				Content   string `json:"content"`
				ToolCalls []struct {
					ID       string `json:"id"`
					Type     string `json:"type"`
					Function struct {
						Name      string          `json:"name"`
						Arguments json.RawMessage `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int64 `json:"prompt_tokens"`
			CompletionTokens int64 `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return Result{}, err
	}
	result := Result{
		InputTokens:  decoded.Usage.PromptTokens,
		OutputTokens: decoded.Usage.CompletionTokens,
	}
	if len(decoded.Choices) > 0 {
		choice := decoded.Choices[0]
		result.Text = choice.Message.Content
		result.StopReason = choice.FinishReason
		for _, tc := range choice.Message.ToolCalls {
			args := tc.Function.Arguments
			if len(args) > 0 && args[0] == '"' {
				var raw string
				if json.Unmarshal(args, &raw) == nil {
					args = json.RawMessage(raw)
				}
			}
			result.ToolCalls = append(result.ToolCalls, ToolCall{
				ID:        tc.ID,
				Name:      tc.Function.Name,
				Arguments: args,
			})
		}
	}
	return result, nil
}

func decodeOpenAIChatStream(resp *http.Response) (Result, error) {
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	var text strings.Builder
	var lastStop string
	var inputTokens, outputTokens int64

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		dataStr := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if dataStr == "" || dataStr == "[DONE]" {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Usage *struct {
				PromptTokens     int64 `json:"prompt_tokens"`
				CompletionTokens int64 `json:"completion_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(dataStr), &chunk); err == nil {
			if len(chunk.Choices) > 0 {
				text.WriteString(chunk.Choices[0].Delta.Content)
				if chunk.Choices[0].FinishReason != "" {
					lastStop = chunk.Choices[0].FinishReason
				}
			}
			if chunk.Usage != nil {
				inputTokens = chunk.Usage.PromptTokens
				outputTokens = chunk.Usage.CompletionTokens
			}
		}
	}
	return Result{
		Text:         text.String(),
		StopReason:   lastStop,
		InputTokens:  inputTokens,
		OutputTokens: outputTokens,
	}, scanner.Err()
}

func (p *HTTPProvider) openAIResponses(ctx context.Context, req Request) (Result, error) {
	input := make([]any, 0, len(req.Messages)*2)
	for _, message := range req.Messages {
		if message.Role == "tool" {
			input = append(input, map[string]any{
				"type": "function_call_output", "call_id": message.ToolCallID, "output": message.Content,
			})
			continue
		}
		for _, call := range message.ToolCalls {
			input = append(input, map[string]any{
				"type": "function_call", "call_id": call.ID, "name": call.Name, "arguments": string(call.Arguments),
			})
		}
		if message.Content != "" {
			input = append(input, map[string]any{
				"role":    message.Role,
				"content": []any{map[string]any{"type": "input_text", "text": message.Content}},
			})
		}
	}
	body := map[string]any{
		"model": p.model, "instructions": req.Instructions, "input": input,
	}
	if req.MaxTokens > 0 {
		body["max_output_tokens"] = req.MaxTokens
	}
	if len(req.Tools) > 0 {
		tools := make([]any, 0, len(req.Tools))
		for _, tool := range req.Tools {
			var parameters any
			if err := json.Unmarshal(tool.Parameters, &parameters); err != nil {
				return Result{}, err
			}
			tools = append(tools, map[string]any{
				"type": "function", "name": tool.Name, "description": tool.Description, "parameters": parameters,
			})
		}
		body["tools"] = tools
		if req.ToolChoice != "" {
			body["tool_choice"] = map[string]any{"type": "function", "name": req.ToolChoice}
		} else {
			body["tool_choice"] = "auto"
		}
	}
	if p.streamMode == "always" {
		body["stream"] = true
		resp, err := p.do(ctx, "/v1/responses", body)
		if err != nil {
			return Result{}, err
		}
		defer resp.Body.Close()
		return decodeOpenAIResponsesStream(resp)
	}
	resp, err := p.do(ctx, "/v1/responses", body)
	if err != nil {
		if p.streamMode != "never" && strings.Contains(strings.ToLower(err.Error()), "stream") {
			body["stream"] = true
			streamResp, streamErr := p.do(ctx, "/v1/responses", body)
			if streamErr == nil {
				defer streamResp.Body.Close()
				return decodeOpenAIResponsesStream(streamResp)
			}
		}
		return Result{}, err
	}
	defer resp.Body.Close()
	var decoded struct {
		Output []struct {
			Type      string          `json:"type"`
			CallID    string          `json:"call_id"`
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
			Content   []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		OutputText string `json:"output_text"`
		Status     string `json:"status"`
		Usage      struct {
			InputTokens  int64 `json:"input_tokens"`
			OutputTokens int64 `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return Result{}, err
	}
	result := Result{
		Text: decoded.OutputText, InputTokens: decoded.Usage.InputTokens,
		OutputTokens: decoded.Usage.OutputTokens, StopReason: decoded.Status,
	}
	for _, item := range decoded.Output {
		if item.Type == "function_call" {
			arguments := item.Arguments
			if len(arguments) > 0 && arguments[0] == '"' {
				var raw string
				if json.Unmarshal(arguments, &raw) == nil {
					arguments = json.RawMessage(raw)
				}
			}
			result.ToolCalls = append(result.ToolCalls, ToolCall{ID: item.CallID, Name: item.Name, Arguments: arguments})
		}
		if item.Type == "message" && result.Text == "" {
			for _, content := range item.Content {
				if content.Type == "output_text" {
					result.Text += content.Text
				}
			}
		}
	}
	return result, nil
}

func decodeOpenAIResponsesStream(resp *http.Response) (Result, error) {
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	var text strings.Builder
	var lastStop string
	var inputTokens, outputTokens int64

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		dataStr := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if dataStr == "" || dataStr == "[DONE]" {
			continue
		}
		var chunk struct {
			Type   string `json:"type"`
			Delta  string `json:"delta"`
			Status string `json:"status"`
			Usage  *struct {
				InputTokens  int64 `json:"input_tokens"`
				OutputTokens int64 `json:"output_tokens"`
			} `json:"usage"`
			Response struct {
				OutputText string `json:"output_text"`
				Status     string `json:"status"`
			} `json:"response"`
		}
		if err := json.Unmarshal([]byte(dataStr), &chunk); err == nil {
			if chunk.Delta != "" {
				text.WriteString(chunk.Delta)
			}
			if chunk.Response.OutputText != "" && text.Len() == 0 {
				text.WriteString(chunk.Response.OutputText)
			}
			if chunk.Status != "" {
				lastStop = chunk.Status
			}
			if chunk.Response.Status != "" {
				lastStop = chunk.Response.Status
			}
			if chunk.Usage != nil {
				inputTokens = chunk.Usage.InputTokens
				outputTokens = chunk.Usage.OutputTokens
			}
		}
	}
	return Result{
		Text:         text.String(),
		StopReason:   lastStop,
		InputTokens:  inputTokens,
		OutputTokens: outputTokens,
	}, scanner.Err()
}

func (p *HTTPProvider) openAIGenerateImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	if p.protocolMode == "chat_completions" {
		return p.openAIChatCompletionsImage(ctx, req)
	}
	if p.protocolMode == "responses" {
		return p.openAIResponsesImage(ctx, req)
	}

	// Default / auto: try responses first, then chat completions
	res, err := p.openAIResponsesImage(ctx, req)
	if err == nil && len(res.Data) > 0 {
		return res, nil
	}
	resChat, errChat := p.openAIChatCompletionsImage(ctx, req)
	if errChat == nil && len(resChat.Data) > 0 {
		return resChat, nil
	}
	if err != nil {
		return ImageResult{}, err
	}
	return ImageResult{}, errChat
}

func (p *HTTPProvider) openAIChatCompletionsImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	stream := p.streamMode != "never"
	resp, err := p.do(ctx, "/v1/chat/completions", map[string]any{
		"model":  p.model,
		"stream": stream,
		"messages": []map[string]any{
			{
				"role":    "user",
				"content": req.Prompt,
			},
		},
	})
	if err != nil {
		return ImageResult{}, err
	}
	defer resp.Body.Close()
	return decodeOpenAIImageResponse(resp)
}

func (p *HTTPProvider) openAIResponsesImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	stream := p.streamMode != "never"
	resp, err := p.do(ctx, "/v1/responses", map[string]any{
		"model":  p.model,
		"stream": stream,
		"input": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{"type": "input_text", "text": req.Prompt},
				},
			},
		},
		"tools":       []map[string]any{{"type": "image_generation"}},
		"tool_choice": map[string]any{"type": "image_generation"},
	})
	if err != nil {
		return ImageResult{}, err
	}
	defer resp.Body.Close()
	return decodeOpenAIImageResponse(resp)
}

type openAIImageResponse struct {
	Type     string          `json:"type"`
	Item     json.RawMessage `json:"item"`
	Result   string          `json:"result"`
	Delta    string          `json:"delta"`
	Response struct {
		Output []struct {
			Type    string `json:"type"`
			Result  string `json:"result"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		OutputText string `json:"output_text"`
	} `json:"response"`
	Output []struct {
		Type    string `json:"type"`
		Result  string `json:"result"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
	OutputText string `json:"output_text"`
	Data       []struct {
		B64JSON string `json:"b64_json"`
	} `json:"data"`
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func extractImageFromOpenAIResponse(resp openAIImageResponse) (ImageResult, bool) {
	for _, output := range resp.Output {
		if output.Type == "image_generation_call" && output.Result != "" {
			if img, ok := parseImageDataOrBase64(output.Result); ok {
				return img, true
			}
		}
		for _, content := range output.Content {
			if img, ok := parseImageDataOrBase64(content.Text); ok {
				return img, true
			}
		}
	}
	for _, output := range resp.Response.Output {
		if output.Type == "image_generation_call" && output.Result != "" {
			if img, ok := parseImageDataOrBase64(output.Result); ok {
				return img, true
			}
		}
		for _, content := range output.Content {
			if img, ok := parseImageDataOrBase64(content.Text); ok {
				return img, true
			}
		}
	}
	if resp.OutputText != "" {
		if img, ok := parseImageDataOrBase64(resp.OutputText); ok {
			return img, true
		}
	}
	if resp.Response.OutputText != "" {
		if img, ok := parseImageDataOrBase64(resp.Response.OutputText); ok {
			return img, true
		}
	}
	for _, item := range resp.Data {
		if item.B64JSON != "" {
			if img, ok := parseImageDataOrBase64(item.B64JSON); ok {
				return img, true
			}
		}
	}
	return ImageResult{}, false
}

func decodeOpenAIImageResponse(resp *http.Response) (ImageResult, error) {
	contentType := resp.Header.Get("Content-Type")
	isSSE := strings.Contains(contentType, "text/event-stream")

	reader := bufio.NewReader(resp.Body)
	if !isSSE {
		peekBytes, _ := reader.Peek(16)
		peekStr := strings.TrimSpace(string(peekBytes))
		if strings.HasPrefix(peekStr, "data:") || strings.HasPrefix(peekStr, "event:") {
			isSSE = true
		}
	}

	if !isSSE {
		var decoded openAIImageResponse
		if err := json.NewDecoder(reader).Decode(&decoded); err != nil {
			return ImageResult{}, err
		}
		if img, ok := extractImageFromOpenAIResponse(decoded); ok {
			return img, nil
		}
		return ImageResult{}, errors.New("OpenAI response did not contain an image")
	}

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)

	var accumulatedText strings.Builder
	var accumulatedResult strings.Builder

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		dataStr := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if dataStr == "" || dataStr == "[DONE]" {
			continue
		}

		var chunk openAIImageResponse
		if err := json.Unmarshal([]byte(dataStr), &chunk); err == nil {
			if img, ok := extractImageFromOpenAIResponse(chunk); ok {
				return img, nil
			}
			if chunk.Delta != "" {
				accumulatedResult.WriteString(chunk.Delta)
			}
			if chunk.Result != "" {
				if img, ok := parseImageDataOrBase64(chunk.Result); ok {
					return img, nil
				}
			}
			if len(chunk.Item) > 0 {
				var item struct {
					Type    string `json:"type"`
					Result  string `json:"result"`
					Content []struct {
						Type string `json:"type"`
						Text string `json:"text"`
					} `json:"content"`
				}
				if err := json.Unmarshal(chunk.Item, &item); err == nil {
					if item.Result != "" {
						if img, ok := parseImageDataOrBase64(item.Result); ok {
							return img, nil
						}
					}
					for _, c := range item.Content {
						if img, ok := parseImageDataOrBase64(c.Text); ok {
							return img, nil
						}
					}
				}
			}
			for _, choice := range chunk.Choices {
				if choice.Delta.Content != "" {
					accumulatedText.WriteString(choice.Delta.Content)
				}
				if choice.Message.Content != "" {
					if img, ok := parseImageDataOrBase64(choice.Message.Content); ok {
						return img, nil
					}
				}
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return ImageResult{}, err
	}

	if accumulatedResult.Len() > 0 {
		if img, ok := parseImageDataOrBase64(accumulatedResult.String()); ok {
			return img, nil
		}
	}
	if accumulatedText.Len() > 0 {
		if img, ok := parseImageDataOrBase64(accumulatedText.String()); ok {
			return img, nil
		}
	}

	return ImageResult{}, errors.New("OpenAI response did not contain an image")
}
