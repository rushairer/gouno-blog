import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  ChoiceButton,
  Empty,
  Input,
  Modal,
  Skeleton,
  Text,
} from "@gouno/ui/core";
import { AISuggestionPicker } from "@gouno/ui/patterns";
import { agentApi } from "../../api/agent";
import { mediaApi, type MediaItem } from "../../api/media";
import { cleanAiSuggestions } from "./editor-ai";

export interface MediaResult {
  url: string;
  alt: string;
}

export type MediaSource = "library" | "upload" | "ai" | null;

export interface EditorMediaSourceDialogProps {
  source: MediaSource;
  onSourceChange: (source: MediaSource) => void;
  title: string;
  summary: string;
  content: string;
  defaultAlt: string;
  purpose: "正文插图" | "文章封面";
  onUse: (result: MediaResult) => void;
}

function mediaResult(item: MediaItem): MediaResult {
  return {
    url: item.url,
    alt: item.alt_text || item.filename,
  };
}

export function EditorMediaSourceDialog({
  source,
  onSourceChange,
  title,
  summary,
  content,
  defaultAlt,
  purpose,
  onUse,
}: EditorMediaSourceDialogProps) {
  const [assets, setAssets] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MediaResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [alt, setAlt] = useState(defaultAlt);
  const [generated, setGenerated] = useState<MediaResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [ideating, setIdeating] = useState(false);
  const [promptCandidates, setPromptCandidates] = useState<string[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!source) return;
    setError("");
    setSelected(null);
    setGenerated(null);
    setPromptCandidates([]);
    setSelectedPrompt(null);
    setAlt(defaultAlt);
    if (source !== "library") return;
    setLoading(true);
    mediaApi
      .listMedia()
      .then(setAssets)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "媒体库读取失败"),
      )
      .finally(() => setLoading(false));
  }, [defaultAlt, source]);

  const close = () => onSourceChange(null);
  const confirm = (result: MediaResult | null) => {
    if (!result) return;
    onUse(result);
    close();
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const item = await mediaApi.uploadMedia(form);
      setSelected(mediaResult(item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const ideate = async () => {
    if (!title.trim() && !content.trim()) {
      setError("请先填写标题或正文，再让 AI 构思画面。");
      return;
    }
    setIdeating(true);
    setError("");
    try {
      const response = await agentApi.getDraftAssist({
        task: "cover_prompt",
        title,
        summary,
        content,
      });
      const candidates = cleanAiSuggestions(response.suggestions);
      setPromptCandidates(candidates);
      setSelectedPrompt(candidates[0] ?? null);
      if (!candidates.length) setError("AI 未返回可用画面建议。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "画面构思失败");
    } finally {
      setIdeating(false);
    }
  };

  const generate = async () => {
    const finalPrompt = prompt.trim() || selectedPrompt?.trim() || "";
    if (!finalPrompt) {
      setError("请先填写或选择生图提示词。");
      return;
    }
    setGenerating(true);
    setGenerated(null);
    setError("");
    try {
      const response = await agentApi.generateImage({
        prompt: finalPrompt,
        alt_text: alt.trim() || defaultAlt || purpose,
      });
      if (!response.url) {
        setError("AI 未返回可用图片。");
        return;
      }
      setGenerated({
        url: response.url,
        alt: response.alt_text || alt.trim() || defaultAlt || purpose,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI 生图失败");
    } finally {
      setGenerating(false);
    }
  };

  const modalTitle =
    source === "library"
      ? `从媒体库选择${purpose}`
      : source === "upload"
        ? `上传${purpose}`
        : `AI 生成${purpose}`;

  return (
    <Modal
      open={source !== null}
      title={modalTitle}
      description="选择或生成完成后，只有点击确认才会应用到当前文档。"
      size="lg"
      onOpenChange={(open) => {
        if (!open) close();
      }}
      footer={null}
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert type="error" showIcon title={error} /> : null}

        {source === "library" ? (
          loading ? (
            <div
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              role="status"
              aria-label="媒体库加载中"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-36 w-full" />
              ))}
            </div>
          ) : assets.length ? (
            <>
              <div className="grid max-h-[28rem] gap-3 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
                {assets.map((asset) => {
                  const result = mediaResult(asset);
                  const active = selected?.url === result.url;
                  return (
                    <ChoiceButton
                      key={asset.id}
                      type="button"
                      className={`h-auto min-h-0 w-full min-w-0 overflow-hidden rounded-lg border bg-background p-0 text-left transition-colors hover:bg-muted/40 [&>span]:block [&>span]:w-full ${active ? "ring-2 ring-primary" : ""}`}
                      aria-pressed={active}
                      onClick={() => setSelected(result)}
                    >
                      <span>
                        <img
                          src={asset.url}
                          alt={asset.alt_text || asset.filename}
                          className="h-28 w-full object-cover"
                        />
                        <span
                          className="block truncate px-3 py-2 text-sm"
                          title={asset.filename}
                        >
                          {asset.filename}
                        </span>
                      </span>
                    </ChoiceButton>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="text" onClick={close}>
                  取消
                </Button>
                <Button
                  variant="solid"
                  color="primary"
                  disabled={!selected}
                  onClick={() => confirm(selected)}
                >
                  使用所选
                </Button>
              </div>
            </>
          ) : (
            <Empty description="媒体库暂无图片" />
          )
        ) : null}

        {source === "upload" ? (
          <>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept="image/*,.svg,.ico"
              aria-label="上传图片文件"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.currentTarget.value = "";
              }}
            />
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Text tone="muted">支持常见 Web 图片格式，包括 SVG 与 ICO。</Text>
              <div className="mt-4">
                <Button
                  onClick={() => fileRef.current?.click()}
                  loading={uploading}
                  disabled={uploading}
                >
                  {uploading ? "正在上传…" : "选择图片上传"}
                </Button>
              </div>
            </div>
            {selected ? (
              <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-[10rem_minmax(0,1fr)]">
                <img
                  src={selected.url}
                  alt={selected.alt}
                  className="h-32 w-full rounded-md object-cover"
                />
                <div className="min-w-0">
                  <Text className="font-semibold">上传完成</Text>
                  <Input
                    className="mt-2"
                    value={selected.alt}
                    onChange={(event) =>
                      setSelected({ ...selected, alt: event.target.value })
                    }
                    aria-label="上传图片替代文本"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="text" onClick={close}>
                      取消
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      onClick={() => confirm(selected)}
                    >
                      使用已上传图片
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {source === "ai" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="small"
                onClick={() => void ideate()}
                loading={ideating}
                disabled={ideating || generating}
              >
                结合文档构思
              </Button>
            </div>
            {promptCandidates.length ? (
              <AISuggestionPicker
                heading="画面建议"
                description="选择一个画面方向，再应用到生图提示词。"
                options={promptCandidates.map((value) => ({ value }))}
                value={selectedPrompt}
                onValueChange={setSelectedPrompt}
                onRegenerate={() => void ideate()}
                onDismiss={() => {
                  setPromptCandidates([]);
                  setSelectedPrompt(null);
                }}
                onApply={(value) => {
                  setPrompt(value);
                  setPromptCandidates([]);
                  setSelectedPrompt(null);
                }}
              />
            ) : null}
            <Input
              aria-label="生图提示词"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述希望生成的画面"
            />
            <Input
              aria-label="图片替代文本"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              placeholder="描述图片内容"
            />
            <div className="flex justify-end">
              <Button
                variant="solid"
                color="primary"
                onClick={() => void generate()}
                loading={generating}
                disabled={generating || !prompt.trim()}
              >
                生成单张图片
              </Button>
            </div>
            {generated ? (
              <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <img
                  src={generated.url}
                  alt={generated.alt}
                  className="max-h-72 w-full rounded-md object-contain"
                />
                <div className="flex min-w-0 flex-col gap-3">
                  <Text className="font-semibold">生成结果</Text>
                  <Input
                    value={generated.alt}
                    onChange={(event) =>
                      setGenerated({ ...generated, alt: event.target.value })
                    }
                    aria-label="AI 图片替代文本"
                  />
                  <div className="mt-auto flex flex-wrap justify-end gap-2">
                    <Button variant="text" onClick={() => setGenerated(null)}>
                      放弃
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      onClick={() => confirm(generated)}
                    >
                      {purpose === "文章封面" ? "使用此封面" : "插入此图片"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
