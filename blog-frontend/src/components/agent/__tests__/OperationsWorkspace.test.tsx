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
      metrics={{ feedback: [], suggestions: 1, converted: 0, ignored: 0, candidate_sets: 1, selected_candidate_sets: 0 }}
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

    await user.click(screen.getByRole('button', { name: 'Make task' }));
    expect(onMutate).toHaveBeenCalledWith('/api/admin/ai-suggestions/7/convert');

    await user.click(screen.getByRole('button', { name: 'Choose and create approval' }));
    expect(onMutate).toHaveBeenCalledWith('/api/admin/ai-candidates/8/select', 'POST', { candidate_id: 11 });
  });

  it('keeps feedback out of the primary queue while retaining the shared form contract', () => {
    const { container } = render(<OperationsWorkspace
      locale="zh"
      onMutate={vi.fn().mockResolvedValue(undefined)}
      metrics={{ feedback: [], suggestions: 0, converted: 0, ignored: 0, candidate_sets: 0, selected_candidate_sets: 0 }}
      suggestions={[]}
      candidateSets={[]}
    />);

    expect(container.querySelector('.operations-queue__counts')).toBeInTheDocument();
    expect(container.querySelector('.operations-history')).toBeInTheDocument();
    const form = container.querySelector('.feedback-form');
    expect(form).toHaveClass('form-grid');
    expect(form?.querySelectorAll('.field')).toHaveLength(4);
    expect(form?.querySelectorAll('.input-field')).toHaveLength(4);
    expect(form?.querySelector('.feedback-form__actions')).toContainElement(screen.getByRole('button', { name: '保存反馈' }));
  });
});
