import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCheck,
  ChevronRight,
  Eye,
  FileText,
  GitBranch,
  Heart,
  Image as ImageIcon,
  MessageSquare,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { analyticsApi } from "../../api/analytics";
import { notificationsApi } from "../../api/notifications";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageState,
  Button,
  buttonClassName,
  ContentStack,
  Feedback,
  Panel,
} from "../../components/ui";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { useAbility } from "../../abilities";

interface Summary {
  total_posts: number;
  published_posts: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  pending_comments: number;
  reported_items: number;
  top_posts: Array<{
    id: number;
    title: string;
    slug: string;
    views_count: number;
    likes_count: number;
    created_by_principal_id?: number | null;
  }>;
  daily_events: Array<{ date: string; count: number }>;
  ai_alerts: Array<{
    id: number;
    type: string;
    title: string;
    body: string;
    href: string;
    created_at: string;
  }>;
}

function alertPresentation(alert: Summary["ai_alerts"][number]) {
  const workflow = alert.type === "ai_workflow_failed";
  const destination =
    alert.href ||
    (workflow
      ? "/admin/ai-ops?tab=records&record=workflow"
      : "/admin/ai-ops?tab=records&record=agent");
  return {
    destination,
    icon: workflow ? (
      <GitBranch aria-hidden="true" />
    ) : (
      <Bot aria-hidden="true" />
    ),
    label: workflow ? "Workflow 执行失败" : "Agent 执行失败",
    action: destination.includes("run=") ? "查看失败详情" : "打开运行中心",
  };
}

