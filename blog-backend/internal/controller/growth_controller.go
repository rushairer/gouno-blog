package controller

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/media"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/gouno"
	"go.uber.org/zap"
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
	media     media.Store
	logger    *zap.Logger
}

func NewGrowthController(growth *service.GrowthService, posts *service.PostService, community *service.CommunityService, store media.Store, loggers ...*zap.Logger) *GrowthController {
	var l *zap.Logger
	if len(loggers) > 0 && loggers[0] != nil {
		l = loggers[0]
	} else {
		l = zap.L()
	}
	return &GrowthController{growth: growth, posts: posts, community: community, media: store, logger: l}
}

func (ctrl *GrowthController) RelatedPosts(c *gin.Context) {
	post, err := ctrl.community.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	posts, err := ctrl.growth.RelatedPosts(c.Request.Context(), post)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(posts))
}

func (ctrl *GrowthController) TrackView(c *gin.Context) {
	post, err := ctrl.community.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	if err := ctrl.posts.IncrementViews(c.Request.Context(), post.ID); err != nil {
		WriteDomainError(c, err)
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
		ctrl.logger.Warn("could not record analytics event", zap.Error(err), zap.Int64("post_id", post.ID))
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *GrowthController) ListVersions(c *gin.Context) {
	postID, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	versions, err := ctrl.growth.ListVersions(c.Request.Context(), postID)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(versions))
}

func (ctrl *GrowthController) RestoreVersion(c *gin.Context) {
	postID, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	versionID, ok := ParamPositiveID(c, "versionID")
	if !ok {
		return
	}
	post, err := ctrl.growth.RestoreVersion(c.Request.Context(), postID, versionID)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *GrowthController) ListMedia(c *gin.Context) {
	assets, err := ctrl.growth.ListMedia(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
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
		WriteDomainError(c, err)
		return
	}
	source, err := header.Open()
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	defer source.Close()
	if err := ctrl.media.Put(c.Request.Context(), storageName, source, contentType); err != nil {
		WriteDomainError(c, err)
		return
	}
	asset := &domain.MediaAsset{
		Filename: header.Filename, StorageName: storageName, URL: ctrl.media.URL(storageName),
		ContentType: contentType, SizeBytes: header.Size, AltText: strings.TrimSpace(c.PostForm("alt_text")),
	}
	if subject, exists := c.Get("account_id"); exists {
		if value, ok := subject.(string); ok && value != "" {
			asset.CreatedBy = &value
		}
	}
	if err := ctrl.growth.CreateMedia(c.Request.Context(), asset); err != nil {
		_ = ctrl.media.Delete(c.Request.Context(), storageName)
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(asset))
}

func (ctrl *GrowthController) DeleteMedia(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	asset, err := ctrl.growth.DeleteMedia(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrMediaInUse) {
			c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, err.Error()))
			return
		}
		WriteDomainError(c, err)
		return
	}
	_ = ctrl.media.Delete(c.Request.Context(), asset.StorageName)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *GrowthController) MediaReferences(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.growth.ListMediaReferences(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *GrowthController) Analytics(c *gin.Context) {
	summary, err := ctrl.growth.AnalyticsSummary(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(summary))
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
