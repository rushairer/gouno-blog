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
import { pagesApi } from "../../api/pages";
import type { CustomPage } from "../../types/blog";
import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";

type DeleteTarget =
  | { kind: "page"; page: CustomPage }
  | { kind: "batch" }
  | null;
type Notice = { type: "success" | "info" | "error"; message: string } | null;

const pageSize = 20;

function PageStatusTag({ status }: { status?: string }) {
  return status === "published" ? (
    <Tag color="success">已发布</Tag>
  ) : (
    <Tag>草稿</Tag>
  );
}

function PageActions({
  page,
  onCopy,
  onDelete,
}: {
  page: CustomPage;
  onCopy: (page: CustomPage) => void;
  onDelete: (page: CustomPage) => void;
}) {
  return (
    <div className="flex min-w-max flex-nowrap items-center justify-end gap-1">
      <IconButtonLink
        to={`/${page.slug}`}
        target="_blank"
        rel="noreferrer"
        label={`${page.status === "published" ? "查看" : "预览"}单页 ${page.title}`}
        icon={<Eye />}
        variant="ghost"
      />
      <IconButton
        variant="ghost"
        label={`复制单页链接 ${page.title}`}
        icon={<Copy />}
        onClick={() => onCopy(page)}
      />
      <IconButtonLink
        variant="ghost"
        to={`/admin/pages/${page.id}/edit`}
        label={`编辑单页 ${page.title}`}
        icon={<Edit2 />}
      />
      <IconButton
        variant="ghost"
        color="error"
        label={`删除单页 ${page.title}`}
        icon={<Trash2 />}
        onClick={() => onDelete(page)}
      />
    </div>
  );
}

