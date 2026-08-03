import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentForm } from '../AgentForm';

describe('AgentForm', () => {
  it('prefills a disabled agent draft without enabling it', () => {
    render(<AgentForm
      providers={[{ id: 4, name: 'Local', model: 'mock', enabled: true } as never]}
      skills={[{ id: 8, version_id: 9, name: 'Review', version: 1, capabilities: [], content_publish_mode: 'approval' } as never]}
      prefill={{ name: '内容审校 Agent', provider_profile_id: 4, skill_version_id: 9, enabled: true }}
      locale="zh" labels={{} as Record<string, string>} onSave={vi.fn()} onCancel={vi.fn()}
    />);

    expect(screen.getByDisplayValue('内容审校 Agent')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
