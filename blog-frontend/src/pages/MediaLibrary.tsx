import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Copy, ImagePlus, Trash2 } from 'lucide-react';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
import { AdminPage, AdminPageHeader, EmptyState, Feedback, Field, LoadingState, Panel } from '../components/ui';
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

export default function MediaLibrary() {
  const { t, formatDateTime } = useI18n();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');

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
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (asset: MediaAsset) => {
    if (!confirm(t('deleteMediaConfirm'))) return;
    const response = await apiFetch(`/api/admin/media/${asset.id}`, { method: 'DELETE' });
    if (response.ok) {
      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } else {
      const body = await response.json();
      setError(response.status === 409 ? `该媒体仍被 ${asset.usage_count || '一篇或多篇'}文章引用，移除引用后才能删除。` : body.message || t('requestFailed'));
    }
  };

  return <AdminPage>
    <AdminPageHeader title={t('mediaLibrary')} description="上传、检索和复用内容中的图片资源。" actions={<span className="admin-page-count">{assets.length} 个资源</span>} />
    {error ? <Feedback type="error">{error}</Feedback> : null}
    <Panel className="admin-toolbar-panel">
      <form className="media-upload-form" onSubmit={upload}>
        <Field label={t('imageFile')}><input className="input-field" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required onChange={(event) => setFile(event.target.files?.[0] || null)} /></Field>
        <Field label={t('altText')}><input className="input-field" value={altText} onChange={(event) => setAltText(event.target.value)} /></Field>
        <button className="btn btn-primary" type="submit" disabled={!file || uploading}><ImagePlus />{uploading ? t('uploading') : t('uploadImage')}</button>
      </form>
    </Panel>
    {loading ? <LoadingState label={t('loadingResources')} /> : assets.length === 0 ? <EmptyState label={t('noMedia')} /> : <div className="media-grid">{assets.map((asset) => <Panel className="media-card" key={asset.id}>
      <img src={asset.url} alt={asset.alt_text || asset.filename} loading="lazy" />
      <div><strong>{asset.filename}</strong><small>{Math.ceil(asset.size_bytes / 1024)} KB · {formatDateTime(asset.created_at)} · 引用 {asset.usage_count || 0}</small></div>
      <div className="row-actions"><button className="btn btn-secondary" type="button" onClick={() => void navigator.clipboard.writeText(`![${asset.alt_text || asset.filename}](${asset.url})`)}><Copy />{t('copyMarkdown')}</button><button className="btn btn-danger" type="button" onClick={() => void remove(asset)}><Trash2 />{t('delete')}</button></div>
    </Panel>)}</div>}
  </AdminPage>;
}
