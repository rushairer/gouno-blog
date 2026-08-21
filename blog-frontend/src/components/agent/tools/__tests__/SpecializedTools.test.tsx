import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StalePostsConfig } from '../StalePostsConfig';
import { LowEngagementConfig } from '../LowEngagementConfig';
import { KnowledgeSearchConfig } from '../KnowledgeSearchConfig';
import { DistributionDraftConfig } from '../DistributionDraftConfig';

describe('Tool Config Components', () => {
  it('StalePostsConfig allows updating threshold days and using presets', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StalePostsConfig value={{ older_than_days: 180, limit: 20 }} onChange={onChange} locale="zh" />);

    expect(screen.getByDisplayValue('180')).toBeInTheDocument();
    const presetBtn = screen.getByRole('button', { name: '90 天 (季度复盘)' });
    await user.click(presetBtn);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ older_than_days: 90 }));
  });

  it('LowEngagementConfig allows updating min_views and engagement rate', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<LowEngagementConfig value={{ min_views: 100, max_engagement_rate: 0.02, limit: 20 }} onChange={onChange} locale="zh" />);

    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();

    const presetBtn = screen.getByRole('button', { name: /严格关注/ });
    await user.click(presetBtn);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ max_engagement_rate: 0.01 }));
  });

  it('KnowledgeSearchConfig allows updating retrieval limit', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<KnowledgeSearchConfig value={{ limit: 8 }} onChange={onChange} locale="zh" />);

    expect(screen.getByDisplayValue('8')).toBeInTheDocument();
    const presetBtn = screen.getByRole('button', { name: /精简聚焦/ });
    await user.click(presetBtn);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
  });

  it('DistributionDraftConfig allows updating format and platform', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DistributionDraftConfig value={{ format: 'social', platform: 'Twitter' }} onChange={onChange} locale="zh" />);

    expect(screen.getByDisplayValue('Twitter')).toBeInTheDocument();
    const presetBtn = screen.getByRole('button', { name: 'Email Newsletter' });
    await user.click(presetBtn);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ format: 'newsletter', platform: 'Newsletter' }));
  });
});
