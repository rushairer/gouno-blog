import { useEffect, useState } from "react";
import { Bot, Copy, Edit2, Eye, Plus, Trash2, X } from "lucide-react";
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
import { pagesApi } from "../../api/pages";
import type { CustomPage } from "../../types/blog";
import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

type DeleteTarget =
  | { kind: "page"; page: CustomPage }
  | { kind: "batch" }
  | null;
const pageSize = 20;

function PageStatusTag({ status }: { status?: string }) {
  return status === "published" ? (
    <Tag color="success">已发布</Tag>
  ) : (
    <Tag>草稿</Tag>
  );
}

function PagesSkeleton() {
  return (
    <Card padding="base">
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="单页加载中"
        aria-live="polite"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 md:grid-cols-[3rem_minmax(0,1fr)_9rem_7rem_8rem]"
          >
            <Skeleton className="h-5 w-5" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AdminPages() {
  const allowed = useAdminGuard("/admin/pages");
  const { notify } = useAppFeedback();
  const [params, setParams] = useSearchParams();
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  }, [allowed, page, q, reloadKey, status]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: key === "q" });
  };

  const hasFilters = Boolean(q || status);
  const clearFilters = () => setParams({});

  const copyPageLink = async (pageItem: CustomPage) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/${pageItem.slug}`,
      );
      notify("单页链接已复制。");
    } catch {
      notify("复制单页链接失败，请手动复制。", "error");
    }
  };

  const renderActions = (pageItem: CustomPage) => (
    <>
      <IconButtonLink
        to={`/${pageItem.slug}`}
        target="_blank"
        rel="noreferrer"
        label={`${pageItem.status === "published" ? "查看" : "预览"}单页 ${pageItem.title}`}
        icon={<Eye />}
      />
      <IconButton
        variant="ghost"
        label={`复制单页链接 ${pageItem.title}`}
        icon={<Copy />}
        onClick={() => void copyPageLink(pageItem)}
      />
      <IconButtonLink
        variant="ghost"
        to={`/admin/pages/${pageItem.id}/edit`}
        label={`编辑单页 ${pageItem.title}`}
        icon={<Edit2 />}
      />
      <IconButton
        variant="ghost"
        color="error"
        label={`删除单页 ${pageItem.title}`}
        icon={<Trash2 />}
        onClick={() => setDeleteTarget({ kind: "page", page: pageItem })}
      />
    </>
  );

  const performDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "page") {
        await pagesApi.deletePage(deleteTarget.page.id);
        setPages((current) =>
          current.filter((item) => item.id !== deleteTarget.page.id),
        );
        setTotal((current) => Math.max(0, current - 1));
        notify("单页已删除。");
      } else {
        await Promise.all(selected.map((id) => pagesApi.deletePage(id)));
        setPages((current) =>
          current.filter((item) => !selected.includes(item.id)),
        );
        setTotal((current) => Math.max(0, current - selected.length));
        setSelected([]);
        notify("所选单页已删除。");
      }
      setDeleteTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败，请稍后重试。");
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

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            className="min-w-[14rem] flex-1"
            aria-label="搜索单页"
            value={q}
            onChange={(event) => setFilter("q", event.target.value)}
            placeholder="搜索标题、摘要或路径"
          />
          <Select
            className="w-full sm:w-40"
            aria-label="单页状态"
            value={status}
            onChange={(value) =>
              setFilter(
                "status",
                Array.isArray(value) ? (value[0] ?? "") : value,
              )
            }
          >
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
          </Select>
          <span className="text-sm text-muted-foreground">{total} 页</span>
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

      {error && pages.length > 0 ? (
        <Alert type="error" showIcon title={error} />
      ) : null}

      {selected.length > 0 ? (
        <BulkActionBar
          selectionLabel={`已选择 ${selected.length} 页`}
          onCancel={() => setSelected([])}
        >
          <Button size="small" icon={<Bot />} onClick={() => setAIOpen(true)}>
            交给 AI
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
        <PagesSkeleton />
      ) : error && pages.length === 0 ? (
        <Alert
          type="error"
          showIcon
          title="单页加载失败"
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              重新载入
            </Button>
          }
        />
      ) : pages.length === 0 ? (
        <Card padding="lg">
          <Empty
            title={
              hasFilters
                ? "没有符合当前筛选条件的单页。"
                : "还没有创建过独立单页。"
            }
            action={
              hasFilters ? (
                <Button size="small" onClick={clearFilters}>
                  清除筛选
                </Button>
              ) : (
                <ButtonLink
                  size="small"
                  variant="solid"
                  color="primary"
                  to="/admin/pages/new"
                  icon={<Plus />}
                >
                  创建第一个单页
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
                  <TableHead className="w-36 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((pageItem) => (
                  <TableRow key={pageItem.id}>
                    <TableCell className="text-center">
                      <Checkbox
                        aria-label={`选择 ${pageItem.title}`}
                        checked={selected.includes(pageItem.id)}
                        onChange={(event) =>
                          setSelectedPage(pageItem.id, event.target.checked)
                        }
                      />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-0.5">
                        <strong className="text-sm font-semibold text-foreground">
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
                        <span className="text-xs text-muted-foreground/60">
                          隐藏
                        </span>
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
                      <div className="flex items-center justify-end gap-1">
                        {renderActions(pageItem)}
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
            aria-label="单页列表"
          >
            {pages.map((pageItem) => (
              <Card key={pageItem.id} padding="base" role="listitem">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      aria-label={`选择 ${pageItem.title}`}
                      checked={selected.includes(pageItem.id)}
                      onChange={(event) =>
                        setSelectedPage(pageItem.id, event.target.checked)
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="min-w-0 break-words text-sm font-semibold leading-snug">
                          {pageItem.title}
                        </strong>
                        <PageStatusTag status={pageItem.status} />
                      </div>
                      <div className="break-all font-mono text-xs text-muted-foreground">
                        /{pageItem.slug}
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
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {renderActions(pageItem)}
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
            ariaLabel="单页分页"
            align="center"
            onChange={(nextPage) => setFilter("page", String(nextPage))}
          />
        </div>
      ) : null}

      <ConfirmActionModal
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "page" ? "删除单页" : "批量删除单页"}
        description={
          deleteTarget?.kind === "page" ? (
            <>
              确认永久删除《{deleteTarget.page.title}》（/
              {deleteTarget.page.slug}）？此操作无法撤销。
            </>
          ) : (
            <>确认永久删除选中的 {selected.length} 个单页？此操作无法撤销。</>
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
        resourceType="page"
        resourceKeys={selected}
        onClose={() => setAIOpen(false)}
        title="将所选单页交给 AI"
      />
    </div>
  );
}