function LoadingPages() {
  return (
    <Card padding="base" aria-label="单页加载中">
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <Text size="sm" tone="muted">
          正在加载单页…
        </Text>
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_9rem_7rem_7rem]"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AdminPages() {
  const allowed = useAdminGuard("/admin/pages");
  const [params, setParams] = useSearchParams();
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);
  const [aiOpen, setAIOpen] = useState(false);

  const q = params.get("q") || "";
  const status = params.get("status") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    if (!allowed) return;
    let ignore = false;
    setLoading(true);

    pagesApi
      .getAdminPages({ page, pageSize, q, status })
      .then((result) => {
        if (ignore) return;
        setPages(result.list || []);
        setTotal(result.total || 0);
        setSelected([]);
        setAIOpen(false);
        setLoadError("");
      })
      .catch((reason: Error) => {
        if (!ignore) setLoadError(reason.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [allowed, page, q, reloadKey, status]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSelected([]);
    setAIOpen(false);
    setParams(next, { replace: key === "q" });
  };

  const hasFilters = Boolean(q || status);
  const clearFilters = () => {
    setSelected([]);
    setAIOpen(false);
    setParams({});
  };

  const copyPageLink = async (pageItem: CustomPage) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/${pageItem.slug}`,
      );
      setNotice({ type: "success", message: "单页链接已复制。" });
    } catch {
      setNotice({
        type: "error",
        message: "复制单页链接失败，请手动复制。",
      });
    }
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setNotice(null);
    try {
      if (deleteTarget.kind === "page") {
        await pagesApi.deletePage(deleteTarget.page.id);
        setPages((current) =>
          current.filter((item) => item.id !== deleteTarget.page.id),
        );
        setTotal((current) => Math.max(0, current - 1));
        setNotice({ type: "success", message: "单页已删除。" });
      } else {
        const count = selected.length;
        await Promise.all(selected.map((id) => pagesApi.deletePage(id)));
        setPages((current) =>
          current.filter((item) => !selected.includes(item.id)),
        );
        setTotal((current) => Math.max(0, current - count));
        setSelected([]);
        setAIOpen(false);
        setNotice({
          type: "success",
          message: `所选 ${count} 个单页已删除。`,
        });
      }
      setDeleteTarget(null);
    } catch (reason) {
      setNotice({
        type: "error",
        message:
          reason instanceof Error ? reason.message : "删除失败，请稍后重试。",
      });
    } finally {
      setDeleting(false);
    }
  };

  const setSelectedPage = (id: number, checked: boolean) => {
    setSelected((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id),
    );
  };

  const allSelected =
    pages.length > 0 &&
    pages.every((pageItem) => selected.includes(pageItem.id));

  const deleteDescription =
    deleteTarget?.kind === "page"
      ? `确认永久删除《${deleteTarget.page.title}》（/${deleteTarget.page.slug}）？此操作无法撤销。`
      : deleteTarget?.kind === "batch"
        ? `确认永久删除选中的 ${selected.length} 个单页？此操作无法撤销。`
        : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="单页"
        description="管理关于我、友情链接、隐私政策等独立单页。"
        actions={
          <ButtonLink
            variant="solid"
            color="primary"
            to="/admin/pages/new"
            icon={<Plus />}
          >
            新建单页
          </ButtonLink>
        }
      />

      {notice ? (
        <Alert
          type={notice.type}
          showIcon
          title={notice.message}
          closable={{ onClose: () => setNotice(null) }}
        />
      ) : null}

      <Card padding="base">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <Input
              aria-label="搜索单页"
              prefix={<Search className="size-4" />}
              value={q}
              onChange={(event) => setFilter("q", event.target.value)}
              placeholder="搜索标题、摘要或路径"
            />
          </div>
          <div className="min-w-0 lg:w-40 lg:shrink-0">
            <Select
              aria-label="单页状态"
              value={status}
              onChange={(value) =>
                setFilter(
                  "status",
                  Array.isArray(value) ? (value[0] ?? "") : String(value),
                )
              }
            >
              <option value="">全部状态</option>
              <option value="published">已发布</option>
              <option value="draft">草稿</option>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <Text size="sm" tone="muted" className="whitespace-nowrap">
              {total} 页
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

      {loadError && pages.length > 0 ? (
        <Alert type="error" showIcon title={loadError} />
      ) : null}

      {selected.length > 0 ? (
        <BulkActionBar
          selectionLabel={`已选择 ${selected.length} 页`}
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
          <Button
            size="small"
            color="error"
            onClick={() => setDeleteTarget({ kind: "batch" })}
            icon={<Trash2 />}
          >
            删除
          </Button>
        </BulkActionBar>
      ) : null}

      {loading ? (
        <LoadingPages />
      ) : loadError && pages.length === 0 ? (
        <Alert
          type="error"
          showIcon
          title="单页加载失败"
          description={loadError}
          action={
            <Button size="small" onClick={load}>
              重新载入
            </Button>
          }
        />
      ) : pages.length === 0 ? (
        <Card padding="lg">
          <Empty
            icon={<FileText className="size-7 text-muted-foreground" />}
            title={
              hasFilters
                ? "没有符合当前筛选条件的单页"
                : "还没有创建过独立单页"
            }
            description={
              hasFilters
                ? "调整或清除筛选条件后重试。"
                : "创建关于我、友情链接或隐私政策等独立页面。"
            }
            action={
              hasFilters ? (
                <Button onClick={clearFilters}>清除筛选</Button>
              ) : (
                <ButtonLink
                  variant="solid"
                  color="primary"
                  to="/admin/pages/new"
                  icon={<Plus />}
                >
                  新建单页
                </ButtonLink>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <Table density="compact" bordered>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      aria-label="选择当前页全部单页"
                      checked={allSelected}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? pages.map((pageItem) => pageItem.id)
                            : [],
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>单页</TableHead>
                  <TableHead className="w-40">访问路径</TableHead>
                  <TableHead className="w-28">模板</TableHead>
                  <TableHead className="w-36">导航展示</TableHead>
                  <TableHead className="w-28">状态</TableHead>
                  <TableHead className="w-32">更新时间</TableHead>
                  <TableHead className="w-40 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((pageItem) => (
                  <TableRow
                    key={pageItem.id}
                    data-state={
                      selected.includes(pageItem.id) ? "selected" : undefined
                    }
                  >
                    <TableCell className="text-center">
                      <Checkbox
                        aria-label={`选择单页 ${pageItem.title}`}
                        checked={selected.includes(pageItem.id)}
                        onChange={(event) =>
                          setSelectedPage(pageItem.id, event.target.checked)
                        }
                      />
                    </TableCell>
                    <TableCell className="min-w-72 whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <strong className="text-sm font-semibold leading-snug text-foreground">
                          {pageItem.title}
                        </strong>
                        {pageItem.summary ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {pageItem.summary}
                          </span>
                        ) : (
                          <span className="text-xs italic text-muted-foreground/60">
                            无摘要
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        /{pageItem.slug}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Tag>{pageItem.template || "default"}</Tag>
                    </TableCell>
                    <TableCell>
                      {pageItem.show_in_nav ? (
                        <Tag color="success">
                          主导航 · {pageItem.sort_order}
                        </Tag>
                      ) : (
                        <Text size="xs" tone="muted">
                          隐藏
                        </Text>
                      )}
                    </TableCell>
                    <TableCell>
                      <PageStatusTag status={pageItem.status} />
                    </TableCell>
                    <TableCell>
                      <time className="font-mono text-xs text-muted-foreground">
                        {new Date(
                          pageItem.updated_at || pageItem.created_at,
                        ).toLocaleDateString("zh-CN")}
                      </time>
                    </TableCell>
                    <TableCell>
                      <PageActions
                        page={pageItem}
                        onCopy={(item) => void copyPageLink(item)}
                        onDelete={(item) =>
                          setDeleteTarget({ kind: "page", page: item })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div
            className="grid gap-3 md:hidden"
            role="list"
            aria-label="单页列表"
          >
            {pages.map((pageItem) => (
              <Card
                key={pageItem.id}
                padding="base"
                role="listitem"
                className={
                  selected.includes(pageItem.id)
                    ? "border-primary/40 bg-accent/20"
                    : undefined
                }
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      aria-label={`选择单页 ${pageItem.title}`}
                      checked={selected.includes(pageItem.id)}
                      onChange={(event) =>
                        setSelectedPage(pageItem.id, event.target.checked)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="min-w-0 break-words text-sm font-semibold leading-snug">
                          {pageItem.title}
                        </strong>
                        <PageStatusTag status={pageItem.status} />
                      </div>
                      <code className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                        /{pageItem.slug}
                      </code>
                      {pageItem.summary ? (
                        <Text
                          size="xs"
                          tone="muted"
                          className="mt-2 line-clamp-2"
                        >
                          {pageItem.summary}
                        </Text>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Tag>{pageItem.template || "default"}</Tag>
                    <span>
                      {pageItem.show_in_nav
                        ? `主导航 · ${pageItem.sort_order}`
                        : "导航隐藏"}
                    </span>
                    <time>
                      更新于{" "}
                      {new Date(
                        pageItem.updated_at || pageItem.created_at,
                      ).toLocaleDateString("zh-CN")}
                    </time>
                  </div>
                  <PageActions
                    page={pageItem}
                    onCopy={(item) => void copyPageLink(item)}
                    onDelete={(item) =>
                      setDeleteTarget({ kind: "page", page: item })
                    }
                  />
                </div>
              </Card>
            ))}
          </div>

          {total > pageSize ? (
            <Pagination
              ariaLabel="单页分页"
              page={page}
              total={total}
              pageSize={pageSize}
              onChange={(nextPage) => setFilter("page", String(nextPage))}
              align="center"
              showTotal={(count, range) =>
                `${range[0]}-${range[1]} / ${count} 页`
              }
            />
          ) : null}
        </>
      )}

      <Modal
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "batch" ? "批量删除单页" : "删除单页"}
        description={deleteDescription}
        onClose={() => setDeleteTarget(null)}
        onOk={performDelete}
        okText="永久删除"
        confirmLoading={deleting}
        okButtonProps={{ variant: "solid", color: "error" }}
      >
        <Text size="sm" tone="muted">
          删除后无法恢复，请确认目标无误。
        </Text>
      </Modal>

      <WorkflowLauncher
        open={aiOpen}
        resourceType="page"
        resourceKeys={selected}
        onClose={() => setAIOpen(false)}
        title="将所选单页交给 AI"
      />
    </div>
  );
}
