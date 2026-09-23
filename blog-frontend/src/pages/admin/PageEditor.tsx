import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
import {
  Alert,
  Button,
  Card,
  Checkbox,
  CheckboxField,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Text,
  Textarea,
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

import { useAbility } from "../../abilities";
import { agentApi } from "../../api/agent";
import { pagesApi } from "../../api/pages";
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
import { FieldActionHeader, InspectorSection } from "../../components/editor/EditorFieldChrome";
import {
  cleanAiSuggestions,
  metadataFromAssist,
} from "../../components/editor/editor-ai";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { usePageTitle } from "../../hooks/usePageTitle";
import type { CustomPage, PageTemplate, PostStatus } from "../../types/blog";

type FieldSuggestionTask = "title" | "summary";
type MetadataSuggestion = {
  slug?: string;
  seo_title?: string;
  seo_description?: string;
};

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

function selectValue(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export default function PageEditor() {
  const { id } = useParams();
  const isNew = !id;
  const allowed = useAdminGuard(
    isNew ? "/admin/pages/new" : `/admin/pages/${id}/edit`,
  );
  const navigate = useNavigate();
  const { notify } = useAppFeedback();
  const { cannot } = useAbility();

  const [page, setPage] = useState<CustomPage>(emptyPage);
  const isReadOnly = Boolean(!isNew && cannot("edit", "page"));
  const [publishIntent, setPublishIntent] = useState<PostStatus>("draft");
  const editorTitle = isNew
    ? page.title
      ? `新建单页: ${page.title}`
      : "新建单页"
    : isReadOnly
      ? page.title
        ? `查看: ${page.title}`
        : "查看单页"
      : page.title
        ? `编辑: ${page.title}`
        : "编辑单页";
  usePageTitle(editorTitle, { admin: true });

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const dirty = useRef(false);

  const [editorMode, setEditorMode] = useState<MarkdownEditorMode>("edit");
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

  const [writingOpen, setWritingOpen] = useState(false);
  const [writingPrompt, setWritingPrompt] = useState("");
  const [mediaSource, setMediaSource] = useState<MediaSource>(null);

  useEffect(() => {
    if (!allowed || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    pagesApi
      .getAdminPage(id)
      .then((data) => {
        setPage(data);
        setPublishIntent(data.status || "draft");
        setError("");
      })
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

  const invalidateDerivedSuggestions = (key: keyof CustomPage) => {
    if (key === "title" || key === "summary" || key === "content") {
      setMetadataSuggestion(null);
      setMetadataSelection([]);
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

  const update = <K extends keyof CustomPage>(key: K, value: CustomPage[K]) => {
    if (isReadOnly) return;
    setPage((current) => ({ ...current, [key]: value }));
    dirty.current = true;
    setSavedAt(null);
    invalidateDerivedSuggestions(key);
  };

  const persist = useCallback(
    async (status: PostStatus, automatic = false) => {
      if (isReadOnly) return;
      if (!page.title.trim()) {
        const message = "请先填写单页标题。";
        if (!automatic) {
          setError(message);
          notify(message, "error");
        }
        return;
      }
      if (!page.slug.trim()) {
        const message = "请填写单页访问路径 (Slug)。";
        if (!automatic) {
          setError(message);
          notify(message, "error");
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
        const result = page.id
          ? await pagesApi.updatePage(page.id, payload)
          : await pagesApi.createPage(payload);
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
        if (!page.id)
          navigate(`/admin/pages/${result.id}/edit`, { replace: true });
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : "保存失败，请稍后重试。";
        setError(message);
        notify(message, "error");
      } finally {
        setSaving(false);
      }
    },
    [isReadOnly, navigate, notify, page],
  );

  const leaveEditor = () => {
    if (dirty.current) setConfirmExit(true);
    else navigate("/admin/pages");
  };

  const requestFieldSuggestions = async (task: FieldSuggestionTask) => {
    if (!page.title.trim() && !page.content.trim()) {
      notify("请先填写标题或正文，以便 AI 分析生成。", "error");
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
        title: page.title,
        summary: page.summary,
        content: page.content,
      });
      const candidates = cleanAiSuggestions(response.suggestions);
      if (!candidates.length) {
        notify("AI 未能生成建议，请稍后重试。", "error");
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
      notify(reason instanceof Error ? reason.message : "AI 生成失败", "error");
    } finally {
      setFieldLoading(null);
    }
  };

  const requestMetadataSuggestions = async () => {
    if (!page.title.trim() && !page.content.trim()) {
      notify("请先填写标题或正文，以便 AI 分析生成 SEO。", "error");
      return;
    }
    setMetadataLoading(true);
    setMetadataSuggestion(null);
    setMetadataSelection([]);
    try {
      const response = await agentApi.getDraftAssist({
        task: "seo",
        title: page.title,
        summary: page.summary,
        content: page.content,
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
      notify(
        reason instanceof Error ? reason.message : "生成 SEO 建议失败",
        "error",
      );
    } finally {
      setMetadataLoading(false);
    }
  };

  const applyMetadataSuggestions = () => {
    if (!metadataSuggestion || isReadOnly) return;
    const selected = new Set(metadataSelection);
    setPage((current) => ({
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
      const next = `${page.content.slice(0, editorSelection.start)}${result}${page.content.slice(editorSelection.end)}`;
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
        : page.content
          ? `${page.content.trimEnd()}\n\n${result}`
          : result,
    );
  };

  const applyMedia = (result: MediaResult) => {
    const markdown = `![${result.alt || "单页插图"}](${result.url})`;
    setEditorMode("edit");
    queueMicrotask(() => {
      editorRef.current?.insertText(`\n\n${markdown}\n`, {
        replaceSelection: false,
      });
      editorRef.current?.focus();
    });
    notify("已在编辑位置插入图片。", "success");
  };

  const openFrontsitePreview = async () => {
    let currentPage = page;
    if (!isReadOnly && (dirty.current || !currentPage.id)) {
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
        if (!page.id)
          navigate(`/admin/pages/${result.id}/edit`, { replace: true });
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "保存失败，无法开启预览。",
        );
        return;
      } finally {
        setSaving(false);
      }
    }
    if (currentPage.slug) window.open(`/${currentPage.slug}`, "_blank");
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

  if (!isNew && error && !page.id) {
    return (
      <Alert
        type="error"
        showIcon
        title="无法编辑单页"
        description={error}
        action={
          <Button
            variant="outline"
            icon={<ArrowLeft />}
            onClick={() => navigate("/admin/pages")}
          >
            返回单页列表
          </Button>
        }
      />
    );
  }

  if (!allowed || loading) {
    return (
      <Card
        padding="base"
        aria-label={isNew ? "新建单页编辑器加载中" : "单页编辑器加载中"}
      >
        <div className="flex flex-col gap-5" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-64" />
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
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
        返回单页列表
      </Button>
      <div
        className="flex min-w-0 flex-1 items-center gap-2 type-body-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {isReadOnly ? (
          <>
            <Eye className="size-4" /> 只读模式
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
          disabled={saving || !page.slug.trim()}
          icon={<ExternalLink />}
        >
          预览前台页面
        </Button>
        {!isReadOnly &&
        page.status !== "published" &&
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

  const inspector = (
    <fieldset disabled={isReadOnly} className="min-w-0 border-0 p-0">
      <div className="min-h-9 border-b pb-3">
        <Text weight="semibold">属性</Text>
        <Text size="xs" tone="muted" className="mt-0.5 block">
          发布、页面配置与 SEO。
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
          </Select>
        </Field>
      </InspectorSection>

      <InspectorSection title="页面配置">
        <Field label="显示模板" hint="选择页面的预设布局结构">
          <Select
            aria-label="显示模板"
            value={page.template || "default"}
            onChange={(value) =>
              update("template", selectValue(value) as PageTemplate)
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
              onChange={(event) => update("show_in_nav", event.target.checked)}
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
                metadataLoading || (!page.title.trim() && !page.content.trim())
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
        <Field label="访问路径 (Slug)" required hint="访问路径为 /<slug>">
          <Input
            aria-label="访问路径 (Slug)"
            className="font-mono"
            value={page.slug}
            onChange={(event) => update("slug", event.target.value)}
            placeholder="about"
            required
          />
        </Field>
        <Field label="SEO 标题" hint={`${(page.seo_title || "").length}/60`}>
          <Input
            aria-label="SEO 标题"
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
            aria-label="SEO 描述"
            rows={4}
            value={page.seo_description || ""}
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
                  openWritingAssistant("扩写当前选中的文字，补充必要背景和细节")
                }
              >
                扩写所选
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  openWritingAssistant("压缩当前选中的文字，保留核心信息")
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
                    "基于标题和摘要撰写结构清晰的完整单页初稿",
                  )
                }
              >
                起草单页
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
                    "重构全文结构，减少重复，让页面信息更清晰",
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
          <DropdownMenuItem onSelect={() => setMediaSource("library")}>
            从媒体库选择
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMediaSource("upload")}>
            上传图片
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setMediaSource("ai")}>
            AI 生成配图
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {error ? <Alert type="error" showIcon title={error} /> : null}
      <DocumentEditorShell
        data-pattern="dedicated-workspace-editor"
        aria-label="单页编辑器"
        header={commandBar}
        inspector={inspector}
        canvasAriaLabel="单页编辑画布"
        inspectorAriaLabel="单页元数据 Inspector"
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
                value={page.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="写一个清晰、具体的单页标题"
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
                label="摘要 / 描述"
                actionLabel="AI 根据正文生成摘要"
                onAction={() => void requestFieldSuggestions("summary")}
                loading={fieldLoading === "summary"}
                disabled={
                  !page.content.trim() ||
                  (fieldLoading !== null && fieldLoading !== "summary")
                }
              />
            ) : null}
            <Field
              label="摘要 / 描述"
              hideLabel={!isReadOnly}
              hint={`${page.summary.length}/300`}
            >
              <Textarea
                aria-label="摘要 / 描述"
                rows={3}
                maxLength={300}
                value={page.summary}
                onChange={(event) => update("summary", event.target.value)}
                placeholder="用一两句话说明单页内容"
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
              <Text weight="medium">正文</Text>
              <Text size="xs" tone="muted" className="mt-1 block">
                Markdown 编辑、分屏与预览共用同一编辑器。
              </Text>
            </div>
            <MarkdownEditor
              ref={editorRef}
              value={page.content}
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
              placeholder={"## 页面正文\n\n在此输入 Markdown 内容…"}
              readOnly={isReadOnly}
              textareaAriaLabel="单页正文 Markdown"
              previewAriaLabel="单页预览"
              editorClassName="min-h-[28rem]"
            />
          </div>
        </div>
      </DocumentEditorShell>

      <EditorWritingDialog
        open={writingOpen && !isReadOnly}
        onOpenChange={setWritingOpen}
        documentLabel="单页"
        title={page.title}
        summary={page.summary}
        content={page.content}
        selection={editorSelection}
        initialPrompt={writingPrompt}
        onApply={applyWritingResult}
      />

      <EditorMediaSourceDialog
        source={mediaSource}
        onSourceChange={setMediaSource}
        title={page.title}
        summary={page.summary}
        content={page.content}
        defaultAlt={page.title.trim() ? `${page.title.trim()}插图` : "单页插图"}
        purpose="正文插图"
        onUse={applyMedia}
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
              onClick={() => navigate("/admin/pages")}
            >
              放弃并离开
            </Button>
          </>
        }
      />
    </div>
  );
}
