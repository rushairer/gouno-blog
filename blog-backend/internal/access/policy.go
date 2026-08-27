package access

import (
	"github.com/rushairer/blog-backend/internal/domain"
)

// PostPolicy defines access and authorization rules for posts.
type PostPolicy struct{}

// ScopePosts modifies the filter based on the actor's permissions.
// Authors only see their own posts, while managers (editors/admins/owners) see all posts.
func (p *PostPolicy) ScopePosts(actor *Snapshot, filter *domain.AdminPostFilter) {
	if actor == nil || filter == nil {
		return
	}
	if !actor.HasPermission(PermissionManageContent) {
		filter.CreatedByPrincipalID = &actor.Principal.ID
	}
}

// CanView checks if the actor can view the post in admin.
func (p *PostPolicy) CanView(actor *Snapshot, post *domain.Post) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限访问"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	if actor.HasPermission(PermissionAuthorContent) {
		if post.CreatedByPrincipalID == nil || *post.CreatedByPrincipalID == actor.Principal.ID {
			return true, ""
		}
		return false, "您没有权限查看其他作者的文章"
	}
	return false, "您没有权限查看或编辑该文章"
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
func (p *PostPolicy) CanEdit(actor *Snapshot, post *domain.Post) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限编辑文章"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	if actor.HasPermission(PermissionAuthorContent) {
		if post.CreatedByPrincipalID == nil || *post.CreatedByPrincipalID == actor.Principal.ID {
			return true, ""
		}
		return false, "您仅能编辑自己创建的文章"
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
// Authors only see their own uploaded media, while managers see all media.
func (p *MediaPolicy) ScopeMedia(actor *Snapshot, filter *domain.MediaFilter) {
	if actor == nil || filter == nil {
		return
	}
	if !actor.HasPermission(PermissionManageContent) {
		filter.CreatedByPrincipalID = &actor.Principal.ID
	}
}

// CanView checks if the actor can view the media asset.
func (p *MediaPolicy) CanView(actor *Snapshot, media *domain.MediaAsset) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限查看媒体"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	if actor.HasPermission(PermissionAuthorContent) {
		if media.CreatedByPrincipalID == nil || *media.CreatedByPrincipalID == actor.Principal.ID {
			return true, ""
		}
		return false, "您没有权限查看其他作者的媒体"
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
func (p *MediaPolicy) CanUpdate(actor *Snapshot, media *domain.MediaAsset) (bool, string) {
	if actor == nil || actor.MembershipStatus != "active" {
		return false, "您尚未登录或无权限编辑媒体"
	}
	if actor.HasPermission(PermissionManageContent) {
		return true, ""
	}
	if actor.HasPermission(PermissionAuthorContent) {
		if media.CreatedByPrincipalID == nil || *media.CreatedByPrincipalID == actor.Principal.ID {
			return true, ""
		}
		return false, "您仅能编辑自己上传的媒体"
	}
	return false, "无权限编辑媒体"
}

// CanDelete checks if the actor can delete the media asset.
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
		if media.CreatedByPrincipalID == nil || *media.CreatedByPrincipalID == actor.Principal.ID {
			return true, ""
		}
		return false, "您只能删除自己上传的媒体图片"
	}
	return false, "无权限删除媒体"
}
