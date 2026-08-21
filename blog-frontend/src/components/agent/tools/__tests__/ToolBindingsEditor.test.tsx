import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToolBindingsEditor } from '../ToolBindingsEditor';
import type { ToolDefinition } from '../../../../types/agent';

const mockTools: ToolDefinition[] = [
  { name: 'rss.fetch', description: 'RSS', parameters: {}, risk_level: 'read', surfaces: ['agent'] },
  { name: 'content.list_stale_posts', description: 'Stale', parameters: {}, risk_level: 'read', surfaces: ['agent'] },
  { name: 'analytics.list_low_engagement_posts', description: 'Low engagement', parameters: {}, risk_level: 'read', surfaces: ['agent'] },
  { name: 'content.search_knowledge', description: 'Knowledge', parameters: {}, risk_level: 'read', surfaces: ['agent'] },
  { name: 'content.propose_distribution_draft', description: 'Distribution', parameters: {}, risk_level: 'propose', surfaces: ['agent'] },
];

describe('ToolBindingsEditor', () => {
  it('auto-initializes bindings and renders visual cards for selected tools', async () => {
    const onChange = vi.fn();

    render(
      <ToolBindingsEditor
        capabilities={['content.list_stale_posts', 'analytics.list_low_engagement_posts']}
        tools={mockTools}
        toolBindings={{
          'content.list_stale_posts': { older_than_days: 90, limit: 10 },
          'analytics.list_low_engagement_posts': { min_views: 50, max_engagement_rate: 0.01, limit: 10 },
        }}
        onChange={onChange}
        locale="zh"
      />
    );

    expect(screen.getByText('陈旧内容判定设置 (content.list_stale_posts)')).toBeInTheDocument();
    expect(screen.getByText('低互动分析阈值 (analytics.list_low_engagement_posts)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('90')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('renders Knowledge and Distribution configs when selected', () => {
    const onChange = vi.fn();

    render(
      <ToolBindingsEditor
        capabilities={['content.search_knowledge', 'content.propose_distribution_draft']}
        tools={mockTools}
        toolBindings={{
          'content.search_knowledge': { limit: 5 },
          'content.propose_distribution_draft': { format: 'newsletter', platform: 'Newsletter' },
        }}
        onChange={onChange}
        locale="zh"
      />
    );

    expect(screen.getByText('知识库检索设置 (content.search_knowledge)')).toBeInTheDocument();
    expect(screen.getByText('多渠道内容分发设置 (content.propose_distribution_draft)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Newsletter')).toBeInTheDocument();
  });

  it('switches to raw JSON mode and updates on valid JSON input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ToolBindingsEditor
        capabilities={['content.search_knowledge']}
        tools={mockTools}
        toolBindings={{
          'content.search_knowledge': { limit: 8 },
        }}
        onChange={onChange}
        locale="zh"
      />
    );

    const jsonBtn = screen.getByRole('button', { name: 'JSON' });
    await user.click(jsonBtn);

    expect(screen.getByText('原始 JSON 绑定配置')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/"limit": 8/)).toBeInTheDocument();
  });
});
