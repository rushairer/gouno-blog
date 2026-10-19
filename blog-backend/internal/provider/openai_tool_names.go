package provider

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

func mapOpenAIToolNames(req Request) (Request, map[string]string, error) {
	originals := make(map[string]string)
	encode := func(name string) (string, error) {
		if name == "" {
			return "", errors.New("openai tool name must not be empty")
		}
		wireName := name
		valid := len(name) <= 64
		for _, character := range name {
			if !isOpenAIToolNameCharacter(character) {
				valid = false
			}
		}
		if !valid {
			prefix := strings.Map(func(character rune) rune {
				if isOpenAIToolNameCharacter(character) {
					return character
				}
				return '_'
			}, name)
			if len(prefix) > 47 {
				prefix = prefix[:47]
			}
			digest := sha256.Sum256([]byte(name))
			wireName = prefix + "_" + hex.EncodeToString(digest[:8])
		}
		if original, exists := originals[wireName]; exists && original != name {
			return "", errors.New("openai tool name alias collision")
		}
		originals[wireName] = name
		return wireName, nil
	}

	mapped := req
	mapped.Tools = append([]ToolDefinition(nil), req.Tools...)
	for index := range mapped.Tools {
		name, err := encode(mapped.Tools[index].Name)
		if err != nil {
			return Request{}, nil, err
		}
		mapped.Tools[index].Name = name
	}
	mapped.Messages = append([]Message(nil), req.Messages...)
	for index := range mapped.Messages {
		mapped.Messages[index].ToolCalls = append([]ToolCall(nil), req.Messages[index].ToolCalls...)
		for callIndex := range mapped.Messages[index].ToolCalls {
			name, err := encode(mapped.Messages[index].ToolCalls[callIndex].Name)
			if err != nil {
				return Request{}, nil, err
			}
			mapped.Messages[index].ToolCalls[callIndex].Name = name
		}
	}
	if req.ToolChoice != "" {
		name, err := encode(req.ToolChoice)
		if err != nil {
			return Request{}, nil, err
		}
		mapped.ToolChoice = name
	}
	return mapped, originals, nil
}

func isOpenAIToolNameCharacter(character rune) bool {
	return character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' ||
		character >= '0' && character <= '9' || character == '_' || character == '-'
}
