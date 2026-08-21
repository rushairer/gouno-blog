import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Copy, ImagePlus, LoaderCircle, Sparkles, Trash2, X } from 'lucide-react';
import { canManageBlog, isLoggedIn, redirectToAuthorize } from '../../auth';
import { mediaApi } from '../../api/media';
import { agentApi } from '../../api/agent';
import { AdminPage, AdminPageHeader, BulkActionBar, Button, Checkbox, ConfirmDialog, ContentStack, copyText, Drawer, EmptyState, Feedback, Field, FilterBar, Input, LoadingState, Panel, SearchField, Select, Textarea, useToast } from '../../components/ui';
import { WorkflowLauncher } from '../../components/agent/WorkflowLauncher';
import { useI18n } from '../../i18n';

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
type BatchDeleteTarget = { kind: 'batch' };
type DeleteTarget = MediaAsset | BatchDeleteTarget | null;

function isBatchDeleteTarget(target: DeleteTarget): target is BatchDeleteTarget {
  return Boolean(target && 'kind' in target && target.kind === 'batch');
}

export default function MediaLibrary() {
  const { t, formatDateTime } = useI18n();
  const { notify } = useToast();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [references, setReferences] = useState<MediaReference[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]);
  const [aiOpen, setAIOpen] = useState(false);

  // AI Text-to-Image states
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiAlt, setAiAlt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiGenerated, setAiGenerated] = useState<{ url: string; alt: string } | null>(null);

  const load = useCallback(async () => {
    const data = await mediaApi.listMedia();
    setAssets(data as MediaAsset[]);
  }, []);

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
      const uploaded = await mediaApi.uploadMedia(data);
      setAssets((current) => [uploaded as MediaAsset, ...current]);
      setFile(null);
      setAltText('');
      form.reset();
      setUploadDrawerOpen(false);
      notify('图片已上传。', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateAiImage = async (presetPrompt?: string) => {
    const effectivePrompt = (presetPrompt !== undefined ? presetPrompt : aiPrompt).trim();
    if (!effectivePrompt) {
      setAiError('请输入生图提示词。');
      notify('请输入生图提示词。', 'error');
      return;
    }
    setAiGenerating(true);
    setAiError('');
    try {
      notify('AI 正在绘制插图中（通常需 15~40 秒），请稍候…', 'success');
      const finalAlt = aiAlt.trim() || 'AI 媒体插图';
      const res = await agentApi.generateImage({
        prompt: effectivePrompt,
        alt_text: finalAlt,
      });
      if (res?.url) {
        setAiGenerated({ url: res.url, alt: finalAlt });
        notify('🎨 图片已成功生成并自动存入媒体库！', 'success');
        await load();
      } else {
        const msg = 'AI 未能成功生成图片，请稍后重试。';
        setAiError(msg);
        notify(msg, 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 生图失败，请稍后重试。';
      setAiError(msg);
      notify(msg, 'error');
    } finally {
      setAiGenerating(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    if (isBatchDeleteTarget(deleteTarget)) {
      const results = await Promise.allSettled(
        selectedAssets.map(async (id) => {
          await mediaApi.deleteMedia(id);
          return id;
        })
      );
      const removed = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
      const failed = selectedAssets.filter((id) => !removed.includes(id));
      setAssets((current) => current.filter((item) => !removed.includes(item.id)));
      setSelectedAssets(failed);
      setDeleteTarget(null);
      setReferences([]);
      if (failed.length) {
        const reason = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
        setError(`已删除 ${removed.length} 个媒体；${failed.length} 个未删除：${reason instanceof Error ? reason.message : '可能仍被文章引用。'}`);
        return;
      }
      notify(`已删除 ${removed.length} 个媒体。`, 'success');
      return;
    }
    try {
      await mediaApi.deleteMedia(deleteTarget.id);
      setAssets((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setReferences([]);
      notify('媒体已删除。', 'success');
    } catch {
      try {
        const refs = await mediaApi.getMediaReferences(deleteTarget.id);
        setReferences(refs);
      } catch {
        setReferences([]);
      }
      setError('该媒体仍被文章引用，移除引用后才能删除。');
      setDeleteTarget(null);
    }
  };

  const visibleAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesQuery = !query || `${asset.filename} ${asset.alt_text}`.toLowerCase().includes(query.toLowerCase());
      return matchesQuery && (!type || asset.content_type === type);
    });
  }, [assets, query, type]);

  const contentTypes = useMemo(() => [...new Set(assets.map((asset) => asset.content_type))], [assets]);

  return (
    <AdminPage>
      <AdminPageHeader
        title={t('mediaLibrary')}
        description="上传、检索和复用内容中的图片资源，支持 AI 直接文生图并入库。"
        actions={
          <>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setAiDrawerOpen(true);
                setAiGenerated(null);
                setAiPrompt('');
                setAiAlt('');
                setAiError('');
              }}
            >
              <Sparkles />AI 文生图
            </Button>
            <Button variant="primary" type="button" onClick={() => setUploadDrawerOpen(true)}>
              <ImagePlus />上传图片
            </Button>
            <span className="admin-page-count">{assets.length} 个资源</span>
          </>
        }
      />
      <ContentStack>
        {error ? (
          <Feedback type="error">
            {error}
            {references.length ? (
              <ul className="media-reference-list">
                {references.map((item) => (
                  <li key={item.post_id}>
                    <a href={`/admin/posts/${item.post_id}/edit`}>{item.post_title}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </Feedback>
        ) : null}
        <FilterBar>
          <SearchField aria-label="搜索媒体" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名或替代文本" />
          <Select size="compact" aria-label="媒体类型" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">全部类型</option>
            {contentTypes.map((item) => (
              <option key={item} value={item}>{item.replace('image/', '').toUpperCase()}</option>
            ))}
          </Select>
          <span className="filter-bar__count">{visibleAssets.length} / {assets.length}</span>
          {query || type ? (
            <Button className="filter-bar__actions" variant="ghost" size="compact" type="button" onClick={() => { setQuery(''); setType(''); }}>
              <X /> 清除
            </Button>
          ) : null}
        </FilterBar>
        {selectedAssets.length ? (
          <BulkActionBar selectionLabel={`已选择 ${selectedAssets.length} 个媒体`} onAIAssist={() => setAIOpen(true)} onCancel={() => setSelectedAssets([])}>
            <Button variant="danger" size="compact" type="button" onClick={() => { setDeleteTarget({ kind: 'batch' }); setReferences([]); setError(''); }}>
              <Trash2 />删除
            </Button>
          </BulkActionBar>
        ) : null}
        {loading ? (
          <LoadingState label={t('loadingResources')} />
        ) : assets.length === 0 ? (
          <EmptyState label={t('noMedia')} />
        ) : visibleAssets.length === 0 ? (
          <EmptyState label="没有符合条件的媒体资源。" />
        ) : (
          <div className="media-grid">
            {visibleAssets.map((asset) => (
              <Panel className="media-card" id={`asset-${asset.id}`} key={asset.id}>
                <Checkbox
                  aria-label={`选择媒体 ${asset.filename}`}
                  checked={selectedAssets.includes(asset.id)}
                  onChange={(event) =>
                    setSelectedAssets((current) =>
                      event.target.checked ? [...new Set([...current, asset.id])] : current.filter((id) => id !== asset.id)
                    )
                  }
                />
                <img src={asset.url} alt={asset.alt_text || asset.filename} loading="lazy" />
                <div>
                  <strong>{asset.filename}</strong>
                  <small>{Math.ceil(asset.size_bytes / 1024)} KB · {formatDateTime(asset.created_at)} · 引用 {asset.usage_count || 0}</small>
                </div>
                <div className="row-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => void copyText(`![${asset.alt_text || asset.filename}](${asset.url})`, notify, '媒体 Markdown 已复制。')}>
                    <Copy />{t('copyMarkdown')}
                  </button>
                  <button className="btn btn-danger" type="button" onClick={() => { setDeleteTarget(asset); setReferences([]); setError(''); }}>
                    <Trash2 />{t('delete')}
                  </button>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </ContentStack>

      {/* 上传图片 Drawer */}
      <Drawer open={uploadDrawerOpen} title="上传图片" description="选择图片并补充替代文本，便于内容复用与无障碍阅读。" onClose={() => !uploading && setUploadDrawerOpen(false)}>
        <form className="drawer-form media-upload-drawer" onSubmit={upload}>
          <Field label={t('imageFile')} required hint="支持 JPEG、PNG、WebP 与 GIF。">
            <input className="input-field" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </Field>
          {file ? <p className="upload-file-summary">已选择：<strong>{file.name}</strong> · {Math.ceil(file.size / 1024)} KB</p> : null}
          <Field label={t('altText')} hint="简洁说明图片内容；留空时会使用文件名。">
            <Input value={altText} onChange={(event) => setAltText(event.target.value)} />
          </Field>
          <div className="drawer-actions">
            <Button variant="secondary" type="button" disabled={uploading} onClick={() => setUploadDrawerOpen(false)}>取消</Button>
            <Button variant="primary" disabled={!file} loading={uploading}>
              <ImagePlus />{uploading ? t('uploading') : t('uploadImage')}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* AI 文生图 Drawer */}
      <Drawer open={aiDrawerOpen} title="AI 文生图" description="输入创意描述，让 AI 一键绘制高质量插画并直接存入媒体库。" onClose={() => !aiGenerating && setAiDrawerOpen(false)}>
        <div className="drawer-form">
          <Field label="风格预设" hint="点击预设快速填入专业提示词风格">
            <div className="editor-ai-presets" style={{ marginTop: 4 }}>
              <button type="button" onClick={() => setAiPrompt('A sleek modern architectural diagram illustration showing system components, clean lines, isometric view, tech palette')} disabled={aiGenerating}>
                📊 架构图解
              </button>
              <button type="button" onClick={() => setAiPrompt('A modern minimal editorial vector illustration for a clean web page, subtle gradients, flat design')} disabled={aiGenerating}>
                🖼️ 科技插画
              </button>
              <button type="button" onClick={() => setAiPrompt('Cinematic concept art, hyper-detailed futuristic scene, volumetric lighting, 8k wallpaper quality')} disabled={aiGenerating}>
                🎬 电影概念
              </button>
              <button type="button" onClick={() => setAiPrompt('Cute 3D isometric clay render illustration, soft studio lighting, playful scene')} disabled={aiGenerating}>
                🎨 3D 立体
              </button>
              <button type="button" onClick={() => setAiPrompt('Breathtaking atmospheric nature landscape, morning golden hour mist, tranquil mountain reflections, award-winning photography')} disabled={aiGenerating}>
                🌄 自然风光
              </button>
              <button type="button" onClick={() => setAiPrompt('Ultra-minimalist modern abstract geometry, soft pastel tones, clean negative space, fine art')} disabled={aiGenerating}>
                🏙️ 极简抽象
              </button>
            </div>
          </Field>

          <Field label="生图提示词 (Prompt)" required hint="支持中文或英文描述画面主体、风格、构图与光影。">
            <Textarea
              rows={4}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="例如：科技感云原生架构插画，具有微服务节点、流动的发光数据连线，深蓝与青绿色渐变…"
              disabled={aiGenerating}
              required
            />
          </Field>

          <Field label="替代文本 (Alt Text)" hint="留空时将自动命名为 AI 媒体插图">
            <Input
              value={aiAlt}
              onChange={(e) => setAiAlt(e.target.value)}
              placeholder="例如：云原生架构图解"
              disabled={aiGenerating}
            />
          </Field>

          {aiError ? (
            <div style={{ color: 'var(--danger, #ef4444)', fontSize: 12, padding: '6px 10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 4 }}>
              {aiError}
            </div>
          ) : null}

          {aiGenerated ? (
            <div className="editor-ai-image-result" style={{ marginTop: 8 }}>
              <div className="editor-ai-image-preview">
                <img src={aiGenerated.url} alt={aiGenerated.alt} />
              </div>
              <div className="editor-ai-image-info">
                <div className="editor-ai-image-code">
                  {`![${aiGenerated.alt}](${aiGenerated.url})`}
                </div>
                <div className="editor-ai-image-actions">
                  <Button variant="primary" type="button" onClick={() => void copyText(`![${aiGenerated.alt}](${aiGenerated.url})`, notify, 'Markdown 已复制！')}>
                    <Copy /> 复制 Markdown
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => { setAiGenerated(null); setAiPrompt(''); }}>
                    ➕ 生成下一张
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="drawer-actions" style={{ marginTop: 12 }}>
            <Button variant="secondary" type="button" disabled={aiGenerating} onClick={() => setAiDrawerOpen(false)}>
              {aiGenerated ? '完成' : '取消'}
            </Button>
            <Button variant="primary" type="button" disabled={aiGenerating || !aiPrompt.trim()} onClick={() => void handleGenerateAiImage()}>
              {aiGenerating ? <><LoaderCircle className="is-spinning" /> 正在绘制入库中…</> : <><Sparkles /> 开始生图并入库</>}
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={isBatchDeleteTarget(deleteTarget) ? '批量删除媒体' : '删除媒体'}
        description={isBatchDeleteTarget(deleteTarget) ? `确认永久删除选中的 ${selectedAssets.length} 个媒体？仍被文章引用的媒体将保留。` : t('deleteMediaConfirm')}
        confirmLabel="永久删除"
        danger
        onClose={() => { setDeleteTarget(null); setReferences([]); }}
        onConfirm={remove}
      />
      <WorkflowLauncher open={aiOpen} resourceType="media_asset" resourceKeys={selectedAssets} onClose={() => setAIOpen(false)} title="将所选媒体交给 AI" />
    </AdminPage>
  );
}
