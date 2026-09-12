import { useEffect, useState } from "react";
import { Bot, Copy, Edit2, Eye, FileText, Plus, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { postsApi } from "../../api/posts";
import { siteApi } from "../../api/site";
import type { TagSummary } from "../../api/site";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Empty,
  IconButton,
  IconButtonLink,
  Pagination,
  SearchField,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { BulkActionBar } from "@gouno/ui/patterns";

import { ConfirmActionModal } from "../../components/ConfirmActionModal";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { useAbility } from "../../abilities";
import type { Category, Post } from "../../types/blog";
import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

type DeleteTarget = { kind: "post"; post: Post } | { kind: "batch" } | null;
const pageSize = 20;

function selectValue(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function PostStatusTag({ status }: { status?: string }) {
  if (status === "published") return <Tag color="success">已发布</Tag>;
  if (status === "scheduled") return <Tag color="warning">定时发布</Tag>;
  return <Tag>草稿</Tag>;
}

function PostsSkeleton() {
  return (
    <Card padding="base">
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="文章加载中"
        aria-live="polite"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 md:grid-cols-[3rem_minmax(0,1fr)_7rem_8rem_6rem_9rem]"
          >
            <Skeleton className="h-5 w-5" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AdminPosts() {
  const allowed = useAdminGuard("/admin/posts");
  const { can } = useAbility();
  const { notify } = useAppFeedback();
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
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((key) => key + 1);

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
  }, [allowed, category, page, q, reloadKey, status, tag]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: key === "q" });
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

  const hasFilters = Boolean(q || status || category || tag);
  const clearFilters = () => setParams({});

  const copyPostLink = async (post: Post) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/articles/${post.slug}`,
      );
      notify("文章链接已复制。");
    } catch {
      notify("复制文章链接失败，请手动复制。", "error");
    }
  };

  const setSelectedPost = (id: number, checked: boolean) => {
    setSelected((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id),
    );
  };

  const canBatch = can("batch", "post");
  const allSelected =
    posts.length > 0 && posts.every((post) => selected.includes(post.id));

  const renderActions = (post: Post) => (
    <>
      <IconButtonLink
        variant="ghost"
        to={
          post.status === "published"
            ? `/articles/${post.slug}`
            : `/articles/${post.slug}?preview=true`
        }
        target="_blank"
        rel="noreferrer"
        label={`${post.status === "published" ? "查看" : "预览"}文章 ${post.title}`}
        icon={<Eye />}
      />
      <IconButton
        variant="ghost"
        label={`复制文章链接 ${post.title}`}
        icon={<Copy />}
        onClick={() => void copyPostLink(post)}
      />
      {can("edit", "post", post) ? (
        <IconButtonLink
          variant="ghost"
          to={`/admin/posts/${post.id}/edit`}
          label={`编辑文章 ${post.title}`}
          icon={<Edit2 />}
        />
      ) : (
        <IconButtonLink
          variant="ghost"
          to={`/admin/posts/${post.id}/edit`}
          label={`查看文章详情（只读） ${post.title}`}
          icon={<FileText />}
        />
      )}
      {can("delete", "post", post) ? (
        <IconButton
          variant="ghost"
          color="error"
          label={`删除文章 ${post.title}`}
          icon={<Trash2 />}
          onClick={() => setDeleteTarget({ kind: "post", post })}
        />
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="文章"
        description="管理全站草稿、定时内容与已发布文章。"
        actions={
          can("create", "post") ? (
            <ButtonLink
              variant="solid"
              color="primary"
              to="/admin/posts/new"
              icon={<Plus />}
            >
              新建文章
            </ButtonLink>
          ) : null
        }
      />

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            className="min-w-[14rem] flex-1"
            aria-label="搜索文章"
            value={q}
            onChange={(event) => setFilter("q", event.target.value)}
            placeholder="搜索标题、摘要或正文"
          />
          <Select
            className="w-full sm:w-36"
            aria-label="文章状态"
            value={status}
            onChange={(value) => setFilter("status", selectValue(value))}
          >
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
            <option value="scheduled">定时发布</option>
          </Select>
          <Select
            className="w-full sm:w-40"
            aria-label="文章分类"
            value={category}
            onChange={(value) => setFilter("category", selectValue(value))}
          >
            <option value="">全部分类</option>
            {categories.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-full sm:w-40"
            aria-label="文章标签"
            value={tag}
            onChange={(value) => setFilter("tag", selectValue(value))}
          >
            <option value="">全部标签</option>
            {tags.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </Select>
          <span className="text-sm text-muted-foreground">{total} 篇</span>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="small"
              type="button"
              onClick={clearFilters}
              icon={<X />}
            >
              清除
            </Button>
          ) : null}
        </div>
      </Card>

      {error && posts.length > 0 ? (
        <Alert type="error" showIcon title={error} />
      ) : null}

      {canBatch && selected.length > 0 ? (
        <BulkActionBar
          selectionLabel={`已选择 ${selected.length} 篇`}
          onCancel={() => setSelected([])}
        >
          <Button size="small" icon={<Bot />} onClick={() => setAIOpen(true)}>
            交给 AI
          </Button>
          <Button
            size="small"
            type="button"
            onClick={() => void batch("publish")}
          >
            立即发布
          </Button>
          <Button
            size="small"
            type="button"
            onClick={() => void batch("draft")}
          >
            转为草稿
          </Button>
          <Button
            size="small"
            color="error"
            type="button"
            onClick={() => setDeleteTarget({ kind: "batch" })}
            icon={<Trash2 />}
          >
            删除
          </Button>
        </BulkActionBar>
      ) : null}

      {loading ? (
        <PostsSkeleton />
      ) : error && posts.length === 0 ? (
        <Alert
          type="error"
          showIcon
          title="文章加载失败"
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              重试
            </Button>
          }
        />
      ) : posts.length === 0 ? (
        <Card padding="lg">
          <Empty
            title={
              hasFilters ? "没有符合当前筛选条件的文章。" : "还没有发布过文章。"
            }
            action={
              hasFilters ? (
                <Button size="small" onClick={clearFilters}>
                  清除筛选
                </Button>
              ) : can("create", "post") ? (
                <ButtonLink
                  size="small"
                  variant="solid"
                  color="primary"
                  to="/admin/posts/new"
                  icon={<Plus />}
                >
                  撰写第一篇文章
                </ButtonLink>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <Table density="compact" bordered>
              <TableHeader>
                <TableRow>
                  {canBatch ? (
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        aria-label="选择当前页全部文章"
                        checked={allSelected}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? posts.map((post) => post.id)
                              : [],
                          )
                        }
                      />
                    </TableHead>
                  ) : null}
                  <TableHead>文章</TableHead>
                  <TableHead className="w-32">状态</TableHead>
                  <TableHead className="w-36">更新时间</TableHead>
                  <TableHead className="w-24">阅读</TableHead>
                  <TableHead className="w-40 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id}>
                    {canBatch ? (
                      <TableCell className="text-center">
                        <Checkbox
                          aria-label={`选择文章 ${post.title}`}
                          checked={selected.includes(post.id)}
                          onChange={(event) =>
                            setSelectedPost(post.id, event.target.checked)
                          }
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-0.5">
                        <strong className="font-semibold leading-snug text-foreground">
                          {post.title}
                        </strong>
                        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                          <span>/{post.slug}</span>
                          {post.category ? (
                            <Tag>{post.category.name}</Tag>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PostStatusTag status={post.status} />
                    </TableCell>
                    <TableCell>
                      <time className="font-mono text-xs text-muted-foreground">
                        {new Date(
                          post.updated_at || post.created_at,
                        ).toLocaleDateString("zh-CN")}
                      </time>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {(post.views_count ?? 0).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {renderActions(post)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div
            className="grid gap-3 md:hidden"
            role="list"
            aria-label="文章列表"
          >
            {posts.map((post) => (
              <Card key={post.id} padding="base" role="listitem">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    {canBatch ? (
                      <Checkbox
                        aria-label={`选择文章 ${post.title}`}
                        checked={selected.includes(post.id)}
                        onChange={(event) =>
                          setSelectedPost(post.id, event.target.checked)
                        }
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="min-w-0 break-words text-sm font-semibold leading-snug">
                          {post.title}
                        </strong>
                        <PostStatusTag status={post.status} />
                      </div>
                      <div className="break-all font-mono text-xs text-muted-foreground">
                        /{post.slug}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {post.category ? (
                          <span>{post.category.name}</span>
                        ) : null}
                        <time>
                          更新于{" "}
                          {new Date(
                            post.updated_at || post.created_at,
                          ).toLocaleDateString("zh-CN")}
                        </time>
                        <span>
                          {(post.views_count ?? 0).toLocaleString()} 次阅读
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {renderActions(post)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {!loading && total > pageSize ? (
        <div className="flex justify-center pt-2">
          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            ariaLabel="文章分页"
            align="center"
            onChange={(nextPage) => setFilter("page", String(nextPage))}
          />
        </div>
      ) : null}

      <ConfirmActionModal
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
    </div>
  );
}