export default function Dashboard() {
  const allowed = useAdminGuard("/admin/dashboard");
  const { can } = useAbility();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [clearingAlerts, setClearingAlerts] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    analyticsApi
      .getSummary()
      .then((data) => setSummary(data as unknown as Summary))
      .catch((reason: Error) => setError(reason.message));
  }, [allowed]);

  const dismissAllAlerts = async () => {
    setClearingAlerts(true);
    try {
      await notificationsApi.markAllRead();
      setSummary((prev) => (prev ? { ...prev, ai_alerts: [] } : null));
      window.dispatchEvent(new CustomEvent("community:notifications-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "标记已读失败");
    } finally {
      setClearingAlerts(false);
    }
  };

  if (!allowed || (!summary && !error))
    return (
      <AdminPageState
        title="数据概览"
        description="了解站点整体运营情况，掌握内容表现与用户互动。"
        label="正在进入内容工作台…"
      />
    );
  const max = Math.max(
    1,
    ...(summary?.daily_events || []).map((item) => item.count),
  );

  const draftsCount = Math.max(
    0,
    (summary?.total_posts ?? 0) - (summary?.published_posts ?? 0),
  );

  return (
    <AdminPage>
      <AdminPageHeader
        title="数据概览"
        description="了解站点整体运营情况，掌握内容表现与用户互动。"
        actions={
          can("create", "post") ? (
            <Link
              className={buttonClassName({ variant: "primary" })}
              to="/admin/posts/new"
            >
              <Plus /> 新建文章
            </Link>
          ) : can("moderate", "comment") ? (
            <Link
              className={buttonClassName({ variant: "primary" })}
              to="/admin/comments?status=pending"
            >
              <MessageSquare /> 审核评论
            </Link>
          ) : null
        }
      />
      <ContentStack>
        {error ? <Feedback type="error">{error}</Feedback> : null}
        {summary ? (
          <>
            <div className="admin-metrics">
              {can("view", "post") ? (
                <Panel as={Link} to="/admin/posts">
                  <FileText />
                  <span>文章</span>
                  <strong>{summary.total_posts}</strong>
                  <small>
                    已发布 {summary.published_posts} · 草稿 {draftsCount}
                  </small>
                </Panel>
              ) : (
                <Panel>
                  <FileText />
                  <span>文章</span>
                  <strong>{summary.total_posts}</strong>
                  <small>已发布 {summary.published_posts}</small>
                </Panel>
              )}
              {can("view", "post") ? (
                <Panel as={Link} to="/admin/posts?status=published">
                  <Eye />
                  <span>总阅读</span>
                  <strong>{summary.total_views.toLocaleString()}</strong>
                  <small>查看已发布文章</small>
                </Panel>
              ) : (
                <Panel>
                  <Eye />
                  <span>总阅读</span>
                  <strong>{summary.total_views.toLocaleString()}</strong>
                  <small>全站累计阅读</small>
                </Panel>
              )}
              {can("view", "post") ? (
                <Panel as={Link} to="/admin/posts">
                  <Heart />
                  <span>总点赞</span>
                  <strong>{summary.total_likes.toLocaleString()}</strong>
                  <small>全站累计获赞</small>
                </Panel>
              ) : (
                <Panel>
                  <Heart />
                  <span>总点赞</span>
                  <strong>{summary.total_likes.toLocaleString()}</strong>
                  <small>全站累计获赞</small>
                </Panel>
              )}
              {can("moderate", "comment") ? (
                <Panel as={Link} to="/admin/comments?status=pending">
                  <MessageSquare />
                  <span>评论互动</span>
                  <strong>{summary.total_comments}</strong>
                  <small>待审核 {summary.pending_comments}</small>
                </Panel>
              ) : can("view", "media") ? (
                <Panel as={Link} to="/admin/media">
                  <ImageIcon />
                  <span>媒体素材</span>
                  <strong>媒体库</strong>
                  <small>浏览与选用全站素材</small>
                </Panel>
              ) : (
                <Panel>
                  <MessageSquare />
                  <span>评论互动</span>
                  <strong>{summary.total_comments}</strong>
                  <small>全站累计互动</small>
                </Panel>
              )}
            </div>
            <div className="dashboard-grid">
              <Panel className="traffic-panel">
                <div className="panel-heading">
                  <h2>30 天流量趋势</h2>
                  <span>页面访问</span>
                </div>
                <div
                  className="admin-chart"
                  role="img"
                  aria-label="最近 30 天访问趋势"
                >
                  {summary.daily_events.map((item) => (
                    <div
                      key={item.date}
                      title={`${item.date}: ${item.count} 次访问`}
                    >
                      <div
                        className="admin-chart-bar"
                        style={{
                          height: `${Math.max(
                            6,
                            Math.round((item.count / max) * 100),
                          )}%`,
                        }}
                      />
                      <small>{item.date.slice(5)}</small>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel className="top-posts-panel">
                <div className="panel-heading">
                  <h2>内容指标</h2>
                  <span>累计统计</span>
                </div>
                <div className="admin-status-grid">
                  {can("moderate", "comment") ? (
                    <>
                      <div>
                        <span>待审核评论</span>
                        <strong>{summary.pending_comments}</strong>
                      </div>
                      <div>
                        <span>被举报内容</span>
                        <strong>{summary.reported_items}</strong>
                      </div>
                      <div>
                        <span>总文章数</span>
                        <strong>{summary.total_posts}</strong>
                      </div>
                      <div>
                        <span>已发布文章</span>
                        <strong>{summary.published_posts}</strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span>总文章数</span>
                        <strong>{summary.total_posts}</strong>
                      </div>
                      <div>
                        <span>已发布文章</span>
                        <strong>{summary.published_posts}</strong>
                      </div>
                      <div>
                        <span>草稿与待发</span>
                        <strong>{draftsCount}</strong>
                      </div>
                      <div>
                        <span>全站累计阅读</span>
                        <strong>{summary.total_views.toLocaleString()}</strong>
                      </div>
                    </>
                  )}
                </div>
              </Panel>
            </div>
            {can("manage", "ai") && summary.ai_alerts?.length ? (
              <Panel className="dashboard-ai-alerts">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <AlertTriangle /> AI 运营提醒
                    </h2>
                    <small>
                      需要你处理的自动化异常，点击可直接查看执行记录。
                    </small>
                  </div>
                  <div className="dashboard-ai-alerts__actions">
                    <Button
                      variant="secondary"
                      size="compact"
                      type="button"
                      disabled={clearingAlerts}
                      onClick={() => void dismissAllAlerts()}
                    >
                      <CheckCheck />
                      {clearingAlerts ? "正在清除…" : "全部已读"}
                    </Button>
                    <Link to="/admin/ai-ops?tab=records">查看全部记录</Link>
                  </div>
                </div>
                <div className="dashboard-ai-alert-list">
                  {summary.ai_alerts.map((alert) => {
                    const presentation = alertPresentation(alert);
                    return (
                      <Link
                        className="dashboard-ai-alert"
                        key={alert.id}
                        to={presentation.destination}
                      >
                        <span
                          className="dashboard-ai-alert__icon"
                          aria-hidden="true"
                        >
                          {presentation.icon}
                        </span>
                        <span className="dashboard-ai-alert__content">
                          <strong>
                            {presentation.label}
                            <em>
                              {alert.title
                                .replace(
                                  /^(?:AI 自动化|Workflow|Agent)\s*运行失败：?\s*/,
                                  "",
                                )
                                .trim()}
                            </em>
                          </strong>
                          <span>
                            {alert.body
                              ? `失败原因：${alert.body}`
                              : "运行未完成，请打开记录查看失败步骤。"}
                          </span>
                          <small>
                            {new Date(alert.created_at).toLocaleString("zh-CN")}
                          </small>
                        </span>
                        <span className="dashboard-ai-alert__action">
                          {presentation.action}
                          <ChevronRight aria-hidden="true" />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </Panel>
            ) : null}
            <Panel className="dashboard-table">
              <div className="panel-heading">
                <h2>表现最佳文章</h2>
                {can("view", "post") ? (
                  <Link to="/admin/posts">查看全部文章</Link>
                ) : null}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>文章</th>
                      <th>阅读量</th>
                      <th>点赞</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.top_posts.map((post, index) => {
                      const canEdit = can("edit", "post", post);
                      return (
                        <tr key={post.id}>
                          <td>
                            <span>{index + 1}</span>
                            {post.title}
                          </td>
                          <td>{post.views_count}</td>
                          <td>{post.likes_count}</td>
                          <td>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 12,
                              }}
                            >
                              {canEdit ? (
                                <Link to={`/admin/posts/${post.id}/edit`}>
                                  编辑
                                </Link>
                              ) : (
                                <Link to={`/admin/posts/${post.id}/edit`}>
                                  查看
                                </Link>
                              )}
                              <Link
                                to={`/articles/${post.slug || post.id}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: "var(--text-3)" }}
                              >
                                前台
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        ) : null}
      </ContentStack>
    </AdminPage>
  );
}
