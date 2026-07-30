import { ExternalLink, ShieldCheck, UserRound } from 'lucide-react';
import { getUserProfile, gossoAdminURL } from '../../auth';
import { AdminPage, AdminPageHeader, Panel } from '../../components/ui';

export default function AdminUsers() {
  const user = getUserProfile();
  return <AdminPage><AdminPageHeader title="用户与权限" description="博客使用 GOSSO 统一管理身份、会话和角色。" /><div className="user-admin-grid"><Panel><UserRound /><div><h2>当前管理员</h2><strong>{user?.name || user?.preferred_username || '管理员'}</strong><p>{user?.email || '当前账号未公开邮箱'}</p></div></Panel><Panel><ShieldCheck /><div><h2>权限边界</h2><p>用户生命周期、密码、MFA、Passkey 与角色分配由身份系统集中管理；博客只消费经过签名的身份与权限声明。</p><a className="btn btn-primary" href={gossoAdminURL} target="_blank" rel="noreferrer">打开 GOSSO 管理端 <ExternalLink /></a></div></Panel></div></AdminPage>;
}
