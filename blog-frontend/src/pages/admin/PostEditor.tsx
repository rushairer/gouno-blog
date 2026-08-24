import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  History,
  Image as ImageIcon,
  LoaderCircle,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { agentApi } from "../../api/agent";
import { postsApi } from "../../api/posts";
import { siteApi } from "../../api/site";
import {
  AdminPageState,
  Button,
  ConfirmDialog,
  Feedback,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "../../components/ui";
import { MarkdownRenderer } from "../../components/MarkdownRenderer";
import {
  AiImageGenerationPanel,
  AiWritingPanel,
  ContentEditorFrame,
  EditorCommandBar,
} from "../../components/editor/ContentEditorFrame";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { usePageTitle } from "../../hooks/usePageTitle";
import { extractMarkdownTOC } from "../../utils/markdown";
import type { Category, Post, PostStatus } from "../../types/blog";

interface PostVersion extends Post {
  post_id: number;
}
type AssistTask =
  | "title"
  | "summary"
  | "slug"
  | "content"
  | "tags"
  | "seo"
  | "alt"
  | "category"
  | "cover_prompt"
  | "metadata_all";

const emptyPost: Post = {
  id: 0,
  title: "",
  slug: "",
  summary: "",
  content: "",
  tags: [],
  status: "draft",
  created_at: "",
};

export default function PostEditor() {
  const { id } = useParams();
  const isNew = !id;
  const allowed = useAdminGuard(
    isNew ? "/admin/posts/new" : `/admin/posts/${id}/edit`,
  );
  const navigate = useNavigate();
  const { notify } = useToast();
  const [post, setPost] = useState<Post>(emptyPost);

  const editorTitle = isNew
    ? post.title
      ? `新建文章: ${post.title}`
      : "新建文章"
    : post.title
      ? `编辑: ${post.title}`
      : "编辑文章";
  usePageTitle(editorTitle, { admin: true });
  const [publishIntent, setPublishIntent] = useState<PostStatus>("draft");
  const [categories, setCategories] = useState<Category[]>([]);
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<PostVersion | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [assistTask, setAssistTask] = useState<AssistTask | null>(null);
  const [suggestionTask, setSuggestionTask] = useState<AssistTask | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [assistError, setAssistError] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [categorySuggestion, setCategorySuggestion] = useState<string | null>(
    null,
  );
  const [metaLoading, setMetaLoading] = useState(false);
  const [generatingCoverPrompt, setGeneratingCoverPrompt] = useState<
    string | null
  >(null);
  const [showAiWriting, setShowAiWriting] = useState(false);
  const [contentPrompt, setContentPrompt] = useState("");
  const [aiContentLoading, setAiContentLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [showAiImage, setShowAiImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{
    url: string;
    alt: string;
  } | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!allowed) return;
    const requests: Promise<unknown>[] = [
      siteApi.getCategories().then(setCategories),
    ];
    if (id) {
      requests.push(
        postsApi.getAdminPost(id).then((value) => {
          setPost(value);
          setPublishIntent(value.status || "draft");
        }),
      );
      requests.push(
        postsApi.getVersions(id).then((v) => setVersions(v as PostVersion[])),
      );
    }
    Promise.all(requests)
      .catch((reason: Error) => {
        const msg = reason.message;
        setError(msg);
        notify(msg, "error");
      })
      .finally(() => setLoading(false));
  }, [allowed, id, notify]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const update = <K extends keyof Post>(key: K, value: Post[K]) => {
    setPost((current) => ({ ...current, [key]: value }));
    dirty.current = true;
    setSavedAt(null);
  };

  const persist = useCallback(
    async (status: PostStatus, automatic = false) => {
      if (!post.title.trim()) {
        const msg = "请先填写文章标题。";
        if (!automatic) {
          setError(msg);
          notify(msg, "error");
        }
        return;
      }
      if (status !== "draft" && !post.content.trim()) {
        const msg = "发布前需要填写正文。";
        setError(msg);
        notify(msg, "error");
        return;
      }
      if (status === "scheduled" && !post.scheduled_at) {
        const msg = "定时发布需要选择发布时间。";
        setError(msg);
        notify(msg, "error");
        return;
      }
      setSaving(true);
      setError("");
      try {
        const payload = { ...post, status, tags: post.tags.filter(Boolean) };
        const saved = post.id
          ? await postsApi.updatePost(post.id, payload)
          : await postsApi.createPost(payload);
        setPost(saved);
        dirty.current = false;
        setSavedAt(new Date());
        if (!automatic) {
          setPublishIntent(saved.status || "draft");
          notify(
            status === "published"
              ? "文章已成功发布！"
              : status === "scheduled"
                ? "文章已成功安排发布！"
                : "草稿已保存。",
            "success",
          );
        }
        if (!post.id)
          navigate(`/admin/posts/${saved.id}/edit`, { replace: true });
      } catch (reason) {
        const msg =
          reason instanceof Error ? reason.message : "保存失败，请稍后重试。";
        setError(msg);
        notify(msg, "error");
      } finally {
        setSaving(false);
      }
    },
    [navigate, notify, post],
  );

  useEffect(() => {
    if (
      !dirty.current ||
      !post.id ||
      !post.title.trim() ||
      post.status !== "draft"
    )
      return;
    const timer = window.setTimeout(() => void persist("draft", true), 1800);
    return () => window.clearTimeout(timer);
  }, [post, persist]);

  const outline = useMemo(
    () => extractMarkdownTOC(post.content),
    [post.content],
  );
  const restoreVersion = async () => {
    if (!post.id || !restoreTarget) return;
    try {
      const restored = await postsApi.restoreVersion(post.id, restoreTarget.id);
      setPost(restored);
      setPublishIntent(restored.status || "draft");
      dirty.current = false;
      setSavedAt(new Date());
      setShowVersions(false);
      setRestoreTarget(null);
      notify("已成功恢复历史版本。", "success");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "版本恢复失败";
      setError(msg);
      notify(msg, "error");
    }
  };
  const leaveEditor = () => {
    if (dirty.current) setConfirmExit(true);
    else navigate("/admin/posts");
  };

  const requestSuggestions = async (task: AssistTask) => {
    if (!post.title.trim() && !post.content.trim()) {
      const msg = "先写下标题或正文，AI 才能理解这篇文章。";
      setAssistError(msg);
      notify(msg, "error");
      return;
    }
    setAssistTask(task);
    setSuggestionTask(null);
    setSuggestions([]);
    setAssistError("");
    try {
      const res = await agentApi.getDraftAssist({
        task,
        title: post.title,
        summary: post.summary,
        content: post.content,
        categories: categories.map((c) => c.name),
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
      setSuggestions(cleanList);
      setSuggestionTask(task);
      if (!cleanList.length) {
        const msg = "这次没有生成可用候选，请稍后重试。";
        setAssistError(msg);
        notify(msg, "error");
      }
    } catch (reason) {
      const msg =
        reason instanceof Error ? reason.message : "生成候选失败，请稍后重试。";
      setAssistError(msg);
      notify(msg, "error");
    } finally {
      setAssistTask(null);
    }
  };

  const applySuggestion = (task: AssistTask, value: string) => {
    if (task === "alt") {
      update("cover_alt", value);
      notify("已应用封面替代文本。", "success");
    } else {
      update(task as keyof Post, value);
    }
    setSuggestions([]);
    setSuggestionTask(null);
    setAssistError("");
  };

  const requestTags = async () => {
    if (!post.title.trim() && !post.content.trim()) {
      notify("先写下标题或正文，AI 才能提炼标签。", "error");
      return;
    }
    setAssistTask("tags");
    try {
      const res = await agentApi.getDraftAssist({
        task: "tags",
        title: post.title,
        summary: post.summary,
        content: post.content,
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
      setTagSuggestions(cleanList);
      if (cleanList.length) {
        notify(`已提炼出 ${cleanList.length} 个推荐标签。`, "success");
      } else {
        notify("未能提炼出有效标签，请稍后重试。", "error");
      }
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "提炼标签失败",
        "error",
      );
    } finally {
      setAssistTask(null);
    }
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!post.tags.includes(trimmed)) {
      const nextTags = [...post.tags, trimmed];
      update("tags", nextTags);
      notify(`已添加标签：${trimmed}`, "success");
    }
  };

  const addAllTags = () => {
    const nextTags = [...post.tags];
    let addedCount = 0;
    tagSuggestions.forEach((tag) => {
      const trimmed = tag.trim();
      if (trimmed && !nextTags.includes(trimmed)) {
        nextTags.push(trimmed);
        addedCount++;
      }
    });
    if (addedCount > 0) {
      update("tags", nextTags);
      notify(`已添加 ${addedCount} 个推荐标签。`, "success");
    }
  };

  const requestCategory = async () => {
    if (!post.title.trim() && !post.content.trim()) {
      notify("先写下标题或正文，AI 才能分析分类。", "error");
      return;
    }
    if (!categories.length) {
      notify("当前站点尚未创建任何分类。", "error");
      return;
    }
    setAssistTask("category");
    try {
      const res = await agentApi.getDraftAssist({
        task: "category",
        title: post.title,
        summary: post.summary,
        content: post.content,
        categories: categories.map((c) => c.name),
      });
      if (res.suggestions?.length) {
        const catName = res.suggestions[0].trim();
        setCategorySuggestion(catName);
        notify(`推荐归属分类：${catName}`, "success");
      } else {
        notify("未能匹配到合适分类。", "error");
      }
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "分析分类失败",
        "error",
      );
    } finally {
      setAssistTask(null);
    }
  };

  const applyCategory = (categoryName: string) => {
    const matched = categories.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    if (matched) {
      update("category_id", matched.id);
      notify(`已选择分类：${matched.name}`, "success");
      setCategorySuggestion(null);
    } else {
      notify(`未找到名为 "${categoryName}" 的分类`, "error");
    }
  };

  const requestSeo = async () => {
    if (!post.title.trim() && !post.content.trim()) {
      notify("先写下标题或正文，AI 才能优化 SEO。", "error");
      return;
    }
    setAssistTask("seo");
    try {
      const res = await agentApi.getDraftAssist({
        task: "seo",
        title: post.title,
        summary: post.summary,
        content: post.content,
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
        setPost((current) => ({
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

  const autoFillAllMetadata = async () => {
    if (!post.title.trim() && !post.content.trim()) {
      notify("请先填写标题或正文，AI 才能提炼全套元数据。", "error");
      return;
    }
    setMetaLoading(true);
    try {
      const res = await agentApi.getDraftAssist({
        task: "metadata_all",
        title: post.title,
        summary: post.summary,
        content: post.content,
        categories: categories.map((c) => c.name),
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
        setPost((current) => {
          let catId = current.category_id;
          if (meta?.category) {
            const found = categories.find(
              (c) => c.name.toLowerCase() === meta?.category?.toLowerCase(),
            );
            if (found) catId = found.id;
          }
          const nextTags = [...current.tags];
          if (Array.isArray(meta?.tags)) {
            meta.tags.forEach((t) => {
              const clean = String(t).trim();
              if (clean && !nextTags.includes(clean)) nextTags.push(clean);
            });
          }
          return {
            ...current,
            summary: meta?.summary || current.summary,
            slug: meta?.slug || current.slug,
            seo_title: meta?.seo_title || current.seo_title,
            seo_description: meta?.seo_description || current.seo_description,
            cover_alt: meta?.cover_alt || current.cover_alt,
            category_id: catId,
            tags: nextTags,
          };
        });
        dirty.current = true;
        setSavedAt(null);
        notify("⚡ 全套元数据已成功自动补全！", "success");
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

  const handleGenerateCover = async (promptText: string) => {
    setGeneratingCoverPrompt(promptText);
    try {
      notify("正在根据提示词生成封面图，请稍候…", "success");
      const res = await agentApi.generateImage({
        prompt: promptText,
        alt_text: post.cover_alt || post.title || "文章封面",
      });
      if (res?.url) {
        update("cover_url", res.url);
        notify("🎨 封面图已成功生成并填入！", "success");
      } else {
        notify("未能成功生成封面图。", "error");
      }
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "生图失败";
      void navigator.clipboard.writeText(promptText);
      notify(`${msg}（提示词已自动复制到剪贴板）`, "error");
    } finally {
      setGeneratingCoverPrompt(null);
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
    if (!effectivePrompt && !post.title.trim() && !post.content.trim()) {
      const msg = "请先填写文章标题、正文或输入提示词。";
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
        title: post.title,
        summary: post.summary,
        content: post.content,
        prompt: effectivePrompt,
      });
      if (res.suggestions?.length && res.suggestions[0].trim()) {
        setGeneratedContent(sanitizeAiMarkdown(res.suggestions[0]));
        notify("正文已生成完毕，请在下方预览并确认。", "success");
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
      notify("已替换文章正文。", "success");
    } else {
      update(
        "content",
        post.content
          ? `${post.content.trim()}\n\n${generatedContent}`
          : generatedContent,
      );
      notify("已将生成内容追加到文末。", "success");
    }
    setGeneratedContent(null);
    setShowAiWriting(false);
  };

  const handleGenerateAiImage = async (presetPrompt?: string) => {
    const effectivePrompt = (
      presetPrompt !== undefined ? presetPrompt : imagePrompt
    ).trim();
    if (!effectivePrompt && !post.title.trim() && !post.content.trim()) {
      const msg = "请输入生图提示词或先填写文章标题。";
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
        `Modern artistic illustration representing: ${post.title}`;
      const finalAlt = imageAlt.trim() || post.title || "文章插图";
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
    const md = `![${generatedImage.alt || "文章插图"}](${generatedImage.url})`;
    void navigator.clipboard.writeText(md);
    notify("Markdown 图片代码已复制到剪贴板！", "success");
  };

  const insertImageToContent = () => {
    if (!generatedImage) return;
    const md = `\n\n![${generatedImage.alt || "文章插图"}](${generatedImage.url})\n\n`;
    setPost((current) => ({
      ...current,
      content: current.content
        ? `${current.content.trimEnd()}${md}`
        : `![${generatedImage.alt || "文章插图"}](${generatedImage.url})\n\n`,
    }));
    dirty.current = true;
    setSavedAt(null);
    notify("已成功将插图插入到正文末尾！", "success");
  };

  const setGeneratedImageAsCover = () => {
    if (!generatedImage) return;
    setPost((current) => ({
      ...current,
      cover_url: generatedImage.url,
      cover_alt: generatedImage.alt || current.cover_alt,
    }));
    dirty.current = true;
    setSavedAt(null);
    notify("已成功将该图片设为文章封面！", "success");
  };

  const openFrontsitePreview = async () => {
    let currentPost = post;
    if (dirty.current || !currentPost.id) {
      if (!currentPost.title.trim()) {
        const msg = "请先填写文章标题。";
        setError(msg);
        notify(msg, "error");
        return;
      }
      setSaving(true);
      setError("");
      try {
        const payload = {
          ...currentPost,
          status: currentPost.status || "draft",
          tags: currentPost.tags.filter(Boolean),
        };
        currentPost = currentPost.id
          ? await postsApi.updatePost(currentPost.id, payload)
          : await postsApi.createPost(payload);
        setPost(currentPost);
        dirty.current = false;
        setSavedAt(new Date());
        if (!post.id)
          navigate(`/admin/posts/${currentPost.id}/edit`, { replace: true });
      } catch (reason) {
        const msg =
          reason instanceof Error ? reason.message : "保存失败，无法开启预览。";
        setError(msg);
        notify(msg, "error");
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    const target = currentPost.slug || String(currentPost.id);
    window.open(
      `/articles/${encodeURIComponent(target)}?preview=true`,
      "_blank",
    );
  };

  const primaryStatus: PostStatus =
    publishIntent === "scheduled" ? "scheduled" : "published";
  const primaryLabel =
    publishIntent === "scheduled"
      ? "安排发布"
      : post.status === "published"
        ? "更新文章"
        : "发布";
  if (!allowed || loading)
    return (
      <AdminPageState
        title={isNew ? "新建文章" : "编辑文章"}
        description="撰写、预览并管理文章发布状态。"
        label="正在打开编辑器…"
      />
    );
  return (
    <ContentEditorFrame>
      <EditorCommandBar>
        <button className="editor-back" type="button" onClick={leaveEditor}>
          <ArrowLeft /> 返回文章列表
        </button>
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
        <div>
          <Button
            variant="secondary"
            type="button"
            onClick={() => void openFrontsitePreview()}
            disabled={saving}
          >
            <ExternalLink /> 预览前台页面
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => void persist("draft")}
            disabled={saving}
          >
            <Save /> 保存草稿
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => void persist(primaryStatus)}
            disabled={saving}
          >
            <Send /> {primaryLabel}
          </Button>
        </div>
      </EditorCommandBar>
      {error ? <Feedback type="error">{error}</Feedback> : null}
      <div className="editor-workspace">
        <aside className="editor-outline">
          <div>
            <h2>文档大纲</h2>
            <button
              type="button"
              onClick={() => setShowVersions(!showVersions)}
            >
              <History /> 版本历史 ({versions.length})
            </button>
          </div>
          {showVersions ? (
            <div className="version-drawer">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setRestoreTarget(version)}
                >
                  <strong>{version.title}</strong>
                  <small>
                    {new Date(version.created_at).toLocaleString("zh-CN")} ·
                    点击恢复
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <nav>
              {outline.length ? (
                outline.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`level-${item.level}`}
                    onClick={() => {
                      if (!preview) setPreview(true);
                    }}
                  >
                    {item.text}
                  </a>
                ))
              ) : (
                <p>
                  在正文中添加 Markdown 标题（如 # 或 ##）后，大纲会自动生成。
                </p>
              )}
            </nav>
          )}
        </aside>
        <main className="editor-canvas">
          <Field label="标题" required>
            <Textarea
              className="editor-title"
              rows={2}
              value={post.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="写一个清晰、具体的标题"
              required
            />
            <div className="editor-ai-inline">
              <button
                type="button"
                onClick={() => void requestSuggestions("title")}
                disabled={assistTask !== null}
              >
                <Sparkles />
                {assistTask === "title" ? (
                  <>
                    <LoaderCircle className="is-spinning" /> 正在想标题…
                  </>
                ) : (
                  "生成标题候选"
                )}
              </button>
              {suggestionTask === "title" && suggestions.length > 0 ? (
                <div className="editor-ai-candidates" aria-label="标题候选">
                  {suggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => applySuggestion("title", item)}
                    >
                      <span>{item}</span>
                      <b>应用</b>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>
          <Field label="摘要">
            <Textarea
              className="editor-summary"
              rows={3}
              value={post.summary}
              onChange={(event) => update("summary", event.target.value)}
              maxLength={300}
              placeholder="用两三句话说明文章解决的问题"
            />
            <div className="editor-ai-inline">
              <button
                type="button"
                onClick={() => void requestSuggestions("summary")}
                disabled={assistTask !== null}
              >
                <Sparkles />
                {assistTask === "summary" ? (
                  <>
                    <LoaderCircle className="is-spinning" /> 正在提炼摘要…
                  </>
                ) : (
                  "根据正文生成摘要"
                )}
              </button>
              {suggestionTask === "summary" && suggestions.length > 0 ? (
                <div className="editor-ai-candidates" aria-label="摘要候选">
                  {suggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => applySuggestion("summary", item)}
                    >
                      <span>{item}</span>
                      <b>应用</b>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>
          <div className="editor-tabs">
            <div className="tab-buttons">
              <button
                className={!preview ? "active" : ""}
                type="button"
                onClick={() => setPreview(false)}
              >
                Markdown
              </button>
              <button
                className={preview ? "active" : ""}
                type="button"
                onClick={() => setPreview(true)}
              >
                预览
              </button>
            </div>
            <div className="editor-ai-tools-group">
              <button
                className={`editor-ai-tool-btn ${showAiWriting ? "active" : ""}`}
                type="button"
                onClick={() => {
                  setShowAiWriting(!showAiWriting);
                  setShowAiImage(false);
                  setAssistError("");
                }}
              >
                <Sparkles /> {showAiWriting ? "收起 AI 写作" : "AI 写作与润色"}
              </button>
              <button
                className={`editor-ai-tool-btn ${showAiImage ? "active" : ""}`}
                type="button"
                onClick={() => {
                  setShowAiImage(!showAiImage);
                  setShowAiWriting(false);
                  setAssistError("");
                }}
              >
                <ImageIcon /> {showAiImage ? "收起 AI 插图" : "AI 文生图插画"}
              </button>
            </div>
          </div>
          {showAiWriting ? (
            <AiWritingPanel>
              <div className="editor-ai-panel-header">
                <div className="editor-ai-presets">
                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateContent(
                        "基于文章标题和摘要，撰写结构严谨、内容丰富的 Markdown 完整文章初稿，包含引言、分章节深入论述和总结。",
                      )
                    }
                    disabled={aiContentLoading}
                  >
                    ✍️ 一键起草初稿
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateContent(
                        "保持文章原意与核心论点，优化段落连贯性、语言流畅度与错别字，并完善 Markdown 排版格式。",
                      )
                    }
                    disabled={aiContentLoading || !post.content.trim()}
                  >
                    ✨ 润色与排版
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateContent(
                        "对现有正文进行扩写与深化，补充背景说明、技术细节、论据案例或实践经验，使文章更具深度。",
                      )
                    }
                    disabled={aiContentLoading || !post.content.trim()}
                  >
                    ➕ 扩充内容细节
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateContent(
                        "在保留核心论点与关键信息的前提下，精简冗余表述，提炼要点，使语言更加精炼有力。",
                      )
                    }
                    disabled={aiContentLoading || !post.content.trim()}
                  >
                    📝 精简提炼
                  </button>
                </div>
              </div>
              <div className="editor-ai-prompt-box">
                <Input
                  placeholder="输入自定义写作或修改提示词（例如：按“背景-方案-实操”三部分撰写，增加代码示例…）"
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
                  disabled={
                    aiContentLoading ||
                    (!contentPrompt.trim() &&
                      !post.title.trim() &&
                      !post.content.trim())
                  }
                >
                  {aiContentLoading ? (
                    <>
                      <LoaderCircle className="is-spinning" /> 正在生成…
                    </>
                  ) : (
                    "生成 / 执行"
                  )}
                </Button>
              </div>
              {assistError ? (
                <div
                  style={{
                    color: "var(--danger, #ef4444)",
                    fontSize: 12,
                    padding: "4px 8px",
                    background: "rgba(239, 68, 68, 0.08)",
                    borderRadius: 4,
                  }}
                >
                  {assistError}
                </div>
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
                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateAiImage(
                        "A sleek modern architectural diagram illustration showing system components, clean lines, isometric view, tech palette",
                      )
                    }
                    disabled={aiImageLoading}
                  >
                    📊 架构图解风
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateAiImage(
                        "A modern minimal editorial vector illustration about technology and human intelligence, clean flat design, subtle gradients",
                      )
                    }
                    disabled={aiImageLoading}
                  >
                    🖼️ 科技插画风
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateAiImage(
                        "Cinematic concept art, hyper-detailed futuristic scene, volumetric lighting, 8k wallpaper quality",
                      )
                    }
                    disabled={aiImageLoading}
                  >
                    🎬 电影概念风
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateAiImage(
                        "Cute 3D isometric clay render illustration, soft studio lighting, playful tech scene",
                      )
                    }
                    disabled={aiImageLoading}
                  >
                    🎨 3D 立体风
                  </button>
                </div>
              </div>
              <div className="editor-ai-prompt-box">
                <Input
                  placeholder="输入生图提示词（支持中文或英文，例如：微服务架构调用拓扑图，蓝紫霓虹光效…）"
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
                  style={{ maxWidth: 160 }}
                  placeholder="图片描述 (Alt)"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  disabled={aiImageLoading}
                />
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void handleGenerateAiImage()}
                  disabled={
                    aiImageLoading ||
                    (!imagePrompt.trim() && !post.title.trim())
                  }
                >
                  {aiImageLoading ? (
                    <>
                      <LoaderCircle className="is-spinning" /> 正在绘制…
                    </>
                  ) : (
                    "🎨 开始生图"
                  )}
                </Button>
              </div>
              {assistError ? (
                <div
                  style={{
                    color: "var(--danger, #ef4444)",
                    fontSize: 12,
                    padding: "4px 8px",
                    background: "rgba(239, 68, 68, 0.08)",
                    borderRadius: 4,
                  }}
                >
                  {assistError}
                </div>
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
                      {`![${generatedImage.alt || "文章插图"}](${generatedImage.url})`}
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
                        onClick={setGeneratedImageAsCover}
                      >
                        🖼️ 设为文章封面
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
                content={post.content || "开始写作后，预览会出现在这里。"}
              />
            </div>
          ) : (
            <textarea
              className="editor-body mono"
              value={post.content}
              onChange={(event) => update("content", event.target.value)}
              aria-label="文章正文 Markdown"
              placeholder={"## 从问题开始\n\n写下背景、约束、判断与实现…"}
            />
          )}
        </main>
        <aside className="editor-inspector">
          <div className="editor-inspector-ai-banner">
            <Button
              variant="primary"
              type="button"
              onClick={() => void autoFillAllMetadata()}
              disabled={
                metaLoading || (!post.title.trim() && !post.content.trim())
              }
            >
              {metaLoading ? (
                <>
                  <LoaderCircle className="is-spinning" /> 正在智能分析全文…
                </>
              ) : (
                <>
                  <Sparkles /> ⚡ AI 一键补全元数据
                </>
              )}
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
                }}
              >
                <option value="draft">草稿</option>
                <option value="published">立即发布</option>
                <option value="scheduled">定时发布</option>
              </Select>
            </Field>
            {publishIntent === "scheduled" ? (
              <Field label="发布时间">
                <Input
                  type="datetime-local"
                  value={post.scheduled_at?.slice(0, 16) || ""}
                  onChange={(event) =>
                    update("scheduled_at", event.target.value)
                  }
                />
              </Field>
            ) : null}
          </details>
          <details open>
            <summary>分类与标签</summary>
            <Field label="分类">
              <Select
                value={post.category_id || ""}
                onChange={(event) =>
                  update(
                    "category_id",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">未分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              {categorySuggestion ? (
                <button
                  type="button"
                  className="category-ai-badge"
                  onClick={() => applyCategory(categorySuggestion)}
                >
                  <Sparkles /> 推荐: {categorySuggestion} (点击应用)
                </button>
              ) : (
                <div className="editor-ai-inline">
                  <button
                    type="button"
                    onClick={() => void requestCategory()}
                    disabled={assistTask !== null || !categories.length}
                  >
                    <Sparkles />
                    {assistTask === "category" ? (
                      <>
                        <LoaderCircle className="is-spinning" /> 分析分类…
                      </>
                    ) : (
                      "推荐最佳分类"
                    )}
                  </button>
                </div>
              )}
            </Field>
            <Field label="标签" hint="使用逗号分隔，最多建议 10 个。">
              <Input
                value={post.tags.join(", ")}
                onChange={(event) =>
                  update(
                    "tags",
                    event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="Go, OIDC, 安全"
              />
              <div className="editor-ai-inline">
                <button
                  type="button"
                  onClick={() => void requestTags()}
                  disabled={assistTask !== null}
                >
                  <Sparkles />
                  {assistTask === "tags" ? (
                    <>
                      <LoaderCircle className="is-spinning" /> 正在提炼标签…
                    </>
                  ) : (
                    "提取推荐标签"
                  )}
                </button>
              </div>
              {tagSuggestions.length > 0 ? (
                <div className="editor-tag-pills">
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-3)",
                      width: "100%",
                    }}
                  >
                    点击标签添加：
                  </span>
                  {tagSuggestions.map((tag) => {
                    const isAdded = post.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`editor-tag-pill ${isAdded ? "is-added" : ""}`}
                        onClick={() => !isAdded && addTag(tag)}
                        title={isAdded ? "已添加" : "点击添加此标签"}
                      >
                        {isAdded ? "✓" : "+"} {tag}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="editor-tag-pill-all"
                    onClick={addAllTags}
                  >
                    + 添加全部
                  </button>
                </div>
              ) : null}
            </Field>
          </details>
          <details open>
            <summary>封面与摘要</summary>
            <Field label="封面 URL">
              <Input
                value={post.cover_url || ""}
                onChange={(event) => update("cover_url", event.target.value)}
                placeholder="/media/cover.webp"
              />
              <div className="editor-ai-inline">
                <button
                  type="button"
                  onClick={() => void requestSuggestions("cover_prompt")}
                  disabled={assistTask !== null}
                >
                  <Sparkles />
                  {assistTask === "cover_prompt" ? (
                    <>
                      <LoaderCircle className="is-spinning" /> 生成生图提示词…
                    </>
                  ) : (
                    "生成生图 Prompt"
                  )}
                </button>
                {suggestionTask === "cover_prompt" && suggestions.length > 0 ? (
                  <div
                    className="editor-ai-candidates"
                    aria-label="Prompt 候选"
                  >
                    {suggestions.map((item) => (
                      <div key={item} className="editor-prompt-candidate">
                        <div className="editor-prompt-text">{item}</div>
                        <div className="editor-prompt-candidate-actions">
                          <Button
                            variant="primary"
                            type="button"
                            disabled={generatingCoverPrompt !== null}
                            onClick={() => void handleGenerateCover(item)}
                          >
                            {generatingCoverPrompt === item ? (
                              <>
                                <LoaderCircle className="is-spinning" />{" "}
                                正在生图…
                              </>
                            ) : (
                              <>🎨 生图</>
                            )}
                          </Button>
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(item);
                              notify("生图提示词已复制到剪贴板！", "success");
                            }}
                          >
                            📋 复制
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>
            <Field label="替代文本">
              <Input
                value={post.cover_alt || ""}
                onChange={(event) => update("cover_alt", event.target.value)}
                placeholder="描述封面图场景与主题"
              />
              <div className="editor-ai-inline">
                <button
                  type="button"
                  onClick={() => void requestSuggestions("alt")}
                  disabled={assistTask !== null}
                >
                  <Sparkles />
                  {assistTask === "alt" ? (
                    <>
                      <LoaderCircle className="is-spinning" /> 正在生成 Alt…
                    </>
                  ) : (
                    "生成 Alt 描述"
                  )}
                </button>
                {suggestionTask === "alt" && suggestions.length > 0 ? (
                  <div className="editor-ai-candidates" aria-label="Alt 候选">
                    {suggestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => applySuggestion("alt", item)}
                      >
                        <span>{item}</span>
                        <b>应用</b>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>
          </details>
          <details open>
            <summary>路径与 SEO</summary>
            <div className="editor-ai-inline" style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => void requestSeo()}
                disabled={assistTask !== null}
              >
                <Sparkles />
                {assistTask === "seo" ? (
                  <>
                    <LoaderCircle className="is-spinning" /> 正在优化 SEO…
                  </>
                ) : (
                  "🎯 智能生成整套 SEO 配置"
                )}
              </button>
            </div>
            <Field
              label="访问路径 (Slug)"
              required
              hint="访问路径为 /articles/<slug>"
            >
              <Input
                className="mono"
                value={post.slug}
                onChange={(event) => update("slug", event.target.value)}
                required
              />
              <div className="editor-ai-inline">
                <button
                  type="button"
                  onClick={() => void requestSuggestions("slug")}
                  disabled={assistTask !== null}
                >
                  <Sparkles />
                  {assistTask === "slug" ? (
                    <>
                      <LoaderCircle className="is-spinning" /> 正在生成 Slug…
                    </>
                  ) : (
                    "生成 Slug 候选"
                  )}
                </button>
                {suggestionTask === "slug" && suggestions.length > 0 ? (
                  <div className="editor-ai-candidates" aria-label="Slug 候选">
                    {suggestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => applySuggestion("slug", item)}
                      >
                        <span className="mono">{item}</span>
                        <b>应用</b>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>
            <Field
              label="SEO 标题"
              hint={`${(post.seo_title || "").length}/60`}
            >
              <Input
                value={post.seo_title || ""}
                maxLength={60}
                onChange={(event) => update("seo_title", event.target.value)}
                placeholder="留空时默认使用标题"
              />
            </Field>
            <Field
              label="SEO 描述"
              hint={`${(post.seo_description || "").length}/160`}
            >
              <Textarea
                rows={4}
                value={post.seo_description || ""}
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
        open={restoreTarget !== null}
        title="恢复历史版本"
        description={
          restoreTarget ? (
            <>
              恢复 {new Date(restoreTarget.created_at).toLocaleString("zh-CN")}{" "}
              的版本？当前内容会先保留为历史版本。
            </>
          ) : (
            ""
          )
        }
        confirmLabel="恢复版本"
        onClose={() => setRestoreTarget(null)}
        onConfirm={restoreVersion}
      />
      <ConfirmDialog
        open={confirmExit}
        title="放弃未保存的更改？"
        description="离开编辑器后，尚未保存的内容会丢失。"
        confirmLabel="放弃并离开"
        danger
        onClose={() => setConfirmExit(false)}
        onConfirm={() => navigate("/admin/posts")}
      />
    </ContentEditorFrame>
  );
}
