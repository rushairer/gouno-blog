from pathlib import Path
import re

root = Path("blog-backend")


def read(rel: str) -> str:
    return (root / rel).read_text()


def write(rel: str, text: str) -> None:
    (root / rel).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one regex match, found {count}")
    return updated


# PostService no longer owns Comment behavior.
rel = "internal/service/post_service.go"
text = read(rel)
for line in [
    '\tErrInvalidCommentID    = errors.New("无效的评论 ID")\n',
    '\tErrCommentAuthorEmpty  = errors.New("评论者昵称不能为空")\n',
    '\tErrCommentContentEmpty = errors.New("评论内容不能为空")\n',
]:
    text = replace_once(text, line, "", f"{rel} remove comment error")
interface_block = """\tCreateComment(ctx context.Context, comment *domain.Comment) error
\tGetVisibleCommentsByPostID(ctx context.Context, postID int64) ([]*domain.Comment, error)
\tGetAllCommentsByPostID(ctx context.Context, postID int64) ([]*domain.Comment, error)
\tSetCommentVisibility(ctx context.Context, id int64, isVisible bool) error
\tDeleteComment(ctx context.Context, id int64) error
"""
text = replace_once(text, interface_block, "", f"{rel} remove repository contract")
text = regex_once(
    text,
    r"\nfunc \(s \*PostService\) CreateComment\(.*?(?=\n// Helpers)",
    "",
    f"{rel} remove comment methods",
)
write(rel, text)

# PostRepository no longer carries duplicate Community persistence.
rel = "internal/repository/post_repository.go"
text = read(rel)
text = regex_once(
    text,
    r"\n// Comments Repository Methods\n.*?(?=\nfunc \(r \*PostRepository\) Batch\()",
    "",
    f"{rel} remove comments repository block",
)
write(rel, text)

# PostController contract and handlers become Post-only.
rel = "internal/controller/post_controller.go"
text = read(rel)
controller_interface_block = """\tCreateComment(ctx context.Context, comment *domain.Comment) error
\tGetComments(ctx context.Context, postID int64) ([]*domain.Comment, error)
\tGetAllComments(ctx context.Context, postID int64) ([]*domain.Comment, error)
\tSetCommentVisibility(ctx context.Context, id int64, isVisible bool) error
\tDeleteComment(ctx context.Context, id int64) error
"""
text = replace_once(text, controller_interface_block, "", f"{rel} remove comment service contract")
text = regex_once(
    text,
    r"\ntype CreateCommentRequest struct \{.*\Z",
    "\n",
    f"{rel} remove legacy comment handlers",
)
write(rel, text)

# Shared mapper no longer references the deleted Post-only sentinel.
rel = "internal/controllerutil/response.go"
text = read(rel)
text = replace_once(
    text,
    "\t\terrors.Is(err, service.ErrInvalidCommentID),\n",
    "",
    f"{rel} remove legacy invalid comment id mapping",
)
write(rel, text)

# PostService tests should only model Post behavior.
rel = "internal/service/post_service_test.go"
text = read(rel)
text = replace_once(text, "\tcomments    map[int64][]*domain.Comment\n", "", f"{rel} remove comments field")
text = replace_once(text, "\t\tcomments:    make(map[int64][]*domain.Comment),\n", "", f"{rel} remove comments init")
text = regex_once(
    text,
    r"\nfunc \(r \*fakePostRepo\) CreateComment\(.*?(?=\nfunc \(r \*fakePostRepo\) Batch\()",
    "",
    f"{rel} remove comment fake methods",
)
replacement = """
func TestDeletePostMapsMissingRowToNotFound(t *testing.T) {
\trepo := newFakePostRepo()
\trepo.deleteErr = sql.ErrNoRows
\terr := NewPostService(repo).DeletePost(context.Background(), 99)
\tif !errors.Is(err, ErrPostNotFound) {
\t\tt.Fatalf("DeletePost error = %v, want ErrPostNotFound", err)
\t}
}
"""
text = regex_once(
    text,
    r"\nfunc TestCommentValidation\(.*?(?=\nfunc TestCommentsDefaultToModeratedVisibility)",
    replacement,
    f"{rel} preserve delete-post assertion",
)
text = regex_once(
    text,
    r"\nfunc TestCommentsDefaultToModeratedVisibility\(.*?(?=\nfunc TestBatchPostsValidation)",
    "",
    f"{rel} remove legacy comment behavior test",
)
write(rel, text)

# PostController tests should stop inventing private Comment routes.
rel = "internal/controller/post_controller_test.go"
text = read(rel)
text = replace_once(text, "\tcomments     map[int64][]*domain.Comment\n", "", f"{rel} remove comments field")
text = regex_once(
    text,
    r"\n\t\tcomments: map\[int64\]\[\]\*domain\.Comment\{1: \[\]\*domain\.Comment\{.*?\n\t\t\}\},",
    "",
    f"{rel} remove comments fixture",
)
text = regex_once(
    text,
    r"\nfunc \(s \*fakeBlogService\) CreateComment\(.*?(?=\nfunc setupControllerRouter)",
    "",
    f"{rel} remove comment fake methods",
)
for route in [
    '\trouter.GET("/api/posts/:slugOrID/comments", ctrl.GetComments)\n',
    '\trouter.GET("/api/posts/:slugOrID/comments/all", ctrl.GetAllComments)\n',
    '\trouter.POST("/api/posts/:slugOrID/comments", ctrl.CreateComment)\n',
    '\trouter.PUT("/api/comments/:id/visibility", ctrl.UpdateCommentVisibility)\n',
]:
    text = replace_once(text, route, "", f"{rel} remove private comment route")
text = regex_once(
    text,
    r"\nfunc TestCommentsSupportSlugOrID\(.*?(?=\nfunc TestCreatePostValidationErrorReturnsBadRequest)",
    "",
    f"{rel} remove comment controller tests",
)
write(rel, text)
