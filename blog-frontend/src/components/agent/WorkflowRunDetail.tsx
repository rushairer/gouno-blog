import { ArrowLeft, Ban, Trash2 } from "lucide-react";
import type { ArticleImagePreview } from "../../api/operations";
import type {
  MediaCandidate,
  WorkflowInteractionTask,
  WorkflowResource,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowStepRun,
} from "../../types/agent";
import { Button, EmptyState, PanelHeader, WorkspacePanel } from "../ui";
import { StatusPill } from "./StatusPill";
import { WorkflowMediaCandidates } from "./WorkflowMediaCandidates";
import { WorkflowRunOutput } from "./WorkflowRunOutput";

function duration(start?: string, finish?: string): string {
  if (!start) return "—";
  const ended = finish ? new Date(finish).getTime() : Date.now();
  const seconds = Math.max(0, (ended - new Date(start).getTime()) / 1000);
  return `${seconds.toFixed(1)} s`;
}

function newestFirst<T extends { id: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.id - a.id);
}

function JsonLog({ value }: { value: unknown }) {
  if (value === undefined || value === null) return <span>—</span>;
  return (
    <pre className="agent-json-preview">{JSON.stringify(value, null, 2)}</pre>
  );
}

export interface WorkflowRunDetailData {
  run: WorkflowRun;
  steps: WorkflowStepRun[];
  resources: WorkflowResource[];
  interactions: WorkflowInteractionTask[];
  candidates: MediaCandidate[];
  events: WorkflowRunEvent[];
}

export interface WorkflowRunDetailProps {
  selected: WorkflowRunDetailData;
  locale: "en" | "zh";
  workflowName: string;
  formatDateTime: (value: string) => string;
  cancelling: boolean;
  deleting: boolean;
  retrying: string;
  batchBusy: string;
  generationNow: number;
  candidateSelections: Record<number, boolean>;
  setCandidateSelections: React.Dispatch<
    React.SetStateAction<Record<number, boolean>>
  >;
  candidatePlacement: Record<number, string>;
  setCandidatePlacement: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  candidateAnchor: Record<number, string>;
  setCandidateAnchor: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  generationInstructions: Record<number, string>;
  setGenerationInstructions: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  imagePreviews: Record<number, ArticleImagePreview>;
  onBack: () => void;
  onCancelRun: () => Promise<void>;
  onDeleteRun: () => Promise<void>;
  onResolveInteraction: (
    task: WorkflowInteractionTask,
    response: unknown,
  ) => Promise<void>;
  onCancelInteraction: (task: WorkflowInteractionTask) => Promise<void>;
  onBatchSelect: () => Promise<void>;
  onBatchPreview: () => Promise<void>;
  onBatchReject: () => Promise<void>;
  onBatchApply: () => Promise<void>;
  onCandidateAction: (
    candidate: MediaCandidate,
    action: "select" | "apply" | "regenerate" | "reject",
  ) => Promise<void>;
  onCancelGeneration: (candidate: MediaCandidate) => Promise<void>;
  onPreviewCandidate: (
    candidate: MediaCandidate,
    openDialog?: boolean,
  ) => Promise<void>;
  onRetryStep: (step: WorkflowStepRun) => Promise<void>;
  onRetryFailedGroup: (stepID: string) => Promise<void>;
}

