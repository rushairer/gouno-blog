import { ChevronRight, GitBranch, LoaderCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../auth";
import type {
  MediaCandidate,
  Workflow,
  WorkflowInteractionTask,
  WorkflowResource,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowStepRun,
} from "../../agent";
import { EmptyState, Modal, Panel, Select } from "../ui";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { StatusPill } from "./StatusPill";

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Request failed");
  return body.data as T;
}

function duration(start?: string, finish?: string): string {
  if (!start || !finish) return "—";
  const milliseconds = new Date(finish).getTime() - new Date(start).getTime();
  if (milliseconds < 1000) return `${Math.max(0, milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)} s`;
}

function elapsed(start?: string, now = Date.now()): string {
  if (!start) return "—";
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(start).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function newestFirst<T extends { id: number; created_at: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const rightTime = Date.parse(right.created_at) || 0;
    const leftTime = Date.parse(left.created_at) || 0;
    return rightTime - leftTime || right.id - left.id;
  });
}

type ArticleImagePreview = {
  placement: string;
  image_url: string;
  version_matches: boolean;
  anchor_matches: boolean;
  applied?: boolean;
  cover_url?: string;
  content?: string;
};

function JsonLog({ value }: { value: unknown }) {
  if (value === undefined || value === null) return <span>—</span>;
  return (
    <pre className="agent-json-preview">{JSON.stringify(value, null, 2)}</pre>
  );
}

