import { beforeEach, describe, expect, it } from 'vitest';
import { applySiteMetadata } from '../useSiteMetadata';
import { DEFAULT_SITE_SETTINGS } from '../../config/site-defaults';

describe('applySiteMetadata', () => {
  beforeEach(() => {
    document.head.innerHTML = '<link id="site-favicon" rel="icon" href="/favicon.svg"><meta name="theme-color" content="#24513f"><meta name="description" content="default">';
    document.documentElement.lang = 'zh-CN';
    document.title = DEFAULT_SITE_SETTINGS.site_title;
  });

  it('uses configured browser identity settings', () => {
    applySiteMetadata({
      ...DEFAULT_SITE_SETTINGS,
      favicon_url: '/media/site-icon.png',
      default_seo_title: 'Configured SEO title',
      default_seo_description: 'A configured description.',
    });

    expect(document.head.querySelector<HTMLLinkElement>('#site-favicon')?.href).toBe('https://localhost:8443/media/site-icon.png');
    expect(document.head.querySelector('#site-favicon')).toHaveAttribute('type', 'image/png');
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'A configured description.');
    expect(document.title).toBe('Configured SEO title');
  });
});
