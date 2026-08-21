import { useEffect, useState } from 'react';
import { FileText, Mail, Save, Search } from 'lucide-react';
import { siteApi } from '../../api/site';
import { AdminPage, AdminPageHeader, AdminPageState, Button, Feedback, Field, FormActions, FormLayout, Input, PanelHeader, Tab, TabList, TabPanel, Tabs, Textarea, useToast, WorkspacePanel } from '../../components/ui';
import { DEFAULT_SITE_SETTINGS } from '../../config/site-defaults';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import type { SiteSettings } from '../../types/blog';

type SettingsTab = 'basic' | 'social' | 'seo';

export default function AdminSiteSettings() {
  const allowed = useAdminGuard('/admin/settings');
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic');
  const [value, setValue] = useState(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!allowed) return;
    siteApi.getAdminSettings()
      .then((data) => setValue({ ...DEFAULT_SITE_SETTINGS, ...data }))
      .catch((reason: Error) => {
        const msg = reason.message;
        setError(msg);
        notify(msg, 'error');
      })
      .finally(() => setLoading(false));
  }, [allowed, notify]);

  const field = (key: keyof SiteSettings, next: string) => setValue((current) => ({ ...current, [key]: next }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const rss = value.rss_url.trim();
    if (rss && !rss.startsWith('/') && !/^https?:\/\//i.test(rss)) {
      const msg = 'RSS 地址必须是以 / 开头的站内路径，或完整的 http(s) URL。';
      setError(msg);
      notify(msg, 'error');
      return;
    }
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const updated = await siteApi.updateAdminSettings({ ...value, rss_url: rss || '/feed.xml' });
      setValue(updated);
      setNotice('站点设置已保存。');
      notify('站点设置已成功保存。', 'success');
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : '保存失败';
      setError(msg);
      notify(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminPageState title="站点设置" description="管理品牌信息、社交入口和默认 SEO 元数据。" label="正在载入站点设置…" />;

  return (
    <AdminPage>
      <AdminPageHeader title="站点设置" description="管理品牌信息、社交入口和默认 SEO 元数据。" />
      {notice ? <Feedback type="success">{notice}</Feedback> : null}
      {error ? <Feedback type="error">{error}</Feedback> : null}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)} id="site-settings">
        <TabList label="站点设置">
          <Tab value="basic"><FileText aria-hidden="true" /><span>基础信息</span></Tab>
          <Tab value="social"><Mail aria-hidden="true" /><span>公开联系方式</span></Tab>
          <Tab value="seo"><Search aria-hidden="true" /><span>SEO</span></Tab>
        </TabList>
        <TabPanel value={activeTab}>
          {activeTab === 'basic' ? (
            <WorkspacePanel>
              <PanelHeader title="基础信息" description="站点名称、内容定位和作者展示信息。" />
              <FormLayout onSubmit={save}>
                <Field label="站点名称" required><Input required value={value.site_title} onChange={(event) => field('site_title', event.target.value)} /></Field>
                <Field label="站点描述"><Textarea rows={3} value={value.site_description} onChange={(event) => field('site_description', event.target.value)} /></Field>
                <Field label="页脚文本"><Input value={value.footer_text || ''} onChange={(event) => field('footer_text', event.target.value)} placeholder="Built with care, code, and curiosity." /></Field>
                <Field label="作者名称"><Input value={value.author_name} onChange={(event) => field('author_name', event.target.value)} /></Field>
                <Field label="作者简介"><Textarea rows={4} value={value.author_bio} onChange={(event) => field('author_bio', event.target.value)} /></Field>
                <FormActions>
                  <Button variant="primary" type="submit" loading={saving}>
                    <Save /> {saving ? '正在保存…' : '保存设置'}
                  </Button>
                </FormActions>
              </FormLayout>
            </WorkspacePanel>
          ) : null}
          {activeTab === 'social' ? (
            <WorkspacePanel>
              <PanelHeader title="公开联系方式" description="留空时前台不会显示对应入口；这些信息与 GOSSO 登录账号资料相互独立。" />
              <FormLayout onSubmit={save}>
                <Field label="公开联系邮箱"><Input type="email" value={value.email} onChange={(event) => field('email', event.target.value)} /></Field>
                <Field label="GitHub"><Input type="url" value={value.github_url} onChange={(event) => field('github_url', event.target.value)} /></Field>
                <Field label="RSS"><Input className="mono" value={value.rss_url} onChange={(event) => field('rss_url', event.target.value)} placeholder="/feed.xml" /></Field>
                <FormActions>
                  <Button variant="primary" type="submit" loading={saving}>
                    <Save /> {saving ? '正在保存…' : '保存设置'}
                  </Button>
                </FormActions>
              </FormLayout>
            </WorkspacePanel>
          ) : null}
          {activeTab === 'seo' ? (
            <WorkspacePanel>
              <PanelHeader title="默认 SEO" description="作为文章未单独配置 SEO 信息时的站点级默认值。" />
              <FormLayout onSubmit={save}>
                <Field label="默认标题"><Input value={value.default_seo_title} onChange={(event) => field('default_seo_title', event.target.value)} /></Field>
                <Field label="默认描述"><Textarea rows={4} value={value.default_seo_description} onChange={(event) => field('default_seo_description', event.target.value)} /></Field>
                <FormActions>
                  <Button variant="primary" type="submit" loading={saving}>
                    <Save /> {saving ? '正在保存…' : '保存设置'}
                  </Button>
                </FormActions>
              </FormLayout>
            </WorkspacePanel>
          ) : null}
        </TabPanel>
      </Tabs>
    </AdminPage>
  );
}
