import { Ban, Eye, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { operationsApi } from '../../api/operations';
import type { ArticleImagePreview } from '../../api/operations';
import { workflowApi } from '../../api/workflows';
import type {
  MediaCandidate,
  Workflow,
  WorkflowInteractionTask,
  WorkflowRun,
  WorkflowStepRun,
} from '../../types/agent';
import { Button, EmptyState, FilterBar, Select, WorkspacePanel } from '../ui';
import { ArticlePreviewModal } from './ArticlePreviewModal';
import { StatusPill } from './StatusPill';
import { WorkflowRunDetail } from './WorkflowRunDetail';
import type { WorkflowRunDetailData } from './WorkflowRunDetail';

function duration(start?: string, finish?: string): string {
  if (!start) return '—';
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
  locale: 'en' | 'zh';
  workflows: Workflow[];
  runs: WorkflowRun[];
  formatDateTime: (value: string) => string;
  onRefresh?: () => Promise<void>;
}) {
  const zh = locale === 'zh';
  const [workflowID, setWorkflowID] = useState(() => {
    const value = Number(
      new URLSearchParams(window.location.search).get('workflow'),
    );
    return value || 0;
  });
  const [selected, setSelected] = useState<WorkflowRunDetailData | null>(null);
  const [loadingID, setLoadingID] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState('');
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
  const [batchBusy, setBatchBusy] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<
    Record<number, ArticleImagePreview>
  >({});
  const [previewDialogCandidateID, setPreviewDialogCandidateID] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
    if (statusFilter !== 'all') {
      if (statusFilter === 'running') {
        result = result.filter((run) => ['queued', 'running'].includes(run.status));
      } else if (statusFilter === 'awaiting') {
        result = result.filter((run) => ['awaiting_approval', 'waiting_for_user'].includes(run.status));
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

  const inspect = useCallback(async (run: WorkflowRun) => {
    setLoadingID(run.id);
    setError('');
    const url = new URL(window.location.href);
    url.searchParams.set('run', String(run.id));
    window.history.replaceState(null, '', url);
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
          ['approval', 'choice', 'input', 'preview_confirm'].includes(
            item.interaction_type,
          ),
        ),
        candidates: candidates.filter((item) =>
          [
            'brief_ready',
            'ready_to_generate',
            'generating',
            'generated',
            'rejected',
            'failed',
            'cancelled',
          ].includes(item.generation_status),
        ),
        events: events.filter((item) => Boolean(item.event_type)),
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '无法载入步骤日志。'
            : 'Could not load step logs.',
      );
    } finally {
      setLoadingID(null);
    }
  }, [zh]);

  const resolveInteraction = async (
    task: WorkflowInteractionTask,
    response: unknown,
  ) => {
    setError('');
    try {
      await workflowApi.resolveInteraction(task, response);
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '交互提交失败。'
            : 'Could not resolve interaction.',
      );
    }
  };

  const cancelInteraction = async (task: WorkflowInteractionTask) => {
    setError('');
    try {
      await workflowApi.cancelInteraction(task);
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '取消交互失败。'
            : 'Could not cancel interaction.',
      );
    }
  };

  const selectionForCandidate = (candidate: MediaCandidate) => ({
    placement:
      candidatePlacement[candidate.id] || candidate.placement || 'cover',
    anchor: candidateAnchor[candidate.id] ?? candidate.anchor ?? '',
  });

  const candidateAction = async (
    candidate: MediaCandidate,
    action: 'select' | 'apply' | 'regenerate' | 'reject',
  ) => {
    setError('');
    try {
      const body =
        action === 'select'
          ? selectionForCandidate(candidate)
          : action === 'regenerate'
            ? {
                instruction: generationInstructions[candidate.id]?.trim() || '',
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
            ? '图片任务操作失败。'
            : 'Image task action failed.',
      );
    }
  };

  const selectedCandidates =
    selected?.candidates.filter(
      (candidate) =>
        candidateSelections[candidate.id] &&
        candidate.generation_status === 'generated',
    ) || [];

  const batchSelect = async () => {
    if (!selected || selectedCandidates.length === 0) return;
    setBatchBusy('select');
    setError('');
    try {
      const selections = selectedCandidates.map((candidate) => ({
        id: candidate.id,
        placement:
          candidatePlacement[candidate.id] || candidate.placement || 'cover',
        anchor: candidateAnchor[candidate.id] ?? candidate.anchor ?? '',
      }));
      await operationsApi.batchMediaAction(selected.run.id, 'select', { selections });
      await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '批量选择失败。'
            : 'Could not select image candidates.',
      );
    } finally {
      setBatchBusy('');
    }
  };

  const previewCandidate = async (candidate: MediaCandidate, openDialog = false) => {
    setError('');
    try {
      const preview = await operationsApi.previewImageTask(candidate.id);
      setImagePreviews((current) => ({ ...current, [candidate.id]: preview }));
      if (openDialog) setPreviewDialogCandidateID(candidate.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '无法创建文章预览。'
            : 'Could not create article preview.',
      );
    }
  };

  const batchPreview = async () => {
    if (selectedCandidates.length === 0) return;
    setBatchBusy('preview');
    setError('');
    try {
      await Promise.all(
        selectedCandidates.map((candidate) => previewCandidate(candidate)),
      );
    } finally {
      setBatchBusy('');
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
    setBatchBusy('apply');
    setError('');
    try {
      await operationsApi.batchMediaAction(selected.run.id, 'apply', {
        candidate_ids: selectedCandidates.map((candidate) => candidate.id),
      });
      await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '批量应用失败。'
            : 'Could not apply image candidates.',
      );
    } finally {
      setBatchBusy('');
    }
  };

  const batchReject = async () => {
    if (!selected || selectedCandidates.length === 0) return;
    setBatchBusy('reject');
    setError('');
    try {
      await operationsApi.batchMediaAction(selected.run.id, 'reject', {
        candidate_ids: selectedCandidates.map((candidate) => candidate.id),
      });
      await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '批量放弃失败。'
            : 'Could not reject image candidates.',
      );
    } finally {
      setBatchBusy('');
    }
  };

  const cancelGeneration = async (candidate: MediaCandidate) => {
    setError('');
    try {
      await operationsApi.cancelImageTask(candidate.id);
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '取消图片生成失败。'
            : 'Could not cancel image generation.',
      );
    }
  };

  const generatingSignature = selected?.candidates.map((candidate) => candidate.generation_status).join(',') || '';
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
        (candidate) => candidate.generation_status === 'generating',
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
    setError('');
    try {
      await workflowApi.retryRun(selected.run.id, { step_id: step.step_id, iterations: [step.iteration] });
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '重试步骤失败。'
            : 'Could not retry step.',
      );
    } finally {
      setRetrying('');
    }
  };

  const retryFailedGroup = async (stepID: string) => {
    if (!selected) return;
    const iterations = selected.steps
      .filter(
        (step) =>
          step.step_id === stepID &&
          step.status === 'failed' &&
          step.iteration !== undefined,
      )
      .map((step) => step.iteration as number);
    if (iterations.length === 0) return;
    setRetrying(`${stepID}:all`);
    setError('');
    try {
      await workflowApi.retryRun(selected.run.id, { step_id: stepID, iterations });
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : zh
            ? '批量重试失败。'
            : 'Batch retry failed.',
      );
    } finally {
      setRetrying('');
    }
  };

  const cancelRunByID = async (run: WorkflowRun) => {
    if (!['queued', 'running', 'awaiting_approval', 'waiting_for_user'].includes(run.status)) return;
    if (!window.confirm(zh ? `确定放弃/终止运行 Run #${run.id} 吗？` : `Cancel run #${run.id}?`)) return;
    setCancelling(true);
    setError('');
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
            ? '放弃运行失败。'
            : 'Could not cancel run.',
      );
    } finally {
      setCancelling(false);
    }
  };

  const cancelRun = async () => {
    if (selected) await cancelRunByID(selected.run);
  };

  const deleteRunByID = async (run: WorkflowRun) => {
    if (!['succeeded', 'failed', 'cancelled'].includes(run.status)) return;
    if (!window.confirm(zh ? `删除运行记录 Run #${run.id} 及其附属日志？文章和媒体文件不会被删除。` : `Delete run #${run.id} and its attached logs? Posts and media files are kept.`)) return;
    setDeleting(true);
    setError('');
    try {
      await workflowApi.deleteRun(run.id);
      if (selected?.run.id === run.id) {
        setSelected(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('run');
        window.history.replaceState(null, '', url);
      }
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : zh ? '删除运行记录失败。' : 'Could not delete run record.');
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
      new URLSearchParams(window.location.search).get('run'),
    );
    if (!requestedID) return;
    const requested = runs.find((run) => run.id === requestedID);
    if (!requested) {
      if (runs.length > 0) {
        inspectedFromURL.current = true;
        workflowApi.getRuns().then((allRuns) => {
          const found = allRuns.find((r) => r.id === requestedID);
          if (found) void inspect(found);
        }).catch(() => {});
      }
      return;
    }
    inspectedFromURL.current = true;
    void inspect(requested);
  }, [inspect, runs]);

  return (
    <div className="workflow-records section-stack">
      {error ? <p className="workflow-records__error">{error}</p> : null}
      {selected ? (
        <WorkflowRunDetail
          selected={selected}
          locale={locale}
          workflowName={names.get(selected.run.workflow_id) || `Workflow #${selected.run.workflow_id}`}
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
            url.searchParams.delete('run');
            window.history.replaceState(null, '', url);
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
        <div className="workflow-runs-list-view section-stack">
          <FilterBar>
            <Select
              size="compact"
              aria-label={zh ? '筛选 Workflow' : 'Filter Workflow'}
              value={workflowID}
              onChange={(event) => {
                setWorkflowID(Number(event.target.value));
                setSelected(null);
              }}
            >
              <option value={0}>{zh ? '全部 Workflow' : 'All Workflows'}</option>
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </Select>
            <Select
              size="compact"
              aria-label={zh ? '筛选状态' : 'Filter Status'}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">{zh ? '全部状态' : 'All Status'}</option>
              <option value="succeeded">{zh ? '成功' : 'Succeeded'}</option>
              <option value="failed">{zh ? '失败' : 'Failed'}</option>
              <option value="running">{zh ? '执行中' : 'Running / Queued'}</option>
              <option value="awaiting">{zh ? '等待处理 / 审批' : 'Awaiting user / approval'}</option>
            </Select>
            <span className="filter-bar__count">
              {filtered.length} {zh ? '条记录' : 'runs'}
            </span>
            {(workflowID !== 0 || statusFilter !== 'all') ? (
              <Button
                variant="ghost"
                size="compact"
                type="button"
                onClick={() => {
                  setWorkflowID(0);
                  setStatusFilter('all');
                }}
              >
                <X /> {zh ? '清除' : 'Clear'}
              </Button>
            ) : null}
          </FilterBar>
          {filtered.length === 0 ? (
            <EmptyState
              label={
                zh
                  ? '还没有 Workflow 运行记录。'
                  : 'No Workflow runs recorded yet.'
              }
            />
          ) : (
            <WorkspacePanel className="agent-table-panel">
              <div className="table-scroll">
                <table className="content-table agent-table workflow-runs-table">
                  <thead>
                    <tr>
                      <th>{zh ? 'Workflow 任务' : 'Workflow Task'}</th>
                      <th>{zh ? '类型' : 'Type'}</th>
                      <th>{zh ? '状态' : 'Status'}</th>
                      <th>{zh ? '执行时间' : 'Execution Time'}</th>
                      <th>{zh ? '耗时' : 'Duration'}</th>
                      <th>{zh ? '操作' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <button
                            type="button"
                            className="workflow-name-button"
                            onClick={() => void inspect(run)}
                          >
                            <strong>
                              {names.get(run.workflow_id) || `Workflow #${run.workflow_id}`}
                            </strong>
                            <small>Run #{run.id} · v{run.workflow_version_id}</small>
                          </button>
                        </td>
                        <td>
                          <strong>
                            {run.dry_run
                              ? (zh ? '试运行' : 'Dry-run')
                              : run.schedule_key
                                ? (zh ? `计划 ${run.schedule_key}` : `Scheduled ${run.schedule_key}`)
                                : (zh ? '手动运行' : 'Manual')}
                          </strong>
                        </td>
                        <td>
                          <StatusPill status={run.status} locale={locale} />
                        </td>
                        <td>
                          <span>{formatDateTime(run.started_at || run.created_at)}</span>
                        </td>
                        <td>
                          <small>{duration(run.started_at, run.finished_at)}</small>
                        </td>
                        <td>
                          <div className="agent-row-actions">
                            <button
                              type="button"
                              title={zh ? '查看详情' : 'Inspect'}
                              disabled={loadingID === run.id}
                              onClick={() => void inspect(run)}
                            >
                              <Eye />
                            </button>
                            {['queued', 'running', 'awaiting_approval', 'waiting_for_user'].includes(run.status) ? (
                              <button
                                type="button"
                                title={zh ? '放弃/终止运行' : 'Cancel run'}
                                disabled={cancelling}
                                onClick={() => void cancelRunByID(run)}
                              >
                                <Ban />
                              </button>
                            ) : null}
                            {['succeeded', 'failed', 'cancelled'].includes(run.status) ? (
                              <button
                                type="button"
                                title={zh ? '删除记录' : 'Delete record'}
                                disabled={deleting}
                                onClick={() => void deleteRunByID(run)}
                              >
                                <Trash2 />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </WorkspacePanel>
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
