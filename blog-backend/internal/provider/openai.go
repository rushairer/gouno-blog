package provider

import (
	"context"
	"encoding/json"
)

func (p *HTTPProvider) Generate(ctx context.Context, req Request) (Result, error) {
	if p.name == "anthropic" {
		return p.anthropicGenerate(ctx, req)
	}
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
		body["tool_choice"] = "auto"
	}
	resp, err := p.do(ctx, "/v1/responses", body)
	if err != nil {
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
