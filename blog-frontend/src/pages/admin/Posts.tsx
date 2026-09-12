import { useEffect, useState } from "react";
import {
  Copy,
  Edit2,
  Eye,
  FileText,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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
  Input,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Text,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { BulkActionBar } from "@gouno/ui/patterns";

import { useAdminGuard } from "../../hooks/useAdminGuard";
import { useAbility } from "../../abilities";
import type { Category, Post } from "../../types/blog";
import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

type DeleteTarget = { kind: "post"; post: Post } | { kind: "batch" } | null;

const pageSize = 20;

function selectValue(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : String(value);
}

function PostStatusTag({ status }: { status?: string }) {
  if (status === "published") return <Tag color="success">已发布</Tag>;
  if (status === "scheduled") return <Tag color="warning">定时发布</Tag>;
  return <Tag>草稿</Tag>;
}

function PostsSkeleton() {
  return (
    <Card padding="base" aria-label="文章加载中">
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <Text size="sm" tone="muted">
          正在加载文章…
        </Text>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_8rem_8rem]"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function PostActions({
  post,
  canEdit,
  canDelete,
  onCopy,
  onDelete,
}: {
  post: Post;
  canEdit: boolean;
  canDelete: boolean;
  onCopy: (post: Post) => void;
  onDelete: (post: Post) => void;
}) {
  return (
    <div className="flex min-w-max flex-nowrap items-center justify-end gap-1">
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
        onClick={() => onCopy(post)}
      />
      <IconButtonLink
        variant="ghost"
        to={`/admin/posts/${post.id}/edit`}
        label={
          canEdit
            ? `编辑文章 ${post.title}`
            : `查看文章详情（只读） ${post.title}`
        }
        icon={canEdit ? <Edit2 /> : <FileText />}
      />
      {canDelete ? (
        <IconButton
          variant="ghost"
          color="error"
          label={`删除文章 ${post.title}`}
          icon={<Trash2 />}
          onClick={() => onDelete(post)}
        />
      ) : null}
    </div>
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
        setAIOpen(false);
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
    setSelected([]);
    setAIOpen(false);
    setParams(next, { replace: key === "q" });
  };

  const hasFilters = Boolean(q || status || category || tag);
  const clearFilters = () => {
    setSelected([]);
    setAIOpen(false);
    setParams({});
  };

  const batch = async (action: "publish" | "draft" | "delete") => {
    if (selected.length === 0) return;
    try {
      await postsApi.batchAction(selected, action);
      if (action === "delete") {
        const count = selected.length;
        setPosts((current) =>
          current.filter((post) => !selected.includes(post.id)),
        );
        setTotal((current) => Math.max(0, current - count));
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
      setAIOpen(false);
      setError("");
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
        setSelected((current) =>
          current.filter((id) => id !== deleteTarget.post.id),
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

  const deleteDescription =
    deleteTarget?.kind === "post"
      ? `确认永久删除《${deleteTarget.post.title}》？此操作无法撤销。`
      : deleteTarget?.kind === "batch"
        ? `确认永久删除选中的 ${selected.length} 篇文章？此操作无法撤销。`
        : undefined;

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

      <Card padding="base">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <Input
              aria-label="搜索文章"
              prefix={<Search className="size-4" />}
              value={q}
              onChange={(event) => setFilter("q", event.target.value)}
              placeholder="搜索标题、摘要或正文"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:flex xl:shrink-0">
            <div className="min-w-0 xl:w-36">
              <Select
                aria-label="文章状态"
                value={status}
                onChange={(value) => setFilter("status", selectValue(value))}
              >
                <option value="">全部状态</option>
                <option value="published">已发布</option>
                <option value="draft">草稿</option>
                <option value="scheduled">定时发布</option>
              </Select>
            </div>
            <div className="min-w-0 xl:w-40">
              <Select
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
            </div>
            <div className="min-w-0 xl:w-40">
              <Select
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
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 xl:justify-end">
            <Text size="sm" tone="muted" className="whitespace-nowrap">
              {total} 篇
            </Text>
            {hasFilters ? (
              <Button
                size="small"
                variant="text"
                icon={<X />}
                onClick={clearFilters}
              >
                清除
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {error && posts.length > 0 ? (
        <Alert type="error" showIcon title={error} />
      ) : null}

      {canBatch && selected.length > 0 ? (
        <BulkActionBar
          selectionLabel={`已选择 ${selected.length} 篇`}
          onCancel={() => {
            setSelected([]);
            setAIOpen(false);
          }}
        >
          <Button
            size="small"
            icon={<Sparkles />}
            onClick={() => setAIOpen(true)}
          >
            交给 AI
          </Button>
          <Button size="small" onClick={() => void batch("publish")}>
            立即发布
          </Button>
          <Button size="small" onClick={() => void batch("draft")}>
            转为草稿
          </Button>
          <Button
            size="small"
            color="error"
            icon={<Trash2 />}
            onClick={() => setDeleteTarget({ kind: "batch" })}
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
            <Button size="small" onClick={load}>
              重新载入
            </Button>
          }
        />
      ) : posts.length === 0 ? (
        <Card padding="lg">
          <Empty
            icon={<FileText className="size-7 text-muted-foreground" />}
            title={hasFilters ? "没有符合当前筛选条件的文章" : "还没有文章"}
            description={
              hasFilters
                ? "调整或清除筛选条件后重试。"
                : "创建第一篇文章，开始构建站点内容。"
            }
            action={
              hasFilters ? (
                <Button onClick={clearFilters}>清除筛选</Button>
              ) : can("create", "post") ? (
                <ButtonLink
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
                  <TableHead className="w-28">状态</TableHead>
                  <TableHead className="w-28">更新时间</TableHead>
                  <TableHead className="w-24 text-right">阅读</TableHead>
                  <TableHead className="w-40 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => {
                  const canEdit = can("edit", "post", post);
                  const canDelete = can("delete", "post", post);
                  return (
                    <TableRow
                      key={post.id}
                      data-state={
                        selected.includes(post.id) ? "selected" : undefined
                      }
                    >
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
                      <TableCell className="min-w-72 whitespace-normal">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold leading-snug">
                            {post.title}
                          </span>
                          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <code className="font-mono">/{post.slug}</code>
                            {post.category ? (
                              <Tag bordered={false}>{post.category.name}</Tag>
                            ) : null}
                          </span>
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
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {(post.views_count ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <PostActions
                          post={post}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          onCopy={(item) => void copyPostLink(item)}
                          onDelete={(item) =>
                            setDeleteTarget({ kind: "post", post: item })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div
            className="grid gap-3 md:hidden"
            role="list"
            aria-label="文章列表"
          >
            {posts.map((post) => {
              const canEdit = can("edit", "post", post);
              const canDelete = can("delete", "post", post);
              return (
                <Card
                  key={post.id}
                  padding="base"
                  role="listitem"
                  className={
                    selected.includes(post.id)
                      ? "border-primary/40 bg-accent/20"
                      : undefined
                  }
                >
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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-semibold leading-snug">
                            {post.title}
                          </span>
                          <PostStatusTag status={post.status} />
                        </div>
                        <code className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                          /{post.slug}
                        </code>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {post.category ? <span>{post.category.name}</span> : null}
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
                    <PostActions
                      post={post}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onCopy={(item) => void copyPostLink(item)}
                      onDelete={(item) =>
                        setDeleteTarget({ kind: "post", post: item })
                      }
                    />
                  </div>
                </Card>
              );
            })}
          </div>

          {total > pageSize ? (
            <Pagination
              ariaLabel="文章分页"
              page={page}
              total={total}
              pageSize={pageSize}
              onChange={(nextPage) => setFilter("page", String(nextPage))}
              align="center"
              showTotal={(count, range) =>
                `${range[0]}-${range[1]} / ${count} 篇`
              }
            />
          ) : null}
        </>
      )}

      <Modal
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "batch" ? "批量删除文章" : "删除文章"}
        description={deleteDescription}
        onClose={() => setDeleteTarget(null)}
        onOk={performDelete}
        okText="永久删除"
        cancelText="取消"
        confirmLoading={deleting}
        okButtonProps={{ variant: "solid", color: "error" }}
      >
        <Text size="sm" tone="muted">
          删除后无法恢复，请确认目标无误。
        </Text>
      </Modal>

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
