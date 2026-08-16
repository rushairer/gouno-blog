import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPill } from '../StatusPill';

describe('StatusPill', () => {
  it('localizes the workflow continuation status in both supported locales', () => {
    const { rerender } = render(<StatusPill status="waiting_for_user" locale="zh" />);

    expect(screen.getByText('等待你处理')).toHaveClass('status-pill--waiting_for_user');

    rerender(<StatusPill status="waiting_for_user" locale="en" />);

    expect(screen.getByText('Waiting for you')).toHaveClass('status-pill--waiting_for_user');
  });
});
