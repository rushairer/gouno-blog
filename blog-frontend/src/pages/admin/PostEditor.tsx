import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { agentApi } from "../../api/agent";
import { postsApi } from "../../api/posts";
import { siteApi } from "../../api/site";
import { useAbility } from "../../abilities";
import {
  Alert,
  Button,
  Card,
  ChoiceButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Tabs,
  Text,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@gouno/ui/core";
import {
  AISuggestionPicker,
  AISuggestionReview,
  DocumentEditorShell,
  MarkdownEditor,
  type MarkdownEditorMode,
  type MarkdownEditorRef,
  type MarkdownEditorSelection,
} from "@gouno/ui/patterns";

import { MarkdownRenderer } from "../../components/MarkdownRenderer";
import {
  EditorMediaSourceDialog,
  type MediaResult,
  type MediaSource,
} from "../../components/editor/EditorMediaSourceDialog";
import {
  EditorWritingDialog,
  type WritingApplyMode,
} from "../../components/editor/EditorWritingDialog";
import {
  cleanAiSuggestions,
  metadataFromAssist,
} from "../../components/editor/editor-ai";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
  extractMarkdownTOC,
  normalizedMarkdownText,
  type MarkdownTOCItem,
} from "../../utils/markdown";
import type { Category, Post, PostStatus, PostVersion } from "../../types/blog";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

type NavigatorMode = "outline" | "history";
type FieldSuggestionTask = "title" | "summary";
type MediaPurpose = "body" | "cover";

type MetadataSuggestion = {
  slug?: string;
  seo_title?: string;
  seo_description?: string;
};

type TaxonomySuggestion = {
  category?: Category;
  tags: string[];
};

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

function selectValue(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function InspectorSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details open className="relative border-b py-4 last:border-b-0">
      <summary className="cursor-pointer select-none pr-12 text-sm font-semibold">
        {title}
      </summary>
      {action ? (
        <div className="absolute right-0 top-2.5 z-10">{action}</div>
      ) : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </details>
  );
}

function FieldActionHeader({
  label,
  actionLabel,
  onAction,
  disabled = false,
  loading = false,
  required = false,
}: {
  label: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
}) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
      <div className="text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        size="small"
        variant="text"
        icon={<Sparkles />}
        onClick={onAction}
        disabled={disabled || loading}
        loading={loading}
        aria-label={actionLabel}
        title={actionLabel}
        className="size-8 px-0"
      />
    </div>
  );
}

function versionExcerpt(content: string) {
  return (
    content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")) ?? "暂无版本摘要"
  );
}

function headingSelection(content: string, item: MarkdownTOCItem) {
  const normalized = content.replace(/\r\n/g, "\n");
  let offset = 0;
  for (const line of normalized.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (
      match &&
      match[1].length === item.level &&
      normalizedMarkdownText(match[2]) === item.text
    ) {
      return { start: offset, end: offset + line.length };
    }
    offset += line.length + 1;
  }
  return null;
}

