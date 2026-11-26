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
	mapped, originals, err := mapOpenAIToolNames(req)
	if err != nil {
		return Result{}, err
	}
	result, err := p.openAIGenerateText(ctx, mapped)
	for index := range result.ToolCalls {
		if original, exists := originals[result.ToolCalls[index].Name]; exists {
			result.ToolCalls[index].Name = original
		}
	}
	return result, err
}

func (p *HTTPProvider) openAIGenerateText(ctx context.Context, req Request) (Result, error) {
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
	if !shouldFallbackOpenAITextProtocol(errResp) {
		return resResp, errResp
	}
	return p.openAIChatCompletions(ctx, req)
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
	resp, streaming, err := p.openAITextRequest(ctx, "/v1/chat/completions", body)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()
	if streaming {
		result, err := decodeOpenAIChatStream(resp)
		result.Evidence = p.responseEvidence(resp, false)
		return result, err
	}

	var decoded struct {
		Choices []struct {
			Message struct {
				Role      string `json:"role"`
				Content   string `json:"content"`
				Refusal   string `json:"refusal"`
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
		Evidence:     p.responseEvidence(resp, false),
	}
	if req.requiresCompleteTextResponse() && len(decoded.Choices) != 1 {
		return Result{InputTokens: result.InputTokens, OutputTokens: result.OutputTokens, Evidence: result.Evidence}, ErrTextResponseInvalid
	}
	if len(decoded.Choices) > 0 {
		choice := decoded.Choices[0]
		if req.requiresCompleteTextResponse() && choice.Message.Refusal != "" {
			return Result{InputTokens: result.InputTokens, OutputTokens: result.OutputTokens, Evidence: result.Evidence}, ErrTextResponseRejected
		}
		result.Text = choice.Message.Content
		result.StopReason = choice.FinishReason
		for _, tc := range choice.Message.ToolCalls {
			if req.requiresCompleteTextResponse() && tc.Type != "" && tc.Type != "function" {
				return Result{InputTokens: result.InputTokens, OutputTokens: result.OutputTokens, Evidence: result.Evidence}, ErrTextResponseInvalid
			}
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
	if req.requiresCompleteTextResponse() {
		if err := validateOpenAIChatCompletion(result.StopReason, result.ToolCalls); err != nil {
			return Result{InputTokens: result.InputTokens, OutputTokens: result.OutputTokens, Evidence: result.Evidence}, err
		}
	}
	return result, nil
}

func decodeOpenAIChatStream(resp *http.Response) (Result, error) {
	var text strings.Builder
	var lastStop string
	var inputTokens, outputTokens int64
	type streamedToolCall struct {
		ID, Name string
		Arguments strings.Builder
	}
	toolCalls := map[int]*streamedToolCall{}
	toolOrder := make([]int, 0)

	err := consumeTextSSE(resp.Body, func(data string) error {
		var chunk struct {
			Error json.RawMessage `json:"error"`
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
					ToolCalls []struct {
						Index int `json:"index"`
						ID string `json:"id"`
						Function struct {
							Name string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Usage *struct {
				PromptTokens     int64 `json:"prompt_tokens"`
				CompletionTokens int64 `json:"completion_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return ErrTextStreamInvalid
		}
		if chunk.Usage != nil {
			inputTokens = max(inputTokens, chunk.Usage.PromptTokens)
			outputTokens = max(outputTokens, chunk.Usage.CompletionTokens)
		}
		if len(chunk.Error) > 0 && string(chunk.Error) != "null" {
			return ErrTextStreamRejected
		}
		if len(chunk.Choices) == 0 {
			return nil // a trailing usage-only chunk is legal
		}
		choice := chunk.Choices[0]
		if lastStop != "" && (choice.Delta.Content != "" || len(choice.Delta.ToolCalls) > 0 ||
			(choice.FinishReason != "" && choice.FinishReason != lastStop)) {
			return ErrTextStreamInvalid
		}
		text.WriteString(choice.Delta.Content)
		for _, delta := range choice.Delta.ToolCalls {
			if delta.Index < 0 {
				return ErrTextStreamInvalid
			}
			call, ok := toolCalls[delta.Index]
			if !ok {
				call = &streamedToolCall{}
				toolCalls[delta.Index] = call
				toolOrder = append(toolOrder, delta.Index)
			}
			if delta.ID != "" {
				if call.ID != "" && call.ID != delta.ID {
					return ErrTextStreamInvalid
				}
				call.ID = delta.ID
			}
			if delta.Function.Name != "" {
				if call.Name != "" && call.Name != delta.Function.Name {
					return ErrTextStreamInvalid
				}
				call.Name = delta.Function.Name
			}
			call.Arguments.WriteString(delta.Function.Arguments)
		}
		if choice.FinishReason != "" {
			lastStop = choice.FinishReason
		}
		return nil
	})
	// Failed streams return usage observations only, never executable output.
	observed := Result{InputTokens: inputTokens, OutputTokens: outputTokens}
	if err != nil {
		return observed, err
	}
	// Accept an explicit finish reason followed by clean EOF for compatible
	// gateways that omit [DONE]. [DONE] alone is not completion evidence.
	if lastStop != "stop" && lastStop != "tool_calls" {
		return observed, ErrTextStreamIncomplete
	}
	if (lastStop == "tool_calls") != (len(toolOrder) > 0) {
		return observed, ErrTextStreamInvalid
	}
	result := observed
	result.Text, result.StopReason = text.String(), lastStop
	for _, index := range toolOrder {
		call := toolCalls[index]
		arguments := json.RawMessage(call.Arguments.String())
		if !validStreamToolCall(call.ID, call.Name, arguments) {
			return observed, ErrTextStreamInvalid
		}
		result.ToolCalls = append(result.ToolCalls, ToolCall{
			ID: call.ID, Name: call.Name, Arguments: arguments,
		})
	}
	if !uniqueStreamToolIDs(result.ToolCalls) {
		return observed, ErrTextStreamInvalid
	}
	return result, nil
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
	resp, streaming, err := p.openAITextRequest(ctx, "/v1/responses", body)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()
	if streaming {
		result, err := decodeOpenAIResponsesStream(resp)
		result.Evidence = p.responseEvidence(resp, false)
		return result, err
	}
	var decoded struct {
		Output []struct {
			Type      string          `json:"type"`
			CallID    string          `json:"call_id"`
			Status    string          `json:"status"`
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
		Evidence: p.responseEvidence(resp, false),
	}
	for _, item := range decoded.Output {
		if item.Type == "function_call" {
			if req.requiresCompleteTextResponse() && item.Status != "" && item.Status != "completed" {
				return Result{InputTokens: result.InputTokens, OutputTokens: result.OutputTokens, Evidence: result.Evidence}, ErrTextResponseInvalid
			}
			arguments := item.Arguments
			if len(arguments) > 0 && arguments[0] == '"' {
				var raw string
				if json.Unmarshal(arguments, &raw) == nil {
					arguments = json.RawMessage(raw)
				}
			}
			result.ToolCalls = append(result.ToolCalls, ToolCall{ID: item.CallID, Name: item.Name, Arguments: arguments})
		}
		if req.requiresCompleteTextResponse() && item.Type == "message" {
			for _, content := range item.Content {
				if content.Type == "refusal" {
					return Result{InputTokens: result.InputTokens, OutputTokens: result.OutputTokens, Evidence: result.Evidence}, ErrTextResponseRejected
				}
			}
		}
		if item.Type == "message" && result.Text == "" {
			for _, content := range item.Content {
				if content.Type == "output_text" {
					result.Text += content.Text
				}
			}
		}
	}
	if req.requiresCompleteTextResponse() {
		if err := validateOpenAIResponsesCompletion(result.StopReason, result.ToolCalls); err != nil {
			return Result{InputTokens: result.InputTokens, OutputTokens: result.OutputTokens, Evidence: result.Evidence}, err
		}
	}
	return result, nil
}

func decodeOpenAIResponsesStream(resp *http.Response) (Result, error) {
	var text strings.Builder
	var completed bool
	var inputTokens, outputTokens int64
	type streamedToolCall struct {
		ID, Name string
		Arguments strings.Builder
	}
	toolCalls := map[string]*streamedToolCall{}
	toolOrder := make([]string, 0)

	err := consumeTextSSE(resp.Body, func(data string) error {
		var chunk struct {
			Type   string `json:"type"`
			Delta  string `json:"delta"`
			Status string `json:"status"`
			ItemID string `json:"item_id"`
			CallID string `json:"call_id"`
			Name   string `json:"name"`
			Item *struct {
				Type string `json:"type"`
				ID string `json:"id"`
				CallID string `json:"call_id"`
				Name string `json:"name"`
				Arguments string `json:"arguments"`
			} `json:"item"`
			Usage *struct {
				InputTokens int64 `json:"input_tokens"`
				OutputTokens int64 `json:"output_tokens"`
			} `json:"usage"`
			Response struct {
				OutputText string `json:"output_text"`
				Status string `json:"status"`
				Usage *struct {
					InputTokens int64 `json:"input_tokens"`
					OutputTokens int64 `json:"output_tokens"`
				} `json:"usage"`
			} `json:"response"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return ErrTextStreamInvalid
		}
		if chunk.Usage != nil {
			inputTokens = max(inputTokens, chunk.Usage.InputTokens)
			outputTokens = max(outputTokens, chunk.Usage.OutputTokens)
		}
		if chunk.Response.Usage != nil {
			inputTokens = max(inputTokens, chunk.Response.Usage.InputTokens)
			outputTokens = max(outputTokens, chunk.Response.Usage.OutputTokens)
		}
		switch chunk.Type {
		case "error", "response.failed":
			return ErrTextStreamRejected
		case "response.incomplete", "response.cancelled":
			return ErrTextStreamIncomplete
		}
		if chunk.Status == "failed" || chunk.Response.Status == "failed" {
			return ErrTextStreamRejected
		}
		if chunk.Status == "incomplete" || chunk.Response.Status == "incomplete" ||
			chunk.Status == "cancelled" || chunk.Response.Status == "cancelled" {
			return ErrTextStreamIncomplete
		}
		if completed {
			// The completion event is the final model event. Do not accept
			// new output or Tool deltas after that boundary.
			return ErrTextStreamInvalid
		}
		if chunk.Type == "response.completed" {
			if (chunk.Response.Status != "" && chunk.Response.Status != "completed") ||
				(chunk.Status != "" && chunk.Status != "completed") {
				return ErrTextStreamInvalid
			}
			if chunk.Response.OutputText != "" && text.Len() == 0 {
				text.WriteString(chunk.Response.OutputText)
			}
			completed = true
			return nil
		}
		if chunk.Type == "response.output_text.delta" {
			text.WriteString(chunk.Delta)
			return nil
		}
		isDelta := chunk.Type == "response.function_call_arguments.delta"
		isItem := chunk.Type == "response.output_item.added" || chunk.Type == "response.output_item.done"
		if !isDelta && !isItem {
			return nil
		}
		// Responses streams also emit ordinary message/reasoning output
		// items. Only function calls (or legacy items with explicit call
		// identity) are executable Tools.
		if isItem && (chunk.Item == nil ||
			(chunk.Item.Type != "function_call" && !(chunk.Item.Type == "" && chunk.Item.CallID != "" && chunk.Item.Name != ""))) {
			return nil
		}
		key := chunk.ItemID
		if key == "" && chunk.Item != nil {
			key = chunk.Item.ID
			if key == "" {
				key = chunk.Item.CallID
			}
		}
		if key == "" {
			key = chunk.CallID
		}
		if key == "" {
			return ErrTextStreamInvalid
		}
		call, ok := toolCalls[key]
		if !ok {
			call = &streamedToolCall{}
			toolCalls[key] = call
			toolOrder = append(toolOrder, key)
		}
		callID, name := chunk.CallID, chunk.Name
		if chunk.Item != nil {
			if chunk.Item.CallID != "" {
				callID = chunk.Item.CallID
			}
			if chunk.Item.Name != "" {
				name = chunk.Item.Name
			}
			if chunk.Type == "response.output_item.done" && chunk.Item.Arguments != "" {
				if call.Arguments.Len() == 0 {
					call.Arguments.WriteString(chunk.Item.Arguments)
				} else if call.Arguments.String() != chunk.Item.Arguments {
					return ErrTextStreamInvalid
				}
			}
		}
		if callID != "" {
			if call.ID != "" && call.ID != callID {
				return ErrTextStreamInvalid
			}
			call.ID = callID
		}
		if name != "" {
			if call.Name != "" && call.Name != name {
				return ErrTextStreamInvalid
			}
			call.Name = name
		}
		if isDelta {
			call.Arguments.WriteString(chunk.Delta)
		}
		return nil
	})
	observed := Result{InputTokens: inputTokens, OutputTokens: outputTokens}
	if err != nil {
		return observed, err
	}
	if !completed {
		return observed, ErrTextStreamIncomplete
	}
	result := observed
	result.Text, result.StopReason = text.String(), "completed"
	for _, key := range toolOrder {
		call := toolCalls[key]
		arguments := json.RawMessage(call.Arguments.String())
		if !validStreamToolCall(call.ID, call.Name, arguments) {
			return observed, ErrTextStreamInvalid
		}
		result.ToolCalls = append(result.ToolCalls, ToolCall{
			ID: call.ID, Name: call.Name, Arguments: arguments,
		})
	}
	if !uniqueStreamToolIDs(result.ToolCalls) {
		return observed, ErrTextStreamInvalid
	}
	return result, nil
}

func (p *HTTPProvider) openAIGenerateImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	// Select the protocol BEFORE dispatch. An error or missing image does not
	// prove the first request was unfulfilled or unbilled. Never probe another
	// billable endpoint as a fallback, even for 4xx/5xx or a truncated response.
	// Auto retains its historical first choice; Chat-only gateways must select
	// chat_completions explicitly. Text-generation negotiation is independent.
	switch p.protocolMode {
	case "chat_completions":
		return p.openAIChatCompletionsImage(ctx, req)
	case "", "auto", "responses":
		return p.openAIResponsesImage(ctx, req)
	default:
		return ImageResult{}, errors.New("unsupported image protocol mode")
	}
}

func (p *HTTPProvider) openAIChatCompletionsImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	stream := p.streamMode != "never"
	headers := p.officialOpenAIClientRequestHeaders(req.ClientRequestID)
	resp, err := p.doWithHeaders(ctx, "/v1/chat/completions", map[string]any{
		"model":  p.model,
		"stream": stream,
		"messages": []map[string]any{
			{
				"role":    "user",
				"content": req.Prompt,
			},
		},
	}, headers)
	if err != nil {
		return ImageResult{}, err
	}
	defer resp.Body.Close()
	result, err := decodeOpenAIImageResponse(resp)
	result.Evidence = p.responseEvidence(resp, len(headers) > 0)
	return result, err
}

func (p *HTTPProvider) openAIResponsesImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	stream := p.streamMode != "never"
	headers := p.officialOpenAIClientRequestHeaders(req.ClientRequestID)
	resp, err := p.doWithHeaders(ctx, "/v1/responses", map[string]any{
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
	}, headers)
	if err != nil {
		return ImageResult{}, err
	}
	defer resp.Body.Close()
	result, err := decodeOpenAIImageResponse(resp)
	result.Evidence = p.responseEvidence(resp, len(headers) > 0)
	return result, err
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
