import { readFile, writeFile } from "node:fs/promises";

const path = "blog-frontend/src/components/agent/WorkflowWorkspace.tsx";
let source = await readFile(path, "utf8");

function replaceOnce(from, to, label) {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) {
    throw new Error(`Ambiguous ${label}`);
  }
  source = source.slice(0, index) + to + source.slice(index + from.length);
}

replaceOnce(
  "  History,\n  Play,\n  Plus,\n",
  "  History,\n  MoreHorizontal,\n  Play,\n  Plus,\n",
  "MoreHorizontal import location",
);
replaceOnce(
  "  CheckboxField,\n  Empty,\n",
  "  CheckboxField,\n  DropdownMenu,\n  DropdownMenuContent,\n  DropdownMenuItem,\n  DropdownMenuSeparator,\n  DropdownMenuTrigger,\n  Empty,\n",
  "dropdown imports location",
);
replaceOnce(
  'import { OperationsMeta, OperationsObjectRow } from "./OperationsPatterns";\n',
  'import {\n  OperationsMeta,\n  OperationsObjectRow,\n  OperationsRegionHeading,\n  OperationsSummaryStrip,\n} from "./OperationsPatterns";\n',
  "operations pattern import",
);
replaceOnce(
  '                  : "";\n              return (',
  '                  : "";\n              const recentRuns = [...runs]\n                .filter((run) => run.workflow_id === workflow.id)\n                .sort((left, right) => right.id - left.id)\n                .slice(0, 5);\n              const successRate = metric?.runs\n                ? Math.round(((metric.runs - metric.failures) / metric.runs) * 100)\n                : 0;\n              return (',
  "workflow detail computed facts",
);

const start = source.indexOf(
  "                  <PanelHeader\n                    title={workflow.name}",
);
if (start < 0) throw new Error("Missing legacy workflow detail header");
const versionsStart = source.indexOf(
  "                  {versions[workflow.id]?.length ? (",
  start,
);
if (versionsStart < 0) throw new Error("Missing legacy workflow versions block");
const end = source.indexOf("                </div>\n              );", versionsStart);
if (end < 0) throw new Error("Missing workflow detail closing marker");

