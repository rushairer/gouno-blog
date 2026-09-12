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
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/media"
	mediaservice "github.com/rushairer/blog-backend/internal/media/service"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
)

const maxMediaSize = 10 << 20

var allowedMediaTypes = map[string]string{
	"image/jpeg":               ".jpg",
	"image/png":                ".png",
	"image/webp":               ".webp",
	"image/gif":                ".gif",
	"image/svg+xml":            ".svg",
	"image/x-icon":             ".ico",
	"image/vnd.microsoft.icon": ".ico",
	"image/avif":               ".avif",
	"image/bmp":                ".bmp",
}

type Controller struct {
	service mediaservice.Service
	store   media.Store
	policy  access.MediaPolicy
}

func New(service mediaservice.Service, store media.Store) *Controller {
	return &Controller{service: service, store: store}
}

func (ctrl *Controller) List(c *gin.Context) {
	filter := domain.MediaFilter{}
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		ctrl.policy.ScopeMedia(&snapshot, &filter)
	}
	assets, err := ctrl.service.ListMedia(c.Request.Context(), filter)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(assets))
}

func (ctrl *Controller) Upload(c *gin.Context) {
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		if allowed, reason := ctrl.policy.CanUpload(&snapshot); !allowed {
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
		controllerutil.WriteDomainError(c, err)
		return
	}
	source, err := header.Open()
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	defer source.Close()
	if err := ctrl.store.Put(c.Request.Context(), storageName, source, contentType); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	asset := &domain.MediaAsset{
		Filename: header.Filename, StorageName: storageName, URL: ctrl.store.URL(storageName),
		ContentType: contentType, SizeBytes: header.Size, AltText: strings.TrimSpace(c.PostForm("alt_text")),
	}
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok && snapshot.Principal.ID > 0 {
		asset.CreatedByPrincipalID = &snapshot.Principal.ID
		asset.UpdatedByPrincipalID = &snapshot.Principal.ID
	}
	if err := ctrl.service.CreateMedia(c.Request.Context(), asset); err != nil {
		_ = ctrl.store.Delete(c.Request.Context(), storageName)
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(asset))
}

type UpdateRequest struct {
	AltText string `json:"alt_text"`
}

func (ctrl *Controller) Update(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req UpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid request body"))
		return
	}
	var updatedBy *int64
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		asset, err := ctrl.service.GetMedia(c.Request.Context(), id)
		if err != nil {
			controllerutil.WriteDomainError(c, err)
			return
		}
		if allowed, reason := ctrl.policy.CanUpdate(&snapshot, asset); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
		if snapshot.Principal.ID > 0 {
			updatedBy = &snapshot.Principal.ID
		}
	}
	asset, err := ctrl.service.UpdateMedia(c.Request.Context(), id, req.AltText, updatedBy)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(asset))
}

func (ctrl *Controller) Delete(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	refCount, err := ctrl.service.CountMediaReferences(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		asset, err := ctrl.service.GetMedia(c.Request.Context(), id)
		if err != nil {
			controllerutil.WriteDomainError(c, err)
			return
		}
		if allowed, reason := ctrl.policy.CanDelete(&snapshot, asset, refCount); !allowed {
			if refCount > 0 {
				c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, reason))
			} else {
				c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			}
			return
		}
	}
	asset, err := ctrl.service.DeleteMedia(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, mediaservice.ErrMediaInUse) {
			c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, err.Error()))
			return
		}
		controllerutil.WriteDomainError(c, err)
		return
	}
	_ = ctrl.store.Delete(c.Request.Context(), asset.StorageName)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) References(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.service.ListMediaReferences(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
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
	contentType := detectMediaContentType(header.Filename, buffer[:n])
	extension, ok := allowedMediaTypes[contentType]
	if !ok {
		return "", "", errors.New("only JPEG, PNG, WebP, GIF, SVG, ICO, AVIF and BMP images are supported")
	}
	if contentType == "image/svg+xml" {
		if err := validateStaticSVGUpload(header); err != nil {
			return "", "", err
		}
	}
	return contentType, extension, nil
}

func detectMediaContentType(filename string, sample []byte) string {
	contentType := http.DetectContentType(sample)
	if _, ok := allowedMediaTypes[contentType]; ok {
		return contentType
	}

	lowerName := strings.ToLower(filename)
	if strings.HasSuffix(lowerName, ".svg") && looksLikeSVG(sample) {
		return "image/svg+xml"
	}
	if strings.HasSuffix(lowerName, ".ico") && looksLikeICO(sample) {
		return "image/x-icon"
	}
	if strings.HasSuffix(lowerName, ".avif") && looksLikeAVIF(sample) {
		return "image/avif"
	}
	return contentType
}

func looksLikeSVG(sample []byte) bool {
	value := strings.TrimSpace(strings.TrimPrefix(string(sample), "\ufeff"))
	value = strings.ToLower(value)
	return strings.Contains(value, "<svg")
}

func looksLikeICO(sample []byte) bool {
	return len(sample) >= 4 && sample[0] == 0 && sample[1] == 0 && sample[2] == 1 && sample[3] == 0
}

func looksLikeAVIF(sample []byte) bool {
	if len(sample) < 12 || string(sample[4:8]) != "ftyp" {
		return false
	}
	limit := len(sample)
	if limit > 64 {
		limit = 64
	}
	for offset := 8; offset+4 <= limit; offset += 4 {
		brand := string(sample[offset : offset+4])
		if brand == "avif" || brand == "avis" {
			return true
		}
	}
	return false
}

func randomMediaName(extension string) (string, error) {
	value := make([]byte, 18)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value) + extension, nil
}
