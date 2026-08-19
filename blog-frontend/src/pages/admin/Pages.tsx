import { useEffect, useState } from 'react';
import { Copy, Edit2, Eye, Plus, Trash2, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AdminPage,
  AdminPageHeader,
  BulkActionBar,
  Button,
  ConfirmDialog,
  ContentStack,
  copyText,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  Pagination,
  Panel,
  SearchField,
  Select,
  StatusBadge,
  useToast,
} from '../../components/ui';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { pagesApi } from '../../api/pages';
import type { CustomPage } from '../../types/blog';
import { WorkflowLauncher } from '../../components/agent/WorkflowLauncher';

type DeleteTarget = { kind: 'page'; page: CustomPage } | { kind: 'batch' } | null;
const pageSize = 20;

export default function AdminPages() {
  const allowed = useAdminGuard('/admin/pages');
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);
  const [aiOpen, setAIOpen] = useState(false);

  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  useEffect(() => {
    if (!allowed) return;
    let ignore = false;
    setLoading(true);

    pagesApi.getAdminPages({ page, pageSize, q, status })
      .then((result) => {
        if (ignore) return;
        setPages(result.list || []);
        setTotal(result.total || 0);
        setSelected([]);
        setError('');
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
  }, [allowed, page, q, status]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: key === 'q' });
  };

  const hasFilters = Boolean(q || status);
  const clearFilters = () => setParams({});
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const performDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'page') {
        await pagesApi.deletePage(deleteTarget.page.id);
        setPages((current) => current.filter((item) => item.id !== deleteTarget.page.id));
        setTotal((current) => Math.max(0, current - 1));
        notify('单页已删除。');
      } else {
        await Promise.all(selected.map((id) => pagesApi.deletePage(id)));
        setPages((current) => current.filter((item) => !selected.includes(item.id)));
        setTotal((current) => Math.max(0, current - selected.length));
        setSelected([]);
        notify('所选单页已删除。');
      }
      setDeleteTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除失败，请稍后重试。');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="单页"
        description="管理关于我、友情链接、隐私政策等独立单页。"
        actions={
          <Link className="btn btn-primary" to="/admin/pages/new">
            <Plus /> 新建单页
          </Link>
        }
      />

      <ContentStack>
        {error ? (
          <ErrorState
            label={error}
            action={
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => window.location.reload()}
              >
                重新载入
              </button>
            }
          />
        ) : null}

        <FilterBar>
          <SearchField
            aria-label="搜索单页"
            value={q}
            onChange={(event) => setFilter('q', event.target.value)}
            placeholder="搜索标题、摘要或路径"
          />
          <Select
            size="compact"
            aria-label="单页状态"
            value={status}
            onChange={(event) => setFilter('status', event.target.value)}
          >
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
          </Select>
          <span className="filter-bar__count">{total} 页</span>
          {hasFilters ? (
            <Button
              className="filter-bar__actions"
              variant="ghost"
              size="compact"
              type="button"
              onClick={clearFilters}
            >
              <X /> 清除
            </Button>
          ) : null}
        </FilterBar>

        {selected.length ? (
          <BulkActionBar
            selectionLabel={`已选择 ${selected.length} 页`}
            onAIAssist={() => setAIOpen(true)}
            onCancel={() => setSelected([])}
          >
            <Button
              variant="danger"
              size="compact"
              type="button"
              onClick={() => setDeleteTarget({ kind: 'batch' })}
            >
              <Trash2 />删除
            </Button>
          </BulkActionBar>
        ) : null}

        {loading ? (
          <LoadingState label="正在载入单页…" />
        ) : !error && pages.length === 0 ? (
          <EmptyState
            label={hasFilters ? '没有符合当前筛选条件的单页。' : '还没有创建过独立单页。'}
            action={
              hasFilters ? (
                <button className="btn btn-secondary" type="button" onClick={clearFilters}>
                  清除筛选
                </button>
              ) : (
                <Link className="btn btn-primary" to="/admin/pages/new">
                  <Plus /> 新建单页
                </Link>
              )
            }
          />
        ) : pages.length ? (
          <Panel className="posts-table-panel">
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="选择当前页全部单页"
                        type="checkbox"
                        checked={pages.length > 0 && pages.every((p) => selected.includes(p.id))}
                        onChange={(event) =>
                          setSelected(event.target.checked ? pages.map((p) => p.id) : [])
                        }
                      />
                    </th>
                    <th>单页</th>
                    <th>访问路径</th>
                    <th>模板</th>
                    <th>导航展示</th>
                    <th>状态</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <input
                          aria-label={`选择 ${p.title}`}
                          type="checkbox"
                          checked={selected.includes(p.id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...new Set([...current, p.id])]
                                : current.filter((id) => id !== p.id)
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>{p.title}</strong>
                        <small>{p.summary || '无摘要'}</small>
                      </td>
                      <td>
                        <code>{`/${p.slug}`}</code>
                      </td>
                      <td>
                        <span className="badge badge-secondary">{p.template || 'default'}</span>
                      </td>
                      <td>
                        {p.show_in_nav ? (
                          <span className="badge badge-success">{`主导航 (权重:${p.sort_order})`}</span>
                        ) : (
                          <span className="text-muted text-sm">隐藏</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={p.status || 'draft'} />
                      </td>
                      <td>
                        {new Date(p.updated_at || p.created_at).toLocaleDateString('zh-CN')}
                      </td>
                      <td>
                        <div className="table-actions">
                          {p.status === 'published' ? (
                            <Link to={`/${p.slug}`} target="_blank" title="查看">
                              <Eye />
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            title="复制链接"
                            onClick={() =>
                              void copyText(`${location.origin}/${p.slug}`, notify, '单页链接已复制。')
                            }
                          >
                            <Copy />
                          </button>
                          <Link to={`/admin/pages/${p.id}/edit`} title="编辑">
                            <Edit2 />
                          </Link>
                          <button
                            type="button"
                            className="danger-action"
                            title="删除"
                            onClick={() => setDeleteTarget({ kind: 'page', page: p })}
                          >
                            <Trash2 />
                          </button>
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
            pages={totalPages}
            label="单页分页"
            onChange={(nextPage) => setFilter('page', String(nextPage))}
          />
        ) : null}
      </ContentStack>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === 'page' ? '删除单页' : '批量删除单页'}
        description={
          deleteTarget?.kind === 'page' ? (
            <>确认永久删除《{deleteTarget.page.title}》（/{deleteTarget.page.slug}）？此操作无法撤销。</>
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
    </AdminPage>
  );
}
