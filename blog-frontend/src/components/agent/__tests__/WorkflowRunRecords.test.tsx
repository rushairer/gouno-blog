import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../../auth';
import { WorkflowRunRecords } from '../WorkflowRunRecords';

vi.mock('../../../auth', () => ({ apiFetch: vi.fn() }));

const workflow = {
  id: 4,
  name: 'AI 每日资讯',
  description: 'Daily AI news',
  enabled: false,
  timezone: 'Asia/Shanghai',
  current_version: 2,
  version_id: 8,
  input_schema: { type: 'object' },
  steps: [],
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const run = {
  id: 6,
  workflow_id: 4,
  workflow_version_id: 8,
  dry_run: false,
  status: 'failed',
  input: { trigger: 'manual' },
  error_code: 'step_failed',
  error_message: 'Provider output did not match the required Markdown format.',
  input_tokens: 120,
  output_tokens: 340,
  triggered_by: 'admin-user',
  started_at: '2026-08-01T01:00:00Z',
  finished_at: '2026-08-01T01:00:02Z',
  created_at: '2026-08-01T01:00:00Z',
};

describe('WorkflowRunRecords', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockImplementation(async (url) => Response.json({ data: String(url).endsWith('/resources') ? [{
      id: 20,
      workflow_run_id: 6,
      type: 'post',
      key: '42',
      source: 'manual',
      access_level: 'target',
      label: 'Structured AI inputs',
      version_token: '2026-08-01T00:00:00Z',
      snapshot: { status: 'published' },
      created_at: '2026-08-01T01:00:00Z',
    }] : [{
      id: 19,
      workflow_run_id: 6,
      step_id: 'sources',
      step_type: 'model',
      iteration: 0,
      status: 'failed',
      input: { max_items: 5 },
      output: { retry_count: 2 },
      error_message: 'Markdown validation failed',
      started_at: '2026-08-01T01:00:00Z',
      finished_at: '2026-08-01T01:00:02Z',
    }] }));
  });

  it('loads and displays step-level input, output, timing, and failure logs', async () => {
    const user = userEvent.setup();
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} />);

    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-workflow-runs/6/steps'));
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-workflow-runs/6/resources');
    expect(screen.getByText('Provider output did not match the required Markdown format.')).toBeInTheDocument();
    expect(screen.getByText('sources')).toBeInTheDocument();
    expect(screen.getByText('Markdown validation failed')).toBeInTheDocument();
    expect(screen.getByText(/"max_items": 5/)).toBeInTheDocument();
    expect(screen.getByText(/"retry_count": 2/)).toBeInTheDocument();
    expect(screen.getAllByText('2.0 s')).toHaveLength(2);
    expect(screen.getByText('Structured AI inputs')).toBeInTheDocument();
    expect(screen.getByText(/手选 · 目标/)).toBeInTheDocument();
  });

  it('retries a failed resource iteration and refreshes records', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn(async () => undefined);
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: '重试此资源' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '重试此资源' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-workflow-runs/6/retry', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ step_id: 'sources', iterations: [0] }),
    })));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
