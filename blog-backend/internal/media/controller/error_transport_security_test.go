package controller

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	mediadomain "github.com/rushairer/blog-backend/internal/media/domain"
	mediaservice "github.com/rushairer/blog-backend/internal/media/service"
)

type mediaDeleteTransportFixture struct {
	mediaservice.Service
	deleteErr error
	deletes int
}

func (f *mediaDeleteTransportFixture) CountMediaReferences(context.Context, int64) (int64, error) {
	return 0, nil
}

func (f *mediaDeleteTransportFixture) DeleteMedia(context.Context, int64) (*mediadomain.MediaAsset, error) {
	f.deletes++
	return nil, f.deleteErr
}

func TestMediaDeleteKeepsTrustedConflictAndRedactsDatabaseFailures(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const marker = "PRIVATE_SQL_OR_MEDIA_ASSET_METADATA"
	for _, tc := range []struct {
		name string
		err error
		wantStatus int
		wantMessage string
	}{
		{
			"wrapped_media_in_use",
			fmt.Errorf("%s: %w", marker, mediaservice.ErrMediaInUse),
			http.StatusConflict,
			mediaservice.ErrMediaInUse.Error(),
		},
		{
			"unknown_storage_failure",
			errors.New(marker),
			http.StatusInternalServerError,
			"internal server error",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fixture := &mediaDeleteTransportFixture{deleteErr: tc.err}
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Params = gin.Params{{Key: "id", Value: "42"}}
			c.Request = httptest.NewRequest(http.MethodDelete, "/api/admin/media/42", nil)
			New(fixture, nil).Delete(c)
			if fixture.deletes != 1 || rec.Code != tc.wantStatus ||
				!strings.Contains(rec.Body.String(), tc.wantMessage) ||
				strings.Contains(rec.Body.String(), marker) {
				t.Fatalf("unsafe media delete response: calls=%d status=%d body=%s",
					fixture.deletes, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestMediaUploadValidationUsesOnlyKnownStaticErrors(t *testing.T) {
	const marker = "PRIVATE_STORAGE_CAUSE_AND_CLIENT_FIELD"
	for _, known := range []error{
		errMediaSize, errMediaRead, errMediaUnsupported,
		errSVGInvalid, errSVGActive, errSVGHandlers, errSVGBase,
		errSVGExternal, errSVGAttribute, errSVGStyle,
		errSVGDirectives, errSVGInstructions,
	} {
		t.Run(known.Error(), func(t *testing.T) {
			message, ok := mediaValidationPublicMessage(fmt.Errorf("%s: %w", marker, known))
			if !ok || message != known.Error() || strings.Contains(message, marker) {
				t.Fatalf("known media error lost fixed public message: known=%q actual=%q ok=%v",
					known, message, ok)
			}
			if text, ok := mediaValidationPublicMessage(errors.New(known.Error())); ok || text != "" {
				t.Fatal("an unrelated error with matching message was mistaken for a trusted sentinel")
			}
		})
	}
	if text, ok := mediaValidationPublicMessage(errors.New(marker)); ok || text != "" {
		t.Fatal("unknown storage error was classified as safe client validation")
	}
}

func multipartMediaRequest(t *testing.T, data []byte, filename string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/admin/media", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestMediaUploadRejectsUnsupportedAndActiveSVGWithoutEchoingPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const marker = "PRIVATE_SVG_DOCUMENT_CONTENT_NEVER_ECHO"
	for _, tc := range []struct {
		name string
		filename string
		content []byte
		wantMessage string
	}{
		{"unsupported_text", "bad.txt", []byte("plain text " + marker), errMediaUnsupported.Error()},
		{"active_svg", "bad.svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>` + marker + `</script></svg>`), errSVGActive.Error()},
		{"zero_byte_file", "empty.png", nil, errMediaSize.Error()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = multipartMediaRequest(t, tc.content, tc.filename)
			New(nil, nil).Upload(c) // No storage/service may be used on denial.
			if rec.Code != http.StatusBadRequest ||
				!strings.Contains(rec.Body.String(), tc.wantMessage) ||
				strings.Contains(rec.Body.String(), marker) {
				t.Fatalf("invalid uploaded image leaked or misclassified: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestMediaUploadMultipartPayloadOver11MiBReturnsSafe413(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "large.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.CopyN(part, strings.NewReader(strings.Repeat("z", maxMediaSize+(1<<20)+4096)), maxMediaSize+(1<<20)+4096); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/media", &body)
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	New(nil, nil).Upload(c)
	if rec.Code != http.StatusRequestEntityTooLarge ||
		!strings.Contains(rec.Body.String(), "image upload request exceeds 11 MiB") ||
		strings.Contains(rec.Body.String(), "http: request body too large") {
		t.Fatalf("multipart upload size bound returned wrong status or raw parser error: %d %s",
			rec.Code, rec.Body.String())
	}
}


type failingMediaReader struct{ err error }
func (r failingMediaReader) Read([]byte) (int, error) { return 0, r.err }

type finalMediaReader struct { data []byte }
func (r finalMediaReader) Read(out []byte) (int, error) {
	return copy(out, r.data), io.EOF
}

func TestMediaSniffPreservesUnexpectedReadFailuresButAcceptsFinalShortRead(t *testing.T) {
	const marker = "PRIVATE_MEDIA_TMP_FILE_OR_DISK_FAILURE"
	if _, err := readMediaSample(failingMediaReader{errors.New(marker)}); err == nil ||
		err.Error() != marker {
		t.Fatalf("unexpected media I/O failure was discarded before internal logging: %v", err)
	} else if _, safe := mediaValidationPublicMessage(err); safe {
		t.Fatal("unexpected storage read error was classified as safe 400 text")
	}
	if _, err := readMediaSample(finalMediaReader{}); !errors.Is(err, errMediaRead) {
		t.Fatalf("empty data was not a recognized validation error: %v", err)
	}
	data, err := readMediaSample(finalMediaReader{[]byte("a short final chunk")})
	if err != nil || string(data) != "a short final chunk" {
		t.Fatalf("final read with both bytes and EOF was improperly rejected: data=%q err=%v", data, err)
	}
}

func TestSVGParserDistinguishesMalformedXMLFromUnexpectedReadIO(t *testing.T) {
	const marker = "PRIVATE_XML_TEMP_DISK_ERROR"
	malformed := validateStaticSVG(strings.NewReader("<svg><path></svg>"))
	if !errors.Is(malformed, errSVGInvalid) {
		t.Fatalf("invalid user SVG syntax should retain the fixed bad-request sentinel: %v", malformed)
	}
	err := validateStaticSVG(failingMediaReader{errors.New(marker)})
	if err == nil || err.Error() != marker {
		t.Fatalf("unexpected streaming XML I/O error lost its server-side cause: %v", err)
	}
	if message, ok := mediaValidationPublicMessage(err); ok || message != "" {
		t.Fatalf("unsafe XML stream failure was exposed as client validation: %q", message)
	}
}
