import { ExternalLink, ShieldCheck, UserRound } from 'lucide-react';
import { gossoAdminURL, gossoClient } from '../../auth';
import { AdminPage, AdminPageHeader, Panel } from '../../components/ui';

export default function AdminUsers() {
  const user = gossoClient.getUserProfile();
  const roles = user?.roles?.length ? user.roles : ['未提供角色声明'];
  return <AdminPage><AdminPageHeader title="身份与权限" description="博客消费 GOSSO 签发的身份与角色声明，不复制账号生命周期管理。" /><div className="user-admin-grid"><Panel><UserRound /><div><h2>当前身份</h2><strong>{user?.name || user?.preferred_username || '管理员'}</strong><p>{user?.email || '当前账号未公开邮箱'}</p><div className="role-claim-list" aria-label="当前角色">{roles.map((role) => <span key={role}>{role}</span>)}</div></div></Panel><Panel><ShieldCheck /><div><h2>权限边界</h2><p>账号创建与停用、密码、MFA、Passkey、会话和身份角色由 GOSSO 集中管理；博客仅执行内容领域内的授权检查。</p><p>当前版本继续兼容 <code>admin</code> 角色。博客专属编辑、作者和审核角色将在独立权限阶段引入。</p><a className="btn btn-primary" href={gossoAdminURL} target="_blank" rel="noreferrer">打开 GOSSO 管理端 <ExternalLink /></a></div></Panel></div></AdminPage>;
}
