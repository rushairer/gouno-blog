import { useEffect, useState } from 'react';
import { Edit2, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AdminPage,
  AdminPageHeader,
  Button,
  ConfirmDialog,
  ContentStack,
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
import { deletePage, getAdminPages } from '../../lib/blog-api';
import type { CustomPage } from '../../types/blog';

const pageSize = 20;

export default function AdminPages() {
  const allowed = useAdminGuard('/admin/pages');
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CustomPage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  useEffect(() => {
    if (!allowed) return;
    let ignore = false;
    setLoading(true);

    getAdminPages({ page, pageSize, q, status })
      .then((result) => {
        if (ignore) return;
        setPages(result.list || []);
        setTotal(result.total || 0);
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

  const performDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePage(deleteTarget.id);
      setPages((current) => current.filter((item) => item.id !== deleteTarget.id));
      setTotal((current) => Math.max(0, current - 1));
      notify('页面已删除。');
      setDeleteTarget(null);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : '删除失败，请稍后重试。', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="单页管理"
        description="创建与维护关于我们、友情链接、隐私政策等独立单页。"
        actions={
          <Link to="/admin/pages/new">
            <Button variant="primary">
              <Plus /> 新建页面
            </Button>
          </Link>
        }
      />

      <FilterBar>
        <SearchField
          value={q}
          placeholder="搜索页面标题或路径..."
          onChange={(e) => setFilter('q', e.target.value)}
        />
        <Select
          value={status}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label="按发布状态筛选"
        >
          <option value="">全部状态</option>
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
        </Select>
      </FilterBar>

      {error ? (
        <ErrorState
          label={error}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setLoading(true);
                getAdminPages({ page, pageSize, q, status })
                  .then((result) => {
                    setPages(result.list || []);
                    setTotal(result.total || 0);
                    setError('');
                  })
                  .catch((r: Error) => setError(r.message))
                  .finally(() => setLoading(false));
              }}
            >
              重试
            </Button>
          }
        />
      ) : loading ? (
        <LoadingState label="正在载入页面列表…" />
      ) : pages.length === 0 ? (
        <EmptyState
          label={q || status ? '没有找到符合条件的页面。' : '还没有创建任何单页，点击右上角新建。'}
          action={
            <Link to="/admin/pages/new">
              <Button variant="primary">
                <Plus /> 新建页面
              </Button>
            </Link>
          }
        />
      ) : (
        <ContentStack>
          <Panel>
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>标题</th>
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
                        <strong>{p.title}</strong>
                        {p.summary ? <p className="text-muted text-sm">{p.summary}</p> : null}
                      </td>
                      <td>
                        <code>{`/${p.slug}`}</code>
                      </td>
                      <td>
                        <span className="badge badge-secondary">{p.template || 'default'}</span>
                      </td>
                      <td>
                        {p.show_in_nav ? (
                          <span className="badge badge-success">{`顶部导航 (权重:${p.sort_order})`}</span>
                        ) : (
                          <span className="text-muted text-sm">隐藏</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={p.status || 'draft'} />
                      </td>
                      <td className="text-muted text-sm">
                        {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '-'}
                      </td>
                      <td>
                        <div className="actions">
                          <a
                            href={`/${p.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-icon btn-sm"
                            title="预览页面"
                            aria-label={`预览 ${p.title}`}
                          >
                            <ExternalLink />
                          </a>
                          <Link
                            to={`/admin/pages/${p.id}/edit`}
                            className="btn btn-icon btn-sm"
                            title="编辑页面"
                            aria-label={`编辑 ${p.title}`}
                          >
                            <Edit2 />
                          </Link>
                          <button
                            type="button"
                            className="btn btn-icon btn-sm text-danger"
                            title="删除页面"
                            aria-label={`删除 ${p.title}`}
                            onClick={() => setDeleteTarget(p)}
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

          {total > pageSize ? (
            <Pagination
              page={page}
              pages={Math.ceil(total / pageSize)}
              onChange={(next) => setFilter('page', String(next))}
            />
          ) : null}
        </ContentStack>
      )}

      {deleteTarget ? (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="确认删除页面？"
          description={`删除后，访问路径 /${deleteTarget.slug} 将无法打开。此操作不可逆。`}
          confirmLabel="确认删除"
          danger
          busy={deleting}
          onConfirm={performDelete}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </AdminPage>
  );
}
