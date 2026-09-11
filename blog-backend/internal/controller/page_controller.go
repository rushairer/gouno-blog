package controller

import pagecontroller "github.com/rushairer/blog-backend/internal/page/controller"

// Page controller aliases are retained while route wiring and callers migrate to the capability-owned package.
type PageServiceInterface = pagecontroller.PageServiceInterface
type PageController = pagecontroller.PageController
type CreatePageRequest = pagecontroller.CreatePageRequest

func NewPageController(svc PageServiceInterface) *PageController {
	return pagecontroller.NewPageController(svc)
}
