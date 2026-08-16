import { render, screen, waitFor, within } from '@testing-library/react';
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
    window.history.replaceState(null, '', '/');
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
    }] : String(url).endsWith('/events') ? [{
      id: 21,
      workflow_run_id: 6,
      workflow_step_id: 'images',
      event_type: 'image_candidates_created',
      payload: { count: 1 },
      created_at: '2026-08-01T01:00:01Z',
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
    expect(document.querySelector('.workflow-run-resources__list--single')).toBeInTheDocument();
    expect(document.querySelector('.workflow-event-timeline')).toBeInTheDocument();
    expect(screen.getByText('image candidates created')).toBeInTheDocument();
  });

  it('shows persisted run events with the newest event first', async () => {
    vi.mocked(apiFetch).mockImplementation(async (url) => Response.json({ data: String(url).endsWith('/events') ? [
      { id: 20, workflow_run_id: 6, event_type: 'older_event', payload: {}, created_at: '2026-08-01T01:00:01Z' },
      { id: 21, workflow_run_id: 6, event_type: 'newest_event', payload: {}, created_at: '2026-08-01T01:00:02Z' },
    ] : [] }));
    const user = userEvent.setup();
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} />);

    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));

    await waitFor(() => expect(screen.getByText('newest event')).toBeInTheDocument());
    const labels = Array.from(document.querySelectorAll('.workflow-event-timeline summary strong')).map((item) => item.textContent);
    expect(labels).toEqual(['newest event', 'older event']);
  });

  it('renders an AI output summary as readable Markdown and keeps raw data collapsible', async () => {
    const user = userEvent.setup();
    const completedRun = {
      ...run,
      status: 'succeeded',
      output: {
        output_summary: '## 分类与标签建议\n\n- 将 **AI** 拆分为更具体的主题标签\n- 保留现有分类，后续再补充描述',
        input_tokens: 942,
        output_tokens: 2039,
      },
    };
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[completedRun]} formatDateTime={(value) => value} />);

    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));

    expect(await screen.findByRole('heading', { name: '运行结论' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '分类与标签建议' })).toBeInTheDocument();
    const summary = document.querySelector('.workflow-run-output__summary');
    expect(summary).toBeInTheDocument();
    expect(within(summary as HTMLElement).getByText(/将.*拆分为更具体/)).toBeInTheDocument();
    expect(screen.getByText('查看原始运行数据')).toBeInTheDocument();
    expect(document.querySelector('.workflow-run-output__raw')).not.toHaveAttribute('open');
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

  it('lets an administrator delete a terminal record and refreshes the list', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn(async () => undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));
    await user.click(await screen.findByRole('button', { name: '删除记录' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-workflow-runs/6', { method: 'DELETE' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    confirm.mockRestore();
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
    await waitFor(() => expect(screen.getAllByText('Candidate 1')[0]).toBeInTheDocument());
    expect(document.querySelector('.workflow-candidate-card')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(screen.getByRole('button', { name: '批量选择' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-workflow-runs/6/media-candidates/select', expect.objectContaining({ method: 'POST' })));
    await user.click(screen.getByRole('button', { name: '批量预览' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-image-tasks/1/preview'));
    await user.click(screen.getAllByRole('button', { name: '预览文章' })[0]);
    expect(await screen.findByRole('dialog', { name: '文章预览' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preview heading' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
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

  it('explains that an outdated image candidate cannot be applied', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/steps') || String(url).endsWith('/resources') || String(url).endsWith('/interactions') || String(url).endsWith('/events')) return Response.json({ data: [] });
      if (String(url).endsWith('/media-candidates')) return Response.json({ data: [{ id: 14, post_id: 42, generation_status: 'generated', selected: true, placement: 'cover', headline: 'Stale cover', alt_text: 'Cover image' }] });
      if (String(url).includes('/preview')) return Response.json({ data: { placement: 'cover', image_url: '/media/14.png', version_matches: false, anchor_matches: false, cover_url: '/media/14.png', content: '## Preview heading' } });
      return Response.json({ data: {} });
    });
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} />);

    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));
    await user.click(await screen.findByRole('button', { name: '预览文章' }));

    expect(await screen.findByText('候选图与当前文章不一致')).toBeInTheDocument();
    expect(screen.getByText('文章已在生成候选图后更新，不能直接应用旧候选图。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认应用' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '刷新预览' })).not.toBeInTheDocument();
  });

  it('saves an inline placement and anchor before allowing a preview', async () => {
    const user = userEvent.setup();
    let placementSaved = false;
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/steps') || String(url).endsWith('/resources') || String(url).endsWith('/interactions') || String(url).endsWith('/events')) return Response.json({ data: [] });
      if (String(url).endsWith('/select')) placementSaved = true;
      if (String(url).endsWith('/media-candidates')) return Response.json({ data: [{ id: 15, post_id: 42, generation_status: 'generated', selected: true, placement: placementSaved ? 'inline' : 'cover', anchor: placementSaved ? 'Google 动态' : '', headline: 'Cover brief', alt_text: 'Cover image' }] });
      if (String(url).endsWith('/preview')) return Response.json({ data: { placement: 'inline', image_url: '/media/15.png', version_matches: true, anchor_matches: true, content: 'Google 动态\n\n![Cover image](/media/15.png)' } });
      return Response.json({ data: {} });
    });
    render(<WorkflowRunRecords locale="zh" workflows={[workflow]} runs={[run]} formatDateTime={(value) => value} />);

    await user.click(screen.getByRole('button', { name: /AI 每日资讯/ }));
    await user.selectOptions(screen.getByRole('combobox'), 'inline');
    await user.type(screen.getByPlaceholderText('锚点文字（小标题或关键句）'), 'Google 动态');

    expect(screen.getByText('位置设置尚未保存；保存后才能预览或应用。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '预览文章' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '保存位置' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-image-tasks/15/select', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ placement: 'inline', anchor: 'Google 动态' }),
    })));
    await waitFor(() => expect(screen.getByRole('button', { name: '预览文章' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '预览文章' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-image-tasks/15/preview'));
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

    expect(await screen.findByText(/正在生成图片/)).toBeInTheDocument();
    expect(screen.getByText(/已等待/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消生成' })).toBeInTheDocument();
  });
});