export function WorkflowRunDetail({
  selected,
  locale,
  workflowName,
  formatDateTime,
  cancelling,
  deleting,
  retrying,
  batchBusy,
  generationNow,
  candidateSelections,
  setCandidateSelections,
  candidatePlacement,
  setCandidatePlacement,
  candidateAnchor,
  setCandidateAnchor,
  generationInstructions,
  setGenerationInstructions,
  imagePreviews,
  onBack,
  onCancelRun,
  onDeleteRun,
  onResolveInteraction,
  onCancelInteraction,
  onBatchSelect,
  onBatchPreview,
  onBatchReject,
  onBatchApply,
  onCandidateAction,
  onCancelGeneration,
  onPreviewCandidate,
  onRetryStep,
  onRetryFailedGroup,
}: WorkflowRunDetailProps) {
  const zh = locale === "zh";

  return (
    <div className="workflow-run-detail-view section-stack">
      <div className="workflow-detail-nav">
        <Button
          variant="ghost"
          size="compact"
          type="button"
          onClick={onBack}
          icon={<ArrowLeft />}
        >
          {zh ? "返回运行记录列表" : "Back to run records"}
        </Button>
      </div>
      <WorkspacePanel className="agent-detail-panel">
        <div className="section-stack">
          <PanelHeader
            title={workflowName}
            description={`Run #${selected.run.id} · Workflow v${selected.run.workflow_version_id}`}
            actions={
              <div className="row-actions">
                <StatusPill status={selected.run.status} locale={locale} />
                {[
                  "queued",
                  "running",
                  "awaiting_approval",
                  "waiting_for_user",
                ].includes(selected.run.status) ? (
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={cancelling}
                    onClick={() => void onCancelRun()}
                    icon={<Ban />}
                  >
                    {cancelling
                      ? zh
                        ? "放弃中…"
                        : "Cancelling…"
                      : zh
                        ? "放弃/终止运行"
                        : "Cancel run"}
                  </Button>
                ) : null}
                {["succeeded", "failed", "cancelled"].includes(
                  selected.run.status,
                ) ? (
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={deleting}
                    onClick={() => void onDeleteRun()}
                    icon={<Trash2 />}
                  >
                    {deleting
                      ? zh
                        ? "清理中…"
                        : "Deleting…"
                      : zh
                        ? "删除记录"
                        : "Delete record"}
                  </Button>
                ) : null}
              </div>
            }
          />
          <div className="agent-run-metrics">
            <span>
              <small>{zh ? "开始时间" : "Started"}</small>
              <strong>
                {selected.run.started_at
                  ? formatDateTime(selected.run.started_at)
                  : "—"}
              </strong>
            </span>
            <span>
              <small>{zh ? "结束时间" : "Finished"}</small>
              <strong>
                {selected.run.finished_at
                  ? formatDateTime(selected.run.finished_at)
                  : "—"}
              </strong>
            </span>
            <span>
              <small>{zh ? "总耗时" : "Duration"}</small>
              <strong>
                {duration(selected.run.started_at, selected.run.finished_at)}
              </strong>
            </span>
            <span>
              <small>{zh ? "步骤数" : "Steps"}</small>
              <strong>{selected.steps.length}</strong>
            </span>
          </div>
          {selected.run.error_message ? (
            <section className="workflow-run-error">
              <h3>{zh ? "失败原因" : "Failure"}</h3>
              <p>{selected.run.error_message}</p>
              {selected.run.error_code ? (
                <small>{selected.run.error_code}</small>
              ) : null}
            </section>
          ) : null}
          <section className="workflow-run-resources">
            <div className="panel-heading">
              <div>
                <h3>{zh ? "运行资源" : "Run resources"}</h3>
                <small>
                  {zh
                    ? "目标可用于提案；发现资源始终只读。"
                    : "Targets may be proposed for change; discovered resources stay read-only."}
                </small>
              </div>
              <strong>{selected.resources.length}</strong>
            </div>
            {selected.resources.length === 0 ? (
              <EmptyState
                label={
                  zh
                    ? "该运行没有结构化资源快照。"
                    : "No structured resource snapshot for this run."
                }
              />
            ) : (
              <div
                className={
                  selected.resources.length === 1
                    ? "workflow-run-resources__list workflow-run-resources__list--single"
                    : "workflow-run-resources__list"
                }
              >
                {selected.resources.map((resource) => (
                  <span key={resource.id}>
                    <strong>
                      {resource.label || `${resource.type} #${resource.key}`}
                    </strong>
                    <small>
                      {resource.type} ·{" "}
                      {resource.source === "manual"
                        ? zh
                          ? "手选"
                          : "manual"
                        : resource.source === "query"
                          ? zh
                            ? "规则命中"
                            : "query"
                          : zh
                            ? "动态发现"
                            : "discovery"}{" "}
                      ·{" "}
                      {resource.access_level === "target"
                        ? zh
                          ? "目标"
                          : "target"
                        : zh
                          ? "只读"
                          : "read-only"}
                    </small>
                  </span>
                ))}
              </div>
            )}
          </section>
          {selected.interactions.length > 0 ? (
            <section className="workflow-interactions workflow-candidates">
              <div className="panel-heading">
                <div>
                  <h3>{zh ? "需要你处理" : "Needs your input"}</h3>
                  <small>
                    {zh
                      ? "交互任务属于本次运行，完成后流程会继续。"
                      : "Interaction tasks belong to this run and resume it when completed."}
                  </small>
                </div>
              </div>
              {selected.interactions.map((task) => (
                <div className="workflow-interaction" key={task.id}>
                  <div>
                    <strong>
                      {task.interaction_type === "choice"
                        ? zh
                          ? "请选择"
                          : "Choose an option"
                        : task.interaction_type === "preview_confirm"
                          ? zh
                            ? "确认预览并继续"
                            : "Confirm preview"
                          : zh
                            ? "请确认操作"
                            : "Confirmation required"}
                    </strong>
                    <small>
                      {task.workflow_step_id || `Task #${task.id}`} ·{" "}
                      {task.status}
                    </small>
                  </div>
                  {task.status === "pending" ? (
                    <div className="row-actions">
                      {task.interaction_type === "choice" &&
                      Array.isArray(task.options) ? (
                        task.options.map((option, index) => (
                          <Button
                            variant="secondary"
                            key={index}
                            onClick={() =>
                              void onResolveInteraction(task, { option })
                            }
                          >
                            {String(option)}
                          </Button>
                        ))
                      ) : (
                        <Button
                          variant="primary"
                          onClick={() =>
                            void onResolveInteraction(task, {
                              confirmed: true,
                            })
                          }
                        >
                          {zh ? "确认并继续" : "Confirm and continue"}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => void onCancelInteraction(task)}
                      >
                        {zh ? "取消任务" : "Cancel task"}
                      </Button>
                    </div>
                  ) : task.response ? (
                    <JsonLog value={task.response} />
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
          {selected.candidates.length > 0 ? (
            <WorkflowMediaCandidates
              candidates={selected.candidates}
              zh={zh}
              formatDateTime={formatDateTime}
              candidateSelections={candidateSelections}
              setCandidateSelections={setCandidateSelections}
              candidatePlacement={candidatePlacement}
              setCandidatePlacement={setCandidatePlacement}
              candidateAnchor={candidateAnchor}
              setCandidateAnchor={setCandidateAnchor}
              generationInstructions={generationInstructions}
              setGenerationInstructions={setGenerationInstructions}
              imagePreviews={imagePreviews}
              batchBusy={batchBusy}
              generationNow={generationNow}
              onBatchSelect={onBatchSelect}
              onBatchPreview={onBatchPreview}
              onBatchReject={onBatchReject}
              onBatchApply={onBatchApply}
              onCandidateAction={onCandidateAction}
              onCancelGeneration={onCancelGeneration}
              onPreviewCandidate={onPreviewCandidate}
            />
          ) : null}
          {selected.events.length > 0 ? (
            <section className="workflow-details-list workflow-event-timeline">
              <div className="panel-heading">
                <div>
                  <h3>{zh ? "运行时间线" : "Run timeline"}</h3>
                  <small>
                    {zh
                      ? "包含交互、生成和应用等已持久化事件。"
                      : "Persisted interaction, generation, and application events."}
                  </small>
                </div>
              </div>
              {newestFirst(selected.events).map((event) => (
                <details className="workflow-details-card" key={event.id}>
                  <summary>
                    <time dateTime={event.created_at}>
                      {formatDateTime(event.created_at)}
                    </time>
                    <strong>{event.event_type.replaceAll("_", " ")}</strong>
                    {event.workflow_step_id ? (
                      <small>{event.workflow_step_id}</small>
                    ) : null}
                  </summary>
                  <JsonLog value={event.payload} />
                </details>
              ))}
            </section>
          ) : null}
          <details className="workflow-log-block">
            <summary>{zh ? "运行输入" : "Run input"}</summary>
            <JsonLog value={selected.run.input} />
          </details>
          {selected.run.output !== undefined ? (
            <WorkflowRunOutput output={selected.run.output} locale={locale} />
          ) : null}
          <section className="workflow-details-list workflow-step-log">
            <div className="panel-heading">
              <div>
                <h3>{zh ? "步骤日志" : "Step logs"}</h3>
                <small>
                  {zh
                    ? "按实际执行顺序排列；展开查看输入、输出与错误。"
                    : "Ordered by execution time. Expand for input, output and errors."}
                </small>
              </div>
              <div>
                {Array.from(
                  new Set(
                    selected.steps
                      .filter(
                        (step) =>
                          step.status === "failed" &&
                          step.iteration !== undefined,
                      )
                      .map((step) => step.step_id),
                  ),
                ).map((stepID) => (
                  <Button
                    variant="secondary"
                    key={stepID}
                    type="button"
                    disabled={retrying !== ""}
                    onClick={() => void onRetryFailedGroup(stepID)}
                  >
                    {retrying === `${stepID}:all`
                      ? zh
                        ? "批量重试中…"
                        : "Retrying…"
                      : zh
                        ? `重试 ${stepID} 的全部失败项`
                        : `Retry all failed ${stepID}`}
                  </Button>
                ))}
              </div>
            </div>
            {selected.steps.length === 0 ? (
              <EmptyState
                label={
                  zh ? "该运行没有步骤日志。" : "No step logs for this run."
                }
              />
            ) : (
              selected.steps.map((step, index) => (
                <details
                  className="workflow-details-card"
                  key={step.id}
                  open={step.status === "failed"}
                >
                  <summary>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{step.step_id}</strong>
                      <small>
                        {step.step_type}
                        {step.iteration !== undefined
                          ? ` · #${step.iteration}`
                          : ""}
                      </small>
                    </div>
                    <StatusPill status={step.status} locale={locale} />
                    <small>{duration(step.started_at, step.finished_at)}</small>
                  </summary>
                  <div className="workflow-step-log__body">
                    <div>
                      <small>{zh ? "开始 / 结束" : "Start / finish"}</small>
                      <p>
                        {formatDateTime(step.started_at)} →{" "}
                        {step.finished_at
                          ? formatDateTime(step.finished_at)
                          : "—"}
                      </p>
                    </div>
                    {step.error_message ? (
                      <div className="workflow-run-error">
                        <small>{zh ? "错误" : "Error"}</small>
                        <p>{step.error_message}</p>
                        {step.status === "failed" &&
                        step.iteration !== undefined ? (
                          <Button
                            variant="secondary"
                            disabled={retrying !== ""}
                            onClick={() => void onRetryStep(step)}
                          >
                            {retrying === `${step.step_id}:${step.iteration}`
                              ? zh
                                ? "重试中…"
                                : "Retrying…"
                              : zh
                                ? "重试此资源"
                                : "Retry resource"}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <div>
                      <small>{zh ? "输入" : "Input"}</small>
                      <JsonLog value={step.input} />
                    </div>
                    <div>
                      <small>{zh ? "输出" : "Output"}</small>
                      <JsonLog value={step.output} />
                    </div>
                  </div>
                </details>
              ))
            )}
          </section>
        </div>
      </WorkspacePanel>
    </div>
  );
}
