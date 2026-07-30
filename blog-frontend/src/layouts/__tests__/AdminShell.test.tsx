import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminShell from '../AdminShell';
import AdminUsers from '../../pages/admin/Users';

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));

vi.mock('../../auth', () => ({
  getUserProfile: () => ({ name: 'Content Admin', email: 'admin@example.com' }),
  gossoAdminURL: '/identity-admin/',
  logout: logoutMock,
}));

vi.mock('../../lib/blog-api', () => ({
  getSiteSettings: () => Promise.resolve({ site_title: 'Configured Site' }),
}));

describe('AdminShell navigation utilities', () => {
  beforeEach(() => {
    logoutMock.mockClear();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('uses configured site identity and exposes frontsite and logout actions', async () => {
    render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminShell><h1>Dashboard</h1></AdminShell></MemoryRouter>);

    expect(await screen.findByRole('link', { name: 'Configured Site' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '在新窗口查看前台站点' })).toHaveAttribute('href', '/');
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(logoutMock).toHaveBeenCalledOnce();
  });

  it('points the identity management action at the gateway route', () => {
    render(<MemoryRouter><AdminUsers /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /打开 GOSSO 管理端/ })).toHaveAttribute('href', '/identity-admin/');
    expect(screen.getByText('Content Admin')).toBeInTheDocument();
  });

  it('submits the top search to the article management URL', () => {
    function LocationProbe() {
      const location = useLocation();
      return <output aria-label="current location">{location.pathname}{location.search}</output>;
    }
    render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminShell><LocationProbe /></AdminShell></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索文章' }), { target: { value: '系统 架构' } });
    fireEvent.click(screen.getByRole('button', { name: '提交文章搜索' }));
    expect(screen.getByLabelText('current location')).toHaveTextContent('/admin/posts?q=%E7%B3%BB%E7%BB%9F%20%E6%9E%B6%E6%9E%84');
  });

  it('restores and toggles the shared site theme from administration', () => {
    localStorage.setItem('gouno-blog:theme', 'dark');
    document.documentElement.dataset.theme = 'dark';

    render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminShell><h1>Dashboard</h1></AdminShell></MemoryRouter>);

    const toggle = screen.getByRole('button', { name: '切换后台主题' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('gouno-blog:theme')).toBe('dark');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('gouno-blog:theme')).toBe('light');
  });
});
