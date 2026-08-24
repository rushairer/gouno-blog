import type React from "react";
import { Copy, ImagePlus, LoaderCircle, Pencil, Sparkles } from "lucide-react";
import {
  Button,
  Feedback,
  Field,
  FormActions,
  Input,
  OverlayForm,
  Textarea,
} from "../ui";

export function MediaUploadForm({
  file,
  altText,
  uploading,
  labels,
  onFileChange,
  onAltTextChange,
  onCancel,
  onSubmit,
}: {
  file: File | null;
  altText: string;
  uploading: boolean;
  labels: {
    imageFile: string;
    altText: string;
    cancel: string;
    uploadImage: string;
    uploading: string;
  };
  onFileChange: (file: File | null) => void;
  onAltTextChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <OverlayForm
      className="media-upload-drawer"
      onSubmit={onSubmit}
      actions={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={uploading}
            onClick={onCancel}
          >
            {labels.cancel}
          </Button>
          <Button variant="primary" disabled={!file} loading={uploading}>
            <ImagePlus />
            {uploading ? labels.uploading : labels.uploadImage}
          </Button>
        </>
      }
    >
      <Field
        label={labels.imageFile}
        required
        hint="支持 JPEG、PNG、WebP 与 GIF。"
      >
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          required
          onChange={(event) => onFileChange(event.target.files?.[0] || null)}
        />
      </Field>
      {file ? (
        <p className="upload-file-summary">
          已选择：<strong>{file.name}</strong> · {Math.ceil(file.size / 1024)}{" "}
          KB
        </p>
      ) : null}
      <Field
        label={labels.altText}
        hint="简洁说明图片内容；留空时会使用文件名。"
      >
        <Input
          value={altText}
          onChange={(event) => onAltTextChange(event.target.value)}
        />
      </Field>
    </OverlayForm>
  );
}

export function MediaAltTextForm({
  asset,
  value,
  error,
  saving,
  labels,
  onChange,
  onCancel,
  onSubmit,
}: {
  asset: {
    url: string;
    alt_text: string;
    filename: string;
    size_bytes: number;
    usage_count?: number;
  };
  value: string;
  error: string;
  saving: boolean;
  labels: {
    altText: string;
    cancel: string;
    saveChanges: string;
    saving: string;
  };
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <OverlayForm
      className="media-edit-drawer"
      onSubmit={onSubmit}
      actions={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={saving}
            onClick={onCancel}
          >
            {labels.cancel}
          </Button>
          <Button variant="primary" loading={saving} type="submit">
            <Pencil />
            {saving ? labels.saving : labels.saveChanges}
          </Button>
        </>
      }
    >
      <div className="editor-ai-image-preview" style={{ marginBottom: 12 }}>
        <img
          src={asset.url}
          alt={asset.alt_text || asset.filename}
          style={{
            maxHeight: 200,
            objectFit: "contain",
            width: "100%",
            borderRadius: 8,
            background: "var(--bg-muted)",
          }}
        />
      </div>
      <p className="upload-file-summary">
        已选择：<strong>{asset.filename}</strong> ·{" "}
        {Math.ceil(asset.size_bytes / 1024)} KB · 引用 {asset.usage_count || 0}{" "}
        次
      </p>
      <Field
        label={labels.altText}
        hint="简洁说明图片内容；在 Markdown 插入时将默认作为图片说明。"
      >
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例如：系统架构图解"
          autoFocus
        />
      </Field>
      {error ? <Feedback type="error">{error}</Feedback> : null}
    </OverlayForm>
  );
}

const presets = [
  [
    "📊 架构图解",
    "A sleek modern architectural diagram illustration showing system components, clean lines, isometric view, tech palette",
  ],
  [
    "🖼️ 科技插画",
    "A modern minimal editorial vector illustration for a clean web page, subtle gradients, flat design",
  ],
  [
    "🎬 电影概念",
    "Cinematic concept art, hyper-detailed futuristic scene, volumetric lighting, 8k wallpaper quality",
  ],
  [
    "🎨 3D 立体",
    "Cute 3D isometric clay render illustration, soft studio lighting, playful scene",
  ],
  [
    "🌄 自然风光",
    "Breathtaking atmospheric nature landscape, morning golden hour mist, tranquil mountain reflections, award-winning photography",
  ],
  [
    "🏙️ 极简抽象",
    "Ultra-minimalist modern abstract geometry, soft pastel tones, clean negative space, fine art",
  ],
] as const;

export function MediaImageGenerationForm({
  prompt,
  alt,
  error,
  generated,
  generating,
  onPromptChange,
  onAltChange,
  onGenerate,
  onCancel,
  onCopy,
  onReset,
}: {
  prompt: string;
  alt: string;
  error: string;
  generated: { url: string; alt: string } | null;
  generating: boolean;
  onPromptChange: (value: string) => void;
  onAltChange: (value: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onCopy: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="drawer-form">
      <Field label="风格预设" hint="点击预设快速填入专业提示词风格">
        <div className="editor-ai-presets" style={{ marginTop: 4 }}>
          {presets.map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => onPromptChange(value)}
              disabled={generating}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      <Field
        label="生图提示词 (Prompt)"
        required
        hint="支持中文或英文描述画面主体、风格、构图与光影。"
      >
        <Textarea
          rows={4}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="例如：科技感云原生架构插画，具有微服务节点、流动的发光数据连线，深蓝与青绿色渐变…"
          disabled={generating}
          required
        />
      </Field>
      <Field label="替代文本 (Alt Text)" hint="留空时将自动命名为 AI 媒体插图">
        <Input
          value={alt}
          onChange={(event) => onAltChange(event.target.value)}
          placeholder="例如：云原生架构图解"
          disabled={generating}
        />
      </Field>
      {error ? <Feedback type="error">{error}</Feedback> : null}
      {generated ? (
        <div className="editor-ai-image-result" style={{ marginTop: 8 }}>
          <div className="editor-ai-image-preview">
            <img src={generated.url} alt={generated.alt} />
          </div>
          <div className="editor-ai-image-info">
            <div className="editor-ai-image-code">{`![${generated.alt}](${generated.url})`}</div>
            <div className="editor-ai-image-actions">
              <Button
                variant="primary"
                type="button"
                onClick={() => onCopy(`![${generated.alt}](${generated.url})`)}
              >
                <Copy /> 复制 Markdown
              </Button>
              <Button variant="secondary" type="button" onClick={onReset}>
                ➕ 生成下一张
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <FormActions className="drawer-actions" style={{ marginTop: 12 }}>
        <Button
          variant="secondary"
          type="button"
          disabled={generating}
          onClick={onCancel}
        >
          {generated ? "完成" : "取消"}
        </Button>
        <Button
          variant="primary"
          type="button"
          disabled={generating || !prompt.trim()}
          onClick={onGenerate}
        >
          {generating ? (
            <>
              <LoaderCircle className="is-spinning" /> 正在绘制入库中…
            </>
          ) : (
            <>
              <Sparkles /> 开始生图并入库
            </>
          )}
        </Button>
      </FormActions>
    </div>
  );
}
