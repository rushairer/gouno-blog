import { useEffect, useRef, useState } from "react";
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
  AdminPage,
  AdminPageHeader,
  AdminPageState,
  Button,
  Feedback,
  Field,
  FormActions,
  FormLayout,
  Input,
  PanelHeader,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  useToast,
  WorkspacePanel,
} from "../../components/ui";
import { DEFAULT_SITE_SETTINGS } from "../../config/site-defaults";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import type { SiteSettings } from "../../types/blog";

type SettingsTab = "basic" | "appearance" | "hero" | "social" | "seo";

const commonImageAccept =
  "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/avif,image/bmp,.svg,.ico,.avif,.bmp";

export default function AdminSiteSettings() {
  const allowed = useAdminGuard("/admin/settings");
  const { notify } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("basic");
  const [value, setValue] = useState(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState("");
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    (() => Promise<void>) | null
  >(null);

  useEffect(() => {
    if (!allowed) return;
    siteApi
      .getAdminSettings()
      .then((data) => {
        let merged = { ...DEFAULT_SITE_SETTINGS, ...data };
        try {
          const pending = sessionStorage.getItem(
            "gouno-blog:pending_site_settings",
          );
          if (pending) {
            const parsed = JSON.parse(pending);
            merged = { ...merged, ...parsed };
            notify(
              "已恢复未保存的修改内容。当前尚未生效，请点击“保存设置”以提交生效。",
              "info",
            );
          }
        } catch {}
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
      setValue(updated);
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

  if (loading)
    return (
      <AdminPageState
        title="站点设置"
        description="管理品牌信息、首页标语、社交入口和默认 SEO 元数据。"
        label="正在载入站点设置…"
      />
    );

  return (
    <AdminPage>
      <AdminPageHeader
        title="站点设置"
        description="管理品牌信息、首页标语、社交入口和默认 SEO 元数据。"
      />
      {error ? <Feedback type="error">{error}</Feedback> : null}
      <SudoGate
        title="站点核心配置保护"
        description="修改站点品牌、SEO、页脚或联系方式等敏感设置需要近期多因素身份认证。解锁后享有 10 分钟无打扰编辑期。"
        actionLabel="解锁以修改设置"
      >
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as SettingsTab)}
          id="site-settings"
        >
        <TabList label="站点设置">
          <Tab value="basic">
            <FileText aria-hidden="true" />
            <span>基础信息</span>
          </Tab>
          <Tab value="appearance">
            <ImageIcon aria-hidden="true" />
            <span>网站图标</span>
          </Tab>
          <Tab value="hero">
            <ImageIcon aria-hidden="true" />
            <span>首页 Hero</span>
          </Tab>
          <Tab value="social">
            <Mail aria-hidden="true" />
            <span>公开联系方式</span>
          </Tab>
          <Tab value="seo">
            <Search aria-hidden="true" />
            <span>SEO</span>
          </Tab>
        </TabList>
        <TabPanel value={activeTab}>
          {activeTab === "basic" ? (
            <WorkspacePanel>
              <PanelHeader
                title="基础信息"
                description="站点名称、内容定位和作者展示信息。"
              />
              <FormLayout onSubmit={save}>
                <Field label="站点名称" required>
                  <Input
                    required
                    value={value.site_title}
                    onChange={(event) =>
                      field("site_title", event.target.value)
                    }
                  />
                </Field>
                <Field label="站点描述">
                  <Textarea
                    rows={3}
                    value={value.site_description}
                    onChange={(event) =>
                      field("site_description", event.target.value)
                    }
                  />
                </Field>
                <Field label="页脚文本">
                  <Input
                    value={value.footer_text || ""}
                    onChange={(event) =>
                      field("footer_text", event.target.value)
                    }
                    placeholder="Built with care, code, and curiosity."
                  />
                </Field>
                <Field label="作者名称">
                  <Input
                    value={value.author_name}
                    onChange={(event) =>
                      field("author_name", event.target.value)
                    }
                  />
                </Field>
                <Field label="作者简介">
                  <Textarea
                    rows={4}
                    value={value.author_bio}
                    onChange={(event) =>
                      field("author_bio", event.target.value)
                    }
                  />
                </Field>
                <FormActions>
                  <Button
                    variant="primary"
                    type="submit"
                    loading={saving}
                    icon={<Save />}
                  >
                    {saving ? "正在保存…" : "保存设置"}
                  </Button>
                </FormActions>
              </FormLayout>
            </WorkspacePanel>
          ) : null}
          {activeTab === "hero" ? (
            <WorkspacePanel>
              <PanelHeader
                title="首页 Hero 标语与插图"
                description="定制前台首页顶部的 Slogan 标语、描述以及右侧系统图。"
              />
              <FormLayout onSubmit={save}>
                <Field
                  label="Hero 主标题"
                  hint="支持多行输入，回车换行将在首页以分行呈现。"
                >
                  <Textarea
                    rows={3}
                    value={value.hero_title ?? ""}
                    onChange={(event) =>
                      field("hero_title", event.target.value)
                    }
                    placeholder={"记录探索与思考，\n沉淀见解与价值。"}
                  />
                </Field>
                <Field
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
                </Field>
                <Field
                  label="右侧插图 URL"
                  hint="可直接输入图片地址，或点击下方按钮上传新图片。"
                >
                  <div className="upload-row">
                    <Input
                      className="flex-1"
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
                      variant="secondary"
                      type="button"
                      loading={uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      icon={<Upload />}
                    >
                      上传插图
                    </Button>
                  </div>
                  {value.hero_image_url ? (
                    <div className="upload-preview-card">
                      <div className="upload-preview-img-box">
                        <img
                          src={value.hero_image_url}
                          alt="Hero 预览"
                          className="upload-preview-img"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="compact"
                        type="button"
                        onClick={() => field("hero_image_url", "")}
                      >
                        清空插图
                      </Button>
                    </div>
                  ) : null}
                </Field>
                <Field
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
                </Field>
                <FormActions>
                  <Button
                    variant="primary"
                    type="submit"
                    loading={saving}
                    icon={<Save />}
                  >
                    {saving ? "正在保存…" : "保存设置"}
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={resetHeroDefaults}
                    icon={<RotateCcw />}
                  >
                    恢复默认文案
                  </Button>
                </FormActions>
              </FormLayout>
            </WorkspacePanel>
          ) : null}
          {activeTab === "appearance" ? (
            <WorkspacePanel>
              <PanelHeader
                title="网站图标"
                description="设置浏览器标签页中显示的 Favicon。"
              />
              <FormLayout onSubmit={save}>
                <Field
                  label="Favicon 地址"
                  hint="支持站内路径（如 /media/icon.png）或完整 http(s) URL；支持 PNG、WebP、GIF、JPEG、SVG、ICO、AVIF 与 BMP。"
                >
                  <div className="upload-row">
                    <Input
                      className="flex-1"
                      value={value.favicon_url ?? ""}
                      onChange={(event) =>
                        field("favicon_url", event.target.value)
                      }
                      placeholder="/favicon.svg"
                    />
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept={commonImageAccept}
                      className="sr-only"
                      onChange={handleFaviconUpload}
                    />
                    <Button
                      variant="secondary"
                      type="button"
                      loading={uploadingImage}
                      onClick={() => faviconInputRef.current?.click()}
                      icon={<Upload />}
                    >
                      上传图标
                    </Button>
                  </div>
                  {value.favicon_url ? (
                    <img
                      src={value.favicon_url}
                      alt="Favicon 预览"
                      width={32}
                      height={32}
                      className="favicon-preview-img"
                    />
                  ) : null}
                </Field>
                <FormActions>
                  <Button
                    variant="primary"
                    type="submit"
                    loading={saving}
                    icon={<Save />}
                  >
                    {saving ? "正在保存…" : "保存设置"}
                  </Button>
                </FormActions>
              </FormLayout>
            </WorkspacePanel>
          ) : null}
          {activeTab === "social" ? (
            <WorkspacePanel>
              <PanelHeader
                title="公开联系方式"
                description="留空时前台不会显示对应入口；这些信息与 GOSSO 登录账号资料相互独立。"
              />
              <FormLayout onSubmit={save}>
                <Field label="公开联系邮箱">
                  <Input
                    type="email"
                    value={value.email}
                    onChange={(event) => field("email", event.target.value)}
                  />
                </Field>
                <Field label="GitHub">
                  <Input
                    type="url"
                    value={value.github_url}
                    onChange={(event) =>
                      field("github_url", event.target.value)
                    }
                  />
                </Field>
                <Field label="RSS">
                  <Input
                    className="mono"
                    value={value.rss_url}
                    onChange={(event) => field("rss_url", event.target.value)}
                    placeholder="/feed.xml"
                  />
                </Field>
                <FormActions>
                  <Button
                    variant="primary"
                    type="submit"
                    loading={saving}
                    icon={<Save />}
                  >
                    {saving ? "正在保存…" : "保存设置"}
                  </Button>
                </FormActions>
              </FormLayout>
            </WorkspacePanel>
          ) : null}
          {activeTab === "seo" ? (
            <WorkspacePanel>
              <PanelHeader
                title="默认 SEO"
                description="作为文章未单独配置 SEO 信息时的站点级默认值。"
              />
              <FormLayout onSubmit={save}>
                <Field label="默认标题">
                  <Input
                    value={value.default_seo_title}
                    onChange={(event) =>
                      field("default_seo_title", event.target.value)
                    }
                  />
                </Field>
                <Field label="默认描述">
                  <Textarea
                    rows={4}
                    value={value.default_seo_description}
                    onChange={(event) =>
                      field("default_seo_description", event.target.value)
                    }
                  />
                </Field>
                <FormActions>
                  <Button
                    variant="primary"
                    type="submit"
                    loading={saving}
                    icon={<Save />}
                  >
                    {saving ? "正在保存…" : "保存设置"}
                  </Button>
                </FormActions>
              </FormLayout>
            </WorkspacePanel>
          ) : null}
        </TabPanel>
      </Tabs>
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
    </AdminPage>
  );
}
