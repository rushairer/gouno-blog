package controller

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/media"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/middleware"
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
	growth      *service.GrowthService
	posts       *service.PostService
	community   *service.CommunityService
	media       media.Store
	logger      *zap.Logger
	postPolicy  access.PostPolicy
	mediaPolicy access.MediaPolicy
}

func NewGrowthController(growth *service.GrowthService, posts *service.PostService, community *service.CommunityService, store media.Store, logger *zap.Logger) *GrowthController {
	if logger == nil {
		logger = zap.L()
	}
	return &GrowthController{growth: growth, posts: posts, community: community, media: store, logger: logger}
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
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	actor := c.ClientIP() + "|" + c.GetHeader("User-Agent")
	if err := ctrl.growth.RecordView(c.Request.Context(), id, actor); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *GrowthController) ListVersions(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if snapshot, hasAccess := middleware.CurrentBlogAccess(c); hasAccess {
		post, err := ctrl.posts.GetAdminPost(c.Request.Context(), id)
		if err != nil {
			WriteDomainError(c, err)
			return
		}
		if post == nil {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
			return
		}
		if allowed, reason := ctrl.postPolicy.CanView(&snapshot, post); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
	}
	versions, err := ctrl.growth.ListVersions(c.Request.Context(), id)
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
	if snapshot, hasAccess := middleware.CurrentBlogAccess(c); hasAccess {
		post, err := ctrl.posts.GetAdminPost(c.Request.Context(), postID)
		if err != nil {
			WriteDomainError(c, err)
			return
		}
		if post == nil {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
			return
		}
		if allowed, reason := ctrl.postPolicy.CanRestoreVersion(&snapshot, post); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
	}
	restored, err := ctrl.growth.RestoreVersion(c.Request.Context(), postID, versionID)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(restored))
}

func (ctrl *GrowthController) ListMedia(c *gin.Context) {
	filter := domain.MediaFilter{}
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		ctrl.mediaPolicy.ScopeMedia(&snapshot, &filter)
	}
	assets, err := ctrl.growth.ListMedia(c.Request.Context(), filter)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(assets))
}

func (ctrl *GrowthController) UploadMedia(c *gin.Context) {
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		if allowed, reason := ctrl.mediaPolicy.CanUpload(&snapshot); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
	}

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
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok && snapshot.Principal.ID > 0 {
		asset.CreatedByPrincipalID = &snapshot.Principal.ID
		asset.UpdatedByPrincipalID = &snapshot.Principal.ID
	}
	if err := ctrl.growth.CreateMedia(c.Request.Context(), asset); err != nil {
		_ = ctrl.media.Delete(c.Request.Context(), storageName)
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(asset))
}

type UpdateMediaRequest struct {
	AltText string `json:"alt_text"`
}

func (ctrl *GrowthController) UpdateMedia(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req UpdateMediaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid request body"))
		return
	}
	var updatedBy *int64
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		asset, err := ctrl.growth.GetMedia(c.Request.Context(), id)
		if err != nil {
			WriteDomainError(c, err)
			return
		}
		if allowed, reason := ctrl.mediaPolicy.CanUpdate(&snapshot, asset); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
		if snapshot.Principal.ID > 0 {
			updatedBy = &snapshot.Principal.ID
		}
	}
	asset, err := ctrl.growth.UpdateMedia(c.Request.Context(), id, req.AltText, updatedBy)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(asset))
}

func (ctrl *GrowthController) DeleteMedia(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	refCount, err := ctrl.growth.CountMediaReferences(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		asset, err := ctrl.growth.GetMedia(c.Request.Context(), id)
		if err != nil {
			WriteDomainError(c, err)
			return
		}
		if allowed, reason := ctrl.mediaPolicy.CanDelete(&snapshot, asset, refCount); !allowed {
			if refCount > 0 {
				c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, reason))
			} else {
				c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			}
			return
		}
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
