package media

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Store keeps media bytes separate from their database metadata. URLs are
// stable regardless of whether bytes live on local disk or S3-compatible
// object storage.
type Store interface {
	Put(context.Context, string, io.Reader, string) error
	Delete(context.Context, string) error
	URL(string) string
	LocalPath(string) (string, bool)
}

type localStore struct{ dir string }

func NewLocal(dir string) Store { return &localStore{dir: dir} }
func (s *localStore) path(key string) (string, error) {
	if key == "" || key != filepath.Base(key) || key == "." {
		return "", fmt.Errorf("invalid media key")
	}
	return filepath.Join(s.dir, key), nil
}
func (s *localStore) Put(_ context.Context, key string, body io.Reader, _ string) error {
	path, err := s.path(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.dir, 0o750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.dir, ".upload-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err = io.Copy(tmp, body); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Chmod(0o640); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
func (s *localStore) Delete(_ context.Context, key string) error {
	path, err := s.path(key)
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
func (s *localStore) URL(key string) string { return "/media/" + url.PathEscape(key) }
func (s *localStore) LocalPath(key string) (string, bool) {
	path, err := s.path(key)
	return path, err == nil
}

type s3Store struct {
	client                     *s3.Client
	bucket, prefix, publicBase string
}

func NewS3(ctx context.Context, bucket, region, endpoint, publicBase, prefix string) (Store, error) {
	bucket, region = strings.TrimSpace(bucket), strings.TrimSpace(region)
	if bucket == "" || region == "" || strings.TrimSpace(publicBase) == "" {
		return nil, fmt.Errorf("BLOG_MEDIA_S3_BUCKET, BLOG_MEDIA_S3_REGION and BLOG_MEDIA_S3_PUBLIC_BASE_URL are required for S3 media storage")
	}
	publicURL, err := validatedPublicBase(publicBase)
	if err != nil {
		return nil, err
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if strings.TrimSpace(endpoint) != "" {
			o.BaseEndpoint = aws.String(strings.TrimSpace(endpoint))
			o.UsePathStyle = true
		}
	})
	return &s3Store{client: client, bucket: bucket, prefix: strings.Trim(strings.TrimSpace(prefix), "/"), publicBase: publicURL}, nil
}

func validatedPublicBase(value string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Host == "" || parsed.User != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("BLOG_MEDIA_S3_PUBLIC_BASE_URL must be an absolute HTTP(S) origin or path prefix")
	}
	return strings.TrimRight(parsed.String(), "/"), nil
}
func (s *s3Store) objectKey(key string) string {
	if s.prefix == "" {
		return key
	}
	return s.prefix + "/" + key
}
func (s *s3Store) Put(ctx context.Context, key string, body io.Reader, contentType string) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(s.objectKey(key)), Body: body, ContentType: aws.String(contentType)})
	return err
}
func (s *s3Store) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(s.objectKey(key))})
	return err
}
func (s *s3Store) URL(key string) string {
	return s.publicBase + "/" + url.PathEscape(s.objectKey(key))
}
func (s *s3Store) LocalPath(string) (string, bool) { return "", false }

func FromEnvironment(ctx context.Context, localDir string) (Store, error) {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("BLOG_MEDIA_STORAGE")), "s3") {
		return NewS3(ctx, os.Getenv("BLOG_MEDIA_S3_BUCKET"), os.Getenv("BLOG_MEDIA_S3_REGION"), os.Getenv("BLOG_MEDIA_S3_ENDPOINT"), os.Getenv("BLOG_MEDIA_S3_PUBLIC_BASE_URL"), os.Getenv("BLOG_MEDIA_S3_PREFIX"))
	}
	return NewLocal(localDir), nil
}
