package workflow

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	jsonschema "github.com/santhosh-tekuri/jsonschema/v5"
)

var supportedResourceTypes = map[string]bool{
	"post": true, "comment": true, "media_asset": true,
	"operational_suggestion": true, "category": true, "tag": true,
	"page": true,
}

func validateInputSchema(raw json.RawMessage) error {
	compiler := jsonschema.NewCompiler()
	compiler.Draft = jsonschema.Draft2020
	if err := compiler.AddResource("workflow-input.json", bytes.NewReader(raw)); err != nil {
		return fmt.Errorf("%w: invalid input schema: %v", ErrInvalid, err)
	}
	if _, err := compiler.Compile("workflow-input.json"); err != nil {
		return fmt.Errorf("%w: invalid input schema: %v", ErrInvalid, err)
	}
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil || value["type"] != "object" {
		return fmt.Errorf("%w: input schema must describe an object", ErrInvalid)
	}
	properties, _ := value["properties"].(map[string]any)
	for name, rawProperty := range properties {
		property, _ := rawProperty.(map[string]any)
		if defaultValue, hasDefault := property["default"]; hasDefault {
			propertyRaw, err := json.Marshal(property)
			if err != nil {
				return fmt.Errorf("%w: input field %q has an invalid default", ErrInvalid, name)
			}
			propertyCompiler := jsonschema.NewCompiler()
			propertyCompiler.Draft = jsonschema.Draft2020
			if err := propertyCompiler.AddResource("workflow-input-property.json", bytes.NewReader(propertyRaw)); err != nil {
				return fmt.Errorf("%w: input field %q has an invalid default schema", ErrInvalid, name)
			}
			propertySchema, err := propertyCompiler.Compile("workflow-input-property.json")
			if err != nil || propertySchema.Validate(defaultValue) != nil {
				return fmt.Errorf("%w: input field %q default does not match its schema", ErrInvalid, name)
			}
		}
		resourceType, _ := property["x-gouno-resource"].(string)
		if resourceType == "" {
			continue
		}
		if !supportedResourceTypes[resourceType] {
			return fmt.Errorf("%w: input field %q uses unsupported resource type %q", ErrInvalid, name, resourceType)
		}
		fieldType, _ := property["type"].(string)
		if fieldType != "array" && fieldType != "integer" && fieldType != "string" {
			return fmt.Errorf("%w: resource input field %q must be an array, integer, or string", ErrInvalid, name)
		}
		expectedType := "integer"
		if resourceType == "tag" {
			expectedType = "string"
		}
		valueType := fieldType
		if fieldType == "array" {
			items, _ := property["items"].(map[string]any)
			valueType, _ = items["type"].(string)
		}
		if valueType != expectedType {
			return fmt.Errorf("%w: resource input field %q must use %s keys", ErrInvalid, name, expectedType)
		}
	}
	return nil
}

func validateWorkflowInput(schemaRaw json.RawMessage, value any) error {
	compiler := jsonschema.NewCompiler()
	compiler.Draft = jsonschema.Draft2020
	if err := compiler.AddResource("workflow-input.json", bytes.NewReader(schemaRaw)); err != nil {
		return fmt.Errorf("%w: invalid input schema", ErrInvalid)
	}
	schema, err := compiler.Compile("workflow-input.json")
	if err != nil {
		return fmt.Errorf("%w: invalid input schema", ErrInvalid)
	}
	if err := schema.Validate(value); err != nil {
		return fmt.Errorf("%w: input does not match schema: %s", ErrInvalid, compactSchemaError(err))
	}
	return nil
}

func compactSchemaError(err error) string {
	text := strings.ReplaceAll(err.Error(), "workflow-input.json#", "input")
	lines := strings.Split(text, "\n")
	if len(lines) > 3 {
		lines = lines[:3]
	}
	return strings.Join(lines, " ")
}

func resourceFields(schemaRaw json.RawMessage) (map[string]string, error) {
	var schema struct {
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.Unmarshal(schemaRaw, &schema); err != nil {
		return nil, err
	}
	result := map[string]string{}
	for name, raw := range schema.Properties {
		var property struct {
			ResourceType string `json:"x-gouno-resource"`
		}
		if json.Unmarshal(raw, &property) == nil && property.ResourceType != "" {
			result[name] = property.ResourceType
		}
	}
	return result, nil
}

func normalizeScopePolicy(policy domain.WorkflowScopePolicy, hasResources bool) (domain.WorkflowScopePolicy, error) {
	if policy.Mode == "" {
		if hasResources {
			policy.Mode = "strict"
		} else {
			policy.Mode = "unscoped"
		}
	}
	if policy.Mode != "strict" && policy.Mode != "unscoped" {
		return policy, fmt.Errorf("%w: scope mode must be strict or unscoped", ErrInvalid)
	}
	seen := map[string]bool{}
	clean := make([]string, 0, len(policy.DiscoveryTools))
	for _, name := range policy.DiscoveryTools {
		name = strings.TrimSpace(name)
		if name != "" && !seen[name] {
			seen[name] = true
			clean = append(clean, name)
		}
	}
	policy.DiscoveryTools = clean
	return policy, nil
}
