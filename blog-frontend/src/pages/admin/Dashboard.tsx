import { useEffect, useState } from 'react';
import { AlertTriangle, Bookmark, Bot, ChevronRight, Eye, FileText, GitBranch, MessageSquare, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../auth';
import { AdminPage, AdminPageHeader, AdminPageState, ContentStack, Feedback, Panel } from '../../components/ui';
import { useAdminGuard } from '../../hooks/useAdminGuard';

interface Summary {
  total_posts: number; published_posts: number; total_views: number; total_likes: number;
  total_bookmarks: number; total_comments: number; pending_comments: number; reported_items: number;
  top_posts: Array<{ id: number; title: string; slug: string; views_count: number; likes_count: number }>;
  daily_events: Array<{ date: string; count: number }>;
  ai_alerts: Array<{ id: number; type: string; title: string; body: string; href: string; created_at: string }>;
}

function alertPresentation(alert: Summary['ai_alerts'][number]) {
  const workflow = alert.type === 'ai_workflow_failed';
  const href = new URL(alert.href || '/admin/agents', window.location.origin);
  const workflowID = href.searchParams.get('workflow');
  const destination = workflow
    ? `/admin/agents?tab=records${workflowID ? `&workflow=${workflowID}` : ''}`
    : '/admin/agents?tab=records&record=agent';
  return {
    destination,
    icon: workflow ? <GitBranch aria-hidden="true" /> : <Bot aria-hidden="true" />,
    label: workflow ? 'Workflow 执行失败' : 'Agent 执行失败',
    action: '查看运行记录',
  };
}

export default function Dashboard() {
  const allowed = useAdminGuard('/admin/dashboard');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!allowed) return;
    apiFetch('/api/admin/analytics').then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.message || '无法载入统计数据'); setSummary(body.data);
    }).catch((reason: Error) => setError(reason.message));
  }, [allowed]);
  if (!allowed || (!summary && !error)) return <AdminPageState title="数据概览" description="了解站点整体运营情况，掌握内容表现与用户互动。" label="正在进入内容工作台…" />;
  const max = Math.max(1, ...(summary?.daily_events || []).map((item) => item.count));
  return <AdminPage>
    <AdminPageHeader title="数据概览" description="了解站点整体运营情况，掌握内容表现与用户互动。" actions={<Link className="btn btn-primary" to="/admin/posts/new"><Plus /> 新建文章</Link>} />
    <ContentStack>
      {error ? <Feedback type="error">{error}</Feedback> : null}
      {summary ? <>
        <div className="admin-metrics">
          <Panel as={Link} to="/admin/posts"><FileText /><span>文章</span><strong>{summary.total_posts}</strong><small>已发布 {summary.published_posts}</small></Panel>
          <Panel as={Link} to="/admin/posts?status=published"><Eye /><span>总阅读</span><strong>{summary.total_views.toLocaleString()}</strong><small>查看已发布文章</small></Panel>
          <Panel as={Link} to="/admin/comments?status=pending"><MessageSquare /><span>评论</span><strong>{summary.total_comments}</strong><small>待审核 {summary.pending_comments}</small></Panel>
          <Panel as={Link} to="/admin/posts"><Bookmark /><span>收藏</span><strong>{summary.total_bookmarks}</strong><small>查看内容表现</small></Panel>
        </div>
        <div className="dashboard-grid">
          <Panel className="traffic-panel"><div className="panel-heading"><h2>30 天流量趋势</h2><span>页面事件</span></div><div className="admin-chart" role="img" aria-label="最近 30 天访问趋势">{summary.daily_events.map((item) => <div key={item.date} title={`${item.date}: ${item.count}`}><span style={{ height: `${Math.max(4, item.count / max * 100)}%` }} /><small>{item.date.slice(5)}</small></div>)}</div></Panel>
          <Panel className="status-panel"><div className="panel-heading"><h2>内容状态</h2></div><dl><div><dt>已发布</dt><dd>{summary.published_posts}</dd></div><div><dt>草稿与定时</dt><dd>{summary.total_posts - summary.published_posts}</dd></div><div><dt>待审核评论</dt><dd>{summary.pending_comments}</dd></div><div><dt>被举报内容</dt><dd>{summary.reported_items}</dd></div></dl><Link to="/admin/comments?status=pending">处理互动队列 →</Link></Panel>
        </div>
        {summary.ai_alerts.length > 0 ? <Panel className="dashboard-ai-alerts"><div className="panel-heading"><div><h2><AlertTriangle /> AI 运营提醒</h2><small>需要你处理的自动化异常，点击可直接查看执行记录。</small></div><Link to="/admin/agents?tab=records">查看全部记录</Link></div><div className="dashboard-ai-alert-list">{summary.ai_alerts.map((alert) => { const presentation = alertPresentation(alert); return <Link className="dashboard-ai-alert" key={alert.id} to={presentation.destination}><span className="dashboard-ai-alert__icon" aria-hidden="true">{presentation.icon}</span><span className="dashboard-ai-alert__content"><strong>{presentation.label}<em>{alert.title.replace(/^(?:AI 自动化|Workflow|Agent)\s*运行失败：?\s*/, '').trim()}</em></strong><span>{alert.body ? `失败原因：${alert.body}` : '运行未完成，请打开记录查看失败步骤。'}</span><small>{new Date(alert.created_at).toLocaleString('zh-CN')}</small></span><span className="dashboard-ai-alert__action">{presentation.action}<ChevronRight aria-hidden="true" /></span></Link>; })}</div></Panel> : null}
        <Panel className="dashboard-table"><div className="panel-heading"><h2>表现最佳文章</h2><Link to="/admin/posts">查看全部文章</Link></div><div className="table-scroll"><table><thead><tr><th>文章</th><th>阅读量</th><th>点赞</th><th>操作</th></tr></thead><tbody>{summary.top_posts.map((post, index) => <tr key={post.id}><td><span>{index + 1}</span>{post.title}</td><td>{post.views_count}</td><td>{post.likes_count}</td><td><Link to={`/admin/posts/${post.id}/edit`}>编辑</Link></td></tr>)}</tbody></table></div></Panel>
      </> : null}
    </ContentStack>
  </AdminPage>;
}