const block = String.raw`                  <section
                    className="overflow-hidden rounded-lg border bg-background"
                    aria-label={
                      locale === "zh"
                        ? workflow.name + " Workflow 概览"
                        : workflow.name + " Workflow overview"
                    }
                  >
                    <div className="flex flex-col gap-4 border-b p-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.08] text-primary">
                          <GitBranch className="size-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold tracking-tight">
                              {workflow.name}
                            </h2>
                            <Tag color={workflow.enabled ? "success" : undefined}>
                              {workflow.enabled
                                ? locale === "zh"
                                  ? "已启用"
                                  : "Enabled"
                                : locale === "zh"
                                  ? "已停用"
                                  : "Disabled"}
                            </Tag>
                            <Tag>v{workflow.current_version}</Tag>
                          </div>
                          <Text className="mt-1 max-w-3xl" tone="muted">
                            {workflow.description}
                          </Text>
                        </div>
                      </div>
                      <div
                        className="flex flex-wrap items-center gap-2"
                        data-slot="workflow-management-actions"
                      >
                        <ButtonLink
                          size="small"
                          variant="outline"
                          to={
                            "/admin/ai-ops?tab=records&record=workflow&workflow=" +
                            workflow.id
                          }
                        >
                          {locale === "zh" ? "运行记录" : "Run records"}
                        </ButtonLink>
                        <Button
                          size="small"
                          variant="outline"
                          type="button"
                          onClick={() => setEditing(workflow)}
                          icon={<Edit2 />}
                        >
                          {locale === "zh" ? "编辑" : "Edit"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              label={locale === "zh" ? "更多 Workflow 操作" : "More Workflow actions"}
                              size="small"
                              variant="outline"
                              icon={<MoreHorizontal />}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => void loadVersions(workflow)}>
                              <History className="size-4" aria-hidden="true" />
                              {labels.versions}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!workflow.enabled && Boolean(runBlockReason)}
                              onSelect={() =>
                                void workflowApi
                                  .setEnabled(workflow.id, !workflow.enabled)
                                  .then(() => onRefresh?.())
                              }
                            >
                              {workflow.enabled ? (
                                <CirclePause className="size-4" aria-hidden="true" />
                              ) : (
                                <Play className="size-4" aria-hidden="true" />
                              )}
                              {workflow.enabled ? labels.disable : labels.enable}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setDeleteTarget(workflow)}>
                              <span className="flex items-center gap-2 text-destructive">
                                <Trash2 className="size-4" aria-hidden="true" />
                                {locale === "zh" ? "删除 Workflow" : "Delete Workflow"}
                              </span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className="p-6">
                      <OperationsSummaryStrip
                        ariaLabel={locale === "zh" ? "Workflow 运行摘要" : "Workflow run summary"}
                        items={[
                          {
                            label: locale === "zh" ? "成功率" : "Success rate",
                            value: successRate + "%",
                            detail:
                              locale === "zh"
                                ? (metric?.runs || 0) + " 次运行中的完成率"
                                : (metric?.runs || 0) + " runs",
                          },
                          {
                            label: locale === "zh" ? "累计运行" : "Total runs",
                            value: metric?.runs || 0,
                            detail: latestRun
                              ? (locale === "zh" ? "最近 " : "Latest ") +
                                statusLabel(latestRun.status, locale)
                              : labels.never,
                          },
                          {
                            label: locale === "zh" ? "失败次数" : "Failures",
                            value: metric?.failures || 0,
                            detail:
                              (metric?.failures || 0) > 0
                                ? locale === "zh"
                                  ? "可在运行中心追溯失败证据"
                                  : "Inspect evidence in the run center"
                                : locale === "zh"
                                  ? "暂无失败记录"
                                  : "No failures",
                          },
                          {
                            label: "Token",
                            value: (metric?.tokens || 0).toLocaleString(),
                            detail: locale === "zh" ? "累计 Workflow Run" : "All Workflow Runs",
                          },
                        ]}
                      />

                      <div className="grid border-b sm:grid-cols-2 xl:grid-cols-4 xl:divide-x">
                        <div className="min-w-0 py-4 xl:pr-5">
                          <Text size="xs" tone="muted">{labels.next}</Text>
                          <strong className="mt-1 block text-sm">
                            {formatTime(workflow.next_run_at)}
                          </strong>
                          <Text size="xs" tone="muted" className="mt-1">
                            {workflow.enabled
                              ? locale === "zh"
                                ? "Scheduler 已启用"
                                : "Scheduler enabled"
                              : locale === "zh"
                                ? "Workflow 已停用"
                                : "Workflow disabled"}
                          </Text>
                        </div>
                        <div className="min-w-0 py-4 xl:px-5">
                          <Text size="xs" tone="muted">{labels.schedule}</Text>
                          <strong className="mt-1 block text-sm">
                            {workflow.cron_expression ||
                              (locale === "zh" ? "仅手动" : "Manual only")}
                          </strong>
                          <Text size="xs" tone="muted" className="mt-1">
                            {workflow.timezone}
                          </Text>
                        </div>
                        <div className="min-w-0 py-4 xl:px-5">
                          <Text size="xs" tone="muted">
                            {locale === "zh" ? "当前版本" : "Current version"}
                          </Text>
                          <strong className="mt-1 block text-sm">
                            v{workflow.current_version}
                          </strong>
                          <Text size="xs" tone="muted" className="mt-1">
                            {workflow.template_key ||
                              (locale === "zh" ? "自定义 Workflow" : "Custom Workflow")}
                          </Text>
                        </div>
                        <div className="min-w-0 py-4 xl:pl-5">
                          <Text size="xs" tone="muted">
                            {locale === "zh" ? "流程规模" : "Flow size"}
                          </Text>
                          <strong className="mt-1 block text-sm">
                            {workflow.steps.length} {locale === "zh" ? "个步骤" : "steps"}
                          </strong>
                          <Text size="xs" tone="muted" className="mt-1">
                            {inputProperties.length} {locale === "zh" ? "项运行输入" : "runtime inputs"}
                          </Text>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section
                    className="overflow-hidden rounded-lg border bg-background"
                    aria-label={locale === "zh" ? "最近运行" : "Recent runs"}
                  >
                    <div className="border-b px-6 py-4">
                      <OperationsRegionHeading
                        title={locale === "zh" ? "最近运行" : "Recent runs"}
                        description={
                          locale === "zh"
                            ? "先看最近执行结果；需要完整步骤、资源与人工交互证据时进入运行中心。"
                            : "Review recent results here, then open the run center for full steps, resources, and human interaction evidence."
                        }
                        action={
                          <ButtonLink
                            size="small"
                            variant="ghost"
                            to={
                              "/admin/ai-ops?tab=records&record=workflow&workflow=" +
                              workflow.id
                            }
                          >
                            {locale === "zh" ? "查看全部" : "View all"}
                          </ButtonLink>
                        }
                      />
                    </div>
                    {recentRuns.length ? (
                      <div className="divide-y">
                        {recentRuns.map((run) => {
                          const startedAt = run.started_at || run.created_at;
                          const start = startedAt ? new Date(startedAt).getTime() : 0;
                          const finish = run.finished_at
                            ? new Date(run.finished_at).getTime()
                            : 0;
                          const durationSeconds =
                            start && finish ? Math.max(0, (finish - start) / 1000) : 0;
                          return (
                            <ButtonLink
                              key={run.id}
                              variant="ghost"
                              block
                              className="h-auto w-full rounded-none px-6 py-3.5 text-left font-normal hover:bg-muted/35"
                              to={
                                "/admin/ai-ops?tab=records&record=workflow&workflow=" +
                                workflow.id +
                                "&run=" +
                                run.id
                              }
                              aria-label={
                                (locale === "zh" ? "查看最近 Run #" : "Open recent Run #") +
                                run.id
                              }
                            >
                              <span className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-[6.5rem_7rem_minmax(8rem,0.8fr)_5rem_minmax(0,1.5fr)] sm:items-center">
                                <strong className="text-sm">Run #{run.id}</strong>
                                <span>
                                  <StatusPill status={run.status} locale={locale} />
                                </span>
                                <Text size="xs" tone="muted">
                                  {formatTime(startedAt)}
                                </Text>
                                <Text size="xs" tone="muted">
                                  {durationSeconds ? durationSeconds.toFixed(1) + " s" : "—"}
                                </Text>
                                <span className="min-w-0">
                                  <Text size="sm" className="truncate">
                                    {run.error_message ||
                                      (locale === "zh"
                                        ? "运行证据已记录"
                                        : "Run evidence recorded")}
                                  </Text>
                                  <Text size="xs" tone="muted" className="mt-0.5">
                                    {((run.input_tokens || 0) + (run.output_tokens || 0)).toLocaleString()} Token
                                    {run.dry_run ? " · Dry-run" : ""}
                                  </Text>
                                </span>
                              </span>
                            </ButtonLink>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6">
                        <Text tone="muted">
                          {locale === "zh"
                            ? "这个 Workflow 暂无运行记录。"
                            : "This Workflow has no run history yet."}
                        </Text>
                      </div>
                    )}
                  </section>

                  <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
                    <section
                      className="overflow-hidden rounded-lg border bg-background"
                      aria-label={locale === "zh" ? "Workflow 流程定义" : "Workflow definition"}
                    >
                      <div className="border-b px-6 py-4">
                        <OperationsRegionHeading
                          title={locale === "zh" ? "流程定义" : "Flow definition"}
                          description={
                            locale === "zh"
                              ? workflow.steps.length + " 个步骤，按实际执行顺序排列。定义说明“会做什么”，运行证据在运行中心查看。"
                              : workflow.steps.length + " steps in execution order. This defines what the Workflow does; run evidence remains in the run center."
                          }
                          action={workflow.template_key ? <Tag>{workflow.template_key}</Tag> : undefined}
                        />
                      </div>
                      <ol className="divide-y">
                        {workflow.steps.map((step, index) => (
                          <li key={step.id} className="flex gap-4 px-6 py-4">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <strong className="text-sm">{step.name || step.id}</strong>
                                <Tag>{step.type}</Tag>
                              </div>
                              <Text size="xs" tone="muted" className="mt-1">
                                {step.agent_id
                                  ? (agentMap.get(step.agent_id)?.name || "Agent #" + step.agent_id) + " · "
                                  : ""}
                                {step.id}
                              </Text>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>

                    <div className="flex min-w-0 flex-col gap-5">
                      <section
                        className="rounded-lg border bg-background p-6"
                        aria-label={locale === "zh" ? "Workflow 运行边界" : "Workflow run boundary"}
                      >
                        <OperationsRegionHeading
                          title={locale === "zh" ? "运行边界" : "Run boundary"}
                          description={
                            locale === "zh"
                              ? "决定 Workflow 可以发现什么，以及哪些对象可以成为本次运行的目标。"
                              : "Defines what the Workflow can discover and which resources may become run targets."
                          }
                        />
                        <dl className="mt-4 space-y-4 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">Scope</dt>
                            <dd className="mt-1 font-medium">
                              {workflow.scope_policy?.mode === "strict"
                                ? locale === "zh"
                                  ? "严格限制目标资源"
                                  : "Strictly limited to target resources"
                                : locale === "zh"
                                  ? "Unscoped 兼容模式"
                                  : "Unscoped compatibility mode"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              {locale === "zh" ? "发现工具" : "Discovery tools"}
                            </dt>
                            <dd className="mt-1 font-medium">
                              {workflow.scope_policy?.discovery_tools?.length
                                ? workflow.scope_policy.discovery_tools.join(" · ")
                                : locale === "zh"
                                  ? "无额外发现工具"
                                  : "No extra discovery tools"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              {locale === "zh" ? "空结果策略" : "Empty result policy"}
                            </dt>
                            <dd className="mt-1 font-medium">
                              {workflow.resource_query_empty_policy === "fail"
                                ? locale === "zh"
                                  ? "视为运行失败"
                                  : "Fail the run"
                                : locale === "zh"
                                  ? "正常结束，不产生后续动作"
                                  : "Finish successfully with no downstream action"}
                            </dd>
                          </div>
                        </dl>
                      </section>

                      <section
                        className="rounded-lg border bg-background p-6"
                        aria-label={locale === "zh" ? "运行当前 Workflow" : "Run current Workflow"}
                      >
                        <OperationsRegionHeading
                          title={locale === "zh" ? "运行当前 Workflow" : "Run current Workflow"}
                          description={
                            locale === "zh"
                              ? "人工执行只覆盖本次运行输入，不会改写当前 Workflow Version。"
                              : "Manual execution overrides only this run's input; it never rewrites the current Workflow Version."
                          }
                        />
                        <div className="mt-5">
                          {hasRuntimeInput ? (
                            <WorkflowInputForm
                              schema={workflow.input_schema}
                              value={inputValue}
                              onChange={(next) =>
                                setInputByID((current) => ({
                                  ...current,
                                  [workflow.id]: next,
                                }))
                              }
                              locale={locale}
                            />
                          ) : (
                            <div className="rounded-lg border bg-muted/[0.18] p-4">
                              <Text size="xs" tone="muted">{labels.input}</Text>
                              <strong className="mt-1 block text-sm">
                                {locale === "zh" ? "无需手动填写" : "No manual input required"}
                              </strong>
                              <Text size="xs" tone="muted" className="mt-1">
                                {locale === "zh"
                                  ? "此流程使用计划规则或 Agent 的受控只读工具获取运行上下文。"
                                  : "This workflow obtains context from scheduled rules or governed read tools."}
                              </Text>
                            </div>
                          )}
                        </div>

                        {runBlockReason ? (
                          <div className="mt-4">
                            <Feedback type="error">{runBlockReason}</Feedback>
                          </div>
                        ) : null}
                        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t pt-5">
                          <Button
                            variant="outline"
                            loading={Boolean(activeRun?.dryRun)}
                            disabled={Boolean(runBlockReason) || Boolean(activeRun)}
                            title={runBlockReason || undefined}
                            type="button"
                            onClick={() => void runWorkflow(workflow, true, runInput())}
                            icon={<TestTube2 />}
                          >
                            {activeRun?.dryRun
                              ? locale === "zh"
                                ? "试运行中…"
                                : "Dry-running…"
                              : labels.dry}
                          </Button>
                          <Button
                            variant="solid"
                            color="primary"
                            loading={Boolean(activeRun && !activeRun.dryRun)}
                            disabled={
                              !workflow.enabled ||
                              latestRun?.status === "running" ||
                              Boolean(runBlockReason) ||
                              Boolean(activeRun)
                            }
                            title={runBlockReason || undefined}
                            type="button"
                            onClick={() => void runWorkflow(workflow, false, runInput())}
                            icon={<Play />}
                          >
                            {activeRun && !activeRun.dryRun
                              ? locale === "zh"
                                ? "运行中…"
                                : "Running…"
                              : latestRun?.status === "failed"
                                ? labels.retry
                                : labels.run}
                          </Button>
                        </div>

                        {activeRun ? (
                          <div
                            className="mt-4 flex items-start gap-3 rounded-lg border bg-muted/[0.18] p-4"
                            role="status"
                            aria-live="polite"
                          >
                            <span className="spinner mt-0.5" aria-hidden="true" />
                            <span className="min-w-0">
                              <strong className="block text-sm">
                                {locale === "zh"
                                  ? (activeRun.dryRun ? "试运行" : "Workflow") + " 正在执行"
                                  : (activeRun.dryRun ? "Dry-run" : "Workflow") + " is running"}
                              </strong>
                              <Text size="xs" tone="muted" className="mt-1">
                                {locale === "zh"
                                  ? "请勿重复点击；完成后会自动刷新状态和运行记录。"
                                  : "Do not submit again. Status and run records refresh automatically when complete."}
                              </Text>
                            </span>
                          </div>
                        ) : null}
                        {feedback ? (
                          <div className="mt-4">
                            <Feedback type={feedback.type}>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span>{feedback.message}</span>
                                {feedback.runID ? (
                                  <ButtonLink
                                    variant="outline"
                                    className="shrink-0"
                                    to={
                                      "/admin/ai-ops?tab=records&record=workflow&workflow=" +
                                      workflow.id +
                                      "&run=" +
                                      feedback.runID
                                    }
                                  >
                                    {runFeedbackActionLabel(feedback.action || "viewRun", locale)}
                                  </ButtonLink>
                                ) : null}
                              </div>
                            </Feedback>
                          </div>
                        ) : null}
                      </section>
                    </div>
                  </div>

                  {versions[workflow.id]?.length ? (
                    <section className="rounded-lg border bg-background p-6">
                      <OperationsRegionHeading
                        title={locale === "zh" ? "版本历史" : "Version history"}
                        description={
                          locale === "zh"
                            ? "回滚会创建新的当前版本，不会删除历史运行证据。"
                            : "Rollback creates a new current version and preserves historical run evidence."
                        }
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        {versions[workflow.id].map((version) => (
                          <Button
                            variant="ghost"
                            key={version.version_id}
                            disabled={version.current_version === workflow.current_version}
                            onClick={() =>
                              void workflowApi
                                .rollback(workflow.id, version.current_version || 0)
                                .then(() => onRefresh?.())
                            }
                            icon={<RotateCcw />}
                          >
                            v{version.current_version}
                          </Button>
                        ))}
                      </div>
                    </section>
                  ) : null}
`;

source = source.slice(0, start) + block + source.slice(end);
await writeFile(path, source);
