import {
  GitBranch,
  Lightbulb,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AgentApproval,
  ContentCandidateSet,
  MediaCandidate,
  OperationalSuggestion,
  Workflow,
} from "../../types/agent";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Heading,
  Statistic,
  Text,
} from "@gouno/ui/core";

export type ConsoleTab = "overview" | "inbox" | "automation" | "records";

interface WorkspaceOverviewProps {
  locale: "en" | "zh";
  approvals: AgentApproval[];
  suggestions: OperationalSuggestion[];
  candidateSets: ContentCandidateSet[];
  mediaCandidates: MediaCandidate[];
  workflows: Workflow[];
  onNavigate: (tab: ConsoleTab) => void;
}

export function WorkspaceOverview({
  locale,
  approvals,
  suggestions,
  candidateSets,
  mediaCandidates,
  workflows,
  onNavigate,
}: WorkspaceOverviewProps) {
  const zh = locale === "zh";
  const pendingApprovals = approvals.filter(
    (item) => item.status === "pending" || item.status === "failed",
  ).length;
  const newSuggestions = suggestions.filter(
    (item) => item.status === "new",
  ).length;
  const pendingCandidates = candidateSets.filter(
    (item) => item.status === "pending",
  ).length;
  const readyMedia = mediaCandidates.filter(
    (item) => item.generation_status === "ready_to_generate",
  ).length;
  const enabledWorkflows = workflows.filter((item) => item.enabled).length;
  const reviewCount =
    pendingApprovals + newSuggestions + pendingCandidates + readyMedia;

  return (
    <div className="workspace-overview flex flex-col gap-6">
      <Card padding="base">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl space-y-2">
            <Heading level={2}>
              {zh
                ? "从一件想改善的事开始"
                : "Start with what you want to improve"}
            </Heading>
            <Text tone="muted">
              {zh
                ? "AI 会找出机会、准备建议；发布、修改和生成始终由你决定。"
                : "AI finds opportunities and prepares proposals. You decide every publish, edit, and generation."}
            </Text>
          </div>
          <Button
            variant="solid"
            color="primary"
            icon={<GitBranch />}
            onClick={() => onNavigate("automation")}
          >
            {zh ? "查看自动化" : "Explore automation"}
          </Button>
        </div>
      </Card>

      <section
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
        aria-label={zh ? "当前待办" : "Current work"}
      >
        <Card padding="base" interactive className="relative h-full">
          <div className="flex items-start justify-between gap-4">
            <Statistic
              title={zh ? "待审批变更" : "Pending Approvals"}
              value={pendingApprovals}
            />
            <ShieldCheck className="size-5 text-muted-foreground" />
          </div>
          <Text size="xs" tone="muted">
            {zh ? "项等待审批" : "awaiting approval"}
          </Text>
          <Button
            variant="ghost"
            aria-label={
              zh
                ? `查看待审批变更：${pendingApprovals} 项`
                : `Review pending approvals: ${pendingApprovals}`
            }
            className="absolute inset-0 z-10 h-auto rounded-lg p-0 hover:bg-transparent"
            onClick={() => onNavigate("inbox")}
          />
        </Card>
        <Card padding="base" interactive className="relative h-full">
          <div className="flex items-start justify-between gap-4">
            <Statistic
              title={zh ? "内容建议" : "Content Suggestions"}
              value={newSuggestions + pendingCandidates}
            />
            <Lightbulb className="size-5 text-muted-foreground" />
          </div>
          <Text size="xs" tone="muted">
            {zh ? "条待处理" : "to review"}
          </Text>
          <Button
            variant="ghost"
            aria-label={
              zh
                ? `查看内容建议：${newSuggestions + pendingCandidates} 条`
                : `Review content suggestions: ${newSuggestions + pendingCandidates}`
            }
            className="absolute inset-0 z-10 h-auto rounded-lg p-0 hover:bg-transparent"
            onClick={() => onNavigate("inbox")}
          />
        </Card>
        <Card padding="base" interactive className="relative h-full">
          <div className="flex items-start justify-between gap-4">
            <Statistic
              title={zh ? "图片任务" : "Media Generation"}
              value={readyMedia}
            />
            <Sparkles className="size-5 text-muted-foreground" />
          </div>
          <Text size="xs" tone="muted">
            {zh ? "个可生成" : "ready"}
          </Text>
          <Button
            variant="ghost"
            aria-label={
              zh
                ? `查看图片任务：${readyMedia} 个可生成`
                : `Review media generation tasks: ${readyMedia} ready`
            }
            className="absolute inset-0 z-10 h-auto rounded-lg p-0 hover:bg-transparent"
            onClick={() => onNavigate("inbox")}
          />
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card padding="none" className="overflow-hidden">
          <CardHeader className="border-b p-6">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">
                {zh ? "下一步做什么？" : "What should I do next?"}
              </CardTitle>
              <Text size="xs" tone="muted">
                {zh
                  ? "按影响与人工决策优先级排序。"
                  : "Sorted by impact and the decisions only you can make."}
              </Text>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-6">
            <strong>
              {reviewCount
                ? zh
                  ? `有 ${reviewCount} 项工作等你决定`
                  : `${reviewCount} items need your decision`
                : zh
                  ? "当前没有需要你处理的事项"
                  : "Nothing needs your decision right now"}
            </strong>
            <Text size="sm" tone="muted">
              {zh
                ? "先审阅 AI 准备好的建议；它不会自行修改博客内容。"
                : "Review AI-prepared proposals first; it never changes blog content on its own."}
            </Text>
            <div>
              <Button
                icon={<ShieldCheck />}
                onClick={() => onNavigate("inbox")}
              >
                {zh ? "进入待我处理" : "Open review queue"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card padding="none" className="overflow-hidden">
          <CardHeader className="border-b p-6">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">
                {zh ? "让 AI 持续帮忙" : "Keep AI working for you"}
              </CardTitle>
              <Text size="xs" tone="muted">
                {zh
                  ? `已启用 ${enabledWorkflows} 个自动化流程。`
                  : `${enabledWorkflows} automations are enabled.`}
              </Text>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-6">
            <ul className="space-y-3 text-sm">
              <li>
                <strong>{zh ? "发布前检查" : "Pre-publish checks"}</strong>
                <Text size="xs" tone="muted">
                  {zh
                    ? "发现 SEO、链接和内容问题。"
                    : "Catch SEO, links, and content issues."}
                </Text>
              </li>
              <li>
                <strong>{zh ? "旧文更新" : "Refresh older posts"}</strong>
                <Text size="xs" tone="muted">
                  {zh
                    ? "发现需要维护的文章。"
                    : "Find posts that need maintenance."}
                </Text>
              </li>
              <li>
                <strong>{zh ? "运营周报" : "Operations reporting"}</strong>
                <Text size="xs" tone="muted">
                  {zh
                    ? "汇总值得关注的变化。"
                    : "Summarize changes worth attention."}
                </Text>
              </li>
            </ul>
            <div>
              <Button icon={<Play />} onClick={() => onNavigate("automation")}>
                {zh ? "配置自动化" : "Configure automation"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
