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

  it('retries all failed iterations for a child step in one request', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn(async () => undefined);
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} onRefresh={onRefresh} />);
    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: '重试 sources 的全部失败项' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '重试 sources 的全部失败项' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-workflow-runs/6/retry', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ step_id: 'sources', iterations: [0] }),
    })));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('supports selecting and applying multiple image candidates in one run', async () => {
    const user = userEvent.setup();
    const candidate = (id: number, placement: string) => ({ id, post_id: 42, generation_status: 'generated', selected: false, placement, anchor: placement === 'inline' ? '## Details' : '', media_asset_url: `/media/${id}.png`, headline: `Candidate ${id}`, alt_text: `Alt ${id}` });
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/steps')) return Response.json({ data: [] });
      if (String(url).endsWith('/resources')) return Response.json({ data: [] });
      if (String(url).endsWith('/interactions')) return Response.json({ data: [] });
      if (String(url).endsWith('/media-candidates')) return Response.json({ data: [candidate(1, 'cover'), candidate(2, 'inline')] });
      if (String(url).endsWith('/events')) return Response.json({ data: [] });
      if (String(url).includes('/preview')) return Response.json({ data: { placement: 'cover', image_url: '/media/1.png', version_matches: true, anchor_matches: true, cover_url: '/media/1.png', content: '## Preview heading\n\n**Body**' } });
      return Response.json({ data: {} });
    });
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} />);
    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));
    await waitFor(() => expect(screen.getByText('Candidate 1')).toBeInTheDocument());
    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(screen.getByRole('button', { name: '批量选择' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-workflow-runs/6/media-candidates/select', expect.objectContaining({ method: 'POST' })));
    await user.click(screen.getByRole('button', { name: '批量预览' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-image-tasks/1/preview'));
    expect((await screen.findAllByRole('heading', { name: 'Preview heading' }))).toHaveLength(2);
    expect(screen.getAllByText('Body')).toHaveLength(2);
  });

  it('keeps an ungenerated image brief actionable inside its source run', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/steps') || String(url).endsWith('/resources') || String(url).endsWith('/interactions') || String(url).endsWith('/events')) return Response.json({ data: [] });
      if (String(url).endsWith('/media-candidates')) return Response.json({ data: [{ id: 9, post_id: 42, generation_status: 'brief_ready', selected: false, placement: 'cover', headline: 'Cover direction', alt_text: 'Cover image' }] });
      return Response.json({ data: {} });
    });
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} />);

    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));
    await user.type(await screen.findByRole('textbox', { name: '图片要求 9' }), '横版，不要人物');
    await user.click(screen.getByRole('button', { name: '开始生成候选图片' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-image-tasks/9/regenerate', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ instruction: '横版，不要人物' }),
    })));
  });

  it('keeps image generation visibly active while polling its source run', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/steps') || String(url).endsWith('/resources') || String(url).endsWith('/interactions') || String(url).endsWith('/events')) return Response.json({ data: [] });
      if (String(url).endsWith('/media-candidates')) return Response.json({ data: [{
        id: 12,
        post_id: 42,
        generation_status: 'generating',
        selected: false,
        placement: 'cover',
        headline: 'Cover direction',
        alt_text: 'Cover image',
        generation_started_at: new Date(Date.now() - 5000).toISOString(),
        generation_deadline_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }] });
      return Response.json({ data: {} });
    });
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} />);

    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));

    expect(await screen.findByText('正在生成图片...')).toBeInTheDocument();
    expect(screen.getByText(/已等待/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消生成' })).toBeInTheDocument();
  });
});
