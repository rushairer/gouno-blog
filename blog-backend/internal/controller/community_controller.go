package controller

import (
	communitycontroller "github.com/rushairer/blog-backend/internal/community/controller"
	"github.com/rushairer/blog-backend/internal/service"
	"go.uber.org/zap"
)

// CommunityController is retained as a compatibility alias while runtime
// ownership moves to internal/community/controller.
type CommunityController = communitycontroller.CommunityController

func NewCommunityController(svc *service.CommunityService, limiter service.RateLimiter, visitorSecret string, logger *zap.Logger) *CommunityController {
	return communitycontroller.NewCommunityController(svc.Canonical(), limiter, visitorSecret, logger)
}
