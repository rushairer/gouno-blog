package provider

import (
	"context"
	"encoding/json"
)

func (p *HTTPProvider) anthropicGenerate(ctx context.Context, req Request) (Result, error) {
	messages := make([]any, 0, len(req.Messages))
	for _, message := range req.Messages {
		if message.Role == "tool" {
			messages = append(messages, map[string]any{
				"role":    "user",
				"content": []any{map[string]any{"type": "tool_result", "tool_use_id": message.ToolCallID, "content": message.Content}},
			})
			continue
		}
		content := make([]any, 0, len(message.ToolCalls)+1)
		if message.Content != "" {
			content = append(content, map[string]any{"type": "text", "text": message.Content})
		}
		for _, call := range message.ToolCalls {
			var input any
			if err := json.Unmarshal(call.Arguments, &input); err != nil {
				return Result{}, err
			}
			content = append(content, map[string]any{"type": "tool_use", "id": call.ID, "name": call.Name, "input": input})
		}
		role := message.Role
		if role != "assistant" {
			role = "user"
		}
		messages = append(messages, map[string]any{"role": role, "content": content})
	}
	body := map[string]any{
		"model": p.model, "max_tokens": req.MaxTokens, "system": req.Instructions, "messages": messages,
	}
	if req.MaxTokens <= 0 {
		body["max_tokens"] = 2000
	}
	if len(req.Tools) > 0 {
		tools := make([]any, 0, len(req.Tools))
		for _, tool := range req.Tools {
			var schema any
			if err := json.Unmarshal(tool.Parameters, &schema); err != nil {
				return Result{}, err
			}
			tools = append(tools, map[string]any{
				"name": tool.Name, "description": tool.Description, "input_schema": schema,
			})
		}
		body["tools"] = tools
	}
	resp, err := p.do(ctx, "/v1/messages", body)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()
	var decoded struct {
		Content []struct {
			Type  string          `json:"type"`
			Text  string          `json:"text"`
			ID    string          `json:"id"`
			Name  string          `json:"name"`
			Input json.RawMessage `json:"input"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
		Usage      struct {
			InputTokens  int64 `json:"input_tokens"`
			OutputTokens int64 `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return Result{}, err
	}
	result := Result{
		InputTokens: decoded.Usage.InputTokens, OutputTokens: decoded.Usage.OutputTokens,
		StopReason: decoded.StopReason,
	}
	for _, block := range decoded.Content {
		switch block.Type {
		case "text":
			result.Text += block.Text
		case "tool_use":
			result.ToolCalls = append(result.ToolCalls, ToolCall{ID: block.ID, Name: block.Name, Arguments: block.Input})
		}
	}
	return result, nil
}
