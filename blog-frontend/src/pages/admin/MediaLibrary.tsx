import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Search,
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
  Alert,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Tag,
  Text,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { BulkActionBar } from "@gouno/ui/patterns";

import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";
import {
  MediaAltTextForm,
  MediaImageGenerationForm,
  MediaUploadForm,
} from "../../components/media/MediaDrawerForms";
import { useI18n } from "../../i18n";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

type BatchDeleteTarget = { kind: "batch" };
type DeleteTarget = MediaItem | BatchDeleteTarget | null;

function isBatchDeleteTarget(
  target: DeleteTarget,
): target is BatchDeleteTarget {
  return Boolean(target && "kind" in target && target.kind === "batch");
}

function selectValue(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function typeLabel(contentType: string) {
  return contentType
    .replace("image/", "")
    .replace("svg+xml", "SVG")
    .replace("x-icon", "ICO")
    .toUpperCase();
}

function MediaSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      role="status"
      aria-label="媒体加载中"
      aria-live="polite"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} padding="none" className="overflow-hidden">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </Card>
      ))}
    </div>
  );
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
  const { notify } = useAppFeedback();
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

  const [editingAsset, setEditingAsset] = useState<MediaItem | null>(null);
  const [editAltText, setEditAltText] = useState("");
  const [savingAltText, setSavingAltText] = useState(false);
  const [editAltError, setEditAltError] = useState("");

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

  const copyMediaText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(successMessage, "success");
    } catch {
      notify("复制失败，请手动复制。", "error");
    }
  };

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
  const hasFilters = Boolean(query || type);

  const clearFilters = () => {
    setQuery("");
    setType("");
  };

  const setSelectedAsset = (id: number, checked: boolean) => {
    setSelectedAssets((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="媒体库"
        description="上传、检索和复用全站内容中的图片资源，支持 AI 直接文生图入库。"
        actions={
          can("create", "media") ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
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
                variant="solid"
                color="primary"
                type="button"
                icon={<ImagePlus />}
                onClick={() => {
                  setUploadError("");
                  setUploadDrawerOpen(true);
                }}
              >
                上传图片
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && assets.length > 0 ? (
        <Alert type="error" showIcon title={error}>
          {references.length ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {references.map((item) => (
                <li key={item.post_id}>
                  <a
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    href={`/admin/posts/${item.post_id}/edit`}
                  >
                    {item.post_title}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <Card padding="base">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <Input
              aria-label="搜索媒体"
              prefix={<Search className="size-4" />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文件名或替代文本"
            />
          </div>
          <div className="min-w-0 lg:w-44 lg:shrink-0">
            <Select
              aria-label="媒体类型"
              value={type}
              onChange={(value) => setType(selectValue(value))}
            >
              <option value="">全部类型</option>
              {contentTypes.map((item) => (
                <option key={item} value={item}>
                  {typeLabel(item)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <Text size="sm" tone="muted" className="whitespace-nowrap">
              {visibleAssets.length} / {assets.length}
            </Text>
            {hasFilters ? (
              <Button
                size="small"
                variant="text"
                type="button"
                onClick={clearFilters}
                icon={<X />}
              >
                清除
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {can("batch", "media") && selectedAssets.length > 0 ? (
        <BulkActionBar
          selectionLabel={`已选择 ${selectedAssets.length} 个媒体`}
          onCancel={() => setSelectedAssets([])}
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

      {loading ? (
        <MediaSkeleton />
      ) : error && assets.length === 0 ? (
        <Alert
          type="error"
          showIcon
          title="媒体加载失败"
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              重新载入
            </Button>
          }
        />
      ) : visibleAssets.length === 0 ? (
        <Card padding="lg">
          <Empty
            icon={<ImagePlus className="size-7 text-muted-foreground" />}
            title={
              assets.length === 0 ? t("noMedia") : "没有符合条件的媒体资源。"
            }
            description={
              assets.length === 0
                ? "上传图片或使用 AI 文生图创建第一张媒体资源。"
                : "调整文件名、替代文本或媒体类型筛选后重试。"
            }
            action={
              hasFilters ? (
                <Button size="small" onClick={clearFilters}>
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          role="list"
          aria-label="媒体资源"
        >
          {visibleAssets.map((asset) => (
            <Card
              className="group overflow-hidden transition-all hover:border-primary/40"
              id={`asset-${asset.id}`}
              key={asset.id}
              padding="none"
              role="listitem"
            >
              <div className="relative aspect-video w-full overflow-hidden border-b bg-muted/40">
                {can("batch", "media") ? (
                  <div className="absolute left-2 top-2 z-10 rounded-md bg-background/85 p-1 backdrop-blur">
                    <Checkbox
                      aria-label={`选择媒体 ${asset.filename}`}
                      checked={selectedAssets.includes(asset.id)}
                      onChange={(event) =>
                        setSelectedAsset(asset.id, event.target.checked)
                      }
                    />
                  </div>
                ) : null}
                <img
                  src={asset.url}
                  alt={asset.alt_text || asset.filename}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <strong
                    className="min-w-0 truncate text-sm font-semibold"
                    title={asset.filename}
                  >
                    {asset.filename}
                  </strong>
                  <Tag>{typeLabel(asset.content_type)}</Tag>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
                  <span>{Math.ceil(asset.size_bytes / 1024)} KB</span>
                  <time>{formatDateTime(asset.created_at)}</time>
                  {asset.usage_count ? (
                    <span className="font-sans text-primary">
                      引用 {asset.usage_count}
                    </span>
                  ) : null}
                </div>
                <Text
                  size="xs"
                  tone="muted"
                  className="truncate"
                  title={asset.alt_text || undefined}
                >
                  {t("altText")}：
                  {asset.alt_text || (
                    <span className="italic opacity-70">{t("notSet")}</span>
                  )}
                </Text>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 p-2">
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="text"
                    size="small"
                    aria-label={`${t("copyRelativeUrl")} ${asset.filename}`}
                    onClick={() =>
                      void copyMediaText(
                        getRelativeMediaUrl(asset.url),
                        t("relativeUrlCopied"),
                      )
                    }
                    icon={<Link2 />}
                  >
                    {t("copyRelativeUrl")}
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    aria-label={`${t("copyMarkdown")} ${asset.filename}`}
                    onClick={() =>
                      void copyMediaText(
                        `![${asset.alt_text || asset.filename}](${asset.url})`,
                        "媒体 Markdown 已复制。",
                      )
                    }
                    icon={<Copy />}
                  >
                    {t("copyMarkdown")}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {can("edit", "media", asset) ? (
                    <Button
                      variant="text"
                      size="small"
                      aria-label={`${t("editAltText")} ${asset.filename}`}
                      onClick={() => openEditAltDrawer(asset)}
                      icon={<Pencil />}
                    >
                      {t("editAltText")}
                    </Button>
                  ) : null}
                  {can("delete", "media", asset) ? (
                    <Button
                      variant="text"
                      color="error"
                      size="small"
                      aria-label={`${t("delete")} ${asset.filename}`}
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
              </div>
            </Card>
          ))}
        </div>
      )}

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
          onCopy={(value) => void copyMediaText(value, "Markdown 已复制！")}
          onReset={() => {
            setAiGenerated(null);
            setAiPrompt("");
          }}
        />
      </Drawer>

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

      <Modal
        open={deleteTarget !== null}
        title={isBatchDeleteTarget(deleteTarget) ? "批量删除媒体" : "删除媒体"}
        description={
          isBatchDeleteTarget(deleteTarget)
            ? `确认永久删除选中的 ${selectedAssets.length} 个媒体？仍被文章引用的媒体将保留。`
            : t("deleteMediaConfirm")
        }
        onClose={() => {
          setDeleteTarget(null);
          setReferences([]);
        }}
        onOk={() => void remove()}
        okText="永久删除"
        okButtonProps={{ variant: "solid", color: "error" }}
      >
        <Text size="sm" tone="muted">
          仍被文章引用的媒体必须先移除引用；批量删除时失败项会继续保持选中。
        </Text>
      </Modal>
      <WorkflowLauncher
        open={aiOpen}
        resourceType="media_asset"
        resourceKeys={selectedAssets}
        onClose={() => setAIOpen(false)}
        title="将所选媒体交给 AI"
      />
    </div>
  );
}
