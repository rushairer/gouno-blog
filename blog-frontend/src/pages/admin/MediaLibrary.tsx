import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Copy,
  ImagePlus,
  Link2,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { mediaApi } from "../../api/media";
import type { MediaItem, MediaReference } from "../../api/media";
import { agentApi } from "../../api/agent";
import { useAbility } from "../../abilities";
import {
  AdminPage,
  AdminPageHeader,
  AsyncState,
  BulkActionBar,
  Button,
  Checkbox,
  ConfirmDialog,
  ContentStack,
  copyText,
  Drawer,
  EmptyState,
  Feedback,
  FilterBar,
  Panel,
  SearchField,
  Select,
  TableSkeleton,
  useToast,
} from "../../components/ui";
import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";
import {
  MediaAltTextForm,
  MediaImageGenerationForm,
  MediaUploadForm,
} from "../../components/media/MediaDrawerForms";
import { useI18n } from "../../i18n";

type BatchDeleteTarget = { kind: "batch" };
type DeleteTarget = MediaItem | BatchDeleteTarget | null;

function isBatchDeleteTarget(
  target: DeleteTarget,
): target is BatchDeleteTarget {
  return Boolean(target && "kind" in target && target.kind === "batch");
}

export function getRelativeMediaUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      const parsed = new URL(rawUrl);
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    // fallback
  }
  return rawUrl;
}

