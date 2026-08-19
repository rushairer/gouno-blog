// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://blog.example.test/"}
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gossoClient, redirectToAuthorize } from '../../auth';
import { I18nProvider } from '../../i18n';
import Login from '../Login';

vi.mock('../../auth', () => ({
  gossoClient: {
    loginWithPassword: vi.fn(),
    loginWithPasskey: vi.fn(),
    verifyMfa: vi.fn(),
  },
  redirectToAuthorize: vi.fn(),
}));

function renderLogin(initialEntry = '/login') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gossoClient.loginWithPassword).mockResolvedValue({});
    vi.mocked(redirectToAuthorize).mockResolvedValue(undefined);
  });

  it('continues through the blog OAuth flow after direct password login', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/enter your username/i), 'admin');
    await user.type(screen.getByPlaceholderText(/enter your password/i), 'admin123');
    await user.click(screen.getByRole('button', { name: /^sso sign in$/i }));

    await waitFor(() => {
      expect(gossoClient.loginWithPassword).toHaveBeenCalledWith('admin', 'admin123');
      expect(redirectToAuthorize).toHaveBeenCalledWith('/admin');
    });
  });

  it('shows the MFA step without starting authorize when MFA is required', async () => {
    vi.mocked(gossoClient.loginWithPassword).mockResolvedValue({ requires_mfa: true, mfa_token: 'mfa-token' });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/enter your username/i), 'admin');
    await user.type(screen.getByPlaceholderText(/enter your password/i), 'admin123');
    await user.click(screen.getByRole('button', { name: /^sso sign in$/i }));

    expect(await screen.findByPlaceholderText(/6-digit code/i)).toBeInTheDocument();
    expect(redirectToAuthorize).not.toHaveBeenCalled();
  });

  it('localizes the SDK profile-load error', async () => {
    vi.mocked(gossoClient.loginWithPassword).mockRejectedValue(new Error('Failed to fetch user profile'));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/enter your username/i), 'admin');
    await user.type(screen.getByPlaceholderText(/enter your password/i), 'admin123');
    await user.click(screen.getByRole('button', { name: /^sso sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your user profile. Please try again.');
  });
});