export default function PostEditor() {
  const { id } = useParams();
  const isNew = !id;
  const allowed = useAdminGuard(
    isNew ? "/admin/posts/new" : `/admin/posts/${id}/edit`,
  );
  const navigate = useNavigate();
  const { notify } = useAppFeedback();
  const { cannot } = useAbility();
  const [post, setPost] = useState<Post>(emptyPost);
  const isReadOnly = Boolean(post.id && cannot("edit", "post", post));

  const editorTitle = isNew
    ? post.title
      ? `新建文章: ${post.title}`
      : "新建文章"
    : isReadOnly
      ? post.title
        ? `查看: ${post.title}`
        : "查看文章"
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
  const [conflict, setConflict] = useState(false);
  const [latestPost, setLatestPost] = useState<Post | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<PostVersion | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  const [editorMode, setEditorMode] = useState<MarkdownEditorMode>("edit");
  const [navigatorMode, setNavigatorMode] = useState<NavigatorMode>("outline");
  const [editorSelection, setEditorSelection] =
    useState<MarkdownEditorSelection | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);

  const [fieldLoading, setFieldLoading] = useState<FieldSuggestionTask | null>(
    null,
  );
  const [titleCandidates, setTitleCandidates] = useState<string[]>([]);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [summaryCandidates, setSummaryCandidates] = useState<string[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataSuggestion, setMetadataSuggestion] =
    useState<MetadataSuggestion | null>(null);
  const [metadataSelection, setMetadataSelection] = useState<string[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [taxonomySuggestion, setTaxonomySuggestion] =
    useState<TaxonomySuggestion | null>(null);
  const [taxonomySelection, setTaxonomySelection] = useState<string[]>([]);

  const [writingOpen, setWritingOpen] = useState(false);
  const [writingPrompt, setWritingPrompt] = useState("");
  const [mediaSource, setMediaSource] = useState<MediaSource>(null);
  const [mediaPurpose, setMediaPurpose] = useState<MediaPurpose>("body");

  const dirty = useRef(false);
  const savingRef = useRef(false);

  const recordConflict = (reason: unknown) => {
    if (
      typeof reason === "object" &&
      reason !== null &&
      "status" in reason &&
      reason.status === 409
    ) {
      setConflict(true);
      return;
    }
    if (reason instanceof Error && reason.message.includes("409")) {
      setConflict(true);
    }
  };

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
      requests.push(postsApi.getVersions(id).then(setVersions));
    }
    Promise.all(requests)
      .catch((reason: Error) => {
        setError(reason.message);
        notify(reason.message, "error");
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

  const invalidateDerivedSuggestions = (key: keyof Post) => {
    if (key === "title" || key === "summary" || key === "content") {
      setMetadataSuggestion(null);
      setMetadataSelection([]);
      setTaxonomySuggestion(null);
      setTaxonomySelection([]);
    }
    if (key === "title") {
      setTitleCandidates([]);
      setSelectedTitle(null);
    }
    if (key === "summary") {
      setSummaryCandidates([]);
      setSelectedSummary(null);
    }
  };

  const update = <K extends keyof Post>(key: K, value: Post[K]) => {
    setPost((current) => ({ ...current, [key]: value }));
    dirty.current = true;
    setSavedAt(null);
    invalidateDerivedSuggestions(key);
  };

  const persist = useCallback(
    async (status: PostStatus, automatic = false) => {
      if (!post.title.trim()) {
        const message = "请先填写文章标题。";
        if (!automatic) {
          setError(message);
          notify(message, "error");
        }
        return;
      }
      if (status !== "draft" && !post.content.trim()) {
        const message = "发布前需要填写正文。";
        setError(message);
        notify(message, "error");
        return;
      }
      if (status === "scheduled" && !post.scheduled_at) {
        const message = "定时发布需要选择发布时间。";
        setError(message);
        notify(message, "error");
        return;
      }
      if (savingRef.current || conflict || isReadOnly) return;

      savingRef.current = true;
      setSaving(true);
      setError("");
      try {
        const payload = { ...post, status, tags: post.tags.filter(Boolean) };
        const saved = post.id
          ? await postsApi.updatePost(post.id, payload)
          : await postsApi.createPost(payload);
        setPost((current) => {
          if (current !== post) {
            dirty.current = true;
            return { ...current, revision: saved.revision };
          }
          dirty.current = false;
          return saved;
        });
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
        recordConflict(reason);
        const message =
          reason instanceof Error ? reason.message : "保存失败，请稍后重试。";
        setError(message);
        notify(message, "error");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [conflict, isReadOnly, navigate, notify, post],
  );

  useEffect(() => {
    if (
      isReadOnly ||
      conflict ||
      saving ||
      !dirty.current ||
      !post.id ||
      !post.title.trim() ||
      post.status !== "draft"
    ) {
      return;
    }
    const timer = window.setTimeout(() => void persist("draft", true), 1800);
    return () => window.clearTimeout(timer);
  }, [conflict, isReadOnly, persist, post, saving]);

  const outline = useMemo(
    () => extractMarkdownTOC(post.content),
    [post.content],
  );

  const leaveEditor = () => {
    if (dirty.current) setConfirmExit(true);
    else navigate("/admin/posts");
  };

  const inspectLatest = async () => {
    try {
      setLatestPost(await postsApi.getAdminPost(post.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取最新版本失败");
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(post, null, 2));
      notify("未保存内容已复制", "success");
    } catch {
      notify("复制失败，请手动保留编辑内容", "error");
    }
  };

  const restoreVersion = async () => {
    if (!post.id || !restoreTarget || isReadOnly) return;
    try {
      const restored =
        post.revision === undefined
          ? await postsApi.restoreVersion(post.id, restoreTarget.id)
          : await postsApi.restoreVersion(
              post.id,
              restoreTarget.id,
              post.revision,
            );
      setPost(restored);
      setPublishIntent(restored.status || "draft");
      dirty.current = false;
      setSavedAt(new Date());
      setRestoreTarget(null);
      setNavigatorMode("outline");
      notify("已成功恢复历史版本。", "success");
    } catch (reason) {
      recordConflict(reason);
      const message = reason instanceof Error ? reason.message : "版本恢复失败";
      setError(message);
      notify(message, "error");
    }
  };

  const requestFieldSuggestions = async (task: FieldSuggestionTask) => {
    if (!post.title.trim() && !post.content.trim()) {
      notify("先写下标题或正文，AI 才能理解这篇文章。", "error");
      return;
    }
    setFieldLoading(task);
    if (task === "title") {
      setTitleCandidates([]);
      setSelectedTitle(null);
    } else {
      setSummaryCandidates([]);
      setSelectedSummary(null);
    }
    try {
      const response = await agentApi.getDraftAssist({
        task,
        title: post.title,
        summary: post.summary,
        content: post.content,
        categories: categories.map((category) => category.name),
      });
      const candidates = cleanAiSuggestions(response.suggestions);
      if (!candidates.length) {
        notify("这次没有生成可用候选，请稍后重试。", "error");
        return;
      }
      if (task === "title") {
        setTitleCandidates(candidates);
        setSelectedTitle(candidates[0] ?? null);
      } else {
        setSummaryCandidates(candidates);
        setSelectedSummary(candidates[0] ?? null);
      }
    } catch (reason) {
      recordConflict(reason);
      notify(
        reason instanceof Error ? reason.message : "生成候选失败，请稍后重试。",
        "error",
      );
    } finally {
      setFieldLoading(null);
    }
  };

  const requestMetadataSuggestions = async () => {
    if (!post.title.trim() && !post.content.trim()) {
      notify("先写下标题或正文，AI 才能优化路径与 SEO。", "error");
      return;
    }
    setMetadataLoading(true);
    setMetadataSuggestion(null);
    setMetadataSelection([]);
    try {
      const response = await agentApi.getDraftAssist({
        task: "seo",
        title: post.title,
        summary: post.summary,
        content: post.content,
      });
      const metadata = metadataFromAssist(response);
      const suggestion: MetadataSuggestion = {
        slug: metadata?.slug?.trim(),
        seo_title: metadata?.seo_title?.trim(),
        seo_description: metadata?.seo_description?.trim(),
      };
      const keys = Object.entries(suggestion)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key);
      if (!keys.length) {
        notify("未能生成有效的路径与 SEO 建议，请稍后重试。", "error");
        return;
      }
      setMetadataSuggestion(suggestion);
      setMetadataSelection(keys);
    } catch (reason) {
      recordConflict(reason);
      notify(
        reason instanceof Error ? reason.message : "生成 SEO 建议失败",
        "error",
      );
    } finally {
      setMetadataLoading(false);
    }
  };

  const applyMetadataSuggestions = () => {
    if (!metadataSuggestion) return;
    const selected = new Set(metadataSelection);
    setPost((current) => ({
      ...current,
      slug:
        selected.has("slug") && metadataSuggestion.slug
          ? metadataSuggestion.slug
          : current.slug,
      seo_title:
        selected.has("seo_title") && metadataSuggestion.seo_title
          ? metadataSuggestion.seo_title
          : current.seo_title,
      seo_description:
        selected.has("seo_description") && metadataSuggestion.seo_description
          ? metadataSuggestion.seo_description
          : current.seo_description,
    }));
    dirty.current = true;
    setSavedAt(null);
    setMetadataSuggestion(null);
    setMetadataSelection([]);
  };

  const requestTaxonomySuggestions = async () => {
    if (!post.title.trim() && !post.content.trim()) {
      notify("先写下标题或正文，AI 才能推荐分类与标签。", "error");
      return;
    }
    setTaxonomyLoading(true);
    setTaxonomySuggestion(null);
    setTaxonomySelection([]);
    try {
      const response = await agentApi.getDraftAssist({
        task: "metadata_all",
        title: post.title,
        summary: post.summary,
        content: post.content,
        categories: categories.map((category) => category.name),
      });
      const metadata = metadataFromAssist(response);
      const categoryName = metadata?.category?.trim();
      const category = categoryName
        ? categories.find(
            (candidate) =>
              candidate.name.toLowerCase() === categoryName.toLowerCase(),
          )
        : undefined;
      const tags: string[] = Array.isArray(metadata?.tags)
        ? Array.from(
            new Set<string>(
              metadata.tags
                .map((tag) => String(tag).trim())
                .filter((tag) => tag && !post.tags.includes(tag)),
            ),
          )
        : [];
      const suggestion: TaxonomySuggestion = { category, tags };
      const keys = [
        category ? "category" : null,
        tags.length ? "tags" : null,
      ].filter((key): key is string => Boolean(key));
      if (!keys.length) {
        notify(
          categoryName && !category
            ? `AI 推荐了不存在的分类“${categoryName}”，已按规则忽略。`
            : "未能生成可用的分类与标签建议。",
          "error",
        );
        return;
      }
      setTaxonomySuggestion(suggestion);
      setTaxonomySelection(keys);
    } catch (reason) {
      recordConflict(reason);
      notify(
        reason instanceof Error ? reason.message : "分类与标签建议生成失败",
        "error",
      );
    } finally {
      setTaxonomyLoading(false);
    }
  };

  const applyTaxonomySuggestions = () => {
    if (!taxonomySuggestion) return;
    const selected = new Set(taxonomySelection);
    setPost((current) => ({
      ...current,
      category_id:
        selected.has("category") && taxonomySuggestion.category
          ? taxonomySuggestion.category.id
          : current.category_id,
      tags: selected.has("tags")
        ? Array.from(new Set([...current.tags, ...taxonomySuggestion.tags]))
        : current.tags,
    }));
    dirty.current = true;
    setSavedAt(null);
    setTaxonomySuggestion(null);
    setTaxonomySelection([]);
  };

  const openWritingAssistant = (prompt: string) => {
    setWritingPrompt(prompt);
    setWritingOpen(true);
  };

  const applyWritingResult = (result: string, mode: WritingApplyMode) => {
    if (
      mode === "replace-selection" &&
      editorSelection &&
      editorSelection.end > editorSelection.start
    ) {
      const next = `${post.content.slice(0, editorSelection.start)}${result}${post.content.slice(editorSelection.end)}`;
      const selectionStart = editorSelection.start;
      update("content", next);
      setEditorMode("edit");
      queueMicrotask(() =>
        editorRef.current?.setSelection(
          selectionStart,
          selectionStart + result.length,
        ),
      );
      return;
    }
    update(
      "content",
      mode === "replace"
        ? result
        : post.content
          ? `${post.content.trimEnd()}\n\n${result}`
          : result,
    );
  };

  const openMedia = (
    purpose: MediaPurpose,
    source: Exclude<MediaSource, null>,
  ) => {
    setMediaPurpose(purpose);
    setMediaSource(source);
  };

  const applyMedia = (result: MediaResult) => {
    if (mediaPurpose === "cover") {
      setPost((current) => ({
        ...current,
        cover_url: result.url,
        cover_alt: result.alt,
      }));
      dirty.current = true;
      setSavedAt(null);
      notify("已更新文章封面。", "success");
      return;
    }

    const markdown = `![${result.alt || "文章插图"}](${result.url})`;
    setEditorMode("edit");
    queueMicrotask(() => {
      editorRef.current?.insertText(`\n\n${markdown}\n`, {
        replaceSelection: false,
      });
      editorRef.current?.focus();
    });
    notify("已在编辑位置插入图片。", "success");
  };

  const focusOutlineItem = (item: MarkdownTOCItem) => {
    const selection = headingSelection(post.content, item);
    if (!selection) return;
    setEditorMode("edit");
    queueMicrotask(() => {
      editorRef.current?.setSelection(selection.start, selection.end);
      editorRef.current?.focus();
    });
  };

  const openFrontsitePreview = async () => {
    if (savingRef.current || conflict) return;
    let currentPost = post;
    if (dirty.current || !currentPost.id) {
      if (!currentPost.title.trim()) {
        const message = "请先填写文章标题。";
        setError(message);
        notify(message, "error");
        return;
      }
      savingRef.current = true;
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
        recordConflict(reason);
        const message =
          reason instanceof Error ? reason.message : "保存失败，无法开启预览。";
        setError(message);
        notify(message, "error");
        return;
      } finally {
        savingRef.current = false;
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
    publishIntent === "scheduled"
      ? "scheduled"
      : publishIntent === "draft"
        ? "draft"
        : "published";
  const primaryLabel =
    publishIntent === "scheduled"
      ? "安排发布"
      : publishIntent === "draft"
        ? post.status === "published"
          ? "下架为草稿"
          : "保存草稿"
        : post.status === "published"
          ? "更新文章"
          : "发布";

  if (!isNew && error && !post.id) {
    return (
      <Alert
        type="error"
        showIcon
        title="无法编辑文章"
        description={error}
        action={
          <Button
            variant="outline"
            icon={<ArrowLeft />}
            onClick={() => navigate("/admin/posts")}
          >
            返回文章列表
          </Button>
        }
      />
    );
  }

  if (!allowed || loading) {
    return (
      <Card
        padding="base"
        aria-label={isNew ? "新建文章编辑器加载中" : "文章编辑器加载中"}
      >
        <div className="flex flex-col gap-5" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-64" />
          </div>
          <div className="grid gap-5 xl:grid-cols-[14rem_minmax(0,1fr)_20rem]">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-[38rem] w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </Card>
    );
  }

  const commandBar = (
    <>
      <Button variant="text" onClick={leaveEditor} icon={<ArrowLeft />}>
        返回文章列表
      </Button>
      <div
        className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {isReadOnly ? (
          <>
            <Eye className="size-4" /> 只读模式（他人文章）
          </>
        ) : saving ? (
          "正在保存…"
        ) : savedAt ? (
          <>
            <Check className="size-4" /> 已于{" "}
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
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button
          variant="outline"
          type="button"
          onClick={() => void openFrontsitePreview()}
          disabled={saving}
          icon={<ExternalLink />}
        >
          预览前台页面
        </Button>
        {!isReadOnly &&
        post.status !== "published" &&
        publishIntent !== "draft" ? (
          <Button
            variant="outline"
            type="button"
            onClick={() => void persist("draft")}
            disabled={saving}
            icon={<Save />}
          >
            保存草稿
          </Button>
        ) : null}
        {!isReadOnly ? (
          <Button
            variant="solid"
            color="primary"
            type="button"
            onClick={() => void persist(primaryStatus)}
            disabled={saving}
            icon={<Send />}
          >
            {primaryLabel}
          </Button>
        ) : null}
      </div>
    </>
  );

  const navigatorPanel = (
    <div className="min-w-0">
      <Tabs<NavigatorMode>
        aria-label="文档导航视图"
        size="small"
        activeKey={navigatorMode}
        onChange={setNavigatorMode}
        items={[
          { key: "outline", label: `大纲 ${outline.length}` },
          { key: "history", label: `历史 ${versions.length}` },
        ]}
      />
      <div className="mt-3 flex flex-col gap-1.5">
        {navigatorMode === "outline" ? (
          outline.length ? (
            <TooltipProvider delayDuration={350}>
              {outline.map((item) => (
                <Tooltip key={`${item.id}-${item.level}`}>
                  <TooltipTrigger asChild>
                    <ChoiceButton
                      type="button"
                      aria-label={`跳转到 ${item.text}`}
                      className="w-full min-w-0 overflow-hidden rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&>span]:min-w-0 [&>span]:w-full"
                      style={{
                        paddingLeft: `${8 + Math.max(0, item.level - 2) * 12}px`,
                      }}
                      onClick={() => focusOutlineItem(item)}
                    >
                      <span className="block min-w-0 truncate">
                        {item.text}
                      </span>
                    </ChoiceButton>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-80">
                    {item.text}
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          ) : (
            <Text size="sm" tone="muted">
              在正文中添加 Markdown 标题后，大纲会自动生成。
            </Text>
          )
        ) : versions.length ? (
          <div className="flex flex-col gap-1" data-slot="post-history-list">
            {versions.map((version) => (
              <ChoiceButton
                key={version.id}
                type="button"
                className="h-auto min-h-0 w-full items-start rounded-md px-2.5 py-2.5 text-left text-sm whitespace-normal transition-colors hover:bg-muted/70 [&>span]:min-w-0 [&>span]:w-full"
                onClick={() => setRestoreTarget(version)}
                aria-label={`查看 ${version.title || "无标题草稿"} 历史版本`}
              >
                <span className="flex min-w-0 w-full flex-col gap-1">
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      {version.title || "无标题草稿"}
                    </span>
                    <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
                      {new Date(version.created_at).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs font-normal leading-5 text-muted-foreground">
                    {versionExcerpt(version.content)}
                  </span>
                </span>
              </ChoiceButton>
            ))}
          </div>
        ) : (
          <Empty description="暂无历史版本记录" />
        )}
      </div>
    </div>
  );

  const metadataItems: {
    key: string;
    label: string;
    value: string;
    monospace?: boolean;
  }[] = metadataSuggestion
    ? [
        ...(metadataSuggestion.slug
          ? [
              {
                key: "slug",
                label: "Slug",
                value: metadataSuggestion.slug,
                monospace: true,
              },
            ]
          : []),
        ...(metadataSuggestion.seo_title
          ? [
              {
                key: "seo_title",
                label: "SEO 标题",
                value: metadataSuggestion.seo_title,
              },
            ]
          : []),
        ...(metadataSuggestion.seo_description
          ? [
              {
                key: "seo_description",
                label: "SEO 描述",
                value: metadataSuggestion.seo_description,
              },
            ]
          : []),
      ]
    : [];

  const taxonomyItems = taxonomySuggestion
    ? [
        taxonomySuggestion.category
          ? {
              key: "category",
              label: "分类",
              value: taxonomySuggestion.category.name,
            }
          : null,
        taxonomySuggestion.tags.length
          ? {
              key: "tags",
              label: "标签补充",
              value: taxonomySuggestion.tags.join("、"),
            }
          : null,
      ].filter((item): item is { key: string; label: string; value: string } =>
        Boolean(item),
      )
    : [];

  const inspector = (
    <fieldset disabled={isReadOnly} className="min-w-0 border-0 p-0">
      <div className="min-h-9 border-b pb-3">
        <Text className="font-semibold">属性</Text>
        <Text size="xs" tone="muted" className="mt-0.5 block">
          发布、组织、封面与 SEO。
        </Text>
      </div>

      <InspectorSection title="发布设置">
        <Field label="状态">
          <Select
            aria-label="状态"
            value={publishIntent}
            onChange={(value) => {
              setPublishIntent(selectValue(value) as PostStatus);
              dirty.current = true;
              setSavedAt(null);
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
              aria-label="发布时间"
              type="datetime-local"
              value={post.scheduled_at?.slice(0, 16) || ""}
              onChange={(event) => update("scheduled_at", event.target.value)}
            />
          </Field>
        ) : null}
      </InspectorSection>

      <InspectorSection
        title="分类与标签"
        action={
          !isReadOnly ? (
            <Button
              type="button"
              size="small"
              variant="text"
              icon={<Sparkles />}
              aria-label="AI 推荐分类与标签"
              title="AI 推荐分类与标签"
              className="size-8 px-0"
              loading={taxonomyLoading}
              disabled={
                taxonomyLoading || (!post.title.trim() && !post.content.trim())
              }
              onClick={() => void requestTaxonomySuggestions()}
            />
          ) : undefined
        }
      >
        {taxonomySuggestion && taxonomyItems.length ? (
          <AISuggestionReview
            aria-label="AI 分类与标签建议"
            groupLabel="分类与标签建议"
            description="分类只从现有分类中推荐；标签只补充勾选的新标签，不覆盖手工标签。"
            items={taxonomyItems}
            selectedKeys={taxonomySelection}
            onSelectedKeysChange={setTaxonomySelection}
            onCancel={() => {
              setTaxonomySuggestion(null);
              setTaxonomySelection([]);
            }}
            onRegenerate={() => void requestTaxonomySuggestions()}
            onApply={applyTaxonomySuggestions}
          />
        ) : null}
        <Field label="分类">
          <Select
            aria-label="分类"
            value={String(post.category_id || "")}
            onChange={(value) => {
              const next = selectValue(value);
              update("category_id", next ? Number(next) : null);
            }}
          >
            <option value="">未分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="标签" hint="使用逗号分隔。">
          <Input
            aria-label="标签"
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
        </Field>
      </InspectorSection>

      <InspectorSection
        title="封面"
        action={
          !isReadOnly ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="small"
                  variant="text"
                  icon={<ImageIcon />}
                  aria-label="选择文章封面"
                  title="选择文章封面"
                  className="size-8 px-0"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onSelect={() => openMedia("cover", "library")}
                >
                  从媒体库选择
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openMedia("cover", "upload")}>
                  上传图片
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => openMedia("cover", "ai")}>
                  AI 生成封面
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      >
        <Field label="封面 URL">
          <Input
            aria-label="封面 URL"
            value={post.cover_url || ""}
            onChange={(event) => update("cover_url", event.target.value)}
            placeholder="/media/cover.webp"
          />
        </Field>
        <Field label="替代文本">
          <Input
            aria-label="替代文本"
            value={post.cover_alt || ""}
            onChange={(event) => update("cover_alt", event.target.value)}
            placeholder="描述封面图场景与主题"
          />
        </Field>
      </InspectorSection>

      <InspectorSection
        title="路径与 SEO"
        action={
          !isReadOnly ? (
            <Button
              type="button"
              size="small"
              variant="text"
              icon={<Sparkles />}
              aria-label="AI 优化路径与 SEO"
              title="AI 优化路径与 SEO"
              className="size-8 px-0"
              loading={metadataLoading}
              disabled={
                metadataLoading || (!post.title.trim() && !post.content.trim())
              }
              onClick={() => void requestMetadataSuggestions()}
            />
          ) : undefined
        }
      >
        {metadataSuggestion && metadataItems.length ? (
          <AISuggestionReview
            aria-label="AI 路径与 SEO 建议"
            groupLabel="路径与 SEO 建议"
            description="审阅后只应用勾选的路径与 SEO 修改。"
            items={metadataItems}
            selectedKeys={metadataSelection}
            onSelectedKeysChange={setMetadataSelection}
            onCancel={() => {
              setMetadataSuggestion(null);
              setMetadataSelection([]);
            }}
            onRegenerate={() => void requestMetadataSuggestions()}
            onApply={applyMetadataSuggestions}
          />
        ) : null}
        <Field
          label="访问路径 (Slug)"
          required
          hint="访问路径为 /articles/<slug>"
        >
          <Input
            aria-label="访问路径 (Slug)"
            className="font-mono"
            value={post.slug}
            onChange={(event) => update("slug", event.target.value)}
            required
          />
        </Field>
        <Field label="SEO 标题" hint={`${(post.seo_title || "").length}/60`}>
          <Input
            aria-label="SEO 标题"
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
            aria-label="SEO 描述"
            rows={4}
            value={post.seo_description || ""}
            maxLength={160}
            onChange={(event) => update("seo_description", event.target.value)}
            placeholder="留空时默认使用摘要"
          />
        </Field>
      </InspectorSection>
    </fieldset>
  );

  const aiToolbarActions = !isReadOnly ? (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="small"
            variant="text"
            icon={<Sparkles />}
            aria-label="AI 写作"
            title="AI 写作"
            className="size-8 px-0"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {editorSelection?.text ? (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  openWritingAssistant(
                    "保持原意，润色当前选中的文字，提升连贯性和表达质量",
                  )
                }
              >
                润色所选
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  openWritingAssistant(
                    "扩写当前选中的文字，补充必要背景、技术细节和例子",
                  )
                }
              >
                扩写所选
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  openWritingAssistant("压缩当前选中的文字，保留核心事实和结论")
                }
              >
                缩写所选
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  openWritingAssistant(
                    "基于标题和摘要撰写结构严谨的完整文章初稿",
                  )
                }
              >
                起草文章
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  openWritingAssistant(
                    "延续当前正文继续写作，保持已有结构、语气和 Markdown 风格",
                  )
                }
              >
                继续写作
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  openWritingAssistant(
                    "重构全文结构，减少重复，让论点和结论更清晰",
                  )
                }
              >
                重构全文
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openWritingAssistant("")}>
            自定义指令…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="small"
            variant="text"
            icon={<ImageIcon />}
            aria-label="插图"
            title="插图"
            className="size-8 px-0"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onSelect={() => openMedia("body", "library")}>
            从媒体库选择
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openMedia("body", "upload")}>
            上传图片
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openMedia("body", "ai")}>
            AI 生成配图
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {conflict ? (
        <Alert
          type="warning"
          showIcon
          title="文章已有新版本"
          description="你的未保存内容仍保留。请先比较或复制当前草稿，再决定是否加载服务器最新版本。"
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="small" onClick={() => void inspectLatest()}>
                查看最新版本
              </Button>
              <Button size="small" onClick={() => void copyDraft()}>
                复制未保存内容
              </Button>
            </div>
          }
        />
      ) : null}
      {latestPost ? (
        <Card padding="base">
          <div className="flex flex-col gap-3">
            <Text className="font-semibold">
              服务器最新版本：{latestPost.title || "无标题"}
            </Text>
            <Text size="sm" tone="muted">
              Revision {latestPost.revision ?? "-"}
            </Text>
            <div className="max-h-48 overflow-auto rounded-md bg-muted/20 p-3 text-sm">
              <MarkdownRenderer content={latestPost.content || "暂无正文"} />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setConfirmReload(true)}>
                加载最新版本
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
      {error ? <Alert type="error" showIcon title={error} /> : null}

      <DocumentEditorShell
        aria-label="文章编辑器"
        header={commandBar}
        navigator={navigatorPanel}
        inspector={inspector}
        navigatorAriaLabel="编辑器导航"
        canvasAriaLabel="文章编辑画布"
        inspectorAriaLabel="文章元数据 Inspector"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            {!isReadOnly ? (
              <FieldActionHeader
                label="标题"
                required
                actionLabel="AI 生成标题候选"
                onAction={() => void requestFieldSuggestions("title")}
                loading={fieldLoading === "title"}
                disabled={fieldLoading !== null && fieldLoading !== "title"}
              />
            ) : null}
            <Field label="标题" required hideLabel={!isReadOnly}>
              <Textarea
                aria-label="标题"
                rows={2}
                value={post.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="写一个清晰、具体的标题"
                disabled={isReadOnly}
                readOnly={isReadOnly}
                required
              />
            </Field>
            {titleCandidates.length ? (
              <AISuggestionPicker
                className="mt-2"
                aria-label="标题 AI 建议"
                groupLabel="标题候选"
                description="选择一个候选，再统一应用到标题。"
                options={titleCandidates.map((value) => ({ value }))}
                value={selectedTitle}
                onValueChange={setSelectedTitle}
                onDismiss={() => {
                  setTitleCandidates([]);
                  setSelectedTitle(null);
                }}
                onRegenerate={() => void requestFieldSuggestions("title")}
                onApply={(value) => {
                  update("title", value);
                  setTitleCandidates([]);
                  setSelectedTitle(null);
                }}
              />
            ) : null}
          </div>

          <div>
            {!isReadOnly ? (
              <FieldActionHeader
                label="摘要"
                actionLabel="AI 根据正文生成摘要"
                onAction={() => void requestFieldSuggestions("summary")}
                loading={fieldLoading === "summary"}
                disabled={
                  !post.content.trim() ||
                  (fieldLoading !== null && fieldLoading !== "summary")
                }
              />
            ) : null}
            <Field
              label="摘要"
              hideLabel={!isReadOnly}
              hint={`${post.summary.length}/300`}
            >
              <Textarea
                aria-label="摘要"
                rows={3}
                maxLength={300}
                value={post.summary}
                onChange={(event) => update("summary", event.target.value)}
                placeholder="用两三句话说明文章解决的问题"
                disabled={isReadOnly}
                readOnly={isReadOnly}
              />
            </Field>
            {summaryCandidates.length ? (
              <AISuggestionPicker
                className="mt-2"
                aria-label="摘要 AI 建议"
                groupLabel="摘要候选"
                description="从候选摘要中选择一个，再应用到当前字段。"
                options={summaryCandidates.map((value) => ({ value }))}
                value={selectedSummary}
                onValueChange={setSelectedSummary}
                onDismiss={() => {
                  setSummaryCandidates([]);
                  setSelectedSummary(null);
                }}
                onRegenerate={() => void requestFieldSuggestions("summary")}
                onApply={(value) => {
                  update("summary", value);
                  setSummaryCandidates([]);
                  setSelectedSummary(null);
                }}
              />
            ) : null}
          </div>

          <div>
            <div className="mb-2">
              <Text className="font-medium">正文</Text>
              <Text size="xs" tone="muted" className="mt-1 block">
                Markdown 编辑、分屏与预览共用同一编辑器。
              </Text>
            </div>
            <MarkdownEditor
              ref={editorRef}
              value={post.content}
              onChange={(value) => update("content", value)}
              mode={editorMode}
              onModeChange={setEditorMode}
              onSelectionChange={setEditorSelection}
              renderPreview={(value) => (
                <div className="editor-preview">
                  <MarkdownRenderer
                    content={value || "开始写作后，预览会出现在这里。"}
                  />
                </div>
              )}
              toolbarActions={aiToolbarActions}
              placeholder={"## 从问题开始\n\n写下背景、约束、判断与实现…"}
              readOnly={isReadOnly}
              textareaAriaLabel="文章正文 Markdown"
              previewAriaLabel="文章预览"
              editorClassName="min-h-[28rem]"
            />
          </div>
        </div>
      </DocumentEditorShell>

      <EditorWritingDialog
        open={writingOpen && !isReadOnly}
        onOpenChange={setWritingOpen}
        documentLabel="文章"
        title={post.title}
        summary={post.summary}
        content={post.content}
        selection={editorSelection}
        initialPrompt={writingPrompt}
        onApply={applyWritingResult}
      />

      <EditorMediaSourceDialog
        source={mediaSource}
        onSourceChange={setMediaSource}
        title={post.title}
        summary={post.summary}
        content={post.content}
        defaultAlt={
          mediaPurpose === "cover"
            ? post.cover_alt ||
              (post.title.trim() ? `${post.title.trim()}封面` : "文章封面")
            : post.title.trim()
              ? `${post.title.trim()}插图`
              : "文章插图"
        }
        purpose={mediaPurpose === "cover" ? "文章封面" : "正文插图"}
        onUse={applyMedia}
      />

      <Modal
        open={restoreTarget !== null}
        title="恢复历史版本"
        description={
          restoreTarget
            ? `恢复 ${new Date(restoreTarget.created_at).toLocaleString("zh-CN")} 的版本？当前内容会先保留为历史版本。`
            : ""
        }
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        footer={
          <>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>
              取消
            </Button>
            <Button
              variant="solid"
              color="primary"
              onClick={() => void restoreVersion()}
            >
              恢复版本
            </Button>
          </>
        }
      />

      <Modal
        open={confirmReload}
        title="替换未保存内容？"
        description="当前未保存内容将被服务器最新版本替换，请先复制保留。"
        onOpenChange={setConfirmReload}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmReload(false)}>
              取消
            </Button>
            <Button
              variant="solid"
              color="error"
              onClick={() => {
                if (!latestPost) return;
                setPost(latestPost);
                setPublishIntent(latestPost.status || "draft");
                dirty.current = false;
                setConflict(false);
                setError("");
                setLatestPost(null);
                setConfirmReload(false);
              }}
            >
              确认替换并加载
            </Button>
          </>
        }
      />

      <Modal
        open={confirmExit}
        title="放弃未保存的更改？"
        description="离开编辑器后，尚未保存的内容会丢失。"
        onOpenChange={setConfirmExit}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmExit(false)}>
              继续编辑
            </Button>
            <Button
              variant="solid"
              color="error"
              onClick={() => navigate("/admin/posts")}
            >
              放弃并离开
            </Button>
          </>
        }
      />
    </div>
  );
}
