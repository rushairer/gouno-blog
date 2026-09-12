import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FileText,
  Image as ImageIcon,
  Mail,
  RotateCcw,
  Save,
  Search,
  Upload,
} from "lucide-react";
import { mediaApi } from "../../api/media";
import { siteApi } from "../../api/site";
import { isMfaError } from "../../auth";
import { StepUpMfaModal } from "../../components/auth/StepUpMfaModal";
import { SudoGate } from "../../components/auth/SudoGate";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardFooter,
  FormField,
  Input,
  Skeleton,
  Tabs,
  Text,
  Textarea,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";

import { DEFAULT_SITE_SETTINGS } from "../../config/site-defaults";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import type { SiteSettings } from "../../types/blog";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

type SettingsTab = "basic" | "appearance" | "hero" | "social" | "seo";

const commonImageAccept =
  "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/avif,image/bmp,.svg,.ico,.avif,.bmp";

function TabPanelLead({
  description,
  actions,
}: {
  description?: ReactNode;
  actions?: ReactNode;
}) {
  if (!description && !actions) return null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {description ? (
          <Text tone="muted" size="sm" className="max-w-3xl leading-relaxed">
            {description}
          </Text>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function SettingsSurface({
  description,
  dirty,
  saving,
  onSubmit,
  secondaryAction,
  children,
}: {
  description: string;
  dirty: boolean;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  secondaryAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <TabPanelLead description={description} />
      <Card padding="none" className="gap-0 overflow-clip">
        <CardContent className="flex flex-col gap-5 p-6">
          {children}
        </CardContent>
        <CardFooter className="sticky bottom-0 z-10 justify-between border-t bg-card/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            {secondaryAction}
            <Text size="sm" tone="muted">
              {dirty ? "有未保存修改" : "当前设置已同步"}
            </Text>
          </div>
          <Button
            variant="solid"
            color="primary"
            type="submit"
            disabled={!dirty || saving}
            loading={saving}
            loadingText="正在保存…"
            icon={<Save />}
          >
            保存设置
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function LoadingSettings() {
  return (
    <Card padding="base" aria-label="站点设置加载中">
      <div className="flex flex-col gap-5" role="status" aria-live="polite">
        <Text size="sm" tone="muted">
          正在载入站点设置…
        </Text>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    </Card>
  );
}

export default function AdminSiteSettings() {
  const allowed = useAdminGuard("/admin/settings");
  const { notify } = useAppFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("basic");
  const [value, setValue] = useState(DEFAULT_SITE_SETTINGS);
  const [baseline, setBaseline] = useState(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState("");
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    (() => Promise<void>) | null
  >(null);

  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!allowed) return;
    siteApi
      .getAdminSettings()
      .then((data) => {
        const serverValue = { ...DEFAULT_SITE_SETTINGS, ...data };
        let merged = serverValue;
        try {
          const pending = sessionStorage.getItem(
            "gouno-blog:pending_site_settings",
          );
          if (pending) {
            const parsed = JSON.parse(pending);
            merged = { ...serverValue, ...parsed };
            notify(
              "已恢复未保存的修改内容。当前尚未生效，请点击“保存设置”以提交生效。",
              "info",
            );
          }
        } catch {}
        setBaseline(serverValue);
        setValue(merged);
      })
      .catch((reason: Error) => {
        setError(reason.message);
      })
      .finally(() => setLoading(false));
  }, [allowed, notify]);

  const field = (key: keyof SiteSettings, next: string) =>
    setValue((current) => ({ ...current, [key]: next }));

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await mediaApi.uploadMedia(form);
      field("hero_image_url", res.url);
      notify("Hero 插图已上传成功。", "success");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "图片上传失败";
      notify(msg, "error");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFaviconUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await mediaApi.uploadMedia(form);
      field("favicon_url", res.url);
      notify("站点图标已上传成功。", "success");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "图标上传失败";
      notify(msg, "error");
    } finally {
      setUploadingImage(false);
      if (faviconInputRef.current) faviconInputRef.current.value = "";
    }
  };

  const resetHeroDefaults = () => {
    setValue((current) => ({
      ...current,
      hero_title: DEFAULT_SITE_SETTINGS.hero_title,
      hero_description: DEFAULT_SITE_SETTINGS.hero_description,
      hero_image_url: DEFAULT_SITE_SETTINGS.hero_image_url,
      hero_image_caption: DEFAULT_SITE_SETTINGS.hero_image_caption,
    }));
    notify("已填充为默认 Hero 标语与插图，点击“保存设置”即可生效。", "success");
  };

  const save = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const rss = value.rss_url.trim();
    if (rss && !rss.startsWith("/") && !/^https?:\/\//i.test(rss)) {
      notify(
        "RSS 地址必须是以 / 开头的站内路径，或完整的 http(s) URL。",
        "error",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await siteApi.updateAdminSettings({
        ...value,
        rss_url: rss || "/feed.xml",
      });
      const normalized = { ...DEFAULT_SITE_SETTINGS, ...updated };
      setValue(normalized);
      setBaseline(normalized);
      try {
        sessionStorage.removeItem("gouno-blog:pending_site_settings");
      } catch {}
      notify("站点设置已成功保存。", "success");
    } catch (reason) {
      if (isMfaError(reason)) {
        try {
          sessionStorage.setItem(
            "gouno-blog:pending_site_settings",
            JSON.stringify(value),
          );
        } catch {}
        setPendingAction(() => () => save());
        setStepUpOpen(true);
        return;
      }
      const msg = reason instanceof Error ? reason.message : "保存失败";
      notify(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const submitSettings = (event: React.FormEvent) => {
    void save(event);
  };

  const pageHeader = (
    <PageHeader
      title="站点设置"
      description="管理品牌信息、首页标语、社交入口和默认 SEO 元数据。"
    />
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        {pageHeader}
        <LoadingSettings />
      </div>
    );
  }

  const tabs = [
    {
      key: "basic" as const,
      label: "基础信息",
      icon: <FileText aria-hidden="true" className="size-4" />,
      children: (
        <SettingsSurface
          description="站点名称、内容定位和作者展示信息。"
          dirty={dirty}
          saving={saving}
          onSubmit={submitSettings}
        >
          <FormField label="站点名称" required>
            <Input
              required
              value={value.site_title}
              onChange={(event) => field("site_title", event.target.value)}
            />
          </FormField>
          <FormField label="站点描述">
            <Textarea
              rows={3}
              value={value.site_description}
              onChange={(event) =>
                field("site_description", event.target.value)
              }
            />
          </FormField>
          <FormField label="页脚文本">
            <Input
              value={value.footer_text || ""}
              onChange={(event) => field("footer_text", event.target.value)}
              placeholder="Built with care, code, and curiosity."
            />
          </FormField>
          <FormField label="作者名称">
            <Input
              value={value.author_name}
              onChange={(event) => field("author_name", event.target.value)}
            />
          </FormField>
          <FormField label="作者简介">
            <Textarea
              rows={4}
              value={value.author_bio}
              onChange={(event) => field("author_bio", event.target.value)}
            />
          </FormField>
        </SettingsSurface>
      ),
    },
    {
      key: "appearance" as const,
      label: "网站图标",
      icon: <ImageIcon aria-hidden="true" className="size-4" />,
      children: (
        <SettingsSurface
          description="设置浏览器标签页中显示的 Favicon。"
          dirty={dirty}
          saving={saving}
          onSubmit={submitSettings}
        >
          <FormField
            label="Favicon 地址"
            hint="支持站内路径或完整 http(s) URL；上传支持 PNG、WebP、GIF、JPEG、SVG、ICO、AVIF 与 BMP。"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                aria-label="Favicon 地址"
                className="min-w-0 flex-1"
                value={value.favicon_url ?? ""}
                onChange={(event) => field("favicon_url", event.target.value)}
                placeholder="/favicon.svg"
              />
              <input
                ref={faviconInputRef}
                aria-label="Favicon 文件"
                type="file"
                accept={commonImageAccept}
                className="sr-only"
                onChange={handleFaviconUpload}
              />
              <Button
                variant="outline"
                type="button"
                loading={uploadingImage}
                onClick={() => faviconInputRef.current?.click()}
                icon={<Upload />}
              >
                上传图标
              </Button>
            </div>
          </FormField>
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            {value.favicon_url ? (
              <img
                src={value.favicon_url}
                alt="Favicon 预览"
                width={40}
                height={40}
                className="size-10 rounded-lg border bg-background object-contain p-1"
              />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-lg border bg-background text-sm font-bold text-primary">
                GB
              </div>
            )}
            <div className="min-w-0">
              <Text size="sm" className="font-medium">
                Favicon 预览
              </Text>
              <code className="mt-1 block truncate text-xs text-muted-foreground">
                {value.favicon_url || "未配置"}
              </code>
            </div>
          </div>
        </SettingsSurface>
      ),
    },
    {
      key: "hero" as const,
      label: "首页 Hero",
      icon: <ImageIcon aria-hidden="true" className="size-4" />,
      children: (
        <SettingsSurface
          description="定制前台首页顶部的 Slogan 标语、描述以及右侧系统图。"
          dirty={dirty}
          saving={saving}
          onSubmit={submitSettings}
          secondaryAction={
            <Button
              variant="outline"
              type="button"
              onClick={resetHeroDefaults}
              icon={<RotateCcw />}
            >
              恢复默认文案
            </Button>
          }
        >
          <FormField
            label="Hero 主标题"
            hint="支持多行输入，回车换行将在首页以分行呈现。"
          >
            <Textarea
              rows={3}
              value={value.hero_title ?? ""}
              onChange={(event) => field("hero_title", event.target.value)}
              placeholder={"记录探索与思考，\n沉淀见解与价值。"}
            />
          </FormField>
          <FormField
            label="Hero 副标题描述"
            hint="对网站主题、关注领域的补充说明。"
          >
            <Textarea
              rows={3}
              value={value.hero_description ?? ""}
              onChange={(event) =>
                field("hero_description", event.target.value)
              }
              placeholder="专注于长期记录、深度思考与知识沉淀。写下探索的过程，也分享有价值的见解。"
            />
          </FormField>
          <FormField
            label="右侧插图 URL"
            hint="可直接输入图片地址，或点击下方按钮上传新图片。"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                className="min-w-0 flex-1"
                value={value.hero_image_url ?? ""}
                onChange={(event) =>
                  field("hero_image_url", event.target.value)
                }
                placeholder="/editorial-system-map.png"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept={commonImageAccept}
                className="sr-only"
                onChange={handleImageUpload}
              />
              <Button
                variant="outline"
                type="button"
                loading={uploadingImage}
                onClick={() => fileInputRef.current?.click()}
                icon={<Upload />}
              >
                上传插图
              </Button>
            </div>
            {value.hero_image_url ? (
              <div className="mt-3 overflow-hidden rounded-lg border bg-muted/20">
                <div className="flex min-h-40 items-center justify-center bg-muted/30 p-4">
                  <img
                    src={value.hero_image_url}
                    alt="Hero 预览"
                    className="max-h-56 max-w-full rounded-md object-contain"
                  />
                </div>
                <div className="flex justify-end border-t px-4 py-3">
                  <Button
                    variant="text"
                    size="small"
                    type="button"
                    onClick={() => field("hero_image_url", "")}
                  >
                    清空插图
                  </Button>
                </div>
              </div>
            ) : null}
          </FormField>
          <FormField
            label="右侧插图底部标注"
            hint="显示在插图右下角的排版小字，例如 EXPLORE / THINK / SHARE。"
          >
            <Input
              value={value.hero_image_caption ?? ""}
              onChange={(event) =>
                field("hero_image_caption", event.target.value)
              }
              placeholder="EXPLORE / THINK / SHARE"
            />
          </FormField>
        </SettingsSurface>
      ),
    },
    {
      key: "social" as const,
      label: "公开联系方式",
      icon: <Mail aria-hidden="true" className="size-4" />,
      children: (
        <SettingsSurface
          description="留空时前台不会显示对应入口；这些信息与 GOSSO 登录账号资料相互独立。"
          dirty={dirty}
          saving={saving}
          onSubmit={submitSettings}
        >
          <FormField label="公开联系邮箱">
            <Input
              type="email"
              value={value.email}
              onChange={(event) => field("email", event.target.value)}
            />
          </FormField>
          <FormField label="GitHub">
            <Input
              type="url"
              value={value.github_url}
              onChange={(event) => field("github_url", event.target.value)}
            />
          </FormField>
          <FormField label="RSS">
            <Input
              className="font-mono"
              value={value.rss_url}
              onChange={(event) => field("rss_url", event.target.value)}
              placeholder="/feed.xml"
            />
          </FormField>
        </SettingsSurface>
      ),
    },
    {
      key: "seo" as const,
      label: "SEO",
      icon: <Search aria-hidden="true" className="size-4" />,
      children: (
        <SettingsSurface
          description="作为文章未单独配置 SEO 信息时的站点级默认值。"
          dirty={dirty}
          saving={saving}
          onSubmit={submitSettings}
        >
          <FormField label="默认标题">
            <Input
              value={value.default_seo_title}
              onChange={(event) =>
                field("default_seo_title", event.target.value)
              }
            />
          </FormField>
          <FormField label="默认描述">
            <Textarea
              rows={4}
              value={value.default_seo_description}
              onChange={(event) =>
                field("default_seo_description", event.target.value)
              }
            />
          </FormField>
        </SettingsSurface>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {pageHeader}
      {error ? <Alert type="error" showIcon title={error} /> : null}
      <SudoGate
        title="站点核心配置保护"
        description="修改站点品牌、SEO、页脚或联系方式等敏感设置需要近期多因素身份认证。解锁后享有 10 分钟无打扰编辑期。"
        actionLabel="解锁以修改设置"
      >
        <Tabs<SettingsTab>
          id="site-settings"
          aria-label="站点设置"
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabs}
        />
      </SudoGate>

      <StepUpMfaModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setPendingAction(null);
        }}
        onSuccess={async () => {
          if (pendingAction) {
            const action = pendingAction;
            setPendingAction(null);
            await action();
          }
        }}
      />
    </div>
  );
}
