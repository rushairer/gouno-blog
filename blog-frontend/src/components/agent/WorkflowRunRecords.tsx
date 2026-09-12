import { Ban, Eye, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { operationsApi } from "../../api/operations";
import type { ArticleImagePreview } from "../../api/operations";
import { workflowApi } from "../../api/workflows";
import type {
  MediaCandidate,
  Workflow,
  WorkflowInteractionTask,
  WorkflowRun,
  WorkflowStepRun,
} from "../../types/agent";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Empty,
  IconButton,
  Select,
  Text,
} from "@gouno/ui/core";
import { ArticlePreviewModal } from "./ArticlePreviewModal";
import { StatusPill } from "./StatusPill";
import { WorkflowRunDetail } from "./WorkflowRunDetail";
import type { WorkflowRunDetailData } from "./WorkflowRunDetail";

function duration(start?: string, finish?: string): string {
  if (!start) return "—";
  const ended = finish ? new Date(finish).getTime() : Date.now();
  const seconds = Math.max(0, (ended - new Date(start).getTime()) / 1000);
  return `${seconds.toFixed(1)} s`;
}

function newestFirst<T extends { id: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.id - a.id);
}

export function WorkflowRunRecords({
  locale,
  workflows,
  runs,
  formatDateTime,
  onRefresh,
}: {
  locale: "en" | "zh";
  workflows: Workflow[];
  runs: WorkflowRun[];
  formatDateTime: (value: string) => string;
  onRefresh?: () => Promise<void>;
}) {
  const zh = locale === "zh";
  const [workflowID, setWorkflowID] = useState(() => {
    const value = Number(
      new URLSearchParams(window.location.search).get("workflow"),
    );
    return value || 0;
  });
  const [selected, setSelected] = useState<WorkflowRunDetailData | null>(null);
  const [loadingID, setLoadingID] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState("");
  const [candidateSelections, setCandidateSelections] = useState<
    Record<number, boolean>
  >({});
  const [candidatePlacement, setCandidatePlacement] = useState<
    Record<number, string>
  >({});
  const [candidateAnchor, setCandidateAnchor] = useState<
    Record<number, string>
  >({});
  const [generationInstructions, setGenerationInstructions] = useState<
    Record<number, string>
  >({});
  const [batchBusy, setBatchBusy] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<
    Record<number, ArticleImagePreview>
  >({});
  const [previewDialogCandidateID, setPreviewDialogCandidateID] = useState<
    number | null
  >(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [generationNow, setGenerationNow] = useState(() => Date.now());
  const inspectedFromURL = useRef(false);

  const names = useMemo(
    () => new Map(workflows.map((item) => [item.id, item.name])),
    [workflows],
  );

  const filtered = useMemo(() => {
    let result = newestFirst(runs);
    if (workflowID > 0) {
      result = result.filter((run) => run.workflow_id === workflowID);
    }
    if (statusFilter !== "all") {
      if (statusFilter === "running") {
        result = result.filter((run) =>
          ["queued", "running"].includes(run.status),
        );
      } else if (statusFilter === "awaiting") {
        result = result.filter((run) =>
          ["awaiting_approval", "waiting_for_user"].includes(run.status),
        );
      } else {
        result = result.filter((run) => run.status === statusFilter);
      }
    }
    return result;
  }, [runs, statusFilter, workflowID]);

  useEffect(() => {
    if (!selected) return;
    const latest = runs.find((run) => run.id === selected.run.id);
    if (latest && latest !== selected.run) {
      setSelected((current) => (current ? { ...current, run: latest } : null));
    }
  }, [runs, selected]);

  const inspect = useCallback(
    async (run: WorkflowRun) => {
      setLoadingID(run.id);
      setError("");
      const url = new URL(window.location.href);
      url.searchParams.set("run", String(run.id));
      window.history.replaceState(null, "", url);
      try {
        const [steps, resources, interactions, candidates, events] =
          await Promise.all([
            workflowApi.getRunSteps(run.id),
            workflowApi.getRunResources(run.id),
            workflowApi.getRunInteractions(run.id),
            workflowApi.getRunMediaCandidates(run.id),
            workflowApi.getRunEvents(run.id),
          ]);
        setSelected({
          run,
          steps,
          resources,
          interactions: interactions.filter((item) =>
            ["approval", "choice", "input", "preview_confirm"].includes(
              item.interaction_type,
            ),
          ),
          candidates: candidates.filter((item) =>
            [
              "brief_ready",
              "ready_to_generate",
              "generating",
              "generated",
              "rejected",
              "failed",
              "cancelled",
            ].includes(item.generation_status),
          ),
          events: events.filter((item) => Boolean(item.event_type)),
        });
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : zh
              ? "无法载入步骤日志。"
              : "Could not load step logs.",
        );
      } finally {
        setLoadingID(null);
      }
    },
    [zh],
  );

  const resolveInteraction = async (
    task: WorkflowInteractionTask,
    response: unknown,
  ) => {
    setError("");
    try {
      await workflowApi.resolveInteraction(task, response);
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "交互提交失败。"
            : "Could not resolve interaction.",
      );
    }
  };

  const cancelInteraction = async (task: WorkflowInteractionTask) => {
    setError("");
    try {
      await workflowApi.cancelInteraction(task);
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "取消交互失败。"
            : "Could not cancel interaction.",
      );
    }
  };

  const selectionForCandidate = (candidate: MediaCandidate) => ({
    placement:
      candidatePlacement[candidate.id] || candidate.placement || "cover",
    anchor: candidateAnchor[candidate.id] ?? candidate.anchor ?? "",
  });

  const candidateAction = async (
    candidate: MediaCandidate,
    action: "select" | "apply" | "regenerate" | "reject",
  ) => {
    setError("");
    try {
      const body =
        action === "select"
          ? selectionForCandidate(candidate)
          : action === "regenerate"
            ? {
                instruction: generationInstructions[candidate.id]?.trim() || "",
              }
            : undefined;
      await operationsApi.imageTaskAction(candidate.id, action, body);
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "图片任务操作失败。"
            : "Image task action failed.",
      );
    }
  };

  const selectedCandidates =
    selected?.candidates.filter(
      (candidate) =>
        candidateSelections[candidate.id] &&
        candidate.generation_status === "generated",
    ) || [];

  const batchSelect = async () => {
    if (!selected || selectedCandidates.length === 0) return;
    setBatchBusy("select");
    setError("");
    try {
      const selections = selectedCandidates.map((candidate) => ({
        id: candidate.id,
        placement:
          candidatePlacement[candidate.id] || candidate.placement || "cover",
        anchor: candidateAnchor[candidate.id] ?? candidate.anchor ?? "",
      }));
      await operationsApi.batchMediaAction(selected.run.id, "select", {
        selections,
      });
      await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "批量选择失败。"
            : "Could not select image candidates.",
      );
    } finally {
      setBatchBusy("");
    }
  };

  const previewCandidate = async (
    candidate: MediaCandidate,
    openDialog = false,
  ) => {
    setError("");
    try {
      const preview = await operationsApi.previewImageTask(candidate.id);
      setImagePreviews((current) => ({ ...current, [candidate.id]: preview }));
      if (openDialog) setPreviewDialogCandidateID(candidate.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "无法创建文章预览。"
            : "Could not create article preview.",
      );
    }
  };

  const batchPreview = async () => {
    if (selectedCandidates.length === 0) return;
    setBatchBusy("preview");
    setError("");
    try {
      await Promise.all(
        selectedCandidates.map((candidate) => previewCandidate(candidate)),
      );
    } finally {
      setBatchBusy("");
    }
  };

  const batchApply = async () => {
    if (
      !selected ||
      selectedCandidates.length === 0 ||
      selectedCandidates.some(
        (candidate) =>
          !candidate.selected ||
          !imagePreviews[candidate.id]?.version_matches ||
          !imagePreviews[candidate.id]?.anchor_matches,
      )
    )
      return;
    setBatchBusy("apply");
    setError("");
    try {
      await operationsApi.batchMediaAction(selected.run.id, "apply", {
        candidate_ids: selectedCandidates.map((candidate) => candidate.id),
      });
      await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "批量应用失败。"
            : "Could not apply image candidates.",
      );
    } finally {
      setBatchBusy("");
    }
  };

  const batchReject = async () => {
    if (!selected || selectedCandidates.length === 0) return;
    setBatchBusy("reject");
    setError("");
    try {
      await operationsApi.batchMediaAction(selected.run.id, "reject", {
        candidate_ids: selectedCandidates.map((candidate) => candidate.id),
      });
      await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "批量放弃失败。"
            : "Could not reject image candidates.",
      );
    } finally {
      setBatchBusy("");
    }
  };

  const cancelGeneration = async (candidate: MediaCandidate) => {
    setError("");
    try {
      await operationsApi.cancelImageTask(candidate.id);
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "取消图片生成失败。"
            : "Could not cancel image generation.",
      );
    }
  };

  const generatingSignature =
    selected?.candidates
      .map((candidate) => candidate.generation_status)
      .join(",") || "";
  const previewDialogCandidate = selected?.candidates.find(
    (candidate) => candidate.id === previewDialogCandidateID,
  );
  const previewDialogPreview = previewDialogCandidate
    ? imagePreviews[previewDialogCandidate.id]
    : undefined;

  useEffect(() => {
    if (
      !selected ||
      !selected.candidates.some(
        (candidate) => candidate.generation_status === "generating",
      )
    )
      return;
    const refreshTimer = window.setInterval(() => {
      void inspect(selected.run);
    }, 4000);
    const clockTimer = window.setInterval(
      () => setGenerationNow(Date.now()),
      1000,
    );
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [generatingSignature, inspect, selected]);

  const retryStep = async (step: WorkflowStepRun) => {
    if (!selected || step.iteration === undefined) return;
    const key = `${step.step_id}:${step.iteration}`;
    setRetrying(key);
    setError("");
    try {
      await workflowApi.retryRun(selected.run.id, {
        step_id: step.step_id,
        iterations: [step.iteration],
      });
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "重试步骤失败。"
            : "Could not retry step.",
      );
    } finally {
      setRetrying("");
    }
  };

  const retryFailedGroup = async (stepID: string) => {
    if (!selected) return;
    const iterations = selected.steps
      .filter(
        (step) =>
          step.step_id === stepID &&
          step.status === "failed" &&
          step.iteration !== undefined,
      )
      .map((step) => step.iteration as number);
    if (iterations.length === 0) return;
    setRetrying(`${stepID}:all`);
    setError("");
    try {
      await workflowApi.retryRun(selected.run.id, {
        step_id: stepID,
        iterations,
      });
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "批量重试失败。"
            : "Batch retry failed.",
      );
    } finally {
      setRetrying("");
    }
  };

  const cancelRunByID = async (run: WorkflowRun) => {
    if (
      !["queued", "running", "awaiting_approval", "waiting_for_user"].includes(
        run.status,
      )
    )
      return;
    if (
      !window.confirm(
        zh ? `确定放弃/终止运行 Run #${run.id} 吗？` : `Cancel run #${run.id}?`,
      )
    )
      return;
    setCancelling(true);
    setError("");
    try {
      await workflowApi.cancelRun(run.id);
      if (selected?.run.id === run.id) {
        await inspect(run);
      }
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "放弃运行失败。"
            : "Could not cancel run.",
      );
    } finally {
      setCancelling(false);
    }
  };

  const cancelRun = async () => {
    if (selected) await cancelRunByID(selected.run);
  };

  const deleteRunByID = async (run: WorkflowRun) => {
    if (!["succeeded", "failed", "cancelled"].includes(run.status)) return;
    if (
      !window.confirm(
        zh
          ? `删除运行记录 Run #${run.id} 及其附属日志？文章和媒体文件不会被删除。`
          : `Delete run #${run.id} and its attached logs? Posts and media files are kept.`,
      )
    )
      return;
    setDeleting(true);
    setError("");
    try {
      await workflowApi.deleteRun(run.id);
      if (selected?.run.id === run.id) {
        setSelected(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("run");
        window.history.replaceState(null, "", url);
      }
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "删除运行记录失败。"
            : "Could not delete run record.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const deleteRun = async () => {
    if (selected) await deleteRunByID(selected.run);
  };

  useEffect(() => {
    if (inspectedFromURL.current) return;
    const requestedID = Number(
      new URLSearchParams(window.location.search).get("run"),
    );
    if (!requestedID) return;
    const requested = runs.find((run) => run.id === requestedID);
    if (!requested) {
      if (runs.length > 0) {
        inspectedFromURL.current = true;
        workflowApi
          .getRuns()
          .then((allRuns) => {
            const found = allRuns.find((run) => run.id === requestedID);
            if (found) void inspect(found);
          })
          .catch(() => {});
      }
      return;
    }
    inspectedFromURL.current = true;
    void inspect(requested);
  }, [inspect, runs]);

  return (
    <div className="workflow-records section-stack">
      {error ? <Alert type="error" showIcon title={error} /> : null}
      {selected ? (
        <WorkflowRunDetail
          selected={selected}
          locale={locale}
          workflowName={
            names.get(selected.run.workflow_id) ||
            `Workflow #${selected.run.workflow_id}`
          }
          formatDateTime={formatDateTime}
          cancelling={cancelling}
          deleting={deleting}
          retrying={retrying}
          batchBusy={batchBusy}
          generationNow={generationNow}
          candidateSelections={candidateSelections}
          setCandidateSelections={setCandidateSelections}
          candidatePlacement={candidatePlacement}
          setCandidatePlacement={setCandidatePlacement}
          candidateAnchor={candidateAnchor}
          setCandidateAnchor={setCandidateAnchor}
          generationInstructions={generationInstructions}
          setGenerationInstructions={setGenerationInstructions}
          imagePreviews={imagePreviews}
          onBack={() => {
            setSelected(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("run");
            window.history.replaceState(null, "", url);
          }}
          onCancelRun={cancelRun}
          onDeleteRun={deleteRun}
          onResolveInteraction={resolveInteraction}
          onCancelInteraction={cancelInteraction}
          onBatchSelect={batchSelect}
          onBatchPreview={batchPreview}
          onBatchReject={batchReject}
          onBatchApply={batchApply}
          onCandidateAction={candidateAction}
          onCancelGeneration={cancelGeneration}
          onPreviewCandidate={previewCandidate}
          onRetryStep={retryStep}
          onRetryFailedGroup={retryFailedGroup}
        />
      ) : (
        <div className="workflow-runs-list-view flex flex-col gap-5">
          <Card padding="base">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0 lg:w-64">
                <Select
                  size="small"
                  aria-label={zh ? "筛选 Workflow" : "Filter Workflow"}
                  value={String(workflowID)}
                  onChange={(nextValue) => {
                    setWorkflowID(Number(nextValue));
                    setSelected(null);
                  }}
                >
                  <option value="0">
                    {zh ? "全部 Workflow" : "All Workflows"}
                  </option>
                  {workflows.map((workflow) => (
                    <option key={workflow.id} value={String(workflow.id)}>
                      {workflow.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0 lg:w-56">
                <Select
                  size="small"
                  aria-label={zh ? "筛选状态" : "Filter Status"}
                  value={statusFilter}
                  onChange={(nextValue) => setStatusFilter(String(nextValue))}
                >
                  <option value="all">{zh ? "全部状态" : "All Status"}</option>
                  <option value="succeeded">{zh ? "成功" : "Succeeded"}</option>
                  <option value="failed">{zh ? "失败" : "Failed"}</option>
                  <option value="running">
                    {zh ? "执行中" : "Running / Queued"}
                  </option>
                  <option value="awaiting">
                    {zh ? "等待处理 / 审批" : "Awaiting user / approval"}
                  </option>
                </Select>
              </div>
              <div className="flex flex-1 items-center justify-between gap-3 lg:justify-end">
                <Text size="sm" tone="muted" className="whitespace-nowrap">
                  {filtered.length} {zh ? "条记录" : "runs"}
                </Text>
                {workflowID !== 0 || statusFilter !== "all" ? (
                  <Button
                    variant="text"
                    size="small"
                    type="button"
                    onClick={() => {
                      setWorkflowID(0);
                      setStatusFilter("all");
                    }}
                    icon={<X />}
                  >
                    {zh ? "清除" : "Clear"}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
          {filtered.length === 0 ? (
            <Card padding="base">
              <Empty
                title={
                  zh
                    ? "还没有 Workflow 运行记录。"
                    : "No Workflow runs recorded yet."
                }
              />
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <CardContent className="p-0">
                <div
                  role="list"
                  aria-label={zh ? "Workflow 运行列表" : "Workflow run list"}
                  className="divide-y"
                >
                  {filtered.map((run) => {
                    const runType = run.dry_run
                      ? zh
                        ? "试运行"
                        : "Dry-run"
                      : run.schedule_key
                        ? zh
                          ? `计划 ${run.schedule_key}`
                          : `Scheduled ${run.schedule_key}`
                        : zh
                          ? "手动运行"
                          : "Manual";
                    return (
                      <div
                        key={run.id}
                        role="listitem"
                        className="flex flex-col gap-4 p-6 xl:flex-row xl:items-start xl:justify-between"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => void inspect(run)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <strong>
                              {names.get(run.workflow_id) ||
                                `Workflow #${run.workflow_id}`}
                            </strong>
                            <StatusPill status={run.status} locale={locale} />
                            <Text size="xs" tone="muted">
                              Run #{run.id} · v{run.workflow_version_id}
                            </Text>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                            <span>{runType}</span>
                            <span>
                              {formatDateTime(run.started_at || run.created_at)}
                            </span>
                            <span>
                              {duration(run.started_at, run.finished_at)}
                            </span>
                            <span>
                              {zh
                                ? "查看步骤、资源与交互证据"
                                : "Inspect steps, resources, and interactions"}
                            </span>
                          </div>
                        </button>
                        <div className="flex min-w-max shrink-0 flex-nowrap items-center gap-1">
                          <IconButton
                            label={zh ? "查看详情" : "Inspect"}
                            icon={<Eye />}
                            variant="ghost"
                            disabled={loadingID === run.id}
                            onClick={() => void inspect(run)}
                          />
                          {[
                            "queued",
                            "running",
                            "awaiting_approval",
                            "waiting_for_user",
                          ].includes(run.status) ? (
                            <IconButton
                              variant="ghost"
                              color="error"
                              label={zh ? "放弃/终止运行" : "Cancel run"}
                              icon={<Ban />}
                              disabled={cancelling}
                              onClick={() => void cancelRunByID(run)}
                            />
                          ) : null}
                          {["succeeded", "failed", "cancelled"].includes(
                            run.status,
                          ) ? (
                            <IconButton
                              variant="ghost"
                              color="error"
                              label={zh ? "删除记录" : "Delete record"}
                              icon={<Trash2 />}
                              disabled={deleting}
                              onClick={() => void deleteRunByID(run)}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {previewDialogCandidate && previewDialogPreview ? (
        <ArticlePreviewModal
          candidate={previewDialogCandidate}
          preview={previewDialogPreview}
          zh={zh}
          onClose={() => setPreviewDialogCandidateID(null)}
        />
      ) : null}
    </div>
  );
}
