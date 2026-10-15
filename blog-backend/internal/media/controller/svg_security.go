package controller

import (
	"encoding/xml"
	"errors"
	"io"
	"mime/multipart"
	"strings"
)

const xmlNamespace = "http://www.w3.org/XML/1998/namespace"

var forbiddenSVGElements = map[string]struct{}{
	"script":           {},
	"foreignobject":    {},
	"iframe":           {},
	"object":           {},
	"embed":            {},
	"audio":            {},
	"video":            {},
	"canvas":           {},
	"link":             {},
	"meta":             {},
	"base":             {},
	"handler":          {},
	"animate":          {},
	"animatemotion":    {},
	"animatetransform": {},
	"set":              {},
	"discard":          {},
	"cursor":           {},
}

func validateStaticSVGUpload(header *multipart.FileHeader) error {
	file, err := header.Open()
	if err != nil {
		return err
	}
	defer file.Close()
	return validateStaticSVG(io.LimitReader(file, maxMediaSize+1))
}

func validateStaticSVG(reader io.Reader) error {
	decoder := xml.NewDecoder(reader)
	depth := 0
	styleDepth := 0
	rootSeen := false
	rootClosed := false

	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			// Malformed client XML remains a fixed 400 validation result.
			// Unexpected underlying reader/I/O faults are not client errors;
			// retain the real cause server-side for a redacted HTTP 5xx.
			var syntaxErr *xml.SyntaxError
			if errors.As(err, &syntaxErr) {
				return errSVGInvalid
			}
			return err
		}

		switch value := token.(type) {
		case xml.StartElement:
			name := strings.ToLower(value.Name.Local)
			if depth == 0 {
				if rootSeen || rootClosed || name != "svg" {
					return errSVGInvalid
				}
				rootSeen = true
			}
			if _, forbidden := forbiddenSVGElements[name]; forbidden {
				return errSVGActive
			}
			for _, attribute := range value.Attr {
				attributeName := strings.ToLower(attribute.Name.Local)
				if strings.HasPrefix(attributeName, "on") && len(attributeName) > 2 {
					return errSVGHandlers
				}
				if attribute.Name.Space == xmlNamespace && attributeName == "base" {
					return errSVGBase
				}
				if attributeName == "href" || attributeName == "src" {
					if !safeSVGReference(name, attribute.Value) {
						return errSVGExternal
					}
				}
				if unsafeSVGAttributeValue(attribute.Value) {
					return errSVGAttribute
				}
				if attributeName == "style" && unsafeSVGStyle(attribute.Value) {
					return errSVGStyle
				}
			}
			depth++
			if name == "style" {
				styleDepth++
			}

		case xml.EndElement:
			if depth <= 0 {
				return errSVGInvalid
			}
			if strings.EqualFold(value.Name.Local, "style") && styleDepth > 0 {
				styleDepth--
			}
			depth--
			if depth == 0 {
				rootClosed = true
			}

		case xml.CharData:
			if depth == 0 && strings.TrimSpace(string(value)) != "" {
				return errSVGInvalid
			}
			if styleDepth > 0 && unsafeSVGStyle(string(value)) {
				return errSVGStyle
			}

		case xml.Directive:
			return errSVGDirectives

		case xml.ProcInst:
			if !strings.EqualFold(value.Target, "xml") {
				return errSVGInstructions
			}
		}
	}

	if !rootSeen || !rootClosed || depth != 0 {
		return errSVGInvalid
	}
	return nil
}

func safeSVGReference(elementName, raw string) bool {
	value := strings.TrimSpace(raw)
	if value == "" || strings.HasPrefix(value, "#") {
		return true
	}
	if elementName != "image" && elementName != "feimage" {
		return false
	}
	lower := strings.ToLower(value)
	for _, prefix := range []string{
		"data:image/png;base64,",
		"data:image/jpeg;base64,",
		"data:image/jpg;base64,",
		"data:image/gif;base64,",
		"data:image/webp;base64,",
		"data:image/avif;base64,",
	} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

func unsafeSVGAttributeValue(raw string) bool {
	value := strings.ToLower(raw)
	if strings.Contains(value, "\\") || strings.Contains(value, "javascript:") ||
		strings.Contains(value, "vbscript:") || strings.Contains(value, "expression(") {
		return true
	}
	return containsUnsafeSVGURL(value)
}

func containsUnsafeSVGURL(raw string) bool {
	value := strings.ToLower(raw)
	for {
		index := strings.Index(value, "url(")
		if index < 0 {
			return false
		}
		value = value[index+4:]
		end := strings.IndexByte(value, ')')
		if end < 0 {
			return true
		}
		reference := strings.Trim(strings.TrimSpace(value[:end]), "\"'")
		if !strings.HasPrefix(reference, "#") {
			return true
		}
		value = value[end+1:]
	}
}

func unsafeSVGStyle(raw string) bool {
	value := strings.ToLower(raw)
	if strings.Contains(value, "@") || unsafeSVGAttributeValue(value) {
		return true
	}
	return false
}
