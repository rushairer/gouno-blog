import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { apiFetch } from '../../auth';
import { AdminPage, AdminPageHeader, Feedback, LoadingState, Panel } from '../../components/ui';
import { DEFAULT_SITE_SETTINGS } from '../../config/site-defaults';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { readData } from '../../lib/blog-api';
import type { SiteSettings } from '../../types/blog';

export default function AdminSiteSettings() {
  const allowed = useAdminGuard('/admin/settings');
  const [value, setValue] = useState(DEFAULT_SITE_SETTINGS); const [loading, setLoading] = useState(true); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  useEffect(() => { if (!allowed) return; readData<SiteSettings>(apiFetch('/api/admin/settings')).then((data) => setValue({ ...DEFAULT_SITE_SETTINGS, ...data })).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)); }, [allowed]);
  const field = (key: keyof SiteSettings, next: string) => setValue((current) => ({ ...current, [key]: next }));
  const save = async (event: React.FormEvent) => { event.preventDefault(); try { setValue(await readData<SiteSettings>(apiFetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }))); setNotice('站点设置已保存。'); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); } };
  if (loading) return <LoadingState label="正在载入站点设置…" />;
  return <AdminPage><AdminPageHeader title="站点设置" description="管理品牌信息、社交入口和默认 SEO 元数据。" />{notice ? <Feedback type="success">{notice}</Feedback> : null}{error ? <Feedback type="error">{error}</Feedback> : null}<form className="settings-layout" onSubmit={save}><nav><a href="#basic">基础信息</a><a href="#social">公开联系方式</a><a href="#seo">SEO</a></nav><div><Panel id="basic" className="settings-section"><h2>基础信息</h2><label>站点名称<input value={value.site_title} onChange={(event) => field('site_title', event.target.value)} /></label><label>站点描述<textarea rows={3} value={value.site_description} onChange={(event) => field('site_description', event.target.value)} /></label><label>作者名称<input value={value.author_name} onChange={(event) => field('author_name', event.target.value)} /></label><label>作者简介<textarea rows={4} value={value.author_bio} onChange={(event) => field('author_bio', event.target.value)} /></label></Panel><Panel id="social" className="settings-section"><h2>公开联系方式</h2><p>留空时前台不会显示对应入口；此处信息与 GOSSO 登录账号资料相互独立。</p><label>公开联系邮箱<input type="email" value={value.email} onChange={(event) => field('email', event.target.value)} /></label><label>GitHub<input type="url" value={value.github_url} onChange={(event) => field('github_url', event.target.value)} /></label><label>RSS<input value={value.rss_url} onChange={(event) => field('rss_url', event.target.value)} /></label></Panel><Panel id="seo" className="settings-section"><h2>默认 SEO</h2><label>默认标题<input value={value.default_seo_title} onChange={(event) => field('default_seo_title', event.target.value)} /></label><label>默认描述<textarea rows={4} value={value.default_seo_description} onChange={(event) => field('default_seo_description', event.target.value)} /></label></Panel><button className="btn btn-primary settings-save"><Save /> 保存设置</button></div></form></AdminPage>;
}