export default function MediaLibrary() {
  const { t, formatDateTime } = useI18n();
  const { notify } = useToast();
  const { can } = useAbility();
  const [assets, setAssets] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [references, setReferences] = useState<MediaReference[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]);
  const [aiOpen, setAIOpen] = useState(false);

  // Edit Alt Text states
  const [editingAsset, setEditingAsset] = useState<MediaItem | null>(null);
  const [editAltText, setEditAltText] = useState("");
  const [savingAltText, setSavingAltText] = useState(false);
  const [editAltError, setEditAltError] = useState("");

  // AI Text-to-Image states
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAlt, setAiAlt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiGenerated, setAiGenerated] = useState<{
    url: string;
    alt: string;
  } | null>(null);

  const load = useCallback(async () => {
    const data = await mediaApi.listMedia();
    setAssets(data);
  }, []);

  useEffect(() => {
    load()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!file) return;
    setUploading(true);
    setUploadError("");
    setError("");
    const data = new FormData();
    data.append("file", file);
    data.append("alt_text", altText);
    try {
      const uploaded = await mediaApi.uploadMedia(data);
      setAssets((current) => [uploaded, ...current]);
      setFile(null);
      setAltText("");
      form.reset();
      setUploadDrawerOpen(false);
      notify("图片已上传。", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("requestFailed");
      setUploadError(msg);
      notify(msg, "error");
    } finally {
      setUploading(false);
    }
  };

  const openEditAltDrawer = (asset: MediaItem) => {
    setEditingAsset(asset);
    setEditAltText(asset.alt_text || "");
    setEditAltError("");
  };

  const handleSaveAltText = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingAsset) return;
    setSavingAltText(true);
    setEditAltError("");
    try {
      const updated = await mediaApi.updateMedia(editingAsset.id, {
        alt_text: editAltText.trim(),
      });
      setAssets((current) =>
        current.map((item) =>
          item.id === updated.id
            ? { ...item, alt_text: updated.alt_text }
            : item,
        ),
      );
      setEditingAsset(null);
      notify(t("altTextUpdated"), "success");
    } catch (err) {
      setEditAltError(err instanceof Error ? err.message : t("requestFailed"));
    } finally {
      setSavingAltText(false);
    }
  };

  const handleGenerateAiImage = async (presetPrompt?: string) => {
    const effectivePrompt = (
      presetPrompt !== undefined ? presetPrompt : aiPrompt
    ).trim();
    if (!effectivePrompt) {
      setAiError("请输入生图提示词。");
      notify("请输入生图提示词。", "error");
      return;
    }
    setAiGenerating(true);
    setAiError("");
    try {
      notify("AI 正在绘制插图中（通常需 15~40 秒），请稍候…", "success");
      const finalAlt = aiAlt.trim() || "AI 媒体插图";
      const res = await agentApi.generateImage({
        prompt: effectivePrompt,
        alt_text: finalAlt,
      });
      if (res?.url) {
        setAiGenerated({ url: res.url, alt: finalAlt });
        notify("🎨 图片已成功生成并自动存入媒体库！", "success");
        await load();
      } else {
        const msg = "AI 未能成功生成图片，请稍后重试。";
        setAiError(msg);
        notify(msg, "error");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "AI 生图失败，请稍后重试。";
      setAiError(msg);
      notify(msg, "error");
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
        }),
      );
      const removed = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failed = selectedAssets.filter((id) => !removed.includes(id));
      setAssets((current) =>
        current.filter((item) => !removed.includes(item.id)),
      );
      setSelectedAssets(failed);
      setDeleteTarget(null);
      setReferences([]);
      if (failed.length) {
        const reason = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        )?.reason;
        setError(
          `已删除 ${removed.length} 个媒体；${failed.length} 个未删除：${reason instanceof Error ? reason.message : "可能仍被文章引用。"}`,
        );
        return;
      }
      notify(`已删除 ${removed.length} 个媒体。`, "success");
      return;
    }
    try {
      await mediaApi.deleteMedia(deleteTarget.id);
      setAssets((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      setReferences([]);
      notify("媒体已删除。", "success");
    } catch (err) {
      let refs: typeof references = [];
      try {
        refs = await mediaApi.getMediaReferences(deleteTarget.id);
        setReferences(refs);
      } catch {
        setReferences([]);
      }
      if (refs.length > 0) {
        setError("该媒体仍被文章引用，移除引用后才能删除。");
      } else if (err instanceof Error && err.message) {
        setError(
          err.message ===
            "media asset is still referenced by published or draft content"
            ? "该媒体仍被文章引用，移除引用后才能删除。"
            : err.message,
        );
      } else {
        setError("删除媒体失败，请稍后重试。");
      }
      setDeleteTarget(null);
    }
  };

  const visibleAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesQuery =
        !query ||
        `${asset.filename} ${asset.alt_text}`
          .toLowerCase()
          .includes(query.toLowerCase());
      return matchesQuery && (!type || asset.content_type === type);
    });
  }, [assets, query, type]);

  const contentTypes = useMemo(
    () => [...new Set(assets.map((asset) => asset.content_type))],
    [assets],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        title="媒体库"
        description="上传、检索和复用全站内容中的图片资源，支持 AI 直接文生图入库。"
        actions={
          <>
            {can("create", "media") ? (
              <>
                <Button
                  variant="secondary"
                  type="button"
                  icon={<Sparkles />}
                  onClick={() => {
                    setAiDrawerOpen(true);
                    setAiGenerated(null);
                    setAiPrompt("");
                    setAiAlt("");
                    setAiError("");
                  }}
                >
                  AI 文生图
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  icon={<ImagePlus />}
                  onClick={() => {
                    setUploadError("");
                    setUploadDrawerOpen(true);
                  }}
                >
                  上传图片
                </Button>
              </>
            ) : null}
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
                    <a href={`/admin/posts/${item.post_id}/edit`}>
                      {item.post_title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </Feedback>
        ) : null}
        <FilterBar>
          <SearchField
            aria-label="搜索媒体"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件名或替代文本"
          />
          <Select
            size="compact"
            aria-label="媒体类型"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">全部类型</option>
            {contentTypes.map((item) => (
              <option key={item} value={item}>
                {item.replace("image/", "").toUpperCase()}
              </option>
            ))}
          </Select>
          <span className="filter-bar__count">
            {visibleAssets.length} / {assets.length}
          </span>
          {query || type ? (
            <Button
              className="filter-bar__actions"
              variant="ghost"
              size="compact"
              type="button"
              onClick={() => {
                setQuery("");
                setType("");
              }}
              icon={<X />}
            >
              清除
            </Button>
          ) : null}
        </FilterBar>
        {can("batch", "media") && selectedAssets.length ? (
          <BulkActionBar
            selectionLabel={`已选择 ${selectedAssets.length} 个媒体`}
            onAIAssist={() => setAIOpen(true)}
            onCancel={() => setSelectedAssets([])}
          >
            <Button
              variant="danger"
              size="compact"
              type="button"
              onClick={() => {
                setDeleteTarget({ kind: "batch" });
                setReferences([]);
                setError("");
              }}
              icon={<Trash2 />}
            >
              删除
            </Button>
          </BulkActionBar>
        ) : null}
        <AsyncState
          loading={loading}
          skeleton={<TableSkeleton rows={4} columns={4} />}
          error={assets.length === 0 ? error : null}
          onRetry={() => void load()}
          retryLabel="重新载入"
          empty={!loading && visibleAssets.length === 0 && !error}
          emptyState={
            <EmptyState
              label={
                assets.length === 0 ? t("noMedia") : "没有符合条件的媒体资源。"
              }
            />
          }
        >
          <div className="media-grid">
            {visibleAssets.map((asset) => (
              <Panel
                className="media-card"
                id={`asset-${asset.id}`}
                key={asset.id}
              >
                {can("batch", "media") ? (
                  <Checkbox
                    aria-label={`选择媒体 ${asset.filename}`}
                    checked={selectedAssets.includes(asset.id)}
                    onChange={(event) =>
                      setSelectedAssets((current) =>
                        event.target.checked
                          ? [...new Set([...current, asset.id])]
                          : current.filter((id) => id !== asset.id),
                      )
                    }
                  />
                ) : null}
                <img
                  src={asset.url}
                  alt={asset.alt_text || asset.filename}
                  loading="lazy"
                />
                <div>
                  <strong>{asset.filename}</strong>
                  <small>
                    {Math.ceil(asset.size_bytes / 1024)} KB ·{" "}
                    {formatDateTime(asset.created_at)} · 引用{" "}
                    {asset.usage_count || 0}
                  </small>
                  <small
                    className="media-card__alt"
                    title={
                      asset.alt_text
                        ? `${t("altText")}: ${asset.alt_text}`
                        : undefined
                    }
                  >
                    {t("altText")}:{" "}
                    {asset.alt_text || (
                      <span className="text-muted">{t("notSet")}</span>
                    )}
                  </small>
                </div>
                <div className="row-actions">
                  <Button
                    variant="secondary"
                    title={t("copyRelativeUrl")}
                    onClick={() =>
                      void copyText(
                        getRelativeMediaUrl(asset.url),
                        notify,
                        t("relativeUrlCopied"),
                      )
                    }
                    icon={<Link2 />}
                  >
                    {t("copyRelativeUrl")}
                  </Button>
                  <Button
                    variant="secondary"
                    title={t("copyMarkdown")}
                    onClick={() =>
                      void copyText(
                        `![${asset.alt_text || asset.filename}](${asset.url})`,
                        notify,
                        "媒体 Markdown 已复制。",
                      )
                    }
                    icon={<Copy />}
                  >
                    {t("copyMarkdown")}
                  </Button>
                  {can("edit", "media", asset) ? (
                    <Button
                      variant="secondary"
                      title={t("editAltText")}
                      onClick={() => openEditAltDrawer(asset)}
                      icon={<Pencil />}
                    >
                      {t("editAltText")}
                    </Button>
                  ) : null}
                  {can("delete", "media", asset) ? (
                    <Button
                      variant="danger"
                      title={t("delete")}
                      onClick={() => {
                        setDeleteTarget(asset);
                        setReferences([]);
                        setError("");
                      }}
                      icon={<Trash2 />}
                    >
                      {t("delete")}
                    </Button>
                  ) : null}
                </div>
              </Panel>
            ))}
          </div>
        </AsyncState>
      </ContentStack>

      {/* 上传图片 Drawer */}
      <Drawer
        open={uploadDrawerOpen}
        title="上传图片"
        description="选择图片并补充替代文本，便于内容复用与无障碍阅读。"
        onClose={() => {
          if (!uploading) {
            setUploadDrawerOpen(false);
            setUploadError("");
          }
        }}
      >
        <MediaUploadForm
          file={file}
          altText={altText}
          error={uploadError}
          uploading={uploading}
          labels={{
            imageFile: t("imageFile"),
            altText: t("altText"),
            cancel: t("cancel"),
            uploadImage: t("uploadImage"),
            uploading: t("uploading"),
          }}
          onFileChange={setFile}
          onAltTextChange={setAltText}
          onCancel={() => {
            setUploadDrawerOpen(false);
            setUploadError("");
          }}
          onSubmit={upload}
        />
      </Drawer>

      {/* AI 文生图 Drawer */}
      <Drawer
        open={aiDrawerOpen}
        title="AI 文生图"
        description="输入创意描述，让 AI 一键绘制高质量插画并直接存入媒体库。"
        onClose={() => !aiGenerating && setAiDrawerOpen(false)}
      >
        <MediaImageGenerationForm
          prompt={aiPrompt}
          alt={aiAlt}
          error={aiError}
          generated={aiGenerated}
          generating={aiGenerating}
          onPromptChange={setAiPrompt}
          onAltChange={setAiAlt}
          onGenerate={() => void handleGenerateAiImage()}
          onCancel={() => setAiDrawerOpen(false)}
          onCopy={(value) => void copyText(value, notify, "Markdown 已复制！")}
          onReset={() => {
            setAiGenerated(null);
            setAiPrompt("");
          }}
        />
      </Drawer>

      {/* 编辑替代文本 Drawer */}
      <Drawer
        open={editingAsset !== null}
        title={t("editAltText")}
        description="修改图片的替代文本（Alt Text），便于内容复用与无障碍阅读。"
        onClose={() => !savingAltText && setEditingAsset(null)}
      >
        {editingAsset ? (
          <MediaAltTextForm
            asset={editingAsset}
            value={editAltText}
            error={editAltError}
            saving={savingAltText}
            labels={{
              altText: t("altText"),
              cancel: t("cancel"),
              saveChanges: t("saveChanges"),
              saving: t("saving"),
            }}
            onChange={setEditAltText}
            onCancel={() => setEditingAsset(null)}
            onSubmit={handleSaveAltText}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={isBatchDeleteTarget(deleteTarget) ? "批量删除媒体" : "删除媒体"}
        description={
          isBatchDeleteTarget(deleteTarget)
            ? `确认永久删除选中的 ${selectedAssets.length} 个媒体？仍被文章引用的媒体将保留。`
            : t("deleteMediaConfirm")
        }
        confirmLabel="永久删除"
        danger
        onClose={() => {
          setDeleteTarget(null);
          setReferences([]);
        }}
        onConfirm={remove}
      />
      <WorkflowLauncher
        open={aiOpen}
        resourceType="media_asset"
        resourceKeys={selectedAssets}
        onClose={() => setAIOpen(false)}
        title="将所选媒体交给 AI"
      />
    </AdminPage>
  );
}
