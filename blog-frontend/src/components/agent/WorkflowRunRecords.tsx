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
  Modal,
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
  const [confirmAction, setConfirmAction] = useState<{
    kind: "cancel" | "delete";
    run: WorkflowRun;
  } | null>(null);
  const [imagePreviews, setImagePreviews] = useState<
    Record<number, ArticleImagePreview>
  >({});
  const [previewDialogCandidateID, setPreviewDialogCandidateID] = useState<
    number | null
  >(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [generationNow, setGenerationNow] = useState(() => Date.now());
  const inspectedFromURL = useRef(false);
  const autoInspectedRunID = useRef<number | null>(null);

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

  const cancelRunByID = async (run: WorkflowRun): Promise<boolean> => {
    if (
      !["queued", "running", "awaiting_approval", "waiting_for_user"].includes(
        run.status,
      )
    )
      return false;
    setCancelling(true);
    setError("");
    try {
      await workflowApi.cancelRun(run.id);
      if (selected?.run.id === run.id) {
        await inspect(run);
      }
      if (onRefresh) await onRefresh();
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "放弃运行失败。"
            : "Could not cancel run.",
      );
      return false;
    } finally {
      setCancelling(false);
    }
  };

  const requestCancelRun = (run: WorkflowRun) => {
    if (
      ["queued", "running", "awaiting_approval", "waiting_for_user"].includes(
        run.status,
      )
    ) {
      setConfirmAction({ kind: "cancel", run });
    }
  };

  const cancelRun = async () => {
    if (selected) requestCancelRun(selected.run);
  };

  const deleteRunByID = async (run: WorkflowRun): Promise<boolean> => {
    if (!["succeeded", "failed", "cancelled"].includes(run.status))
      return false;
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
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "删除运行记录失败。"
            : "Could not delete run record.",
      );
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const requestDeleteRun = (run: WorkflowRun) => {
    if (["succeeded", "failed", "cancelled"].includes(run.status)) {
      setConfirmAction({ kind: "delete", run });
    }
  };

  const deleteRun = async () => {
    if (selected) requestDeleteRun(selected.run);
  };

  const confirmRunAction = async () => {
    if (!confirmAction) return;
    const completed =
      confirmAction.kind === "cancel"
        ? await cancelRunByID(confirmAction.run)
        : await deleteRunByID(confirmAction.run);
    if (completed) setConfirmAction(null);
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

  useEffect(() => {
    const requestedID = Number(
      new URLSearchParams(window.location.search).get("run"),
    );
    if (requestedID) return;
    const candidate = filtered[0];
    if (
      selected ||
      !candidate ||
      loadingID !== null ||
      autoInspectedRunID.current === candidate.id
    )
      return;
    autoInspectedRunID.current = candidate.id;
    void inspect(candidate);
  }, [filtered, inspect, loadingID, selected]);

  return (
    <div className="workflow-records flex min-w-0 flex-col gap-5">
      {error ? <Alert type="error" showIcon title={error} /> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Select
          size="small"
          aria-label={zh ? "筛选 Workflow" : "Filter Workflow"}
          value={String(workflowID)}
          onChange={(nextValue) => {
            setWorkflowID(Number(nextValue));
            setSelected(null);
            autoInspectedRunID.current = null;
            const url = new URL(window.location.href);
            url.searchParams.delete("run");
            window.history.replaceState(null, "", url);
          }}
        >
          <option value="0">{zh ? "全部 Workflow" : "All Workflows"}</option>
          {workflows.map((workflow) => (
            <option key={workflow.id} value={String(workflow.id)}>
              {workflow.name}
            </option>
          ))}
        </Select>
        <Select
          size="small"
          aria-label={zh ? "筛选状态" : "Filter Status"}
          value={statusFilter}
          onChange={(nextValue) => {
            setStatusFilter(String(nextValue));
            setSelected(null);
            autoInspectedRunID.current = null;
            const url = new URL(window.location.href);
            url.searchParams.delete("run");
            window.history.replaceState(null, "", url);
          }}
        >
          <option value="all">{zh ? "全部状态" : "All Status"}</option>
          <option value="succeeded">{zh ? "成功" : "Succeeded"}</option>
          <option value="failed">{zh ? "失败" : "Failed"}</option>
          <option value="running">{zh ? "执行中" : "Running / Queued"}</option>
          <option value="awaiting">
            {zh ? "等待处理 / 审批" : "Awaiting user / approval"}
          </option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-background p-8">
          <Empty
            title={
              zh
                ? "还没有符合条件的 Workflow 运行记录。"
                : "No matching Workflow runs yet."
            }
          />
        </div>
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside
            className="min-w-0 overflow-hidden rounded-lg border bg-background"
            aria-label={zh ? "Workflow Runs" : "Workflow Runs"}
          >
            <div className="border-b bg-muted/20 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <strong className="text-sm">Workflow Runs</strong>
                  <Text size="xs" tone="muted" className="mt-0.5">
                    {filtered.length} {zh ? "条运行证据" : "run records"}
                  </Text>
                </div>
                {workflowID !== 0 || statusFilter !== "all" ? (
                  <Button
                    variant="ghost"
                    size="small"
                    type="button"
                    onClick={() => {
                      setWorkflowID(0);
                      setStatusFilter("all");
                      setSelected(null);
                      autoInspectedRunID.current = null;
                      const url = new URL(window.location.href);
                      url.searchParams.delete("run");
                      window.history.replaceState(null, "", url);
                    }}
                    icon={<X />}
                  >
                    {zh ? "清除" : "Clear"}
                  </Button>
                ) : null}
              </div>
            </div>
            <div
              role="list"
              aria-label={zh ? "Workflow 运行列表" : "Workflow run list"}
              className="max-h-[56rem] overflow-y-auto"
            >
              {filtered.map((run) => {
                const runType = run.dry_run
                  ? "Dry-run"
                  : run.schedule_key
                    ? (zh ? "计划 " : "Scheduled ") + run.schedule_key
                    : zh
                      ? "手动运行"
                      : "Manual";
                return (
                  <div key={run.id} role="listitem">
                    <Button
                      type="button"
                      variant="ghost"
                      block
                      aria-pressed={selected?.run.id === run.id}
                      className={[
                        "group h-auto items-stretch justify-start whitespace-normal rounded-none border-b border-l-2 px-4 py-4 text-left last:border-b-0",
                        selected?.run.id === run.id
                          ? "border-l-primary bg-primary/[0.08] hover:bg-primary/[0.08]"
                          : "border-l-transparent hover:bg-muted/45",
                      ].join(" ")}
                      disabled={loadingID === run.id}
                      onClick={() => void inspect(run)}
                    >
                      <span className="flex w-full min-w-0 flex-col gap-1.5 text-left">
                        <span className="flex min-w-0 items-start justify-between gap-3">
                          <strong className="text-sm">Run #{run.id}</strong>
                          <StatusPill status={run.status} locale={locale} />
                        </span>
                        <span className="text-xs leading-4 text-muted-foreground">
                          {names.get(run.workflow_id) ||
                            "Workflow #" + run.workflow_id}{" "}
                          · v{run.workflow_version_id}
                        </span>
                        <span className="text-sm leading-5 text-foreground/80">
                          {run.error_message ||
                            (zh
                              ? "查看本次执行证据。"
                              : "Inspect this run's execution evidence.")}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{runType}</span>
                          <span>
                            {formatDateTime(run.started_at || run.created_at)}
                          </span>
                          <span>
                            {duration(run.started_at, run.finished_at)}
                          </span>
                          <span>
                            {(
                              (run.input_tokens || 0) + (run.output_tokens || 0)
                            ).toLocaleString()}{" "}
                            Token
                          </span>
                        </span>
                      </span>
                    </Button>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">
            {selected ? (
              <WorkflowRunDetail
                selected={selected}
                locale={locale}
                workflowName={
                  names.get(selected.run.workflow_id) ||
                  "Workflow #" + selected.run.workflow_id
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
              <div className="rounded-lg border bg-background p-8">
                <Text tone="muted">
                  {loadingID
                    ? zh
                      ? "正在载入 Run 证据…"
                      : "Loading Run evidence…"
                    : zh
                      ? "选择一次 Run 查看完整执行证据。"
                      : "Select a Run to inspect complete execution evidence."}
                </Text>
              </div>
            )}
          </div>
        </div>
      )}
      <Modal
        open={confirmAction !== null}
        title={
          confirmAction?.kind === "cancel"
            ? zh
              ? "放弃/终止 Workflow 运行"
              : "Cancel Workflow run"
            : zh
              ? "删除 Workflow 运行记录"
              : "Delete Workflow run record"
        }
        description={
          confirmAction
            ? confirmAction.kind === "cancel"
              ? zh
                ? `确认放弃/终止 Run #${confirmAction.run.id}？`
                : `Cancel Run #${confirmAction.run.id}?`
              : zh
                ? `确认删除 Run #${confirmAction.run.id} 及其附属日志？`
                : `Delete Run #${confirmAction.run.id} and its attached logs?`
            : undefined
        }
        onClose={() => {
          if (!cancelling && !deleting) setConfirmAction(null);
        }}
        onOk={() => void confirmRunAction()}
        okText={
          confirmAction?.kind === "cancel"
            ? zh
              ? "放弃/终止运行"
              : "Cancel run"
            : zh
              ? "删除记录"
              : "Delete record"
        }
        cancelText={zh ? "返回" : "Back"}
        okButtonProps={{
          variant: "solid",
          color: "error",
          loading: confirmAction?.kind === "cancel" ? cancelling : deleting,
        }}
      >
        <Text size="sm" tone="muted">
          {confirmAction?.kind === "cancel"
            ? zh
              ? "终止后当前运行不会继续推进；已经产生的审计记录会保留。"
              : "The run stops progressing, while audit evidence already produced is retained."
            : zh
              ? "只清理终态运行记录和附属日志；文章与媒体文件不会被删除。"
              : "Only the terminal run record and attached logs are removed. Posts and media files are kept."}
        </Text>
      </Modal>

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
