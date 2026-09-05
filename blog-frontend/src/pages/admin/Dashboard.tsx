import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCheck,
  ChevronRight,
  Eye,
  FileText,
  GitBranch,
  Heart,
  MessageSquare,
  Plus,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { analyticsApi } from "../../api/analytics";
import { notificationsApi } from "../../api/notifications";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageState,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ContentStack,
  EmptyState,
  Feedback,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
      <GitBranch className="h-4 w-4" aria-hidden="true" />
    ) : (
      <Bot className="h-4 w-4" aria-hidden="true" />
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
            <ButtonLink variant="primary" to="/admin/posts/new" icon={<Plus />}>
              新建文章
            </ButtonLink>
          ) : can("moderate", "comment") ? (
            <ButtonLink
              variant="primary"
              to="/admin/comments?status=pending"
              icon={<MessageSquare />}
            >
              审核评论
            </ButtonLink>
          ) : null
        }
      />
      <ContentStack className="space-y-6">
        {error ? <Feedback type="error">{error}</Feedback> : null}
        {summary ? (
          <>
            {/* Top 4 Metrics Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Metric 1: Total Posts */}
              {can("view", "post") ? (
                <Link
                  to="/admin/posts"
                  className="block focus-visible:outline-none"
                >
                  <Card
                    interactive
                    className="group relative overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-md h-full"
                  >
                    <div className="p-5 flex flex-col justify-between h-full space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          文章总数
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-primary">
                          <FileText className="h-4 w-4" />
                        </div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold tracking-tight text-foreground">
                          {summary.total_posts}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                          <span>已发布 {summary.published_posts}</span>
                          <span className="text-border">·</span>
                          <span className="text-amber-400">
                            草稿 {draftsCount}
                          </span>
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ) : (
                <Card className="group relative overflow-hidden h-full">
                  <div className="p-5 flex flex-col justify-between h-full space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        文章总数
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold tracking-tight text-foreground">
                        {summary.total_posts}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                        <span>已发布 {summary.published_posts}</span>
                        <span className="text-border">·</span>
                        <span className="text-amber-400">
                          草稿 {draftsCount}
                        </span>
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Metric 2: Total Views */}
              {can("view", "post") ? (
                <Link
                  to="/admin/posts?status=published"
                  className="block focus-visible:outline-none"
                >
                  <Card
                    interactive
                    className="group relative overflow-hidden transition-all duration-200 hover:border-emerald-500/40 hover:shadow-md h-full"
                  >
                    <div className="p-5 flex flex-col justify-between h-full space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          总阅读量
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                          <Eye className="h-4 w-4" />
                        </div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold tracking-tight text-foreground">
                          {summary.total_views.toLocaleString()}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          全站累计公开阅读次数
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ) : (
                <Card className="group relative overflow-hidden h-full">
                  <div className="p-5 flex flex-col justify-between h-full space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        总阅读量
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                        <Eye className="h-4 w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold tracking-tight text-foreground">
                        {summary.total_views.toLocaleString()}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        全站累计公开阅读次数
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Metric 3: Total Likes */}
              {can("view", "post") ? (
                <Link
                  to="/admin/posts"
                  className="block focus-visible:outline-none"
                >
                  <Card
                    interactive
                    className="group relative overflow-hidden transition-all duration-200 hover:border-pink-500/40 hover:shadow-md h-full"
                  >
                    <div className="p-5 flex flex-col justify-between h-full space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          总获赞数
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/10 text-pink-400">
                          <Heart className="h-4 w-4" />
                        </div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold tracking-tight text-foreground">
                          {summary.total_likes.toLocaleString()}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          读者正向互动累计
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ) : (
                <Card className="group relative overflow-hidden h-full">
                  <div className="p-5 flex flex-col justify-between h-full space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        总获赞数
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/10 text-pink-400">
                        <Heart className="h-4 w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold tracking-tight text-foreground">
                        {summary.total_likes.toLocaleString()}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        读者正向互动累计
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Metric 4: Comments / Media */}
              {can("moderate", "comment") || can("view", "media") ? (
                <Link
                  to={
                    can("moderate", "comment")
                      ? "/admin/comments?status=pending"
                      : "/admin/media"
                  }
                  className="block focus-visible:outline-none"
                >
                  <Card
                    interactive
                    className="group relative overflow-hidden transition-all duration-200 hover:border-violet-500/40 hover:shadow-md h-full"
                  >
                    <div className="p-5 flex flex-col justify-between h-full space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          评论互动
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold tracking-tight text-foreground">
                          {summary.total_comments}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                          {summary.pending_comments > 0 ? (
                            <span className="font-semibold text-amber-400">
                              待审核 {summary.pending_comments} 条
                            </span>
                          ) : (
                            <span>全站互动良好</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ) : (
                <Card className="group relative overflow-hidden h-full">
                  <div className="p-5 flex flex-col justify-between h-full space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        评论互动
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold tracking-tight text-foreground">
                        {summary.total_comments}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                        {summary.pending_comments > 0 ? (
                          <span className="font-semibold text-amber-400">
                            待审核 {summary.pending_comments} 条
                          </span>
                        ) : (
                          <span>全站互动良好</span>
                        )}
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* Main Section: Traffic Chart & Content Health */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Traffic Chart (2 cols) */}
              <Card className="lg:col-span-2 overflow-hidden flex flex-col">
                <CardHeader className="pb-2 border-b border-border/60">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        30 天访问趋势
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        每日页面访问量分布
                      </p>
                    </div>
                    <Badge tone="primary" pill>
                      近 30 天
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 flex-1 flex flex-col justify-end">
                  <div
                    className="flex h-48 items-end gap-1.5 sm:gap-2 px-2"
                    role="img"
                    aria-label="最近 30 天访问趋势"
                  >
                    {summary.daily_events.map((item) => {
                      const pct = Math.max(
                        6,
                        Math.round((item.count / max) * 100),
                      );
                      return (
                        <div
                          key={item.date}
                          className="group relative flex-1 flex flex-col items-center justify-end h-full"
                          title={`${item.date}: ${item.count} 次访问`}
                        >
                          <div
                            className="w-full rounded-t-sm bg-primary/70 transition-all duration-200 group-hover:bg-primary group-hover:shadow-sm"
                            style={{ height: `${pct}%` }}
                          />
                          <span className="mt-2 text-[10px] text-muted-foreground/60 hidden sm:block truncate">
                            {item.date.slice(8)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Content Health & Moderation (1 col) */}
              <Card className="flex flex-col">
                <CardHeader className="pb-2 border-b border-border/60">
                  <CardTitle className="text-base">内容治理与指标</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    关键待办事项与健康指标
                  </p>
                </CardHeader>
                <CardContent className="pt-6 flex-1 flex flex-col justify-center space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border bg-secondary/40 p-3.5 space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        待审核评论
                      </span>
                      <div className="text-xl font-bold text-foreground">
                        {summary.pending_comments}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/40 p-3.5 space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        被举报内容
                      </span>
                      <div className="text-xl font-bold text-foreground">
                        {summary.reported_items}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/40 p-3.5 space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        已发布文章
                      </span>
                      <div className="text-xl font-bold text-emerald-400">
                        {summary.published_posts}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/40 p-3.5 space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        草稿待发布
                      </span>
                      <div className="text-xl font-bold text-amber-400">
                        {draftsCount}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <span>系统状态正常</span>
                    <Link
                      to="/admin/posts"
                      className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                    >
                      文章管理 <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* AI Operations Alerts Card (if any) */}
            {can("manage", "ai") && summary.ai_alerts?.length ? (
              <Card className="border-amber-500/30 bg-amber-950/10 overflow-hidden">
                <CardHeader className="pb-3 border-b border-amber-500/20">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base text-amber-300 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                        AI 运营提醒
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        需要你关注或审批的自动化执行记录，点击可直接查看详情。
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="compact"
                        type="button"
                        disabled={clearingAlerts}
                        onClick={() => void dismissAllAlerts()}
                        icon={<CheckCheck className="h-3.5 w-3.5" />}
                      >
                        {clearingAlerts ? "正在清除…" : "全部已读"}
                      </Button>
                      <ButtonLink
                        variant="ghost"
                        size="compact"
                        to="/admin/ai-ops?tab=records"
                      >
                        查看全部记录
                      </ButtonLink>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-amber-500/10">
                  {summary.ai_alerts.map((alert) => {
                    const presentation = alertPresentation(alert);
                    return (
                      <Link
                        key={alert.id}
                        to={presentation.destination}
                        className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-amber-500/5 group"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 mt-0.5">
                            {presentation.icon}
                          </div>
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-foreground">
                                {presentation.label}
                              </span>
                              <span className="text-xs font-medium text-amber-300">
                                {alert.title
                                  .replace(
                                    /^(?:AI 自动化|Workflow|Agent)\s*运行失败：?\s*/,
                                    "",
                                  )
                                  .trim()}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {alert.body
                                ? `失败原因：${alert.body}`
                                : "运行未完成，请打开记录查看失败步骤。"}
                            </p>
                            <time className="text-[11px] text-muted-foreground/60 block">
                              {new Date(alert.created_at).toLocaleString(
                                "zh-CN",
                              )}
                            </time>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-medium text-primary shrink-0 group-hover:translate-x-0.5 transition-transform">
                          <span>{presentation.action}</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}

            {/* Top Posts Table Card */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">表现最佳文章</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      按全站阅读量与点赞数排序的热门内容
                    </p>
                  </div>
                  {can("view", "post") ? (
                    <ButtonLink
                      variant="ghost"
                      size="compact"
                      to="/admin/posts"
                      icon={<ArrowUpRight />}
                    >
                      查看全部文章
                    </ButtonLink>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {summary.top_posts.length === 0 ? (
                  <EmptyState label="暂无表现数据" className="py-12" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">排名</TableHead>
                        <TableHead>文章标题</TableHead>
                        <TableHead className="w-28 text-right">
                          阅读量
                        </TableHead>
                        <TableHead className="w-28 text-right">
                          点赞数
                        </TableHead>
                        <TableHead className="w-36 text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.top_posts.map((post, index) => {
                        const canEdit = can("edit", "post", post);
                        return (
                          <TableRow key={post.id} className="hover:bg-muted/40">
                            <TableCell className="text-center font-mono font-medium text-muted-foreground text-xs">
                              {index + 1}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {post.title}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {post.views_count.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {post.likes_count.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <ButtonLink
                                  variant="ghost"
                                  size="compact"
                                  to={`/admin/posts/${post.id}/edit`}
                                >
                                  {canEdit ? "编辑" : "查看"}
                                </ButtonLink>
                                <ButtonLink
                                  variant="ghost"
                                  size="compact"
                                  to={`/articles/${post.slug || post.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  前台
                                </ButtonLink>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </ContentStack>
    </AdminPage>
  );
}
