import { useEffect, useState, type ReactNode } from "react";
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
  Alert,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  Skeleton,
  Statistic,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Text,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
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
      <GitBranch className="size-4" aria-hidden="true" />
    ) : (
      <Bot className="size-4" aria-hidden="true" />
    ),
    label: workflow ? "Workflow 执行失败" : "Agent 执行失败",
    action: destination.includes("run=") ? "查看失败详情" : "打开运行中心",
  };
}

function MetricCard({
  icon,
  title,
  value,
  detail,
  to,
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  detail: ReactNode;
  to?: string;
}) {
  const content = (
    <Card padding="base" interactive={Boolean(to)} className="h-full">
      <div className="flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <Statistic title={title} value={value} />
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
            {icon}
          </span>
        </div>
        <div className="mt-auto text-xs text-muted-foreground">{detail}</div>
      </div>
    </Card>
  );

  return to ? (
    <Link
      to={to}
      className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

function DashboardLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="数据概览加载中"
      aria-live="polite"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} padding="base">
            <div className="flex flex-col gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-36" />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card padding="base" className="lg:col-span-2">
          <Skeleton className="h-64 w-full" />
        </Card>
        <Card padding="base">
          <Skeleton className="h-64 w-full" />
        </Card>
      </div>
      <Card padding="base">
        <Skeleton className="h-56 w-full" />
      </Card>
    </div>
  );
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
      setSummary((current) => (current ? { ...current, ai_alerts: [] } : null));
      window.dispatchEvent(new CustomEvent("community:notifications-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "标记已读失败");
    } finally {
      setClearingAlerts(false);
    }
  };

  const pageHeader = (
    <PageHeader
      title="数据概览"
      description="了解站点整体运营情况，掌握内容表现与用户互动。"
      actions={
        can("create", "post") ? (
          <ButtonLink
            variant="solid"
            color="primary"
            to="/admin/posts/new"
            icon={<Plus />}
          >
            新建文章
          </ButtonLink>
        ) : can("moderate", "comment") ? (
          <ButtonLink
            variant="solid"
            color="primary"
            to="/admin/comments?status=pending"
            icon={<MessageSquare />}
          >
            审核评论
          </ButtonLink>
        ) : null
      }
    />
  );

  if (!allowed || (!summary && !error)) {
    return (
      <div className="flex flex-col gap-6">
        {pageHeader}
        <DashboardLoading />
      </div>
    );
  }

  const maxTraffic = Math.max(
    1,
    ...(summary?.daily_events || []).map((item) => item.count),
  );
  const draftsCount = Math.max(
    0,
    (summary?.total_posts ?? 0) - (summary?.published_posts ?? 0),
  );
  const trafficTotal = (summary?.daily_events || []).reduce(
    (total, item) => total + item.count,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {pageHeader}

      {error ? <Alert type="error" showIcon title={error} /> : null}

      {summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={<FileText className="size-4" />}
              title="文章总数"
              value={summary.total_posts.toLocaleString()}
              detail={
                <span>
                  已发布 {summary.published_posts} · 草稿 {draftsCount}
                </span>
              }
              to={can("view", "post") ? "/admin/posts" : undefined}
            />
            <MetricCard
              icon={<Eye className="size-4" />}
              title="总阅读量"
              value={summary.total_views.toLocaleString()}
              detail="全站累计公开阅读次数"
              to={
                can("view", "post")
                  ? "/admin/posts?status=published"
                  : undefined
              }
            />
            <MetricCard
              icon={<Heart className="size-4" />}
              title="总获赞数"
              value={summary.total_likes.toLocaleString()}
              detail="读者正向互动累计"
              to={can("view", "post") ? "/admin/posts" : undefined}
            />
            <MetricCard
              icon={<MessageSquare className="size-4" />}
              title="评论互动"
              value={summary.total_comments.toLocaleString()}
              detail={
                summary.pending_comments > 0
                  ? `待审核 ${summary.pending_comments} 条`
                  : "全站互动良好"
              }
              to={
                can("moderate", "comment")
                  ? "/admin/comments?status=pending"
                  : can("view", "media")
                    ? "/admin/media"
                    : undefined
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card padding="none" className="overflow-hidden lg:col-span-2">
              <CardHeader className="border-b p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="size-4 text-primary" />
                      30 天访问趋势
                    </CardTitle>
                    <Text size="xs" tone="muted">
                      每日页面访问量分布
                    </Text>
                  </div>
                  <Tag color="primary">
                    {trafficTotal.toLocaleString()} 次访问
                  </Tag>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {summary.daily_events.length === 0 ? (
                  <Empty
                    title="暂无访问趋势"
                    description="产生公开页面访问后，这里会显示最近 30 天趋势。"
                  />
                ) : (
                  <div
                    className="flex h-56 items-end gap-1.5 sm:gap-2"
                    role="img"
                    aria-label="最近 30 天访问趋势"
                  >
                    {summary.daily_events.map((item) => {
                      const height = Math.max(
                        6,
                        Math.round((item.count / maxTraffic) * 100),
                      );
                      return (
                        <div
                          key={item.date}
                          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                          title={`${item.date}: ${item.count} 次访问`}
                        >
                          <div
                            className="w-full rounded-t-sm bg-primary/65 transition-opacity hover:bg-primary"
                            style={{ height: `${height}%` }}
                          />
                          <span className="hidden truncate text-[10px] text-muted-foreground sm:block">
                            {item.date.slice(-2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card padding="none" className="overflow-hidden">
              <CardHeader className="border-b p-6">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base">内容治理与指标</CardTitle>
                  <Text size="xs" tone="muted">
                    关键待办事项与健康指标
                  </Text>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 p-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <Text size="xs" tone="muted">
                      待审核评论
                    </Text>
                    <div className="mt-1 text-xl font-semibold">
                      {summary.pending_comments}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <Text size="xs" tone="muted">
                      被举报内容
                    </Text>
                    <div className="mt-1 text-xl font-semibold">
                      {summary.reported_items}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <Text size="xs" tone="muted">
                      已发布文章
                    </Text>
                    <div className="mt-1 text-xl font-semibold">
                      {summary.published_posts}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <Text size="xs" tone="muted">
                      草稿待发布
                    </Text>
                    <div className="mt-1 text-xl font-semibold">
                      {draftsCount}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t pt-4">
                  <Text size="xs" tone="muted">
                    系统状态正常
                  </Text>
                  {can("view", "post") ? (
                    <ButtonLink
                      size="small"
                      variant="text"
                      to="/admin/posts"
                      icon={<ChevronRight />}
                      iconPlacement="end"
                    >
                      文章管理
                    </ButtonLink>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          {can("manage", "ai") && summary.ai_alerts?.length ? (
            <Card padding="none" className="overflow-hidden border-warning/40">
              <CardHeader className="border-b p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="size-4 text-warning" />
                      AI 运营提醒
                    </CardTitle>
                    <Text size="xs" tone="muted">
                      需要你关注或审批的自动化执行记录，点击可直接查看详情。
                    </Text>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="small"
                      type="button"
                      disabled={clearingAlerts}
                      loading={clearingAlerts}
                      loadingText="正在清除…"
                      onClick={() => void dismissAllAlerts()}
                      icon={<CheckCheck />}
                    >
                      全部已读
                    </Button>
                    <ButtonLink
                      variant="text"
                      size="small"
                      to="/admin/ai-ops?tab=records"
                    >
                      查看全部记录
                    </ButtonLink>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {summary.ai_alerts.map((alert) => {
                  const presentation = alertPresentation(alert);
                  return (
                    <Link
                      key={alert.id}
                      to={presentation.destination}
                      className="group flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/40 sm:p-6"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                          {presentation.icon}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {presentation.label}
                            </span>
                            <span className="text-xs font-medium text-warning">
                              {alert.title
                                .replace(
                                  /^(?:AI 自动化|Workflow|Agent)\s*运行失败：?\s*/,
                                  "",
                                )
                                .trim()}
                            </span>
                          </div>
                          <Text size="xs" tone="muted" className="line-clamp-1">
                            {alert.body
                              ? `失败原因：${alert.body}`
                              : "运行未完成，请打开记录查看失败步骤。"}
                          </Text>
                          <time className="block text-[11px] text-muted-foreground">
                            {new Date(alert.created_at).toLocaleString("zh-CN")}
                          </time>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-primary transition-transform group-hover:translate-x-0.5">
                        {presentation.action}
                      </span>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          <Card padding="none" className="overflow-hidden">
            <CardHeader className="border-b p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base">表现最佳文章</CardTitle>
                  <Text size="xs" tone="muted">
                    按全站阅读量与点赞数排序的热门内容
                  </Text>
                </div>
                {can("view", "post") ? (
                  <ButtonLink
                    variant="text"
                    size="small"
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
                <div className="p-6">
                  <Empty
                    title="暂无表现数据"
                    description="发布文章并产生阅读后，这里会出现热门内容排行。"
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center">排名</TableHead>
                      <TableHead>文章标题</TableHead>
                      <TableHead className="w-28 text-right">阅读量</TableHead>
                      <TableHead className="w-28 text-right">点赞数</TableHead>
                      <TableHead className="w-36 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.top_posts.map((post, index) => {
                      const canEdit = can("edit", "post", post);
                      return (
                        <TableRow key={post.id}>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {post.title}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {post.views_count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {post.likes_count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex min-w-max flex-nowrap items-center justify-end gap-1">
                              <ButtonLink
                                variant="text"
                                size="small"
                                to={`/admin/posts/${post.id}/edit`}
                              >
                                {canEdit ? "编辑" : "查看"}
                              </ButtonLink>
                              <ButtonLink
                                variant="text"
                                size="small"
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
    </div>
  );
}
