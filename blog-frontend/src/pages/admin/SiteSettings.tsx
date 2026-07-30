import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { apiFetch } from '../../auth';
import { AdminPage, AdminPageHeader, AdminPageState, Button, Feedback, Field, FormActions, Input, PanelHeader, SectionNav, Textarea, WorkspacePanel } from '../../components/ui';
import { DEFAULT_SITE_SETTINGS } from '../../config/site-defaults';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { readData } from '../../lib/blog-api';
import type { SiteSettings } from '../../types/blog';

const settingSections = [
  { id: 'basic', label: '基础信息' },
  { id: 'social', label: '公开联系方式' },
  { id: 'seo', label: 'SEO' },
];

export default function AdminSiteSettings() {
  const allowed = useAdminGuard('/admin/settings');
  const [value, setValue] = useState(DEFAULT_SITE_SETTINGS); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  useEffect(() => { if (!allowed) return; readData<SiteSettings>(apiFetch('/api/admin/settings')).then((data) => setValue({ ...DEFAULT_SITE_SETTINGS, ...data })).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)); }, [allowed]);
  const field = (key: keyof SiteSettings, next: string) => setValue((current) => ({ ...current, [key]: next }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const rss = value.rss_url.trim();
    if (rss && !rss.startsWith('/') && !/^https?:\/\//i.test(rss)) {
      setError('RSS 地址必须是以 / 开头的站内路径，或完整的 http(s) URL。');
      return;
    }
    setSaving(true); setNotice(''); setError('');
    try {
      setValue(await readData<SiteSettings>(apiFetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...value, rss_url: rss || '/feed.xml' }) })));
      setNotice('站点设置已保存。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); } finally { setSaving(false); }
  };
  if (loading) return <AdminPageState title="站点设置" description="管理品牌信息、社交入口和默认 SEO 元数据。" label="正在载入站点设置…" />;
  return (
    <AdminPage>
      <AdminPageHeader title="站点设置" description="管理品牌信息、社交入口和默认 SEO 元数据。" />
      {notice ? <Feedback type="success">{notice}</Feedback> : null}
      {error ? <Feedback type="error">{error}</Feedback> : null}
      <form className="settings-layout" onSubmit={save}>
        <SectionNav items={settingSections} label="站点设置分区" />
        <div className="settings-content">
          <WorkspacePanel id="basic" className="settings-section">
            <PanelHeader title="基础信息" description="站点名称、内容定位和作者展示信息。" />
            <div className="form-stack">
              <Field label="站点名称" required><Input required value={value.site_title} onChange={(event) => field('site_title', event.target.value)} /></Field>
              <Field label="站点描述"><Textarea rows={3} value={value.site_description} onChange={(event) => field('site_description', event.target.value)} /></Field>
              <Field label="作者名称"><Input value={value.author_name} onChange={(event) => field('author_name', event.target.value)} /></Field>
              <Field label="作者简介"><Textarea rows={4} value={value.author_bio} onChange={(event) => field('author_bio', event.target.value)} /></Field>
            </div>
          </WorkspacePanel>
          <WorkspacePanel id="social" className="settings-section">
            <PanelHeader title="公开联系方式" description="留空时前台不会显示对应入口；这些信息与 GOSSO 登录账号资料相互独立。" />
            <div className="form-stack">
              <Field label="公开联系邮箱"><Input type="email" value={value.email} onChange={(event) => field('email', event.target.value)} /></Field>
              <Field label="GitHub"><Input type="url" value={value.github_url} onChange={(event) => field('github_url', event.target.value)} /></Field>
              <Field label="RSS"><Input className="mono" value={value.rss_url} onChange={(event) => field('rss_url', event.target.value)} placeholder="/feed.xml" /></Field>
            </div>
          </WorkspacePanel>
          <WorkspacePanel id="seo" className="settings-section">
            <PanelHeader title="默认 SEO" description="作为文章未单独配置 SEO 信息时的站点级默认值。" />
            <div className="form-stack">
              <Field label="默认标题"><Input value={value.default_seo_title} onChange={(event) => field('default_seo_title', event.target.value)} /></Field>
              <Field label="默认描述"><Textarea rows={4} value={value.default_seo_description} onChange={(event) => field('default_seo_description', event.target.value)} /></Field>
            </div>
          </WorkspacePanel>
          <FormActions><Button variant="primary" type="submit" loading={saving}><Save /> {saving ? '正在保存…' : '保存设置'}</Button></FormActions>
        </div>
      </form>
    </AdminPage>
  );
}
