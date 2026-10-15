package controller

import "errors"

// These identities separate safe, fixed client-facing file validation from
// arbitrary multipart filesystem and storage failures. All strings are
// existing public messages, held only in trusted server-side sentinels.
var (
	errMediaSize = errors.New("image must be no larger than 10 MB")
	errMediaRead = errors.New("could not read image")
	errMediaUnsupported = errors.New("only JPEG, PNG, WebP, GIF, SVG, ICO, AVIF and BMP images are supported")
	errSVGInvalid = errors.New("invalid SVG document")
	errSVGActive = errors.New("SVG contains active content")
	errSVGHandlers = errors.New("SVG event handlers are not allowed")
	errSVGBase = errors.New("SVG xml:base is not allowed")
	errSVGExternal = errors.New("SVG external references are not allowed")
	errSVGAttribute = errors.New("SVG attribute contains active or external content")
	errSVGStyle = errors.New("SVG style contains active or external content")
	errSVGDirectives = errors.New("SVG XML directives are not allowed")
	errSVGInstructions = errors.New("SVG processing instructions are not allowed")
)

// This allowlist is intentionally explicit: a wrapped header.Open, file.Read,
// object-store or database error must never be presented as invalid media.
// Preserve the existing detailed SVG denial messages for known static
// validation outcomes, without accepting arbitrary errors that look similar.
func mediaValidationPublicMessage(err error) (string, bool) {
	for _, recognized := range []error{
		errMediaSize, errMediaRead, errMediaUnsupported,
		errSVGInvalid, errSVGActive, errSVGHandlers, errSVGBase,
		errSVGExternal, errSVGAttribute, errSVGStyle,
		errSVGDirectives, errSVGInstructions,
	} {
		if errors.Is(err, recognized) {
			return recognized.Error(), true
		}
	}
	return "", false
}
