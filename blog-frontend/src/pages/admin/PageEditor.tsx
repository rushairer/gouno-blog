import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AdminPageState,
  Button,
  Checkbox,
  CheckboxField,
  ChoiceButton,
  ConfirmDialog,
  Feedback,
  Field,
  Input,
  Select,
  Textarea,
  Tab,
  TabList,
  Tabs,
  useToast,
} from "../../components/ui";
import { MarkdownRenderer } from "../../components/MarkdownRenderer";
import {
  AiImageGenerationPanel,
  AiWritingPanel,
  ContentEditorFrame,
  EditorCommandActions,
  EditorCommandBar,
} from "../../components/editor/ContentEditorFrame";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { usePageTitle } from "../../hooks/usePageTitle";
import { pagesApi } from "../../api/pages";
import { agentApi } from "../../api/agent";
import type { CustomPage, PageTemplate, PostStatus } from "../../types/blog";

const emptyPage: CustomPage = {
  id: 0,
  title: "",
  slug: "",
  summary: "",
  content: "",
  template: "default",
  status: "draft",
  allow_comments: false,
  show_in_nav: false,
  sort_order: 0,
  seo_title: "",
  seo_description: "",
  created_at: "",
};

export default function PageEditor() {
  const { id } = useParams();
  const isNew = !id;
  const allowed = useAdminGuard(
    isNew ? "/admin/pages/new" : `/admin/pages/${id}/edit`,
  );
  const navigate = useNavigate();
  const { notify } = useToast();

  const [page, setPage] = useState<CustomPage>(emptyPage);
  const [publishIntent, setPublishIntent] = useState<PostStatus>("draft");
  const editorTitle = isNew
    ? page.title
      ? `新建单页: ${page.title}`
      : "新建单页"
    : page.title
      ? `编辑: ${page.title}`
      : "编辑单页";
  usePageTitle(editorTitle, { admin: true });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const dirty = useRef(false);

  // AI Assist States
  const [assistTask, setAssistTask] = useState<string | null>(null);
  const [suggestionTask, setSuggestionTask] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showAiWriting, setShowAiWriting] = useState(false);
  const [showAiImage, setShowAiImage] = useState(false);
  const [contentPrompt, setContentPrompt] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imagePromptCandidates, setImagePromptCandidates] = useState<string[]>(
    [],
  );
  const [aiIdeateLoading, setAiIdeateLoading] = useState(false);
  const [aiContentLoading, setAiContentLoading] = useState(false);
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<{
    url: string;
    alt: string;
  } | null>(null);
  const [assistError, setAssistError] = useState("");
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    if (!isNew && id) {
      setLoading(true);
      pagesApi
        .getAdminPage(id)
        .then((data) => {
          setPage(data);
          setPublishIntent(data.status || "draft");
          setError("");
        })
        .catch((reason: Error) => {
          const msg = reason.message;
          setError(msg);
          notify(msg, "error");
        })
        .finally(() => setLoading(false));
    }
  }, [allowed, id, isNew, notify]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const update = <K extends keyof CustomPage>(key: K, value: CustomPage[K]) => {
    setPage((current) => ({ ...current, [key]: value }));
    dirty.current = true;
    setSavedAt(null);
  };

  const persist = useCallback(
    async (status: PostStatus, automatic = false) => {
      if (!page.title.trim()) {
        const msg = "请先填写单页标题。";
        if (!automatic) {
          setError(msg);
          notify(msg, "error");
        }
        return;
      }
      if (!page.slug.trim()) {
        const msg = "请填写单页访问路径 (Slug)。";
        if (!automatic) {
          setError(msg);
          notify(msg, "error");
        }
        return;
      }

      setSaving(true);
      setError("");

      const payload: Partial<CustomPage> = {
        title: page.title.trim(),
        slug: page.slug.trim().toLowerCase(),
        summary: page.summary || "",
        content: page.content || "",
        template: page.template || "default",
        status,
        allow_comments: false,
        show_in_nav: Boolean(page.show_in_nav),
        sort_order: Number(page.sort_order) || 0,
        seo_title: page.seo_title || "",
        seo_description: page.seo_description || "",
      };

      try {
        let result: CustomPage;
        if (page.id) {
          result = await pagesApi.updatePage(page.id, payload);
        } else {
          result = await pagesApi.createPage(payload);
        }
        setPage(result);
        setPublishIntent(result.status || "draft");
        dirty.current = false;
        setSavedAt(new Date());
        if (!automatic) {
          notify(
            status === "published" ? "单页已成功发布！" : "单页草稿已保存。",
            "success",
          );
        }
        if (!page.id) {
          navigate(`/admin/pages/${result.id}/edit`, { replace: true });
        }
      } catch (reason) {
        const msg =
          reason instanceof Error ? reason.message : "保存失败，请稍后重试。";
        setError(msg);
        notify(msg, "error");
      } finally {
        setSaving(false);
      }
    },
    [navigate, notify, page],
  );

  const leaveEditor = () => {
    if (dirty.current) setConfirmExit(true);
    else navigate("/admin/pages");
  };

  const primaryStatus: PostStatus =
    publishIntent === "draft" ? "draft" : "published";
  const primaryLabel =
    publishIntent === "draft"
      ? page.status === "published"
        ? "下架为草稿"
        : "保存草稿"
      : page.status === "published"
        ? "更新单页"
        : "发布";

  const requestSeo = async () => {
    if (!page.title.trim() && !page.content.trim()) {
      notify("请先填写标题或正文，以便 AI 分析生成 SEO。", "error");
      return;
    }
    setAssistTask("seo");
    try {
      const res = await agentApi.getDraftAssist({
        task: "seo",
        title: page.title,
        summary: page.summary,
        content: page.content,
      });
      let seoTitle = "";
      let seoDesc = "";
      let seoSlug = "";
      if (res.metadata) {
        seoTitle = res.metadata.seo_title || "";
        seoDesc = res.metadata.seo_description || "";
        seoSlug = res.metadata.slug || "";
      } else if (res.suggestions?.length) {
        try {
          const parsed = JSON.parse(res.suggestions[0]);
          seoTitle = parsed.seo_title || "";
          seoDesc = parsed.seo_description || "";
          seoSlug = parsed.slug || "";
        } catch {
          // parse failed
        }
      }
      if (seoTitle || seoDesc || seoSlug) {
        setPage((current) => ({
          ...current,
          seo_title: seoTitle || current.seo_title,
          seo_description: seoDesc || current.seo_description,
          slug: seoSlug || current.slug,
        }));
        dirty.current = true;
        setSavedAt(null);
        notify("SEO 标题、描述与 Slug 已自动生成！", "success");
      } else {
        notify("未能生成有效的 SEO 配置，请稍后重试。", "error");
      }
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "生成 SEO 配置失败",
        "error",
      );
    } finally {
      setAssistTask(null);
    }
  };

  const requestSuggestions = async (task: "title" | "summary" | "slug") => {
    if (!page.title.trim() && !page.content.trim()) {
      notify("请先填写标题或正文，以便 AI 分析生成。", "error");
      return;
    }
    setAssistTask(task);
    setAssistError("");
    try {
      const res = await agentApi.getDraftAssist({
        task,
        title: page.title,
        summary: page.summary,
        content: page.content,
      });
      setSuggestionTask(task);
      setSuggestions(res.suggestions || []);
      if (!res.suggestions || res.suggestions.length === 0) {
        notify("AI 未能生成建议，请稍后重试。", "error");
      }
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "AI 生成失败", "error");
    } finally {
      setAssistTask(null);
    }
  };

  const applySuggestion = (
    task: "title" | "summary" | "slug",
    value: string,
  ) => {
    update(task, value);
    setSuggestionTask(null);
    setSuggestions([]);
  };

  const autoFillAllMetadata = async () => {
    if (!page.title.trim() && !page.content.trim()) {
      notify("请先填写标题或正文，AI 才能提炼全套元数据。", "error");
      return;
    }
    setMetaLoading(true);
    try {
      const res = await agentApi.getDraftAssist({
        task: "metadata_all",
        title: page.title,
        summary: page.summary,
        content: page.content,
      });
      let meta = res.metadata;
      if (!meta && res.suggestions?.length) {
        try {
          meta = JSON.parse(res.suggestions[0]);
        } catch {
          // ignore
        }
      }
      if (meta) {
        setPage((current) => ({
          ...current,
          summary: meta?.summary || current.summary,
          slug: meta?.slug || current.slug,
          seo_title: meta?.seo_title || current.seo_title,
          seo_description: meta?.seo_description || current.seo_description,
        }));
        dirty.current = true;
        setSavedAt(null);
        notify("⚡ 全套单页元数据已成功自动补全！", "success");
      } else {
        notify("未能生成完整元数据，请稍后重试。", "error");
      }
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "一键补全元数据失败",
        "error",
      );
    } finally {
      setMetaLoading(false);
    }
  };

  const sanitizeAiMarkdown = (raw: string): string => {
    let text = raw.trim();
    if (text.startsWith("{") || text.startsWith("```json")) {
      try {
        const trimmed = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed?.suggestions) && parsed.suggestions[0]) {
          text = String(parsed.suggestions[0]);
        } else if (parsed?.content) {
          text = String(parsed.content);
        }
      } catch {
        const match = text.match(/"suggestions"\s*:\s*\[\s*"([\s\S]*)"\s*\]/);
        if (match && match[1]) {
          text = match[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\t/g, "\t");
        }
      }
    }
    if (text.startsWith("```markdown") && text.endsWith("```")) {
      text = text.slice(11, -3).trim();
    } else if (text.startsWith("```md") && text.endsWith("```")) {
      text = text.slice(5, -3).trim();
    } else if (text.startsWith("```") && text.endsWith("```")) {
      text = text.slice(3, -3).trim();
    }
    return text.trim();
  };

  const handleGenerateContent = async (promptText?: string) => {
    const effectivePrompt = (
      promptText !== undefined ? promptText : contentPrompt
    ).trim();
    if (!effectivePrompt && !page.title.trim() && !page.content.trim()) {
      const msg = "请先填写单页标题、正文或输入提示词。";
      setAssistError(msg);
      notify(msg, "error");
      return;
    }
    setAiContentLoading(true);
    setAssistError("");
    setGeneratedContent(null);
    try {
      const res = await agentApi.getDraftAssist({
        task: "content",
        title: page.title,
        summary: page.summary,
        content: page.content,
        prompt: effectivePrompt,
      });
      if (res.suggestions?.length && res.suggestions[0].trim()) {
        setGeneratedContent(sanitizeAiMarkdown(res.suggestions[0]));
        notify("单页正文已生成完毕，请在下方预览并确认。", "success");
      } else {
        const msg = "AI 未能生成正文，请稍后重试或调整提示词。";
        setAssistError(msg);
        notify(msg, "error");
      }
    } catch (reason) {
      const msg =
        reason instanceof Error
          ? reason.message
          : "AI 生成正文失败，请稍后重试。";
      setAssistError(msg);
      notify(msg, "error");
    } finally {
      setAiContentLoading(false);
    }
  };

  const applyGeneratedContent = (mode: "replace" | "append") => {
    if (!generatedContent) return;
    if (mode === "replace") {
      update("content", generatedContent);
      notify("已替换单页正文。", "success");
    } else {
      update(
        "content",
        page.content
          ? `${page.content.trim()}\n\n${generatedContent}`
          : generatedContent,
      );
      notify("已将生成内容追加到文末。", "success");
    }
    setGeneratedContent(null);
    setShowAiWriting(false);
  };

  const handleIdeateImagePrompts = async () => {
    if (!page.title.trim() && !page.content.trim()) {
      const msg = "请先填写单页标题或正文，AI 才能理解内容并构思插画。";
      setAssistError(msg);
      notify(msg, "error");
      return;
    }
    setAiIdeateLoading(true);
    setAssistError("");
    try {
      notify("AI 正在深度阅读单页内容并构思插画方案，请稍候…", "success");
      const res = await agentApi.getDraftAssist({
        task: "cover_prompt",
        title: page.title,
        summary: page.summary,
        content: page.content,
      });
      const cleanList: string[] = [];
      (res.suggestions || []).forEach((item) => {
        if (item.includes('","')) {
          item.split('","').forEach((sub) => {
            const clean = sub.replace(/^[{"[\s]+|[}"\]\s,]+$/g, "").trim();
            if (clean) cleanList.push(clean);
          });
        } else {
          const clean = item.replace(/^[{"[\s]+|[}"\]\s,]+$/g, "").trim();
          if (clean) cleanList.push(clean);
        }
      });
      setImagePromptCandidates(cleanList);
      if (cleanList.length) {
        notify(`已结合页面构思出 ${cleanList.length} 组插画方案！`, "success");
      } else {
        notify("未能生成插画构思，请稍后重试。", "error");
      }
    } catch (reason) {
      const msg =
        reason instanceof Error ? reason.message : "插画构思失败，请稍后重试。";
      setAssistError(msg);
      notify(msg, "error");
    } finally {
      setAiIdeateLoading(false);
    }
  };

  const handleGenerateAiImage = async (presetPrompt?: string) => {
    const effectivePrompt = (
      presetPrompt !== undefined ? presetPrompt : imagePrompt
    ).trim();
    if (!effectivePrompt && !page.title.trim() && !page.content.trim()) {
      const msg = "请输入生图提示词或先填写单页标题。";
      setAssistError(msg);
      notify(msg, "error");
      return;
    }
    setAiImageLoading(true);
    setAssistError("");
    try {
      notify("AI 正在绘制插图中（通常需 15~40 秒），请稍候…", "success");
      const finalPrompt =
        effectivePrompt ||
        `Modern clean editorial illustration for webpage: ${page.title}`;
      let finalAlt = imageAlt.trim();
      if (!finalAlt) {
        const match = finalPrompt.match(/\[中文说明:\s*([^\]]+)\]/);
        if (match && match[1]) {
          finalAlt = match[1].trim();
        } else {
          finalAlt = page.title || "单页插图";
        }
      }
      const res = await agentApi.generateImage({
        prompt: finalPrompt,
        alt_text: finalAlt,
      });
      if (res?.url) {
        setGeneratedImage({ url: res.url, alt: finalAlt });
        notify(
          "🎨 插图已成功生成，支持复制 Markdown 或直接插入正文！",
          "success",
        );
      } else {
        const msg = "AI 未能成功生成图片，请稍后重试。";
        setAssistError(msg);
        notify(msg, "error");
      }
    } catch (reason) {
      const msg =
        reason instanceof Error ? reason.message : "AI 生图失败，请稍后重试。";
      setAssistError(msg);
      notify(msg, "error");
    } finally {
      setAiImageLoading(false);
    }
  };

  const copyImageMarkdown = () => {
    if (!generatedImage) return;
    const md = `![${generatedImage.alt || "单页插图"}](${generatedImage.url})`;
    void navigator.clipboard.writeText(md);
    notify("Markdown 图片代码已复制到剪贴板！", "success");
  };

  const insertImageToContent = () => {
    if (!generatedImage) return;
    const md = `\n\n![${generatedImage.alt || "单页插图"}](${generatedImage.url})\n\n`;
    setPage((current) => ({
      ...current,
      content: current.content
        ? `${current.content.trimEnd()}${md}`
        : `![${generatedImage.alt || "单页插图"}](${generatedImage.url})\n\n`,
    }));
    dirty.current = true;
    setSavedAt(null);
    notify("已成功将插图插入到单页正文末尾！", "success");
  };

  const openFrontsitePreview = async () => {
    let currentPage = page;
    if (dirty.current || !currentPage.id) {
      if (!currentPage.title.trim() || !currentPage.slug.trim()) {
        setError("请先填写单页标题与路径。");
        return;
      }
      setSaving(true);
      setError("");
      try {
        const payload: Partial<CustomPage> = {
          title: currentPage.title.trim(),
          slug: currentPage.slug.trim().toLowerCase(),
          summary: currentPage.summary || "",
          content: currentPage.content || "",
          template: currentPage.template || "default",
          status: currentPage.status || "draft",
          allow_comments: false,
          show_in_nav: Boolean(currentPage.show_in_nav),
          sort_order: Number(currentPage.sort_order) || 0,
          seo_title: currentPage.seo_title || "",
          seo_description: currentPage.seo_description || "",
        };
        const result = currentPage.id
          ? await pagesApi.updatePage(currentPage.id, payload)
          : await pagesApi.createPage(payload);
        currentPage = result;
        setPage(result);
        dirty.current = false;
        setSavedAt(new Date());
        if (!page.id) {
          navigate(`/admin/pages/${result.id}/edit`, { replace: true });
        }
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "保存失败，无法开启预览。",
        );
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    window.open(`/${currentPage.slug}`, "_blank");
  };

  if (!isNew && error && !page.id) {
    return (
      <AdminPageState
        title="无法编辑单页"
        description={error}
        label="无权限或单页不存在"
      />
    );
  }

  if (!allowed || loading) {
    return (
      <AdminPageState
        title={isNew ? "新建单页" : "编辑单页"}
        description="撰写并管理独立单页展示结构与配置。"
        label="正在打开编辑器…"
      />
    );
  }

  return (
    <ContentEditorFrame>
      <EditorCommandBar>
        <Button
          className="editor-back"
          variant="ghost"
          onClick={leaveEditor}
          icon={<ArrowLeft />}
        >
          返回单页列表
        </Button>
        <div className="editor-save-state">
          {saving ? (
            "正在保存…"
          ) : savedAt ? (
            <>
              <Check /> 已于{" "}
              {savedAt.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              保存
            </>
          ) : dirty.current ? (
            "有未保存的更改"
          ) : (
            "所有更改已保存"
          )}
        </div>
        <EditorCommandActions>
          <Button
            variant="secondary"
            type="button"
            onClick={() => void openFrontsitePreview()}
            disabled={saving}
            icon={<ExternalLink />}
          >
            预览前台页面
          </Button>
          {page.status !== "published" && publishIntent !== "draft" ? (
            <Button
              variant="secondary"
              type="button"
              onClick={() => void persist("draft")}
              disabled={saving}
              icon={<Save />}
            >
              保存草稿
            </Button>
          ) : null}
          <Button
            variant="primary"
            type="button"
            onClick={() => void persist(primaryStatus)}
            disabled={saving}
            icon={<Send />}
          >
            {primaryLabel}
          </Button>
        </EditorCommandActions>
      </EditorCommandBar>

      <div className="editor-workspace">
        <main className="editor-canvas">
          <Field label="标题" required>
            <Textarea
              className="editor-title"
              rows={2}
              value={page.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="写一个清晰、具体的单页标题"
              required
            />
            <div className="editor-ai-inline">
              <Button
                variant="ghost"
                onClick={() => void requestSuggestions("title")}
                disabled={assistTask !== null}
                icon={<Sparkles />}
              >
                {assistTask === "title" ? "正在想标题…" : "生成标题候选"}
              </Button>
              {suggestionTask === "title" && suggestions.length > 0 ? (
                <div className="editor-ai-candidates" aria-label="标题候选">
                  {suggestions.map((item) => (
                    <Button
                      key={item}
                      variant="ghost"
                      onClick={() => applySuggestion("title", item)}
                    >
                      <span>{item}</span>
                      <b>应用</b>
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>

          <Field label="摘要 / 描述">
            <Textarea
              className="editor-summary"
              rows={2}
              value={page.summary}
              onChange={(event) => update("summary", event.target.value)}
              maxLength={300}
              placeholder="用一两句话说明单页内容"
            />
            <div className="editor-ai-inline">
              <Button
                variant="ghost"
                onClick={() => void requestSuggestions("summary")}
                disabled={assistTask !== null}
                icon={<Sparkles />}
              >
                {assistTask === "summary"
                  ? "正在提炼摘要…"
                  : "根据正文生成摘要"}
              </Button>
              {suggestionTask === "summary" && suggestions.length > 0 ? (
                <div className="editor-ai-candidates" aria-label="摘要候选">
                  {suggestions.map((item) => (
                    <Button
                      key={item}
                      variant="ghost"
                      onClick={() => applySuggestion("summary", item)}
                    >
                      <span>{item}</span>
                      <b>应用</b>
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>

          <Tabs
            className="editor-tabs"
            value={preview ? "preview" : "markdown"}
            onValueChange={(value) => setPreview(value === "preview")}
          >
            <TabList label="编辑模式">
              <Tab value="markdown">Markdown</Tab>
              <Tab value="preview">预览</Tab>
            </TabList>
            <div className="editor-ai-tools-group">
              <Button
                variant="ghost"
                size="compact"
                className={`editor-ai-tool-control ${showAiWriting ? "active" : ""}`}
                onClick={() => {
                  setShowAiWriting(!showAiWriting);
                  setShowAiImage(false);
                  setAssistError("");
                }}
                icon={<Sparkles />}
              >
                {showAiWriting ? "收起 AI 写作" : "AI 写作与润色"}
              </Button>
              <Button
                variant="ghost"
                size="compact"
                className={`editor-ai-tool-control ${showAiImage ? "active" : ""}`}
                onClick={() => {
                  setShowAiImage(!showAiImage);
                  setShowAiWriting(false);
                  setAssistError("");
                }}
                icon={<ImageIcon />}
              >
                {showAiImage ? "收起 AI 插图" : "AI 文生图插画"}
              </Button>
            </div>
          </Tabs>

          {showAiWriting ? (
            <AiWritingPanel>
              <div className="editor-ai-panel-header">
                <div className="editor-ai-presets">
                  <ChoiceButton
                    onClick={() =>
                      void handleGenerateContent(
                        "基于单页标题和摘要，撰写结构严谨、排版精美且适合独立单页展示的 Markdown 完整初稿，包含引言、分章节介绍和关键信息汇总。",
                      )
                    }
                    disabled={aiContentLoading}
                  >
                    📄 一键起草单页初稿
                  </ChoiceButton>
                  <ChoiceButton
                    onClick={() =>
                      void handleGenerateContent(
                        "保持页面原意，优化段落连贯性、语言流畅度与排版格式，提升可读性。",
                      )
                    }
                    disabled={aiContentLoading || !page.content.trim()}
                  >
                    ✨ 润色与排版
                  </ChoiceButton>
                  <ChoiceButton
                    onClick={() =>
                      void handleGenerateContent(
                        "对现有单页正文进行扩充与深化，补充背景说明、服务介绍、常见细节或案例示例。",
                      )
                    }
                    disabled={aiContentLoading || !page.content.trim()}
                  >
                    ➕ 扩充内容细节
                  </ChoiceButton>
                  <ChoiceButton
                    onClick={() =>
                      void handleGenerateContent(
                        "在保留核心信息的前提下，精简冗余表述，使单页表达更加凝练直观。",
                      )
                    }
                    disabled={aiContentLoading || !page.content.trim()}
                  >
                    📝 精简提炼
                  </ChoiceButton>
                </div>
              </div>
              <div className="editor-ai-prompt-box">
                <Input
                  placeholder="输入自定义写作或修改提示词（例如：撰写一份现代关于页，包含个人经历、技术栈与联系方式…）"
                  value={contentPrompt}
                  onChange={(e) => setContentPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleGenerateContent();
                    }
                  }}
                  disabled={aiContentLoading}
                />
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void handleGenerateContent()}
                  loading={aiContentLoading}
                  disabled={
                    !contentPrompt.trim() &&
                    !page.title.trim() &&
                    !page.content.trim()
                  }
                >
                  {aiContentLoading ? "正在生成…" : "生成 / 执行"}
                </Button>
              </div>
              {assistError ? (
                <Feedback type="error">{assistError}</Feedback>
              ) : null}
              {generatedContent ? (
                <div className="editor-ai-result-box">
                  <div className="editor-ai-result-header">
                    <strong>
                      <Sparkles /> 生成结果预览
                    </strong>
                    <div className="editor-ai-result-actions">
                      <Button
                        variant="primary"
                        type="button"
                        onClick={() => applyGeneratedContent("replace")}
                      >
                        替换全文
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => applyGeneratedContent("append")}
                      >
                        追加到末尾
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => setGeneratedContent(null)}
                      >
                        放弃
                      </Button>
                    </div>
                  </div>
                  <div className="editor-ai-result-preview">
                    <MarkdownRenderer content={generatedContent} />
                  </div>
                </div>
              ) : null}
            </AiWritingPanel>
          ) : null}

          {showAiImage ? (
            <AiImageGenerationPanel>
              <div className="editor-ai-panel-header">
                <div className="editor-ai-presets">
                  <ChoiceButton
                    className="editor-ai-ideate-control"
                    onClick={() => void handleIdeateImagePrompts()}
                    loading={aiIdeateLoading}
                    disabled={aiIdeateLoading || aiImageLoading}
                    icon={<Sparkles />}
                  >
                    {aiIdeateLoading ? "正在构思画面…" : "结合页面智能构思画面"}
                  </ChoiceButton>
                  <ChoiceButton
                    onClick={() =>
                      void handleGenerateAiImage(
                        page.title
                          ? `A sleek modern architectural diagram illustration showing system components for ${page.title}, clean lines, isometric view, tech palette`
                          : "A sleek modern architectural diagram illustration showing system components, clean lines, isometric view, tech palette",
                      )
                    }
                    disabled={aiImageLoading}
                  >
                    📊 架构图解风
                  </ChoiceButton>
                  <ChoiceButton
                    onClick={() =>
                      void handleGenerateAiImage(
                        page.title
                          ? `A modern minimal editorial vector illustration for ${page.title}, clean flat design, subtle gradients`
                          : "A modern minimal editorial vector illustration for a clean web page, subtle gradients, flat design",
                      )
                    }
                    disabled={aiImageLoading}
                  >
                    🖼️ 科技插画风
                  </ChoiceButton>
                  <ChoiceButton
                    onClick={() =>
                      void handleGenerateAiImage(
                        page.title
                          ? `Cinematic concept art for ${page.title}, hyper-detailed futuristic scene, volumetric lighting, 8k wallpaper quality`
                          : "Cinematic concept art, hyper-detailed futuristic scene, volumetric lighting, 8k wallpaper quality",
                      )
                    }
                    disabled={aiImageLoading}
                  >
                    🎬 电影概念风
                  </ChoiceButton>
                  <ChoiceButton
                    onClick={() =>
                      void handleGenerateAiImage(
                        page.title
                          ? `Cute 3D isometric clay render illustration representing ${page.title}, soft studio lighting, playful scene`
                          : "Cute 3D isometric clay render illustration, soft studio lighting, playful scene",
                      )
                    }
                    disabled={aiImageLoading}
                  >
                    🎨 3D 立体风
                  </ChoiceButton>
                  <ChoiceButton
                    onClick={() =>
                      void handleGenerateAiImage(
                        page.title
                          ? `Cute and simple 2D cartoon flat illustration for ${page.title}, clean line art, playful vibrant colors, minimal modern aesthetic`
                          : "Cute and simple 2D cartoon flat illustration, clean line art, playful vibrant colors, minimal modern aesthetic",
                      )
                    }
                    disabled={aiImageLoading}
                  >
                    🧸 简单卡通风
                  </ChoiceButton>
                </div>
              </div>
              <div className="editor-ai-prompt-box">
                <Input
                  placeholder="输入生图提示词（或点击上方“智能构思画面”，也可直接描述场景）"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleGenerateAiImage();
                    }
                  }}
                  disabled={aiImageLoading}
                />
                <Input
                  className="editor-alt-input"
                  placeholder="图片描述 (Alt)"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  disabled={aiImageLoading}
                />
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void handleGenerateAiImage()}
                  loading={aiImageLoading}
                  disabled={!imagePrompt.trim() && !page.title.trim()}
                >
                  {aiImageLoading ? "正在绘制…" : "开始生图"}
                </Button>
              </div>
              {imagePromptCandidates.length > 0 ? (
                <div
                  className="editor-ai-candidates editor-ai-candidates--spaced"
                  aria-label="画面构思候选"
                >
                  {imagePromptCandidates.map((item) => {
                    const match = item.match(/\[中文说明:\s*([^\]]+)\]/);
                    const chDesc = match && match[1] ? match[1].trim() : "";
                    const promptText = item
                      .replace(/\[中文说明:\s*[^\]]+\]/g, "")
                      .trim();
                    return (
                      <div key={item} className="editor-prompt-candidate">
                        {chDesc ? (
                          <div className="editor-prompt-badge">
                            <Sparkles size={13} /> {chDesc}
                          </div>
                        ) : null}
                        <div className="editor-prompt-text">{promptText}</div>
                        <div className="editor-prompt-candidate-actions">
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => {
                              if (chDesc) setImageAlt(chDesc);
                              setImagePrompt(promptText);
                              notify("已填入生图提示词！", "success");
                            }}
                          >
                            ✍️ 填入提示词
                          </Button>
                          <Button
                            variant="primary"
                            type="button"
                            disabled={aiImageLoading}
                            onClick={() => {
                              if (chDesc) setImageAlt(chDesc);
                              setImagePrompt(promptText);
                              void handleGenerateAiImage(promptText);
                            }}
                          >
                            🎨 一键生图
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {assistError ? (
                <Feedback type="error">{assistError}</Feedback>
              ) : null}
              {generatedImage ? (
                <div className="editor-ai-image-result">
                  <div className="editor-ai-image-preview">
                    <img
                      src={generatedImage.url}
                      alt={generatedImage.alt || "AI 生成插图"}
                    />
                  </div>
                  <div className="editor-ai-image-info">
                    <div className="editor-ai-image-code">
                      {`![${generatedImage.alt || "单页插图"}](${generatedImage.url})`}
                    </div>
                    <div className="editor-ai-image-actions">
                      <Button
                        variant="primary"
                        type="button"
                        onClick={copyImageMarkdown}
                      >
                        📋 复制 Markdown
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={insertImageToContent}
                      >
                        ➕ 插入到正文末尾
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => setGeneratedImage(null)}
                      >
                        放弃
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </AiImageGenerationPanel>
          ) : null}

          {preview ? (
            <div className="editor-preview">
              <MarkdownRenderer
                content={page.content || "开始写作后，预览会出现在这里。"}
              />
            </div>
          ) : (
            <textarea
              className="editor-body mono"
              value={page.content}
              onChange={(event) => update("content", event.target.value)}
              aria-label="单页正文 Markdown"
              placeholder={"## 页面正文\n\n在此输入 Markdown 内容…"}
            />
          )}
        </main>

        <aside className="editor-inspector">
          <div className="editor-inspector-ai-banner">
            <Button
              variant="primary"
              type="button"
              onClick={() => void autoFillAllMetadata()}
              loading={metaLoading}
              disabled={!page.title.trim() && !page.content.trim()}
              icon={<Sparkles />}
            >
              {metaLoading ? "正在智能分析全文…" : "AI 一键补全元数据"}
            </Button>
          </div>

          <details open>
            <summary>发布设置</summary>
            <Field label="状态">
              <Select
                value={publishIntent}
                onChange={(event) => {
                  setPublishIntent(event.target.value as PostStatus);
                  dirty.current = true;
                  setSavedAt(null);
                }}
              >
                <option value="draft">草稿</option>
                <option value="published">立即发布</option>
              </Select>
            </Field>
          </details>

          <details open>
            <summary>页面配置</summary>
            <Field label="显示模板" hint="选择页面的预设布局结构">
              <Select
                value={page.template || "default"}
                onChange={(event) =>
                  update("template", event.target.value as PageTemplate)
                }
              >
                <option value="default">默认标准排版 (Default)</option>
                <option value="about">关于页专用模板 (About)</option>
                <option value="links">友情链接模板 (Links)</option>
                <option value="timeline">时间轴与历程 (Timeline)</option>
                <option value="projects">项目与作品集 (Projects)</option>
                <option value="focus">极简专注阅读 (Focus)</option>
                <option value="faq">问答与指南 (FAQ)</option>
                <option value="blank">全宽纯净模板 (Blank)</option>
              </Select>
            </Field>
            <Field label="主导航栏联动">
              <CheckboxField>
                <Checkbox
                  checked={page.show_in_nav}
                  onChange={(event) =>
                    update("show_in_nav", event.target.checked)
                  }
                />
                <span>显示在顶部主导航栏</span>
              </CheckboxField>
            </Field>
            {page.show_in_nav ? (
              <Field label="导航排序权重" hint="数字越小越靠前，如 10, 20">
                <Input
                  type="number"
                  value={page.sort_order}
                  onChange={(event) =>
                    update("sort_order", Number(event.target.value) || 0)
                  }
                />
              </Field>
            ) : null}
          </details>

          <details open>
            <summary>路径与 SEO</summary>
            <div className="editor-ai-inline editor-inline-box">
              <Button
                variant="ghost"
                onClick={() => void requestSeo()}
                disabled={assistTask !== null}
                icon={<Sparkles />}
              >
                {assistTask === "seo"
                  ? "正在优化 SEO…"
                  : "🎯 智能生成整套 SEO 配置"}
              </Button>
            </div>
            <Field label="访问路径 (Slug)" required hint="访问路径为 /<slug>">
              <Input
                className="mono"
                value={page.slug}
                onChange={(event) => update("slug", event.target.value)}
                placeholder="about"
                required
              />
              <div className="editor-ai-inline">
                <Button
                  variant="ghost"
                  onClick={() => void requestSuggestions("slug")}
                  disabled={assistTask !== null}
                  icon={<Sparkles />}
                >
                  {assistTask === "slug" ? "正在生成 Slug…" : "生成 Slug 候选"}
                </Button>
                {suggestionTask === "slug" && suggestions.length > 0 ? (
                  <div className="editor-ai-candidates" aria-label="Slug 候选">
                    {suggestions.map((item) => (
                      <Button
                        key={item}
                        variant="ghost"
                        onClick={() => applySuggestion("slug", item)}
                      >
                        <span className="mono">{item}</span>
                        <b>应用</b>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>
            <Field
              label="SEO 标题"
              hint={`${(page.seo_title || "").length}/60`}
            >
              <Input
                value={page.seo_title || ""}
                maxLength={60}
                onChange={(event) => update("seo_title", event.target.value)}
                placeholder="留空时默认使用标题"
              />
            </Field>
            <Field
              label="SEO 描述"
              hint={`${(page.seo_description || "").length}/160`}
            >
              <Textarea
                rows={4}
                value={page.seo_description || ""}
                maxLength={160}
                onChange={(event) =>
                  update("seo_description", event.target.value)
                }
                placeholder="留空时默认使用摘要"
              />
            </Field>
          </details>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmExit}
        title="放弃未保存的更改？"
        description="离开编辑器后，尚未保存的内容会丢失。"
        confirmLabel="放弃并离开"
        danger
        onClose={() => setConfirmExit(false)}
        onConfirm={() => navigate("/admin/pages")}
      />
    </ContentEditorFrame>
  );
}
