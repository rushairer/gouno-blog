package controller

import (
	"github.com/gin-gonic/gin"
	sitecontroller "github.com/rushairer/blog-backend/internal/site/controller"
	"github.com/rushairer/blog-backend/internal/service"
	taxonomycontroller "github.com/rushairer/blog-backend/internal/taxonomy/controller"
)

// ContentController is retained as a compatibility facade while callers move
// to the capability-owned Taxonomy and Site controllers.
type ContentController struct {
	taxonomy *taxonomycontroller.Controller
	site     *sitecontroller.Controller
}

func NewContentController(svc service.CategoryService) *ContentController {
	return &ContentController{
		taxonomy: taxonomycontroller.New(svc),
		site:     sitecontroller.New(svc),
	}
}

func validSiteURL(value string, allowPath bool) bool {
	return service.ValidSiteURL(value, allowPath)
}

func (ctrl *ContentController) ListCategories(c *gin.Context) {
	ctrl.taxonomy.ListCategories(c)
}

func (ctrl *ContentController) ListPublishedTagSummaries(c *gin.Context) {
	ctrl.taxonomy.ListPublishedTagSummaries(c)
}

func (ctrl *ContentController) ListCategoryPosts(c *gin.Context) {
	ctrl.taxonomy.ListCategoryPosts(c)
}

func (ctrl *ContentController) CreateCategory(c *gin.Context) {
	ctrl.taxonomy.CreateCategory(c)
}

func (ctrl *ContentController) UpdateCategory(c *gin.Context) {
	ctrl.taxonomy.UpdateCategory(c)
}

func (ctrl *ContentController) DeleteCategory(c *gin.Context) {
	ctrl.taxonomy.DeleteCategory(c)
}

func (ctrl *ContentController) ListAdminTags(c *gin.Context) {
	ctrl.taxonomy.ListAdminTags(c)
}

func (ctrl *ContentController) RenameTag(c *gin.Context) {
	ctrl.taxonomy.RenameTag(c)
}

func (ctrl *ContentController) DeleteTag(c *gin.Context) {
	ctrl.taxonomy.DeleteTag(c)
}

func (ctrl *ContentController) MergeTags(c *gin.Context) {
	ctrl.taxonomy.MergeTags(c)
}

func (ctrl *ContentController) GetSiteSettings(c *gin.Context) {
	ctrl.site.GetSiteSettings(c)
}

func (ctrl *ContentController) UpdateSiteSettings(c *gin.Context) {
	ctrl.site.UpdateSiteSettings(c)
}
