import { readFile, writeFile } from "node:fs/promises";

const detailPath = "blog-frontend/src/components/agent/WorkflowRunDetail.tsx";
let detail = await readFile(detailPath, "utf8");

detail = detail.replace("  onBack: () => void;\n", "  onBack?: () => void;\n");
const backBlock = `      <div>\n        <Button\n          variant="ghost"\n          size="small"\n          type="button"\n          onClick={onBack}\n          icon={<ArrowLeft />}\n        >\n          {zh ? "返回运行记录列表" : "Back to run records"}\n        </Button>\n      </div>\n`;
if (!detail.includes(backBlock)) throw new Error("Missing WorkflowRunDetail back block");
detail = detail.replace(
  backBlock,
  `      {onBack ? (\n        <div>\n          <Button\n            variant="ghost"\n            size="small"\n            type="button"\n            onClick={onBack}\n            icon={<ArrowLeft />}\n          >\n            {zh ? "返回运行记录列表" : "Back to run records"}\n          </Button>\n        </div>\n      ) : null}\n`,
);
await writeFile(detailPath, detail);

const recordsPath = "blog-frontend/src/components/agent/WorkflowRunRecords.tsx";
let source = await readFile(recordsPath, "utf8");

const refMarker = "  const inspectedFromURL = useRef(false);\n";
if (!source.includes(refMarker)) throw new Error("Missing inspectedFromURL ref");
source = source.replace(
  refMarker,
  `${refMarker}  const autoInspectedRunID = useRef<number | null>(null);\n`,
);

const effectMarker = `  }, [inspect, runs]);\n\n  return (\n`;
if (!source.includes(effectMarker)) throw new Error("Missing URL inspection effect marker");
source = source.replace(
  effectMarker,
  `  }, [inspect, runs]);\n\n  useEffect(() => {\n    const requestedID = Number(\n      new URLSearchParams(window.location.search).get("run"),\n    );\n    if (requestedID) return;\n    const candidate = filtered[0];\n    if (\n      selected ||\n      !candidate ||\n      loadingID !== null ||\n      autoInspectedRunID.current === candidate.id\n    )\n      return;\n    autoInspectedRunID.current = candidate.id;\n    void inspect(candidate);\n  }, [filtered, inspect, loadingID, selected]);\n\n  return (\n`,
);

const start = source.indexOf(
  '  return (\n    <div className="workflow-records section-stack">',
);
if (start < 0) throw new Error("Missing WorkflowRunRecords return start");
const modalStart = source.indexOf(
  '      <Modal\n        open={confirmAction !== null}',
  start,
);
if (modalStart < 0) throw new Error("Missing WorkflowRunRecords modal marker");

const composition = String.raw`  return (
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
                          {names.get(run.workflow_id) || "Workflow #" + run.workflow_id} · v{run.workflow_version_id}
                        </span>
                        <span className="text-sm leading-5 text-foreground/80">
                          {run.error_message ||
                            (zh ? "查看本次执行证据。" : "Inspect this run's execution evidence.")}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{runType}</span>
                          <span>{formatDateTime(run.started_at || run.created_at)}</span>
                          <span>{duration(run.started_at, run.finished_at)}</span>
                          <span>
                            {((run.input_tokens || 0) + (run.output_tokens || 0)).toLocaleString()} Token
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
`;

source = source.slice(0, start) + composition + source.slice(modalStart);
await writeFile(recordsPath, source);
