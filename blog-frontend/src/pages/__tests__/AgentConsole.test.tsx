import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../../auth';
import { I18nProvider } from '../../i18n';
import AgentConsole from '../AgentConsole';

vi.mock('../../auth', () => ({
  apiFetch: vi.fn(),
  canManageBlog: vi.fn(),
  isLoggedIn: vi.fn(),
  redirectToAuthorize: vi.fn(),
}));

const provider = {
  id: 1, name: 'OpenAI', provider_type: 'openai', base_url: 'https://api.openai.com',
  model: 'gpt-5-mini', api_key_last4: '1234', has_api_key: true, enabled: true,
  request_timeout_seconds: 60, max_output_tokens: 2000,
  created_at: '2026-07-30T00:00:00Z', updated_at: '2026-07-30T00:00:00Z',
};

function responseFor(url: string) {
  if (url === '/api/admin/provider-profiles') return [provider];
  if (url === '/api/admin/agents') return [{
    id: 1, name: 'Weekly Operations', description: 'Weekly report', system_prompt: 'Report',
    provider_profile_id: 1, enabled: true, trigger_type: 'manual', timezone: 'Asia/Shanghai',
    capabilities: ['content.list_posts'], execution_mode: 'advisory', max_steps: 6,
    max_input_tokens: 16000, max_output_tokens: 2000, daily_run_limit: 10,
    monthly_token_budget: 1000000, created_at: '2026-07-30T00:00:00Z', updated_at: '2026-07-30T00:00:00Z',
  }];
  if (url.startsWith('/api/admin/agent-runs')) return { list: [] };
  if (url.startsWith('/api/admin/agent-approvals')) return { list: [] };
  if (url === '/api/admin/agent-tools') return [{
    name: 'content.list_posts', description: 'List posts', parameters: {}, risk_level: 'read',
  }];
  if (url === '/api/admin/agent-presets') return [];
  throw new Error(`unexpected URL: ${url}`);
}

function renderConsole() {
  return render(<I18nProvider><MemoryRouter><AgentConsole /></MemoryRouter></I18nProvider>);
}

describe('AgentConsole', () => {
  beforeEach(() => {
    localStorage.setItem('gouno-blog:locale', 'en');
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(canManageBlog).mockReturnValue(true);
    vi.mocked(apiFetch).mockImplementation(async (input) => Response.json({ data: responseFor(input.toString()) }));
  });

  it('loads agents, providers, runs, approvals, tools, and presets in parallel', async () => {
    renderConsole();
    expect(await screen.findByText('Weekly Operations')).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(6));
    expect(screen.getByRole('button', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByText('gpt-5-mini')).toBeInTheDocument();
  });

  it('opens the provider editor from the provider workspace', async () => {
    const user = userEvent.setup();
    renderConsole();
    await screen.findByText('Weekly Operations');
    await user.click(screen.getByRole('button', { name: 'Providers' }));
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));
    expect(screen.getByRole('heading', { name: 'Add Provider' })).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeRequired();
  });

  it('redirects users without blog management access', async () => {
    vi.mocked(canManageBlog).mockReturnValue(false);
    renderConsole();
    await waitFor(() => expect(redirectToAuthorize).toHaveBeenCalledWith('/admin/agents'));
  });
});
