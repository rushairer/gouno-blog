import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../../auth';
import { WorkflowLauncher } from '../WorkflowLauncher';

vi.mock('../../../auth', () => ({ apiFetch: vi.fn() }));

const workflow = {
  id: 38,
  name: '生成封面/文配图（手选）',
  description: '为所选文章生成图片候选。',
  enabled: true,
  timezone: 'Asia/Shanghai',
  current_version: 1,
  version_id: 38,
  input_schema: {
    type: 'object',
    required: ['format', 'post_ids'],
    properties: {
      format: { type: 'string', title: '图片任务', enum: ['image_brief'], default: 'image_brief' },
      post_ids: { type: 'array', title: '文章', items: { type: 'integer' }, 'x-gouno-resource': 'post' },
    },
  },
  steps: [],
  created_at: '2026-08-16T00:00:00Z',
  updated_at: '2026-08-16T00:00:00Z',
};

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('WorkflowLauncher', () => {
  it('uses a bounded modal layout and keeps long selected resource labels readable', async () => {
    const longTitle = 'AI 每日资讯：Gemini 3.7 Flash 发布、GPT-5.6 提速 14 倍、SpaceX 完成收购 Cursor';
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (String(path) === '/api/admin/ai-workflows') return jsonResponse([workflow]);
      if (String(path).startsWith('/api/admin/ai-resources/post?')) return jsonResponse({
        list: [{ type: 'post', key: '17', label: longTitle, version_token: 'v1', metadata: {} }],
        total: 1,
        unavailable_keys: [],
      });
      throw new Error(`Unexpected request: ${String(path)}`);
    });

    render(<WorkflowLauncher open resourceType="post" resourceKeys={[17]} title="将所选文章交给 AI" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('workflow-launcher-modal');
    expect(dialog.querySelector('.workflow-launcher__body')).toBeInTheDocument();
    expect(dialog.querySelector('.workflow-launcher__footer')).toBeInTheDocument();

    const label = await screen.findByText(longTitle);
    expect(label).toHaveClass('workflow-resource-label');
    expect(label).toHaveAttribute('title', longTitle);
    expect(label.closest('.workflow-resource-field')).toHaveClass('input-field');
    expect(within(dialog).getByRole('button', { name: `移除 ${longTitle}` })).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/api/admin/ai-resources/post?key=17'), expect.any(Object)));
  });
});