function ArticlePreviewDialog({
  candidate,
  preview,
  zh,
  onClose,
}: {
  candidate: MediaCandidate;
  preview: ArticleImagePreview;
  zh: boolean;
  onClose: () => void;
}) {
  const isCurrent = preview.version_matches && preview.anchor_matches;
  return (
    <Modal
      className="workflow-preview-modal"
      open
      title={zh ? "文章预览" : "Article preview"}
      description={
        isCurrent
          ? zh
            ? "这是应用图片后的文章效果；确认应用前不会修改文章。"
            : "This shows the article after applying the image; the article is unchanged until confirmation."
          : zh
            ? "文章在生成此预览后已更新，候选图不能再安全应用。"
            : "The article changed after this preview was generated, so this candidate can no longer be applied safely."
      }
      onClose={onClose}
    >
      <div className="workflow-preview-modal__body">
        <article className="workflow-article-preview-surface">
          {preview.placement === "cover" && preview.cover_url ? (
            <img
              className="workflow-article-preview"
              src={preview.cover_url}
              alt={candidate.alt_text || candidate.headline}
            />
          ) : null}
          {preview.content ? <MarkdownRenderer content={preview.content} /> : null}
        </article>
      </div>
    </Modal>
  );
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
    return workflows.some((workflow) => workflow.id === value) ? value : 0;
  });
  const [selected, setSelected] = useState<{
    run: WorkflowRun;
    steps: WorkflowStepRun[];
    resources: WorkflowResource[];
    interactions: WorkflowInteractionTask[];
    candidates: MediaCandidate[];
    events: WorkflowRunEvent[];
  } | null>(null);
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
  const [deleting, setDeleting] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<
    Record<number, ArticleImagePreview>
  >({});
  const [previewDialogCandidateID, setPreviewDialogCandidateID] = useState<number | null>(null);
  const [generationNow, setGenerationNow] = useState(() => Date.now());
  const inspectedFromURL = useRef(false);
  const names = useMemo(
    () => new Map(workflows.map((item) => [item.id, item.name])),
    [workflows],
  );
  const filtered = workflowID
    ? runs.filter((run) => run.workflow_id === workflowID)
    : runs;

  // The detail panel owns its expanded logs, while the parent owns the fresh
  // run list. Merge the latest run envelope after any action so its status and
  // timing never lag behind the user-visible operation that just completed.
  useEffect(() => {
    if (!selected) return;
    const latest = runs.find((run) => run.id === selected.run.id);
    if (latest && latest !== selected.run) {
      setSelected((current) => (current ? { ...current, run: latest } : null));
    }
  }, [runs, selected]);

  const inspect = useCallback(async (run: WorkflowRun) => {
    setLoadingID(run.id);
    setError("");
    try {
      const [steps, resources, interactions, candidates, events] =
        await Promise.all([
          readData<WorkflowStepRun[]>(
            await apiFetch(`/api/admin/ai-workflow-runs/${run.id}/steps`),
          ),
          readData<WorkflowResource[]>(
            await apiFetch(`/api/admin/ai-workflow-runs/${run.id}/resources`),
          ),
          readData<WorkflowInteractionTask[]>(
            await apiFetch(
              `/api/admin/ai-workflow-runs/${run.id}/interactions`,
            ),
          ),
          readData<MediaCandidate[]>(
            await apiFetch(
              `/api/admin/ai-workflow-runs/${run.id}/media-candidates`,
            ),
          ),
          readData<WorkflowRunEvent[]>(
            await apiFetch(`/api/admin/ai-workflow-runs/${run.id}/events`),
          ),
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
  }, [zh]);

  const resolveInteraction = async (
    task: WorkflowInteractionTask,
    response: unknown,
  ) => {
    setError("");
    try {
      await readData<WorkflowInteractionTask>(
        await apiFetch(`/api/admin/ai-interactions/${task.id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume_token: task.resume_token, response }),
        }),
      );
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
      await readData<unknown>(
        await apiFetch(`/api/admin/ai-interactions/${task.id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume_token: task.resume_token }),
        }),
      );
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
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
  const hasUnsavedCandidateSelection = (candidate: MediaCandidate) => {
    const selection = selectionForCandidate(candidate);
    return selection.placement !== (candidate.placement || "cover") ||
      selection.anchor.trim() !== (candidate.anchor || "").trim();
  };
  const hasValidCandidateSelection = (candidate: MediaCandidate) => {
    const selection = selectionForCandidate(candidate);
    return selection.placement !== "inline" || selection.anchor.trim() !== "";
  };

  const candidateAction = async (
    candidate: MediaCandidate,
    action: "select" | "apply" | "regenerate",
  ) => {
    setError("");
    try {
      const path =
        action === "select"
          ? `/api/admin/ai-image-tasks/${candidate.id}/select`
          : action === "apply"
            ? `/api/admin/ai-image-tasks/${candidate.id}/apply`
            : `/api/admin/ai-image-tasks/${candidate.id}/regenerate`;
      const body =
        action === "select"
          ? selectionForCandidate(candidate)
          : action === "regenerate"
            ? {
                instruction: generationInstructions[candidate.id]?.trim() || "",
              }
            : undefined;
      await readData<unknown>(
        await apiFetch(path, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
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
      await readData<unknown>(
        await apiFetch(
          `/api/admin/ai-workflow-runs/${selected.run.id}/media-candidates/select`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selections }),
          },
        ),
      );
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
      await readData<unknown>(
        await apiFetch(
          `/api/admin/ai-workflow-runs/${selected.run.id}/media-candidates/apply`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              candidate_ids: selectedCandidates.map(
                (candidate) => candidate.id,
              ),
            }),
          },
        ),
      );
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

  const cancelGeneration = async (candidate: MediaCandidate) => {
    setError("");
    try {
      await readData<unknown>(
        await apiFetch(`/api/admin/ai-image-tasks/${candidate.id}/cancel`, {
          method: "POST",
        }),
      );
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

  const previewCandidate = async (candidate: MediaCandidate, openDialog = false) => {
    setError("");
    try {
      const preview = await readData<{
        placement: string;
        image_url: string;
        version_matches: boolean;
        anchor_matches: boolean;
        applied?: boolean;
        cover_url?: string;
        content?: string;
      }>(await apiFetch(`/api/admin/ai-image-tasks/${candidate.id}/preview`));
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

  const generatingSignature = selected?.candidates.map((candidate) => candidate.generation_status).join(",") || "";
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
      await readData<WorkflowRun>(
        await apiFetch(`/api/admin/ai-workflow-runs/${selected.run.id}/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step_id: step.step_id,
            iterations: [step.iteration],
          }),
        }),
      );
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? "重试失败。"
            : "Retry failed.",
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
      await readData<WorkflowRun>(
        await apiFetch(`/api/admin/ai-workflow-runs/${selected.run.id}/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step_id: stepID, iterations }),
        }),
      );
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

  const deleteRun = async () => {
    if (!selected || !["succeeded", "failed", "cancelled"].includes(selected.run.status)) return;
    if (!window.confirm(zh ? "删除这条终态运行记录及其附属日志？文章和媒体文件不会被删除。" : "Delete this completed run and its attached logs? Posts and media files are kept.")) return;
    setDeleting(true);
    setError("");
    try {
      await readData<unknown>(await apiFetch(`/api/admin/ai-workflow-runs/${selected.run.id}`, { method: "DELETE" }));
      setSelected(null);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : zh ? "删除运行记录失败。" : "Could not delete run record.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (inspectedFromURL.current) return;
    const requestedID = Number(
      new URLSearchParams(window.location.search).get("run"),
    );
    const requested = runs.find((run) => run.id === requestedID);
    if (!requested) return;
    inspectedFromURL.current = true;
    void inspect(requested);
  }, [inspect, runs]);

  return (
    <div className="workflow-records section-stack">
      <div className="workflow-records__filter">
        <label>
          {zh ? "筛选 Workflow" : "Filter Workflow"}
          <Select
            value={workflowID}
            onChange={(event) => {
              setWorkflowID(Number(event.target.value));
              setSelected(null);
            }}
          >
            <option value={0}>{zh ? "全部 Workflow" : "All Workflows"}</option>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {error ? <p className="workflow-records__error">{error}</p> : null}
      <div className="agent-split-view">
        <Panel className="agent-master-panel agent-run-list">
          {filtered.length === 0 ? (
            <EmptyState
              label={
                zh
                  ? "还没有 Workflow 运行记录。"
                  : "No Workflow runs recorded yet."
              }
            />
          ) : (
            filtered.map((run) => (
              <button
                className={selected?.run.id === run.id ? "active" : ""}
                key={run.id}
                type="button"
                onClick={() => void inspect(run)}
              >
                <span className={`run-icon run-icon--${run.status}`}>
                  <GitBranch />
                </span>
                <span>
                  <strong>
                    {names.get(run.workflow_id) ||
                      `Workflow #${run.workflow_id}`}
                  </strong>
                  <small>
                    {formatDateTime(run.started_at || run.created_at)} ·{" "}
                    {run.dry_run
                      ? zh
                        ? "试运行"
                        : "Dry-run"
                      : run.schedule_key
                        ? zh
                          ? `计划 ${run.schedule_key}`
                          : `Scheduled ${run.schedule_key}`
                        : zh
                          ? "手动运行"
                          : "Manual"}
                  </small>
                </span>
                <span>
                  {loadingID === run.id ? (
                    <b>{zh ? "载入中" : "Loading"}</b>
                  ) : (
                    <StatusPill status={run.status} locale={locale} />
                  )}
                  <ChevronRight />
                </span>
              </button>
            ))
          )}
        </Panel>
        <Panel className="agent-detail-panel">
          {selected ? (
            <div className="section-stack">
              <div className="panel-heading">
                <div>
                  <h2>
                    {names.get(selected.run.workflow_id) ||
                      `Workflow #${selected.run.workflow_id}`}
                  </h2>
                  <small>
                    Run #{selected.run.id} · Workflow v
                    {selected.run.workflow_version_id}
                  </small>
                </div>
                <div className="row-actions"><StatusPill status={selected.run.status} locale={locale} />
                  {["succeeded", "failed", "cancelled"].includes(selected.run.status) ? <button className="btn btn-secondary" type="button" disabled={deleting} onClick={() => void deleteRun()}><Trash2 />{deleting ? (zh ? "清理中…" : "Deleting…") : (zh ? "删除记录" : "Delete record")}</button> : null}
                </div>
              </div>
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
                    {duration(
                      selected.run.started_at,
                      selected.run.finished_at,
                    )}
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
                          {resource.label ||
                            `${resource.type} #${resource.key}`}
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
                              <button
                                className="btn btn-secondary"
                                type="button"
                                key={index}
                                onClick={() =>
                                  void resolveInteraction(task, { option })
                                }
                              >
                                {String(option)}
                              </button>
                            ))
                          ) : (
                            <button
                              className="btn btn-primary"
                              type="button"
                              onClick={() =>
                                void resolveInteraction(task, {
                                  confirmed: true,
                                })
                              }
                            >
                              {zh ? "确认并继续" : "Confirm and continue"}
                            </button>
                          )}
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => void cancelInteraction(task)}
                          >
                            {zh ? "取消任务" : "Cancel task"}
                          </button>
                        </div>
                      ) : task.response ? (
                        <JsonLog value={task.response} />
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}
              {selected.candidates.length > 0 ? (
                <section className="workflow-interactions">
                  <div className="panel-heading workflow-candidate-heading">
                    <div>
                      <h3>{zh ? "图片候选" : "Image candidates"}</h3>
                      <small>
                        {zh
                          ? "图片会在本次运行中生成；可同时选择封面和正文插图，批量应用只创建一个文章新版本。"
                          : "Images are generated in this run. Select a cover and inline images together; batch apply creates one article version."}
                      </small>
                    </div>
                    <div className="row-actions workflow-candidate-batch-actions">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={
                          batchBusy !== "" || selectedCandidates.length === 0
                        }
                        onClick={() => void batchSelect()}
                      >
                        {batchBusy === "select"
                          ? zh
                            ? "选择中…"
                            : "Selecting…"
                          : zh
                            ? "批量选择"
                            : "Select selected"}
                      </button>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={
                          batchBusy !== "" || selectedCandidates.length === 0
                        }
                        onClick={() => void batchPreview()}
                      >
                        {batchBusy === "preview"
                          ? zh
                            ? "预览中…"
                            : "Previewing…"
                          : zh
                            ? "批量预览"
                            : "Preview selected"}
                      </button>
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={
                          batchBusy !== "" ||
                          selectedCandidates.length === 0 ||
                          selectedCandidates.some(
                            (candidate) =>
                              !candidate.selected ||
                              !imagePreviews[candidate.id]?.version_matches ||
                              !imagePreviews[candidate.id]?.anchor_matches,
                          )
                        }
                        onClick={() => void batchApply()}
                      >
                        {batchBusy === "apply"
                          ? zh
                            ? "应用中…"
                            : "Applying…"
                          : zh
                            ? "批量确认应用"
                            : "Apply selected"}
                      </button>
                    </div>
                  </div>
                  <div className="workflow-candidate-list">
                    {selected.candidates.map((candidate) => (
                    <div
                      className={`workflow-candidate-card${candidate.media_asset_url ? "" : " workflow-candidate-card--no-preview"}`}
                      key={candidate.id}
                    >
                      {candidate.media_asset_url ? (
                        <img
                          className="workflow-candidate-preview"
                          src={candidate.media_asset_url}
                          alt={candidate.alt_text || candidate.headline}
                        />
                      ) : null}
                      <div className="workflow-candidate-card__content">
                        <label className="workflow-candidate-choice">
                          <input
                            type="checkbox"
                            checked={Boolean(candidateSelections[candidate.id])}
                            disabled={
                              candidate.generation_status !== "generated" ||
                              Boolean(candidate.applied_version_id)
                            }
                            onChange={(event) =>
                              setCandidateSelections((current) => ({
                                ...current,
                                [candidate.id]: event.target.checked,
                              }))
                            }
                          />
                          <strong>
                            {candidate.headline || `Candidate #${candidate.id}`}
                          </strong>
                        </label>
                        <small>
                          {candidate.generation_status} ·{" "}
                          {candidate.selected
                            ? zh
                              ? "已选择"
                              : "selected"
                            : zh
                              ? "未选择"
                              : "not selected"}{" "}
                          · {candidate.placement || "cover"}
                        </small>
                        {candidate.generation_status === "generated" ? (
                          <div className="workflow-candidate-fields">
                            <Select
                              size="compact"
                              value={
                                candidatePlacement[candidate.id] ||
                                candidate.placement ||
                                "cover"
                              }
                              onChange={(event) =>
                                setCandidatePlacement((current) => ({
                                  ...current,
                                  [candidate.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="cover">
                                {zh ? "封面" : "Cover"}
                              </option>
                              <option value="inline">
                                {zh ? "正文插图" : "Inline"}
                              </option>
                            </Select>
                            {(candidatePlacement[candidate.id] ||
                              candidate.placement) === "inline" ? (
                              <input
                                className="input-field"
                                value={
                                  candidateAnchor[candidate.id] ??
                                  candidate.anchor ??
                                  ""
                                }
                                placeholder={
                                  zh ? "正文锚点文本" : "Article anchor"
                                }
                                onChange={(event) =>
                                  setCandidateAnchor((current) => ({
                                    ...current,
                                    [candidate.id]: event.target.value,
                                  }))
                                }
                              />
                            ) : null}
                          </div>
                        ) : null}
                        {[
                          "brief_ready",
                          "failed",
                          "ready_to_generate",
                          "cancelled",
                        ].includes(candidate.generation_status) ? (
                          <textarea
                            aria-label={
                              zh
                                ? `图片要求 ${candidate.id}`
                                : `Image instructions ${candidate.id}`
                            }
                            className="input-field"
                            rows={2}
                            value={
                              generationInstructions[candidate.id] ??
                              candidate.regeneration_instruction ??
                              ""
                            }
                            placeholder={
                              zh
                                ? "可选：告诉 AI 如何调整下一轮图片，例如“横版、保留留白、不要人物”。"
                                : "Optional: describe how the next image should change."
                            }
                            onChange={(event) =>
                              setGenerationInstructions((current) => ({
                                ...current,
                                [candidate.id]: event.target.value,
                              }))
                            }
                          />
                        ) : null}
                        {candidate.generation_status === "generating" ? (
                          <div
                            className="workflow-generation-status"
                            role="status"
                          >
                            <LoaderCircle aria-hidden="true" />
                            <span>
                              <strong>
                                {zh ? "正在生成图片..." : "Generating image..."}
                              </strong>
                              <small>
                                {zh
                                  ? `已等待 ${elapsed(candidate.generation_started_at, generationNow)}；最长等待至 ${candidate.generation_deadline_at ? formatDateTime(candidate.generation_deadline_at) : "-"}。`
                                  : `Waiting ${elapsed(candidate.generation_started_at, generationNow)}; deadline ${candidate.generation_deadline_at ? formatDateTime(candidate.generation_deadline_at) : "-"}.`}
                              </small>
                            </span>
                          </div>
                        ) : null}
                        {candidate.error_message ? (
                          <small>{candidate.error_message}</small>
                        ) : null}
                        {imagePreviews[candidate.id] ? (
                          <div className="workflow-preview-state" role="status">
                            <strong>
                              {imagePreviews[candidate.id].applied
                                ? zh
                                  ? "图片已应用到文章"
                                  : "Image applied to article"
                                : imagePreviews[candidate.id].version_matches &&
                                  imagePreviews[candidate.id].anchor_matches
                                  ? zh
                                    ? "文章预览已就绪"
                                    : "Article preview ready"
                                  : zh
                                    ? "候选图与当前文章不一致"
                                    : "Image candidate does not match the current article"}
                            </strong>
                            {!imagePreviews[candidate.id].version_matches ||
                            !imagePreviews[candidate.id].anchor_matches ? (
                              <small>
                                {zh
                                  ? "文章已在生成候选图后更新，不能直接应用旧候选图。"
                                  : "The article changed after this candidate was generated, so it cannot be applied directly."}
                              </small>
                            ) : null}
                          </div>
                        ) : null}
                        {candidate.generation_status === "generated" &&
                        hasUnsavedCandidateSelection(candidate) ? (
                          <small className="workflow-candidate-selection-pending">
                            {zh
                              ? "位置设置尚未保存；保存后才能预览或应用。"
                              : "Placement changes are unsaved; save before previewing or applying."}
                          </small>
                        ) : null}
                      </div>
                      <div className="row-actions workflow-candidate-card__actions">
                        {candidate.generation_status === "generated" ? (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            disabled={hasUnsavedCandidateSelection(candidate)}
                            onClick={() => void previewCandidate(candidate, true)}
                          >
                            {zh ? "预览文章" : "Preview article"}
                          </button>
                        ) : null}
                        {candidate.generation_status === "generated" &&
                        candidate.selected &&
                        hasUnsavedCandidateSelection(candidate) ? (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            disabled={!hasValidCandidateSelection(candidate)}
                            onClick={() =>
                              void candidateAction(candidate, "select")
                            }
                          >
                            {zh ? "保存位置" : "Save placement"}
                          </button>
                        ) : null}
                        {candidate.generation_status === "generated" &&
                        !candidate.selected ? (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() =>
                              void candidateAction(candidate, "select")
                            }
                          >
                            {zh ? "选择" : "Select"}
                          </button>
                        ) : null}
                        {candidate.generation_status === "generated" &&
                        candidate.selected &&
                        !candidate.applied_version_id ? (
                          <>
                            <button
                              className="btn btn-primary"
                              type="button"
                              disabled={
                                hasUnsavedCandidateSelection(candidate) ||
                                !imagePreviews[candidate.id]?.version_matches ||
                                !imagePreviews[candidate.id]?.anchor_matches
                              }
                              onClick={() =>
                                void candidateAction(candidate, "apply")
                              }
                            >
                              {zh ? "确认应用" : "Apply to article"}
                            </button>
                          </>
                        ) : null}
                        {candidate.generation_status === "brief_ready" ? (
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() =>
                              void candidateAction(candidate, "regenerate")
                            }
                          >
                            {zh
                              ? "开始生成候选图片"
                              : "Generate image candidates"}
                          </button>
                        ) : null}
                        {candidate.generation_status === "failed" ||
                        candidate.generation_status === "ready_to_generate" ||
                        candidate.generation_status === "cancelled" ? (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() =>
                              void candidateAction(candidate, "regenerate")
                            }
                          >
                            {zh
                              ? "按这些要求重新生成"
                              : "Regenerate with these instructions"}
                          </button>
                        ) : null}
                        {candidate.generation_status === "generating" ? (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => void cancelGeneration(candidate)}
                          >
                            {zh ? "取消生成" : "Cancel generation"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    ))}
                  </div>
                </section>
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
                <details className="workflow-log-block">
                  <summary>{zh ? "最终输出" : "Final output"}</summary>
                  <JsonLog value={selected.run.output} />
                </details>
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
                      <button
                        className="btn btn-secondary"
                        key={stepID}
                        type="button"
                        disabled={retrying !== ""}
                        onClick={() => void retryFailedGroup(stepID)}
                      >
                        {retrying === `${stepID}:all`
                          ? zh
                            ? "批量重试中…"
                            : "Retrying…"
                          : zh
                            ? `重试 ${stepID} 的全部失败项`
                            : `Retry all failed ${stepID}`}
                      </button>
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
                        <small>
                          {duration(step.started_at, step.finished_at)}
                        </small>
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
                              <button
                                className="btn btn-secondary"
                                type="button"
                                disabled={retrying !== ""}
                                onClick={() => void retryStep(step)}
                              >
                                {retrying ===
                                `${step.step_id}:${step.iteration}`
                                  ? zh
                                    ? "重试中…"
                                    : "Retrying…"
                                  : zh
                                    ? "重试此资源"
                                    : "Retry resource"}
                              </button>
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
          ) : (
            <EmptyState
              label={
                zh
                  ? "选择一条 Workflow 运行记录查看步骤日志。"
                  : "Select a Workflow run to inspect its step logs."
              }
            />
          )}
        </Panel>
      </div>
      {previewDialogCandidate && previewDialogPreview ? (
        <ArticlePreviewDialog
          candidate={previewDialogCandidate}
          preview={previewDialogPreview}
          zh={zh}
          onClose={() => setPreviewDialogCandidateID(null)}
        />
      ) : null}
    </div>
  );
}
