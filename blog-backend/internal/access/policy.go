package access

import (
	"github.com/rushairer/blog-backend/internal/domain"
)

// PostPolicy defines access and authorization rules for posts.
type PostPolicy struct{}

// ScopePosts modifies the filter based on the actor's permissions.
// Both authors and managers can browse all posts for team collaboration, unless a specific filter is set.
func (p *PostPolicy) ScopePosts(actor *Snapshot, filter *domain.AdminPostFilter) {
	if actor == nil || filter == nil {
		return
	}
}

// CanView checks if the actor can view the post in admin (read-only for non-owned posts).
func (p *PostPolicy) CanView(actor *Snapshot, post *domain.Post) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限访问"
	}
	if actor.HasAnyPermission(PermissionAuthorContent, PermissionManageContent) {
		return true, ""
	}
	return false, "您没有权限查看文章"
}

// CanReadPost enforces unified Blog RBAC/ABAC policy for reading posts via public or admin endpoints.
// Published posts are readable by anyone (including anonymous).
// Unpublished/draft posts are readable ONLY by active Blog members who:
// 1) Have content.manage permission (Editor, Admin, Owner); OR
// 2) Have content.author permission AND are the verified creator of the post (post.CreatedByPrincipalID == actor.Principal.ID).
// Legacy authorless drafts and other authors' drafts are rejected.
func (p *PostPolicy) CanReadPost(actor *Snapshot, post *domain.Post) (bool, string) {
	if post == nil {
		return false, "post not found"
	}
	if post.Status == domain.PostStatusPublished {
		return true, ""
	}
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "post not found"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	if actor.HasPermission(PermissionAuthorContent) {
		if post.CreatedByPrincipalID != nil && *post.CreatedByPrincipalID == actor.Principal.ID {
			return true, ""
		}
		return false, "post not found"
	}
	return false, "post not found"
}

// CanCreate checks if the actor can create a new post.
func (p *PostPolicy) CanCreate(actor *Snapshot) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限创建文章"
	}
	if actor.HasAnyPermission(PermissionAuthorContent, PermissionManageContent) {
		return true, ""
	}
	return false, "您没有权限创建文章"
}

// CanEdit checks if the actor can update the post.
// Managers can edit any post; Authors can ONLY edit their own posts.
func (p *PostPolicy) CanEdit(actor *Snapshot, post *domain.Post) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限编辑文章"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	if actor.HasPermission(PermissionAuthorContent) {
		if post != nil && post.CreatedByPrincipalID != nil && *post.CreatedByPrincipalID == actor.Principal.ID {
			return true, ""
		}
		return false, "您仅能编辑自己创建的文章（他人文章仅供只读查看）"
	}
	return false, "您没有权限编辑该文章"
}

// CanDelete checks if the actor can delete the post.
func (p *PostPolicy) CanDelete(actor *Snapshot, post *domain.Post) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限删除文章"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	return false, "仅编辑或管理员具备删除文章权限"
}

// CanRestoreVersion checks if the actor can restore a version of the post.
func (p *PostPolicy) CanRestoreVersion(actor *Snapshot, post *domain.Post) (bool, string) {
	return p.CanEdit(actor, post)
}

// MediaPolicy defines access and authorization rules for media assets.
type MediaPolicy struct{}

// ScopeMedia modifies the filter based on the actor's permissions.
// Both authors and managers can browse media library for insertion into articles.
func (p *MediaPolicy) ScopeMedia(actor *Snapshot, filter *domain.MediaFilter) {
	if actor == nil || filter == nil {
		return
	}
}

// CanView checks if the actor can view the media asset.
func (p *MediaPolicy) CanView(actor *Snapshot, media *domain.MediaAsset) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限查看媒体"
	}
	if actor.HasAnyPermission(PermissionAuthorContent, PermissionManageContent) {
		return true, ""
	}
	return false, "无权限查看媒体"
}

// CanUpload checks if the actor can upload media.
func (p *MediaPolicy) CanUpload(actor *Snapshot) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限上传媒体"
	}
	if actor.HasAnyPermission(PermissionAuthorContent, PermissionManageContent) {
		return true, ""
	}
	return false, "无权限上传媒体"
}

// CanUpdate checks if the actor can update media alt text.
// Managers can update any media; Authors can ONLY update their own media.
func (p *MediaPolicy) CanUpdate(actor *Snapshot, media *domain.MediaAsset) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限编辑媒体"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	if actor.HasPermission(PermissionAuthorContent) {
		if media != nil && media.CreatedByPrincipalID != nil && *media.CreatedByPrincipalID == actor.Principal.ID {
			return true, ""
		}
		return false, "您仅能编辑自己上传的媒体素材"
	}
	return false, "无权限编辑媒体"
}

// CanDelete checks if the actor can delete the media asset.
// Managers can delete any unreferenced media; Authors can ONLY delete their own unreferenced media.
func (p *MediaPolicy) CanDelete(actor *Snapshot, media *domain.MediaAsset, referencesCount int64) (bool, string) {
	if referencesCount > 0 {
		return false, "该媒体仍被文章引用，移除引用后才能删除。"
	}
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限删除媒体"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	if actor.HasPermission(PermissionAuthorContent) {
		if media != nil && media.CreatedByPrincipalID != nil && *media.CreatedByPrincipalID == actor.Principal.ID {
			return true, ""
		}
		return false, "您只能删除自己上传的媒体图片"
	}
	return false, "无权限删除媒体"
}

// PagePolicy defines access and authorization rules for pages.
type PagePolicy struct{}

// CanReadPage enforces unified Blog RBAC/ABAC policy for reading pages.
// Published pages are readable by anyone (including anonymous).
// Unpublished/draft pages are readable ONLY by active Blog members with content.manage permission (Editor, Admin, Owner).
func (p *PagePolicy) CanReadPage(actor *Snapshot, page *domain.Page) (bool, string) {
	if page == nil {
		return false, "page not found"
	}
	if page.Status == domain.PageStatusPublished {
		return true, ""
	}
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "page not found"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	return false, "page not found"
}
