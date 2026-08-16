import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Copy, ImagePlus, Sparkles, Trash2 } from 'lucide-react';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
import { AdminPage, AdminPageHeader, Checkbox, ConfirmDialog, ContentStack, copyText, EmptyState, Feedback, Field, LoadingState, Panel, SearchField, Select, useToast } from '../components/ui';
import { WorkflowLauncher } from '../components/agent/WorkflowLauncher';
import { useI18n } from '../i18n';

interface MediaAsset {
  id: number;
  filename: string;
  url: string;
  content_type: string;
  size_bytes: number;
  alt_text: string;
  created_at: string;
  usage_count?: number;
}
interface MediaReference { post_id: number; post_title: string; post_slug: string }

export default function MediaLibrary() {
  const { t, formatDateTime } = useI18n();
  const { notify } = useToast();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [references, setReferences] = useState<MediaReference[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]); const [aiOpen, setAIOpen] = useState(false);

  const load = useCallback(async () => {
    const response = await apiFetch('/api/admin/media');
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || t('requestFailed'));
    setAssets(body.data || []);
  }, [t]);

  useEffect(() => {
    if (!isLoggedIn() || !canManageBlog()) {
      setLoading(false);
      void redirectToAuthorize('/admin/media');
      return;
    }
    load().catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [load]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!file) return;
    setUploading(true);
    setError('');
    const data = new FormData();
    data.append('file', file);
    data.append('alt_text', altText);
    try {
      const response = await apiFetch('/api/admin/media', { method: 'POST', body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || t('requestFailed'));
      setAssets((current) => [body.data, ...current]);
      setFile(null);
      setAltText('');
      form.reset();
      notify('图片已上传。');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    const response = await apiFetch(`/api/admin/media/${deleteTarget.id}`, { method: 'DELETE' });
    if (response.ok) {
      setAssets((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null); setReferences([]); notify('媒体已删除。');
    } else {
      const body = await response.json();
      if (response.status === 409) {
        try {
          const refsResponse = await apiFetch(`/api/admin/media/${deleteTarget.id}/references`);
          const refsBody = await refsResponse.json();
          setReferences(refsBody.data || []);
        } catch {
          setReferences([]);
        }
        setError('该媒体仍被文章引用，移除引用后才能删除。');
        setDeleteTarget(null);
      } else {
        setError(body.message || t('requestFailed'));
      }
    }
  };
  const visibleAssets = useMemo(() => assets.filter((asset) => {
    const matchesQuery = !query || `${asset.filename} ${asset.alt_text}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!type || asset.content_type === type);
  }), [assets, query, type]);
  const contentTypes = useMemo(() => [...new Set(assets.map((asset) => asset.content_type))], [assets]);

  return <AdminPage>
    <AdminPageHeader title={t('mediaLibrary')} description="上传、检索和复用内容中的图片资源。" actions={<span className="admin-page-count">{assets.length} 个资源</span>} />
    <ContentStack>
      {error ? <Feedback type="error">{error}{references.length ? <ul className="media-reference-list">{references.map((item) => <li key={item.post_id}><a href={`/admin/posts/${item.post_id}/edit`}>{item.post_title}</a></li>)}</ul> : null}</Feedback> : null}
      <Panel className="admin-toolbar-panel">
        <form className="media-upload-form" onSubmit={upload}>
          <Field label={t('imageFile')}><input className="input-field" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required onChange={(event) => setFile(event.target.files?.[0] || null)} /></Field>
          <Field label={t('altText')}><input className="input-field" value={altText} onChange={(event) => setAltText(event.target.value)} /></Field>
          <button className="btn btn-primary" type="submit" disabled={!file || uploading}><ImagePlus />{uploading ? t('uploading') : t('uploadImage')}</button>
        </form>
        <div className="media-filter-bar"><SearchField aria-label="搜索媒体" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名或替代文本" /><Select size="compact" aria-label="媒体类型" value={type} onChange={(event) => setType(event.target.value)}><option value="">全部类型</option>{contentTypes.map((item) => <option key={item} value={item}>{item.replace('image/', '').toUpperCase()}</option>)}</Select><span>{visibleAssets.length} / {assets.length}</span></div>
      </Panel>
      {selectedAssets.length ? <div className="bulk-action-bar"><strong>已选择 {selectedAssets.length} 个媒体</strong><button onClick={() => setAIOpen(true)}><Sparkles />交给 AI</button><button onClick={() => setSelectedAssets([])}>取消</button></div> : null}
      {loading ? <LoadingState label={t('loadingResources')} /> : assets.length === 0 ? <EmptyState label={t('noMedia')} /> : visibleAssets.length === 0 ? <EmptyState label="没有符合条件的媒体资源。" /> : <div className="media-grid">{visibleAssets.map((asset) => <Panel className="media-card" id={`asset-${asset.id}`} key={asset.id}>
        <Checkbox aria-label={`选择媒体 ${asset.filename}`} checked={selectedAssets.includes(asset.id)} onChange={(event) => setSelectedAssets((current) => event.target.checked ? [...new Set([...current, asset.id])] : current.filter((id) => id !== asset.id))} />
        <img src={asset.url} alt={asset.alt_text || asset.filename} loading="lazy" />
        <div><strong>{asset.filename}</strong><small>{Math.ceil(asset.size_bytes / 1024)} KB · {formatDateTime(asset.created_at)} · 引用 {asset.usage_count || 0}</small></div>
        <div className="row-actions"><button className="btn btn-secondary" type="button" onClick={() => void copyText(`![${asset.alt_text || asset.filename}](${asset.url})`, notify, '媒体 Markdown 已复制。')}><Copy />{t('copyMarkdown')}</button><button className="btn btn-danger" type="button" onClick={() => { setDeleteTarget(asset); setReferences([]); setError(''); }}><Trash2 />{t('delete')}</button></div>
      </Panel>)}</div>}
    </ContentStack>
    <ConfirmDialog open={deleteTarget !== null} title="删除媒体" description={t('deleteMediaConfirm')} confirmLabel="永久删除" danger onClose={() => { setDeleteTarget(null); setReferences([]); }} onConfirm={remove} />
    <WorkflowLauncher open={aiOpen} resourceType="media_asset" resourceKeys={selectedAssets} onClose={() => setAIOpen(false)} title="将所选媒体交给 AI" />
  </AdminPage>;
}
