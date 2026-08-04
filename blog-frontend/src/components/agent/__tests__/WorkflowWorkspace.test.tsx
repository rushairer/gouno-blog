import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowWorkspace } from '../WorkflowWorkspace';

const workflow = {
  id: 7,
  name: 'Daily digest',
  description: 'Summarize the day.',
  enabled: true,
  cron_expression: '0 9 * * *',
  timezone: 'Asia/Shanghai',
  current_version: 1,
  version_id: 11,
  input_schema: { type: 'object', additionalProperties: false },
  steps: [{ id: 'result', type: 'output' as const, output_pointer: '/input' }],
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};
describe('WorkflowWorkspace', () => {
  it('sorts workflows newest first and filters the master list', async () => {
    const user = userEvent.setup();
    const older = { ...workflow, id: 1, name: 'Older workflow', description: 'Legacy check.', created_at: '2026-07-01T00:00:00Z' };
    const newer = { ...workflow, id: 2, name: 'Newest workflow', description: 'SEO review.', created_at: '2026-08-02T00:00:00Z' };
    render(<WorkflowWorkspace workflows={[older, newer]} runs={[]} metrics={[]} agents={[]} locale="zh" onMutate={vi.fn()} onRun={vi.fn()} onSave={vi.fn()} />);

    const list = screen.getByRole('searchbox', { name: '搜索 Workflow' }).closest('.workflow-list-toolbar')?.nextElementSibling;
    expect(list?.textContent?.indexOf('Newest workflow')).toBeLessThan(list?.textContent?.indexOf('Older workflow'));
    await user.type(screen.getByRole('searchbox', { name: '搜索 Workflow' }), 'SEO');
    expect(screen.getByRole('button', { name: /Newest workflow/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Older workflow/ })).not.toBeInTheDocument();
  });

  it('confirms and soft-deletes a workflow', async () => {
    const user = userEvent.setup();
    const onMutate = vi.fn().mockResolvedValue(undefined);
    render(<WorkflowWorkspace workflows={[workflow]} runs={[]} metrics={[]} agents={[]} locale="en" onMutate={onMutate} onRun={vi.fn()} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Deleting “Daily digest” stops future runs. Version history and run audits are retained.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete workflow' }));
    await waitFor(() => expect(onMutate).toHaveBeenCalledWith('/api/admin/ai-workflows/7', 'DELETE'));
  });

  it('shows progress immediately and success feedback after a run completes', async () => {
    const user = userEvent.setup();
    let complete!: (value: unknown) => void;
    const onRun = vi.fn().mockImplementation(() => new Promise<unknown>((resolve) => { complete = resolve; }));
    render(<WorkflowWorkspace workflows={[workflow]} runs={[]} metrics={[]} agents={[]} locale="zh" onMutate={vi.fn()} onRun={onRun} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '运行' }));
    expect(screen.getByRole('button', { name: '运行中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dry-run' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Workflow 正在执行');
    expect(screen.getByRole('status')).toHaveTextContent('完成后会自动刷新状态和运行记录');

    complete({ id: 21, workflow_id: 7, workflow_version_id: 11, dry_run: false, status: 'succeeded', input: {}, input_tokens: 0, output_tokens: 0, created_at: '2026-08-01T10:00:00Z' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('今日已有成功运行 Run #21，本次未重复执行'));
    expect(screen.getByRole('button', { name: '运行' })).toBeEnabled();
    expect(onRun).toHaveBeenCalledWith(7, false, {});
  });

  it('shows an actionable failure message and restores the run button', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockRejectedValue(new Error('Provider request timeout'));
    render(<WorkflowWorkspace workflows={[workflow]} runs={[]} metrics={[]} agents={[]} locale="zh" onMutate={vi.fn()} onRun={onRun} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '运行' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('运行失败：Provider request timeout');
    expect(screen.getByRole('alert')).toHaveTextContent('效果与记录 → Workflow 运行');
    expect(screen.getByRole('button', { name: '运行' })).toBeEnabled();
  });

  it('stops a run when the server-side preflight finds a missing dependency', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(<WorkflowWorkspace workflows={[workflow]} runs={[]} metrics={[]} agents={[]} locale="zh" onMutate={vi.fn()} onRun={onRun} onSave={vi.fn()} onPreflight={vi.fn().mockResolvedValue({ ready: false, checks: [{ key: 'agent_bindings', status: 'error', message: 'linked Agent "Reviewer" is disabled' }] })} />);

    await user.click(screen.getByRole('button', { name: '运行' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('linked Agent "Reviewer" is disabled');
    expect(onRun).not.toHaveBeenCalled();
  });

  it('does not report success when the backend returns a failed run', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockResolvedValue({
      id: 22, workflow_id: 7, workflow_version_id: 11, dry_run: false, status: 'failed', input: {},
      input_tokens: 0, output_tokens: 0, error_message: 'RSS source validation failed', created_at: '2026-08-01T10:01:00Z',
    });
    render(<WorkflowWorkspace workflows={[workflow]} runs={[]} metrics={[]} agents={[]} locale="zh" onMutate={vi.fn()} onRun={onRun} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '运行' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('运行失败：RSS source validation failed');
    expect(screen.queryByText(/运行成功/)).not.toBeInTheDocument();
  });

  it('does not let a successful dry-run hide a failed live run', () => {
    const failedRun = { id: 6, workflow_id: 7, workflow_version_id: 11, dry_run: false, status: 'failed', input: {}, input_tokens: 0, output_tokens: 0, error_message: 'Provider failed', created_at: '2026-08-01T09:00:00Z' };
    const dryRun = { ...failedRun, id: 19, dry_run: true, status: 'succeeded', error_message: undefined, created_at: '2026-08-01T10:00:00Z' };
    render(<WorkflowWorkspace workflows={[workflow]} runs={[dryRun, failedRun]} metrics={[]} agents={[]} locale="zh" onMutate={vi.fn()} onRun={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText('最近正式运行').nextElementSibling).toHaveTextContent('失败');
    expect(screen.getByText('最近试运行：成功')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled();
  });

  it('keeps tool authorization in the structured scope editor', async () => {
	const user = userEvent.setup();
    render(<WorkflowWorkspace workflows={[]} runs={[]} metrics={[]} agents={[]} locale="zh" onMutate={vi.fn()} onRun={vi.fn()} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '创建 Workflow' }));
    expect(screen.getByText(/只展示当前绑定 Skill 已授权/)).toBeInTheDocument();
    expect(screen.queryByText('rss.fetch')).not.toBeInTheDocument();
  });

  it('adds a visual resource query before model steps and saves its filters', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editable = { ...workflow, steps: [{ id: 'writer', type: 'model' as const, agent_id: 5 }, { id: 'result', type: 'output' as const, output_pointer: '/steps/writer' }] };
    const agent = { id: 5, name: 'Editor', enabled: true };
    render(<WorkflowWorkspace workflows={[editable]} runs={[]} metrics={[]} agents={[agent] as never[]} locale="zh" onMutate={vi.fn()} onRun={vi.fn()} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: '添加动态资源筛选' }));
    await user.selectOptions(screen.getByLabelText('状态'), 'published');
    await user.clear(screen.getByLabelText('距今未更新天数'));
    await user.type(screen.getByLabelText('距今未更新天数'), '180');
    await user.selectOptions(screen.getByLabelText('空结果策略'), 'fail');
    await user.click(screen.getByRole('button', { name: '保存 Workflow' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.scope_policy.mode).toBe('strict');
    expect(saved.resource_query_empty_policy).toBe('fail');
    expect(saved.steps[0]).toMatchObject({ id: 'select_resources', type: 'resource_query', resource_type: 'post', max_items: 20, filter: { status: 'published', updated_before_days: 180 } });
    expect(saved.steps[1]).toMatchObject({ id: 'writer', type: 'model', agent_id: 5 });
  });

  it('configures partial failures and preserves nested Agent bindings', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editable = { ...workflow, steps: [
      { id: 'select', type: 'resource_query' as const, resource_type: 'post' as const, filter: {}, max_items: 3 },
      { id: 'batch', type: 'for_each' as const, collection_pointer: '/steps/select', max_items: 3, steps: [{ id: 'writer', type: 'model' as const, agent_id: 5 }] },
      { id: 'result', type: 'output' as const, output_pointer: '/steps/batch' },
    ] };
    const agent = { id: 5, name: 'Editor', enabled: true };
    render(<WorkflowWorkspace workflows={[editable]} runs={[]} metrics={[]} agents={[agent] as never[]} locale="zh" onMutate={vi.fn()} onRun={vi.fn()} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('批量绑定 Agent')).toHaveValue('5');
    await user.selectOptions(screen.getByLabelText('单项失败处理'), 'continue');
    await user.click(screen.getByRole('button', { name: '保存 Workflow' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.steps[1]).toMatchObject({ type: 'for_each', continue_on_error: true, steps: [{ type: 'model', agent_id: 5 }] });
  });

  it('shows only discovery tools authorized by the bound Agent skill', async () => {
    const user = userEvent.setup();
    const editable = { ...workflow, steps: [{ id: 'writer', type: 'model' as const, agent_id: 5 }, { id: 'result', type: 'output' as const, output_pointer: '/steps/writer' }] };
    const agent = { id: 5, name: 'Editor', enabled: true, skill: { capabilities: ['content.find_related'] } };
    render(<WorkflowWorkspace workflows={[editable]} runs={[]} metrics={[]} agents={[agent] as never[]} tools={[
      { name: 'content.find_related', description: 'Find related content', risk_level: 'read', surfaces: ['agent'], parameters: {}, scope: { discovery: true } },
      { name: 'content.propose_update', description: 'Propose update', risk_level: 'propose', surfaces: ['agent'], parameters: {}, scope: { discovery: true } },
      { name: 'content.search_knowledge', description: 'Search knowledge', risk_level: 'read', surfaces: ['agent'], parameters: {}, scope: { discovery: true } },
    ]} locale="zh" onMutate={vi.fn()} onRun={vi.fn()} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('content.find_related')).toBeInTheDocument();
    expect(screen.queryByText('content.propose_update')).not.toBeInTheDocument();
    expect(screen.queryByText('content.search_knowledge')).not.toBeInTheDocument();
  });

  it('builds a resource input field without JSON editing', async () => {
    const user = userEvent.setup();
    render(<WorkflowWorkspace workflows={[]} runs={[]} metrics={[]} agents={[]} locale="zh" onMutate={vi.fn()} onRun={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '创建 Workflow' }));
    await user.click(screen.getByRole('button', { name: '添加字段' }));
    const selects = screen.getAllByLabelText('资源类型');
    await user.selectOptions(selects[0], 'post');
    expect(screen.getByLabelText('最少数量')).toBeInTheDocument();
    expect(screen.getByLabelText('最多数量')).toBeInTheDocument();
  });

  it('keeps enum and default constraints synchronized when saving a visual schema field', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const imageBrief = {
      ...workflow,
      steps: [{ id: 'writer', type: 'model' as const, agent_id: 5, input_pointer: '/input' }, { id: 'result', type: 'output' as const, output_pointer: '/steps/writer' }],
      input_schema: {
        type: 'object', additionalProperties: false, required: ['post_ids', 'format'], properties: {
          format: { type: 'string', enum: ['image_brief'], default: 'image_brief' },
          post_ids: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 20, 'x-gouno-resource': 'post', 'x-gouno-widget': 'entity-multi-select' },
        },
      },
    };
    render(<WorkflowWorkspace workflows={[imageBrief]} runs={[]} metrics={[]} agents={[{ id: 5, name: 'Image brief agent', enabled: true }] as never[]} locale="zh" onMutate={vi.fn()} onRun={vi.fn()} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('枚举值')).toHaveValue('image_brief');
    expect(screen.getByLabelText('默认值')).toHaveValue('image_brief');
    await user.click(screen.getByRole('button', { name: '保存 Workflow' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].input_schema.properties.format).toMatchObject({
      type: 'string', enum: ['image_brief'], default: 'image_brief',
    });
  });
});
