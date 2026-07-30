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

  it('renders structured content-audit evidence in a run detail', async () => {
    const user = userEvent.setup();
    const run = {
      id: 9, agent_id: 1, trigger_type: 'manual', status: 'succeeded', output_summary: 'Audit complete.',
      provider: 'openai', model: 'gpt-5-mini', input_tokens: 20, output_tokens: 30,
      created_at: '2026-07-30T00:00:00Z',
    };
    vi.mocked(apiFetch).mockImplementation(async (input) => {
      const url = input.toString();
      if (url === '/api/admin/agent-runs?pageSize=100') return Response.json({ data: { list: [run] } });
      if (url === '/api/admin/agent-runs/9') return Response.json({ data: { run, tool_calls: [{
        id: 11, run_id: 9, tool_name: 'content.audit_post', risk_level: 'read', status: 'executed', arguments: { id: 3 },
        result: { post_id: 3, metrics: { title_characters: 13, summary_characters: 0, seo_title_characters: 0, seo_description_characters: 0, content_characters: 242, heading_count: 2, image_count: 1, images_missing_alt: 1, internal_link_count: 2, external_link_count: 1 }, checks: [{ code: 'image_alt_missing', severity: 'warning', message: 'Add alt text to every inline image.' }] },
        created_at: '2026-07-30T00:00:00Z',
      }, {
        id: 12, run_id: 9, tool_name: 'content.find_internal_links', risk_level: 'read', status: 'executed', arguments: { id: 3 },
        result: { post_id: 3, suggestions: [{ post_id: 4, title: 'Related article', slug: 'related-article', summary: 'Useful context.', score: 5, match_hints: ['shared tag: go'] }] },
        created_at: '2026-07-30T00:00:00Z',
      }] } });
      return Response.json({ data: responseFor(url) });
    });
    renderConsole();
    await screen.findByText('Weekly Operations');
    await user.click(screen.getByRole('button', { name: 'Runs' }));
    await user.click(screen.getByText('Weekly Operations'));
    expect(await screen.findByRole('region', { name: 'Content audit' })).toBeInTheDocument();
    expect(screen.getByText('image alt missing')).toBeInTheDocument();
    expect(screen.getByText('242')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open article: Related article' })).toHaveAttribute('href', '/articles/related-article');
  });

  it('redirects users without blog management access', async () => {
    vi.mocked(canManageBlog).mockReturnValue(false);
    renderConsole();
    await waitFor(() => expect(redirectToAuthorize).toHaveBeenCalledWith('/admin/agents'));
  });
});
