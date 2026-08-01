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

    expect(screen.getByText('最近正式运行').nextElementSibling).toHaveTextContent('failed');
    expect(screen.getByText('最近试运行：succeeded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled();
  });

  it('does not expose Tools in the workflow editor', async () => {
	const user = userEvent.setup();
    render(<WorkflowWorkspace workflows={[]} runs={[]} metrics={[]} agents={[]} locale="zh" onMutate={vi.fn()} onRun={vi.fn()} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '创建 Workflow' }));
    expect(screen.getByText(/Workflow 只编排已配置的 Agent 与控制流/)).toBeInTheDocument();
    expect(screen.queryByText('rss.fetch')).not.toBeInTheDocument();
  });
});
