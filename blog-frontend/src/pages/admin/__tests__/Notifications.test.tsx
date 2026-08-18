import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminNotifications from '../Notifications';
import { apiFetch } from '../../../auth';
import { ToastProvider } from '../../../components/ui';

vi.mock('../../../auth', () => ({
  apiFetch: vi.fn(),
  getUserProfile: () => ({ name: 'Admin', role: 'admin' }),
}));

vi.mock('../../../hooks/useAdminGuard', () => ({
  useAdminGuard: () => true,
}));

function renderNotifications() {
  return render(
    <ToastProvider>
      <BrowserRouter>
        <AdminNotifications />
      </BrowserRouter>
    </ToastProvider>
  );
}

const mockNotifications = [
  {
    id: 1,
    type: 'ai_workflow_failed',
    title: 'Workflow 运行失败：AI 每日资讯',
    body: 'invalid workflow: Agent run 11 failed',
    href: '/admin/agents?tab=records&workflow=4',
    read_at: null,
    created_at: '2026-08-18T09:38:34Z',
  },
  {
    id: 2,
    type: 'comment_reply',
    actor_name: 'Alice',
    post_title: 'Go 语言微服务实践',
    post_slug: 'go-microservices',
    body: '这篇文章写得很透彻！',
    read_at: '2026-08-17T10:00:00Z',
    created_at: '2026-08-17T09:00:00Z',
  },
];

describe('Admin Notifications Page', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (String(url).includes('/api/me/notifications/read-all')) {
        return Response.json({ message: 'ok' });
      }
      if (String(url).includes('/api/me/notifications/1/read')) {
        return Response.json({ message: 'ok' });
      }
      if (String(url).includes('/api/me/notifications')) {
        return Response.json({ data: { list: mockNotifications } });
      }
      return Response.json({ data: null });
    });
  });

  it('renders admin notifications with badges, filters, and actions', async () => {
    renderNotifications();

    expect(await screen.findByText('通知中心')).toBeInTheDocument();
    expect(screen.getByText('Workflow 运行失败：AI 每日资讯')).toBeInTheDocument();
    expect(screen.getByText('Workflow 告警')).toBeInTheDocument();
    expect(screen.getByText('Alice 互动消息')).toBeInTheDocument();
    expect(screen.getByText('评论互动')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /全部标为已读/ })).toBeInTheDocument();
  });

  it('filters notifications by status and type', async () => {
    const user = userEvent.setup();
    renderNotifications();

    expect(await screen.findByText('Workflow 运行失败：AI 每日资讯')).toBeInTheDocument();

    const typeSelect = screen.getByLabelText('类型筛选');
    await user.selectOptions(typeSelect, 'ai');

    expect(screen.getByText('Workflow 运行失败：AI 每日资讯')).toBeInTheDocument();
    expect(screen.queryByText('Alice 互动消息')).not.toBeInTheDocument();
  });

  it('marks a single notification as read', async () => {
    const user = userEvent.setup();
    renderNotifications();

    const markReadBtn = await screen.findByRole('button', { name: '标为已读' });
    await user.click(markReadBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/me/notifications/1/read', { method: 'PUT' });
    });
  });
});
