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
  if (url === '/api/admin/embedding-profiles') return [];
  if (url === '/api/admin/ai-index/status') return { queued: 0, failed: 0, chunks: 0 };
  if (url === '/api/admin/agents') return [{
    id: 1, name: 'Weekly Operations', description: 'Weekly report', provider_profile_id: 1, skill_version_id: 1,
    skill: { id: 1, name: 'Weekly Operations', description: 'Weekly report', system_prompt: 'Report', capabilities: ['content.list_posts'], execution_mode: 'advisory', content_publish_mode: 'approval', max_steps: 6, max_input_tokens: 16000, max_output_tokens: 2000, default_daily_run_limit: 10, default_monthly_token_budget: 1000000, version: 1, version_id: 1, input_schema: { type: 'object' }, allowed_triggers: ['manual'], created_at: '2026-07-30T00:00:00Z', updated_at: '2026-07-30T00:00:00Z' },
    enabled: true, trigger_type: 'manual', timezone: 'Asia/Shanghai', daily_run_limit: 10,
    monthly_token_budget: 1000000, created_at: '2026-07-30T00:00:00Z', updated_at: '2026-07-30T00:00:00Z',
  }];
  if (url.startsWith('/api/admin/agent-runs')) return { list: [] };
  if (url.startsWith('/api/admin/agent-approvals')) return { list: [] };
  if (url === '/api/admin/agent-tools') return [{
    name: 'content.list_posts', description: 'List posts', parameters: {}, risk_level: 'read',
  }];
  if (url === '/api/admin/agent-skills') return [];
  if (url === '/api/admin/ai-workflows') return [];
  if (url === '/api/admin/ai-workflow-runs') return [];
  if (url === '/api/admin/ai-workflow-metrics') return { workflows: [] };
  if (url === '/api/admin/ai-suggestions?status=all') return [];
  if (url === '/api/admin/ai-candidates') return [];
  if (url === '/api/admin/ai-media-candidates') return [];
  if (url === '/api/admin/ai-outcome-metrics') return { feedback: [], suggestions: 0, converted: 0, ignored: 0, candidate_sets: 0, selected_candidate_sets: 0 };
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

  it('loads agents, providers, runs, approvals, and tools in parallel', async () => {
    renderConsole();
    expect(await screen.findByRole('heading', { name: 'Start with what you want to improve' })).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(15));
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Advanced settings' }));
    expect(screen.getAllByText('Weekly Operations').length).toBeGreaterThan(0);
    expect(screen.getByText('gpt-5-mini')).toBeInTheDocument();
  });

  it('copies a Skill from the Skill list, not from an Agent', async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Weekly Operations Copy');
    vi.mocked(apiFetch).mockImplementation(async (input, init) => {
      const url = input.toString();
      if (url === '/api/admin/agent-skills') {
        return Response.json({ data: [{
          ...responseFor('/api/admin/agents')[0].skill,
          id: 1, version_id: 1, system_key: 'weekly_operations',
        }] });
      }
      if (url === '/api/admin/agent-skills/1/copy' && init?.method === 'POST') {
        return Response.json({ data: { id: 2, name: 'Weekly Operations Copy' } });
      }
      return Response.json({ data: responseFor(url) });
    });
    renderConsole();
    await screen.findByRole('tab', { name: 'Advanced settings' });
    await user.click(screen.getByRole('tab', { name: 'Advanced settings' }));
    await user.click(screen.getByRole('tab', { name: 'Skills' }));
    await user.click(screen.getByRole('button', { name: 'Copy Skill' }));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/agent-skills/1/copy', expect.objectContaining({
        method: 'POST', body: JSON.stringify({ name: 'Weekly Operations Copy' }),
      }));
    });
    prompt.mockRestore();
  });

  it('opens the provider editor from the provider workspace', async () => {
    const user = userEvent.setup();
    renderConsole();
    await screen.findByRole('tab', { name: 'Advanced settings' });
    await user.click(screen.getByRole('tab', { name: 'Advanced settings' }));
    await user.click(screen.getByRole('tab', { name: 'Providers' }));
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));
    expect(screen.getByRole('heading', { name: 'Add Provider' })).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeRequired();
  });

  it('closes tab-scoped editors when switching workspaces', async () => {
    const user = userEvent.setup();
    renderConsole();
    await screen.findByRole('tab', { name: 'Advanced settings' });
    await user.click(screen.getByRole('tab', { name: 'Advanced settings' }));

    await user.click(screen.getByRole('button', { name: 'Create Agent' }));
    expect(screen.getByRole('heading', { name: 'Create Agent' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(screen.queryByRole('heading', { name: 'Create Agent' })).not.toBeInTheDocument();
    expect(screen.getByText('No saved Skills yet. Skills are reusable governed Agent configurations.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Automation' }));
    await user.click(screen.getByRole('button', { name: 'Create Workflow' }));
    expect(screen.getByRole('heading', { name: 'Create Workflow' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Advanced settings' }));
    await user.click(screen.getByRole('tab', { name: 'Providers' }));
    expect(screen.queryByRole('heading', { name: 'Create Workflow' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Providers' })).toBeInTheDocument();
  });

  it('renders structured content-audit evidence in a run detail', async () => {
    const user = userEvent.setup();
    const run = {
      id: 9, agent_id: 1, trigger_type: 'manual', status: 'succeeded', output_summary: 'Audit complete.',
      provider: 'openai', model: 'gpt-5-mini', input_tokens: 20, output_tokens: 30,
      created_at: '2026-07-30T00:00:00Z',
      citations: [{ citation_id: 'kb_123', post_id: 5, title: 'Search result', slug: 'search-result', snippet: 'Verified source.', status: 'validated' }],
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
      }, {
        id: 13, run_id: 9, tool_name: 'content.find_related', risk_level: 'read', status: 'executed', arguments: { id: 3 },
        result: { post_id: 3, suggestions: [{ post_id: 5, title: 'Search result', slug: 'search-result', snippet: 'A relevant <b>search</b> fragment.', score: 0.87, tags: ['go'] }] },
        created_at: '2026-07-30T00:00:00Z',
      }, {
        id: 14, run_id: 9, tool_name: 'content.list_stale_posts', risk_level: 'read', status: 'executed', arguments: {},
        result: { older_than_days: 180, list: [{ id: 6, title: 'Old article', slug: 'old-article', summary: 'Needs a review.', updated_at: '2025-01-01T00:00:00Z', views_count: 12, likes_count: 3 }] },
        created_at: '2026-07-30T00:00:00Z',
      }, {
        id: 15, run_id: 9, tool_name: 'content.list_orphan_posts', risk_level: 'read', status: 'executed', arguments: {},
        result: { match_rule: 'no relative /articles/:slug or /posts/:slug link found in another published article', list: [{ id: 7, title: 'Orphan article', slug: 'orphan-article', summary: 'Needs internal links.', views_count: 7, likes_count: 1 }] },
        created_at: '2026-07-30T00:00:00Z',
      }] } });
      return Response.json({ data: responseFor(url) });
    });
    renderConsole();
    await screen.findByRole('tab', { name: 'Results & records' });
    await user.click(screen.getByRole('tab', { name: 'Results & records' }));
    await user.click(screen.getByRole('tab', { name: 'Agent runs' }));
    await user.click(screen.getByText('Weekly Operations'));
    expect(await screen.findByRole('heading', { name: 'Execution log for this run' })).toBeInTheDocument();
    expect(screen.getByText('Every step belongs to the selected run above. Expand a step to inspect its input, result, and errors.')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Content audit' })).toBeInTheDocument();
    expect(screen.getByText('image alt missing')).toBeInTheDocument();
    expect(screen.getByText('242')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open article: Related article' })).toHaveAttribute('href', '/articles/related-article');
    expect(screen.getByRole('link', { name: 'Open article: Search result' })).toHaveAttribute('href', '/articles/search-result');
    expect(screen.getByRole('link', { name: 'Open article: Old article' })).toHaveAttribute('href', '/articles/old-article');
    expect(screen.getByRole('link', { name: 'Open article: Orphan article' })).toHaveAttribute('href', '/articles/orphan-article');
    expect(screen.getByRole('region', { name: 'Citations' })).toBeInTheDocument();
    expect(screen.getByText('Verified source.')).toBeInTheDocument();
  });

  it('redirects users without blog management access', async () => {
    vi.mocked(canManageBlog).mockReturnValue(false);
    renderConsole();
    await waitFor(() => expect(redirectToAuthorize).toHaveBeenCalledWith('/admin/agents'));
  });
});
