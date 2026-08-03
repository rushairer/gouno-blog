import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OperationsWorkspace } from '../OperationsWorkspace';

describe('OperationsWorkspace', () => {
  it('converts evidence-backed suggestions and selects candidates through governed APIs', async () => {
    const user = userEvent.setup();
    const onMutate = vi.fn().mockResolvedValue(undefined);
    render(<OperationsWorkspace
      locale="en"
      onMutate={onMutate}
      editorialTasks={[]}
      suggestions={[{
        id: 7, source_type: 'broken_links', source_key: 'post:4', title: 'Repair links',
        description: 'Two cached checks failed.', priority: 'high', evidence: { failures: 2 },
        status: 'new', created_at: '2026-07-30T00:00:00Z', updated_at: '2026-07-30T00:00:00Z',
      }]}
      candidateSets={[{
        id: 8, post_id: 4, source_run_id: 9, source_approval_id: 10, field_type: 'title',
        before_value: 'Old title', status: 'pending', created_at: '2026-07-30T00:00:00Z',
        updated_at: '2026-07-30T00:00:00Z',
        candidates: [{ id: 11, value: 'Better title', rationale: 'Clearer', created_at: '2026-07-30T00:00:00Z' }],
      }]}
    />);

    await user.click(screen.getByRole('button', { name: 'Create editorial task' }));
    expect(onMutate).toHaveBeenCalledWith('/api/admin/ai-suggestions/7/convert');

    await user.click(screen.getByRole('button', { name: 'Choose and create approval' }));
    expect(onMutate).toHaveBeenCalledWith('/api/admin/ai-candidates/8/select', 'POST', { candidate_id: 11 });
  });

  it('separates open editorial tasks from handled suggestions without a manual feedback form', async () => {
    const user = userEvent.setup();
    const onMutate = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<OperationsWorkspace
      locale="zh"
      onMutate={onMutate}
      editorialTasks={[{ id: 4, title: '修复失效链接', description: '更新外部链接。', priority: 'high', status: 'open', source_suggestion_id: 7, created_at: '2026-07-30T00:00:00Z' }]}
      suggestions={[{ id: 7, source_type: 'broken_links', source_key: 'post:4', title: '检查失效链接', description: '一条链接失效。', priority: 'high', evidence: {}, status: 'converted', created_at: '2026-07-30T00:00:00Z', updated_at: '2026-07-30T00:00:00Z' }]}
      candidateSets={[]}
    />);

    expect(container.querySelector('.operations-queue__counts')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '编辑任务' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '标记完成' }));
    expect(onMutate).toHaveBeenCalledWith('/api/admin/ai-editorial-tasks/4/status', 'POST', { status: 'done' });
    expect(container.querySelector('.operations-history')).toBeInTheDocument();
    expect(container.querySelector('.feedback-form')).not.toBeInTheDocument();
  });

  it('keeps automatically resolved suggestions out of the decision queue', () => {
    render(<OperationsWorkspace
      locale="zh"
      onMutate={vi.fn().mockResolvedValue(undefined)}
      editorialTasks={[]}
      candidateSets={[]}
      suggestions={[{
        id: 12, source_type: 'broken_links', source_key: 'post:4', title: '旧的链接检查建议',
        description: '最新检查已不再发现可处理的问题。', priority: 'high', evidence: {}, status: 'resolved',
        created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:01:00Z',
      }]}
    />);

    expect(screen.getByText('目前没有需要你决定的运营建议。')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '旧的链接检查建议' })).not.toBeInTheDocument();
    expect(screen.getByText('自动已解决', { selector: '.status-pill--resolved' })).toBeInTheDocument();
  });

  it('reviews an approved image brief before exposing image generation', async () => {
    const user = userEvent.setup();
    const onMutate = vi.fn().mockResolvedValue(undefined);
    render(<OperationsWorkspace locale="zh" onMutate={onMutate} editorialTasks={[]} suggestions={[]} candidateSets={[]} mediaCandidates={[{
      id: 31, post_id: 11, source_run_id: 25, source_approval_id: 40, headline: '封面', brief: '深色科技感构图', platform: '', provider: 'anthropic', model: 'image-model', input_tokens: 1, output_tokens: 1,
      generation_status: 'brief_ready', safety_status: 'not_checked', copyright_status: 'not_checked', alt_text: '', created_at: '2026-08-03T00:00:00Z',
    }]} />);
    expect(screen.getByText('图片方案待审核')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '审核通过，进入生成' }));
    expect(onMutate).toHaveBeenCalledWith('/api/admin/ai-media-candidates/31/review', 'POST', { action: 'ready' });
  });
});
