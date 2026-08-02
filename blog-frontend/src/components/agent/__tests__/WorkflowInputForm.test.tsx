import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../../auth';
import { WorkflowInputForm } from '../WorkflowInputForm';

vi.mock('../../../auth', () => ({ apiFetch: vi.fn() }));

describe('WorkflowInputForm', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ data: { list: [{
      type: 'post', key: '42', label: 'Structured Workflow inputs', status: 'published',
      version_token: '2026-08-02T00:00:00Z', metadata: {},
    }], total: 1, page: 1, page_size: 100 } }));
  });

  it('renders schema controls and writes selected integer resource IDs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const schema = {
      type: 'object', required: ['post_ids', 'format'], properties: {
        post_ids: { title: '文章', type: 'array', items: { type: 'integer' }, maxItems: 2, 'x-gouno-resource': 'post' },
        format: { title: '输出格式', type: 'string', enum: ['review', 'faq'] },
        include_links: { title: '检查链接', type: 'boolean' },
      },
    };
    const { rerender } = render(<WorkflowInputForm schema={schema} value={{ post_ids: [], format: 'review', include_links: false }} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText(/输出格式/), 'faq');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ format: 'faq' }));

    await user.click(screen.getByRole('button', { name: /选择资源/ }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/api/admin/ai-resources/post?'), expect.anything()));
    await user.click(await screen.findByRole('button', { name: /Structured Workflow inputs/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ post_ids: [42] }));

    rerender(<WorkflowInputForm schema={schema} value={{ post_ids: [42], format: 'faq', include_links: false }} onChange={onChange} />);
    expect(screen.getAllByText('Structured Workflow inputs').length).toBeGreaterThan(0);
  });

  it('sends resource-specific filters to the catalog', async () => {
    const user = userEvent.setup();
    render(<WorkflowInputForm schema={{ type: 'object', properties: { post_ids: { title: '文章', type: 'array', items: { type: 'integer' }, 'x-gouno-resource': 'post' } } }} value={{ post_ids: [] }} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '选择资源' }));
    await user.selectOptions(screen.getByLabelText('状态'), 'published');

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('status=published'), expect.anything()));
  });

  it('marks saved resource references that are no longer available', async () => {
    vi.mocked(apiFetch).mockImplementation(async (input) => {
      const url = String(input);
      return Response.json({ data: url.includes('key=99')
        ? { list: [], total: 0, unavailable_keys: ['99'] }
        : { list: [], total: 0, unavailable_keys: [] } });
    });
    render(<WorkflowInputForm schema={{ type: 'object', properties: { post_ids: { title: '文章', type: 'array', items: { type: 'integer' }, 'x-gouno-resource': 'post' } } }} value={{ post_ids: [99] }} onChange={vi.fn()} />);

    expect(await screen.findByText('已失效')).toBeInTheDocument();
    expect(screen.getByText('有 1 项资源已删除或不可用，请移除后再运行。')).toBeInTheDocument();
  });
});
