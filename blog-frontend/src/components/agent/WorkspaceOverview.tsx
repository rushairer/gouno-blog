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
import { Button, Panel } from "../ui";

export type ConsoleTab =
  | "overview"
  | "inbox"
  | "automation"
  | "records"
  | "advanced";

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
    <div className="workspace-overview section-stack">
      <Panel className="workspace-overview__hero">
        <div>
          <h2>
            {zh
              ? "从一件想改善的事开始"
              : "Start with what you want to improve"}
          </h2>
          <p>
            {zh
              ? "AI 会找出机会、准备建议；发布、修改和生成始终由你决定。"
              : "AI finds opportunities and prepares proposals. You decide every publish, edit, and generation."}
          </p>
        </div>
        <Button
          variant="primary"
          type="button"
          icon={<GitBranch />}
          onClick={() => onNavigate("automation")}
        >
          {zh ? "查看自动化" : "Explore automation"}
        </Button>
      </Panel>
      <section
        className="workspace-overview__summary admin-metrics"
        aria-label={zh ? "当前待办" : "Current work"}
      >
        <Panel as="button" type="button" onClick={() => onNavigate("inbox")}>
          <ShieldCheck />
          <span>{zh ? "待审批变更" : "Pending Approvals"}</span>
          <strong>{pendingApprovals}</strong>
          <small>{zh ? "项等待审批" : "awaiting approval"}</small>
        </Panel>
        <Panel as="button" type="button" onClick={() => onNavigate("inbox")}>
          <Lightbulb />
          <span>{zh ? "内容建议" : "Content Suggestions"}</span>
          <strong>{newSuggestions + pendingCandidates}</strong>
          <small>{zh ? "条待处理" : "to review"}</small>
        </Panel>
        <Panel as="button" type="button" onClick={() => onNavigate("inbox")}>
          <Sparkles />
          <span>{zh ? "图片任务" : "Media Generation"}</span>
          <strong>{readyMedia}</strong>
          <small>{zh ? "个可生成" : "ready"}</small>
        </Panel>
      </section>
      <div className="workspace-overview__columns">
        <Panel>
          <div className="panel-heading">
            <div>
              <h3>{zh ? "下一步做什么？" : "What should I do next?"}</h3>
              <small>
                {zh
                  ? "按影响与人工决策优先级排序。"
                  : "Sorted by impact and the decisions only you can make."}
              </small>
            </div>
          </div>
          <div className="workspace-overview__next">
            <strong>
              {reviewCount
                ? zh
                  ? `有 ${reviewCount} 项工作等你决定`
                  : `${reviewCount} items need your decision`
                : zh
                  ? "当前没有需要你处理的事项"
                  : "Nothing needs your decision right now"}
            </strong>
            <p>
              {zh
                ? "先审阅 AI 准备好的建议；它不会自行修改博客内容。"
                : "Review AI-prepared proposals first; it never changes blog content on its own."}
            </p>
            <Button
              variant="secondary"
              type="button"
              icon={<ShieldCheck />}
              onClick={() => onNavigate("inbox")}
            >
              {zh ? "进入待我处理" : "Open review queue"}
            </Button>
          </div>
        </Panel>
        <Panel>
          <div className="panel-heading">
            <div>
              <h3>{zh ? "让 AI 持续帮忙" : "Keep AI working for you"}</h3>
              <small>
                {zh
                  ? `已启用 ${enabledWorkflows} 个自动化流程。`
                  : `${enabledWorkflows} automations are enabled.`}
              </small>
            </div>
          </div>
          <ul className="workspace-overview__goals">
            <li>
              <b>{zh ? "发布前检查" : "Pre-publish checks"}</b>
              <span>
                {zh
                  ? "发现 SEO、链接和内容问题。"
                  : "Catch SEO, links, and content issues."}
              </span>
            </li>
            <li>
              <b>{zh ? "旧文更新" : "Refresh older posts"}</b>
              <span>
                {zh
                  ? "发现需要维护的文章。"
                  : "Find posts that need maintenance."}
              </span>
            </li>
            <li>
              <b>{zh ? "运营周报" : "Operations reporting"}</b>
              <span>
                {zh
                  ? "汇总值得关注的变化。"
                  : "Summarize changes worth attention."}
              </span>
            </li>
          </ul>
          <Button
            variant="secondary"
            type="button"
            icon={<Play />}
            onClick={() => onNavigate("automation")}
          >
            {zh ? "配置自动化" : "Configure automation"}
          </Button>
        </Panel>
      </div>
    </div>
  );
}
