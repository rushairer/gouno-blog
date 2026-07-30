import { useEffect, useState } from 'react';
import { GitBranch, Mail, Rss } from 'lucide-react';
import { authorInitials, DEFAULT_SITE_SETTINGS } from '../config/site-defaults';
import { getSiteSettings } from '../lib/blog-api';
import type { SiteSettings } from '../types/blog';

export default function About() {
  const [site, setSite] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    getSiteSettings()
      .then((settings) => setSite({ ...DEFAULT_SITE_SETTINGS, ...settings }))
      .catch(() => {
        // Neutral defaults keep this public page available during an API outage.
      });
  }, []);

  return <div className="public-container about-page">
    <header><div className="about-mark">{authorInitials(site.author_name)}</div><div><p>ABOUT / {site.site_title.toUpperCase()}</p><h1>关于这个站点，<br />以及持续写作的理由。</h1></div></header>
    <div className="about-grid">
      <main>
        <p className="about-lead">{site.author_bio}</p>
        <h2>为什么写作</h2>
        <p>这里用于记录值得长期保存的问题、过程与结论。比起只给答案，更重视交代上下文、约束和选择的理由。</p>
        <h2>写作原则</h2>
        <ol><li>从真实问题出发，不为技术名词制造问题。</li><li>把结论和推理过程一起交付。</li><li>区分事实、经验和仍待验证的判断。</li><li>让内容在一段时间后仍然可以被复用。</li></ol>
      </main>
      <aside>
        <h2>订阅与联系</h2>
        {site.github_url ? <a href={site.github_url} target="_blank" rel="noreferrer"><GitBranch /> GitHub</a> : null}
        {site.email ? <a href={`mailto:${site.email}`}><Mail /> Email</a> : null}
        <a href={site.rss_url || '/feed.xml'}><Rss /> RSS</a>
      </aside>
    </div>
  </div>;
}
