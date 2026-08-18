import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NotFound from '../NotFound';
import { I18nProvider } from '../../i18n';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <I18nProvider>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </I18nProvider>
  );
}

describe('NotFound Page', () => {
  it('renders 404 code, message, search bar, and navigation shortcuts', () => {
    renderWithProviders(<NotFound />);

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText(/页面未找到|Page Not Found/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/搜索文章或主题|Search articles or topics/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /搜索|Search/ })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /回到首页|Home/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /全部文章|All Articles/ })).toHaveAttribute('href', '/articles');
    expect(screen.getByRole('link', { name: /内容分类|Categories/ })).toHaveAttribute('href', '/categories');
    expect(screen.getByRole('link', { name: /全站归档|Archive/ })).toHaveAttribute('href', '/archive');
  });

  it('allows typing a query and submitting search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotFound />);

    const input = screen.getByPlaceholderText(/搜索文章或主题|Search articles or topics/);
    await user.type(input, 'AI 运营');
    expect(input).toHaveValue('AI 运营');

    const searchBtn = screen.getByRole('button', { name: /搜索|Search/ });
    await user.click(searchBtn);
    expect(window.location.pathname + window.location.search).toContain('/search?q=AI%20%E8%BF%90%E8%90%A5');
  });
});
