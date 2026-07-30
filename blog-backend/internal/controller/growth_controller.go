package controller

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/gouno"
)

const maxMediaSize = 10 << 20

var allowedMediaTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

type GrowthController struct {
	growth    *service.GrowthService
	posts     *service.PostService
	community *service.CommunityService
	mediaDir  string
}

func NewGrowthController(growth *service.GrowthService, posts *service.PostService, community *service.CommunityService, mediaDir string) *GrowthController {
	return &GrowthController{growth: growth, posts: posts, community: community, mediaDir: mediaDir}
}

func (ctrl *GrowthController) RelatedPosts(c *gin.Context) {
	post, err := ctrl.community.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	posts, err := ctrl.growth.RelatedPosts(c.Request.Context(), post)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(posts))
}

func (ctrl *GrowthController) TrackView(c *gin.Context) {
	post, err := ctrl.community.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	if err := ctrl.posts.IncrementViews(c.Request.Context(), post.ID); err != nil {
		writeServiceError(c, err)
		return
	}
	identity := c.ClientIP()
	if value, exists := c.Get("account_id"); exists {
		if subject, ok := value.(string); ok && subject != "" {
			identity = "user:" + subject
		}
	}
	sum := sha256.Sum256([]byte(identity))
	if err := ctrl.growth.RecordView(c.Request.Context(), post.ID, hex.EncodeToString(sum[:])); err != nil {
		log.Printf("could not record analytics event: %v", err)
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *GrowthController) ListVersions(c *gin.Context) {
	postID, ok := positiveID(c, "id")
	if !ok {
		return
	}
	versions, err := ctrl.growth.ListVersions(c.Request.Context(), postID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(versions))
}

func (ctrl *GrowthController) RestoreVersion(c *gin.Context) {
	postID, ok := positiveID(c, "id")
	if !ok {
		return
	}
	versionID, ok := positiveID(c, "versionID")
	if !ok {
		return
	}
	post, err := ctrl.growth.RestoreVersion(c.Request.Context(), postID, versionID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *GrowthController) ListMedia(c *gin.Context) {
	assets, err := ctrl.growth.ListMedia(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(assets))
}

func (ctrl *GrowthController) UploadMedia(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxMediaSize+(1<<20))
	header, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "image file is required"))
		return
	}
	contentType, extension, err := validateMedia(header)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	storageName, err := randomMediaName(extension)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	if err := os.MkdirAll(ctrl.mediaDir, 0o755); err != nil {
		writeServiceError(c, err)
		return
	}
	target := filepath.Join(ctrl.mediaDir, storageName)
	if err := c.SaveUploadedFile(header, target); err != nil {
		writeServiceError(c, err)
		return
	}
	asset := &domain.MediaAsset{
		Filename: header.Filename, StorageName: storageName, URL: "/media/" + storageName,
		ContentType: contentType, SizeBytes: header.Size, AltText: strings.TrimSpace(c.PostForm("alt_text")),
	}
	if subject, exists := c.Get("account_id"); exists {
		if value, ok := subject.(string); ok && value != "" {
			asset.CreatedBy = &value
		}
	}
	if err := ctrl.growth.CreateMedia(c.Request.Context(), asset); err != nil {
		_ = os.Remove(target)
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(asset))
}

func (ctrl *GrowthController) DeleteMedia(c *gin.Context) {
	id, ok := positiveID(c, "id")
	if !ok {
		return
	}
	asset, err := ctrl.growth.DeleteMedia(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrMediaInUse) {
			c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, err.Error()))
			return
		}
		writeServiceError(c, err)
		return
	}
	if err := os.Remove(filepath.Join(ctrl.mediaDir, asset.StorageName)); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Printf("could not remove media file %q: %v", asset.StorageName, err)
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *GrowthController) Analytics(c *gin.Context) {
	summary, err := ctrl.growth.AnalyticsSummary(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(summary))
}

func positiveID(c *gin.Context, name string) (int64, bool) {
	id, err := strconv.ParseInt(c.Param(name), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, fmt.Sprintf("invalid %s", name)))
		return 0, false
	}
	return id, true
}

func validateMedia(header *multipart.FileHeader) (string, string, error) {
	if header.Size <= 0 || header.Size > maxMediaSize {
		return "", "", errors.New("image must be no larger than 10 MB")
	}
	file, err := header.Open()
	if err != nil {
		return "", "", err
	}
	defer file.Close()
	buffer := make([]byte, 512)
	n, err := file.Read(buffer)
	if err != nil {
		return "", "", errors.New("could not read image")
	}
	contentType := http.DetectContentType(buffer[:n])
	extension, ok := allowedMediaTypes[contentType]
	if !ok {
		return "", "", errors.New("only JPEG, PNG, WebP and GIF images are supported")
	}
	return contentType, extension, nil
}

func randomMediaName(extension string) (string, error) {
	value := make([]byte, 18)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value) + extension, nil
}
