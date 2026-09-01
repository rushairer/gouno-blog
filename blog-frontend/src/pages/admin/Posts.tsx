import { useEffect, useState } from "react";
import { Copy, Edit2, Eye, FileText, Plus, Trash2, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { postsApi } from "../../api/posts";
import { siteApi } from "../../api/site";
import type { TagSummary } from "../../api/site";
import {
  AdminPage,
  AdminPageHeader,
  BulkActionBar,
  Button,
  ButtonLink,
  ConfirmDialog,
  ContentStack,
  copyText,
  EmptyState,
  ErrorState,
  FilterBar,
  IconButton,
  Pagination,
  Panel,
  SearchField,
  Select,
  StatusBadge,
  TableSkeleton,
  useToast,
} from "../../components/ui";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { useAbility } from "../../abilities";
import type { Category, Post } from "../../types/blog";
import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";

type DeleteTarget = { kind: "post"; post: Post } | { kind: "batch" } | null;
const pageSize = 20;

export default function AdminPosts() {
  const allowed = useAdminGuard("/admin/posts");
  const { can } = useAbility();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);
  const [aiOpen, setAIOpen] = useState(false);
  const q = params.get("q") || "";
  const status = params.get("status") || "";
  const category = params.get("category") || "";
  const tag = params.get("tag") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  useEffect(() => {
    if (!allowed) return;
    let ignore = false;
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (category) query.set("category", category);
    if (tag) query.set("tag", tag);
    Promise.all([
      postsApi.getPosts(query, true),
      siteApi.getCategories().catch(() => []),
      siteApi
        .getAdminTags()
        .catch(() => siteApi.getPublishedTagSummaries().catch(() => [])),
    ])
      .then(([result, categoryItems, tagItems]) => {
        if (ignore) return;
        setPosts(result.list || []);
        setTotal(result.total || 0);
        setCategories(categoryItems || []);
        setTags(tagItems || []);
        setSelected([]);
        setError("");
      })
      .catch((reason: Error) => {
        if (!ignore) setError(reason.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [allowed, category, page, q, status, tag]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: key === "q" });
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "post") {
        await postsApi.deletePost(deleteTarget.post.id);
        setPosts((current) =>
          current.filter((item) => item.id !== deleteTarget.post.id),
        );
        setTotal((current) => Math.max(0, current - 1));
        notify("文章已删除。");
      } else {
        await batch("delete");
      }
      setDeleteTarget(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "删除失败，请稍后重试。",
      );
    } finally {
      setDeleting(false);
    }
  };

  const batch = async (action: "publish" | "draft" | "delete") => {
    if (selected.length === 0) return;
    try {
      await postsApi.batchAction(selected, action);
      if (action === "delete") {
        setPosts((current) =>
          current.filter((post) => !selected.includes(post.id)),
        );
        setTotal((current) => Math.max(0, current - selected.length));
      } else {
        setPosts((current) =>
          current.map((post) =>
            selected.includes(post.id)
              ? {
                  ...post,
                  status: action === "publish" ? "published" : "draft",
                }
              : post,
          ),
        );
      }
      notify(
        action === "publish"
          ? "所选文章已发布。"
          : action === "draft"
            ? "所选文章已转为草稿。"
            : "所选文章已删除。",
      );
      setSelected([]);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "批量操作失败，请稍后重试。",
      );
    }
  };

  const hasFilters = Boolean(q || status || category || tag);
  const clearFilters = () => setParams({});
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminPage>
      <AdminPageHeader
        title="文章"
        description="管理全站草稿、定时内容与已发布文章。"
        actions={
          can("create", "post") ? (
            <ButtonLink variant="primary" to="/admin/posts/new" icon={<Plus />}>
              新建文章
            </ButtonLink>
          ) : null
        }
      />
      <ContentStack>
        {error ? (
          <ErrorState
            label={error}
            action={
              <Button
                variant="secondary"
                size="compact"
                onClick={() => window.location.reload()}
              >
                重新载入
              </Button>
            }
          />
        ) : null}
        <FilterBar>
          <SearchField
            aria-label="搜索文章"
            value={q}
            onChange={(event) => setFilter("q", event.target.value)}
            placeholder="搜索标题、摘要或正文"
          />
          <Select
            size="compact"
            aria-label="文章状态"
            value={status}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
            <option value="scheduled">定时发布</option>
          </Select>
          <Select
            size="compact"
            aria-label="文章分类"
            value={category}
            onChange={(event) => setFilter("category", event.target.value)}
          >
            <option value="">全部分类</option>
            {categories.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            size="compact"
            aria-label="文章标签"
            value={tag}
            onChange={(event) => setFilter("tag", event.target.value)}
          >
            <option value="">全部标签</option>
            {tags.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </Select>
          <span className="filter-bar__count">{total} 篇</span>
          {q || status || category || tag ? (
            <Button
              className="filter-bar__actions"
              variant="ghost"
              size="compact"
              type="button"
              onClick={clearFilters}
              icon={<X />}
            >
              清除
            </Button>
          ) : null}
        </FilterBar>
        {can("batch", "post") && selected.length ? (
          <BulkActionBar
            selectionLabel={`已选择 ${selected.length} 篇`}
            onAIAssist={() => setAIOpen(true)}
            onCancel={() => setSelected([])}
          >
            <Button
              variant="secondary"
              size="compact"
              type="button"
              onClick={() =>
                void batch("publish").catch((reason: Error) =>
                  setError(reason.message),
                )
              }
            >
              立即发布
            </Button>
            <Button
              variant="secondary"
              size="compact"
              type="button"
              onClick={() =>
                void batch("draft").catch((reason: Error) =>
                  setError(reason.message),
                )
              }
            >
              转为草稿
            </Button>
            <Button
              variant="danger"
              size="compact"
              type="button"
              onClick={() => setDeleteTarget({ kind: "batch" })}
              icon={<Trash2 />}
            >
              删除
            </Button>
          </BulkActionBar>
        ) : null}
        {loading ? (
          <TableSkeleton columns={6} rows={6} />
        ) : !error && posts.length === 0 ? (
          <EmptyState
            label={
              hasFilters ? "没有符合当前筛选条件的文章。" : "还没有发布过文章。"
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={clearFilters}
                >
                  清除筛选
                </Button>
              ) : can("create", "post") ? (
                <ButtonLink
                  variant="primary"
                  to="/admin/posts/new"
                  icon={<Plus />}
                >
                  新建文章
                </ButtonLink>
              ) : null
            }
          />
        ) : posts.length ? (
          <Panel className="posts-table-panel">
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    {can("batch", "post") ? (
                      <th>
                        <input
                          aria-label="选择当前页全部文章"
                          type="checkbox"
                          checked={
                            posts.length > 0 &&
                            posts.every((post) => selected.includes(post.id))
                          }
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? posts.map((post) => post.id)
                                : [],
                            )
                          }
                        />
                      </th>
                    ) : null}
                    <th>文章</th>
                    <th>状态</th>
                    <th>更新时间</th>
                    <th>阅读</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post) => (
                    <tr key={post.id}>
                      {can("batch", "post") ? (
                        <td>
                          <input
                            aria-label={`选择 ${post.title}`}
                            type="checkbox"
                            checked={selected.includes(post.id)}
                            onChange={(event) =>
                              setSelected((current) =>
                                event.target.checked
                                  ? [...new Set([...current, post.id])]
                                  : current.filter((id) => id !== post.id),
                              )
                            }
                          />
                        </td>
                      ) : null}
                      <td>
                        <strong>{post.title}</strong>
                        <small>/{post.slug}</small>
                      </td>
                      <td>
                        <StatusBadge status={post.status} />
                      </td>
                      <td>
                        {new Date(
                          post.updated_at || post.created_at,
                        ).toLocaleDateString("zh-CN")}
                      </td>
                      <td>{(post.views_count ?? 0).toLocaleString()}</td>
                      <td>
                        <div className="table-actions">
                          <Link
                            to={
                              post.status === "published"
                                ? `/articles/${post.slug}`
                                : `/articles/${post.slug}?preview=true`
                            }
                            target="_blank"
                            rel="noreferrer"
                            title={
                              post.status === "published" ? "查看" : "预览"
                            }
                          >
                            <Eye />
                          </Link>
                          <IconButton
                            label="复制链接"
                            icon={<Copy />}
                            onClick={() =>
                              void copyText(
                                `${location.origin}/articles/${post.slug}`,
                                notify,
                                "文章链接已复制。",
                              )
                            }
                          />
                          {can("edit", "post", post) ? (
                            <Link
                              to={`/admin/posts/${post.id}/edit`}
                              title="编辑"
                            >
                              <Edit2 />
                            </Link>
                          ) : (
                            <Link
                              to={`/admin/posts/${post.id}/edit`}
                              title="查看详情（只读）"
                            >
                              <FileText />
                            </Link>
                          )}
                          {can("delete", "post", post) ? (
                            <IconButton
                              variant="danger"
                              label="删除"
                              icon={<Trash2 />}
                              onClick={() =>
                                setDeleteTarget({ kind: "post", post })
                              }
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}
        {!loading && total > pageSize ? (
          <Pagination
            className="admin-pagination"
            page={page}
            pages={pages}
            label="文章分页"
            onChange={(nextPage) => setFilter("page", String(nextPage))}
          />
        ) : null}
      </ContentStack>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "post" ? "删除文章" : "批量删除文章"}
        description={
          deleteTarget?.kind === "post" ? (
            <>确认永久删除《{deleteTarget.post.title}》？此操作无法撤销。</>
          ) : (
            <>确认永久删除选中的 {selected.length} 篇文章？此操作无法撤销。</>
          )
        }
        confirmLabel="永久删除"
        danger
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={performDelete}
      />
      <WorkflowLauncher
        open={aiOpen}
        resourceType="post"
        resourceKeys={selected}
        onClose={() => setAIOpen(false)}
        title="将所选文章交给 AI"
      />
    </AdminPage>
  );
}
