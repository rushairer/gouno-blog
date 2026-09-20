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
import { Alert, Button, Empty, Heading, Tag, Text } from "@gouno/ui/core";
import {
  OperationsRegionHeading,
  OperationsSummaryStrip,
} from "./OperationsPatterns";
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
  onBack?: () => void;
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

function ResourceEvidence({
  resources,
  zh,
}: {
  resources: WorkflowResource[];
  zh: boolean;
}) {
  if (!resources.length) {
    return (
      <Text size="sm" tone="muted">
        {zh
          ? "该运行没有结构化资源快照。"
          : "No structured resource snapshot for this run."}
      </Text>
    );
  }
  return (
    <div className="divide-y">
      {resources.map((resource) => (
        <div
          key={resource.id}
          className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <strong className="block text-sm">
              {resource.label || `${resource.type} #${resource.key}`}
            </strong>
            <Text size="xs" tone="muted" className="mt-1">
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
                    : "discovery"}
            </Text>
          </div>
          <Tag>
            {resource.access_level === "target"
              ? zh
                ? "目标"
                : "target"
              : zh
                ? "只读"
                : "read-only"}
          </Tag>
        </div>
      ))}
    </div>
  );
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
  const totalTokens =
    (selected.run.input_tokens || 0) + (selected.run.output_tokens || 0);
  const active = [
    "queued",
    "running",
    "awaiting_approval",
    "waiting_for_user",
  ].includes(selected.run.status);
  const terminal = ["succeeded", "failed", "cancelled"].includes(
    selected.run.status,
  );
  const failedGroups = Array.from(
    new Set(
      selected.steps
        .filter(
          (step) => step.status === "failed" && step.iteration !== undefined,
        )
        .map((step) => step.step_id),
    ),
  );

  return (
    <div
      data-pattern="record-detail-composition"
      className="workflow-run-detail-view flex min-w-0 flex-col gap-6"
    >
      {onBack ? (
        <div>
          <Button
            variant="ghost"
            size="small"
            type="button"
            onClick={onBack}
            icon={<ArrowLeft />}
          >
            {zh ? "返回运行记录列表" : "Back to run records"}
          </Button>
        </div>
      ) : null}

      <section
        className="flex flex-col gap-3"
        aria-label={zh ? "Run 摘要" : "Run summary"}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level={2}>
                Run #{selected.run.id} · {workflowName}
              </Heading>
              <StatusPill status={selected.run.status} locale={locale} />
              {selected.run.dry_run ? <Tag>Dry-run</Tag> : null}
            </div>
            <Text className="mt-2 max-w-4xl" tone="muted">
              {zh
                ? "一次 Run 就是一份可追溯证据：执行步骤、资源、人工交互、事件和输出都保留在这里。"
                : "Each Run is traceable evidence: execution steps, resources, human interactions, events, and output are preserved here."}
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            {active ? (
              <Button
                variant="outline"
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
            {terminal ? (
              <Button
                variant="outline"
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
        </div>

        <OperationsSummaryStrip
          ariaLabel={zh ? "Run 运行摘要" : "Run metrics"}
          items={[
            {
              label: zh ? "开始时间" : "Started",
              value: selected.run.started_at
                ? formatDateTime(selected.run.started_at)
                : "—",
            },
            {
              label: zh ? "结束时间" : "Finished",
              value: selected.run.finished_at
                ? formatDateTime(selected.run.finished_at)
                : zh
                  ? "仍在运行"
                  : "Still running",
              detail: duration(
                selected.run.started_at,
                selected.run.finished_at,
              ),
            },
            {
              label: "Token",
              value: totalTokens.toLocaleString(),
              detail: `${selected.run.input_tokens || 0} in · ${selected.run.output_tokens || 0} out`,
            },
            {
              label: zh ? "执行步骤" : "Execution steps",
              value: selected.steps.length,
              detail: `Workflow v${selected.run.workflow_version_id}`,
            },
          ]}
        />

        {selected.run.error_message ? (
          <Alert
            type="error"
            showIcon
            title={zh ? "运行失败" : "Run failed"}
            description={`${selected.run.error_message}${selected.run.error_code ? ` · ${selected.run.error_code}` : ""}`}
          />
        ) : null}
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)]">
        <section
          className="overflow-hidden rounded-lg border bg-background"
          aria-label={zh ? "执行过程" : "Execution process"}
        >
          <div className="border-b px-6 py-4">
            <OperationsRegionHeading
              title={zh ? "执行过程" : "Execution process"}
              description={
                zh
                  ? "按实际执行顺序查看每一步结果；失败的批处理步骤可以从证据现场重试。"
                  : "Review results in execution order. Failed batch steps can be retried directly from the evidence."
              }
              action={
                failedGroups.length ? (
                  <div className="flex flex-wrap gap-2">
                    {failedGroups.map((stepID) => (
                      <Button
                        size="small"
                        variant="outline"
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
                            ? `重试 ${stepID}`
                            : `Retry ${stepID}`}
                      </Button>
                    ))}
                  </div>
                ) : undefined
              }
            />
          </div>
          {selected.steps.length ? (
            <div className="divide-y">
              {selected.steps.map((step, index) => (
                <details
                  key={step.id}
                  className="group"
                  open={step.status === "failed"}
                >
                  <summary className="flex cursor-pointer list-none items-start gap-4 px-6 py-4 hover:bg-muted/30">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm">{step.step_id}</strong>
                        <StatusPill status={step.status} locale={locale} />
                      </span>
                      <Text size="xs" tone="muted" className="mt-1">
                        {step.step_type}
                        {step.iteration !== undefined
                          ? ` · #${step.iteration}`
                          : ""}
                        {` · ${duration(step.started_at, step.finished_at)}`}
                      </Text>
                      {step.error_message ? (
                        <Text size="sm" className="mt-2 text-destructive">
                          {step.error_message}
                        </Text>
                      ) : null}
                    </span>
                  </summary>
                  <div className="border-t bg-muted/[0.12] px-6 py-5">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="min-w-0">
                        <Text size="xs" tone="muted">
                          {zh ? "输入" : "Input"}
                        </Text>
                        <div className="mt-2">
                          <JsonLog value={step.input} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <Text size="xs" tone="muted">
                          {zh ? "输出" : "Output"}
                        </Text>
                        <div className="mt-2">
                          <JsonLog value={step.output} />
                        </div>
                      </div>
                    </div>
                    {step.status === "failed" &&
                    step.iteration !== undefined ? (
                      <div className="mt-4 flex justify-end border-t pt-4">
                        <Button
                          variant="outline"
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
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="p-8">
              <Empty
                title={
                  zh ? "该运行没有步骤日志。" : "No step logs for this run."
                }
              />
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section
            className="overflow-hidden rounded-lg border bg-background"
            aria-label={zh ? "运行证据" : "Run evidence"}
          >
            <div className="border-b px-6 py-4">
              <OperationsRegionHeading
                title={zh ? "运行证据" : "Run evidence"}
                description={
                  zh
                    ? "资源快照与 Human Interaction 共同解释这次 Run 读了什么、等待了什么，以及什么可以成为写入目标。"
                    : "Resource snapshots and Human Interactions explain what this Run read, waited for, and could target for change."
                }
              />
            </div>
            <div className="grid gap-6 p-6 md:grid-cols-2">
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <strong className="text-sm">
                    {zh ? "资源" : "Resources"}
                  </strong>
                  <Tag>{selected.resources.length}</Tag>
                </div>
                <ResourceEvidence resources={selected.resources} zh={zh} />
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <strong className="text-sm">
                    {zh ? "人工交互" : "Human interactions"}
                  </strong>
                  <Tag>{selected.interactions.length}</Tag>
                </div>
                {selected.interactions.length ? (
                  <div className="divide-y">
                    {selected.interactions.map((task) => (
                      <div key={task.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <strong className="block text-sm">
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
                            <Text size="xs" tone="muted" className="mt-1">
                              {task.workflow_step_id || `Task #${task.id}`}
                            </Text>
                          </div>
                          <Tag>{task.status}</Tag>
                        </div>
                        {task.status === "pending" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {task.interaction_type === "choice" &&
                            Array.isArray(task.options) ? (
                              task.options.map((option, index) => (
                                <Button
                                  size="small"
                                  variant="outline"
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
                                size="small"
                                variant="solid"
                                color="primary"
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
                              size="small"
                              variant="ghost"
                              onClick={() => void onCancelInteraction(task)}
                            >
                              {zh ? "取消任务" : "Cancel task"}
                            </Button>
                          </div>
                        ) : task.response ? (
                          <div className="mt-3">
                            <JsonLog value={task.response} />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Text size="sm" tone="muted">
                    {zh
                      ? "本次运行没有人工交互。"
                      : "This run has no human interactions."}
                  </Text>
                )}
              </section>
            </div>
          </section>

          <section
            className="overflow-hidden rounded-lg border bg-background"
            aria-label={zh ? "运行事件" : "Run events"}
          >
            <div className="border-b px-6 py-4">
              <OperationsRegionHeading
                title={zh ? "事件" : "Events"}
                description={
                  zh
                    ? "保留交互、生成、应用和状态变化等已持久化事件。"
                    : "Persisted interaction, generation, application, and state-change events."
                }
              />
            </div>
            {selected.events.length ? (
              <div className="divide-y">
                {newestFirst(selected.events).map((event) => (
                  <details key={event.id} className="px-6 py-4">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="font-mono text-xs">
                            {event.event_type}
                          </strong>
                          {event.workflow_step_id ? (
                            <Text size="xs" tone="muted" className="mt-1">
                              {event.workflow_step_id}
                            </Text>
                          ) : null}
                        </div>
                        <Text size="xs" tone="muted">
                          {formatDateTime(event.created_at)}
                        </Text>
                      </div>
                    </summary>
                    <div className="mt-3">
                      <JsonLog value={event.payload} />
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <Text size="sm" tone="muted">
                  {zh
                    ? "本次运行没有事件记录。"
                    : "No persisted events for this run."}
                </Text>
              </div>
            )}
          </section>
        </div>
      </div>

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

      <section
        className="overflow-hidden rounded-lg border bg-background"
        aria-label={zh ? "运行输入输出" : "Run input and output"}
      >
        <div className="border-b px-6 py-4">
          <OperationsRegionHeading
            title={zh ? "输入与输出" : "Input and output"}
            description={
              zh
                ? "保留本次 Run 的原始输入和最终输出，便于复现与审计。"
                : "Preserves the raw input and final output for reproducibility and audit."
            }
          />
        </div>
        <div className="grid gap-6 p-6 xl:grid-cols-2">
          <div className="min-w-0">
            <Text size="xs" tone="muted">
              {zh ? "运行输入" : "Run input"}
            </Text>
            <div className="mt-2">
              <JsonLog value={selected.run.input} />
            </div>
          </div>
          <div className="min-w-0">
            <Text size="xs" tone="muted">
              {zh ? "最终输出" : "Final output"}
            </Text>
            <div className="mt-2">
              {selected.run.output !== undefined ? (
                <WorkflowRunOutput
                  output={selected.run.output}
                  locale={locale}
                />
              ) : (
                <Text size="sm" tone="muted">
                  {zh ? "暂无最终输出。" : "No final output yet."}
                </Text>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
