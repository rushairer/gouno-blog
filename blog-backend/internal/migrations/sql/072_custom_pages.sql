CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    template VARCHAR(50) NOT NULL DEFAULT 'default',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    allow_comments BOOLEAN NOT NULL DEFAULT false,
    show_in_nav BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    seo_title VARCHAR(255) NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages (slug);
CREATE INDEX IF NOT EXISTS idx_pages_status_nav ON pages (status, show_in_nav, sort_order ASC);

INSERT INTO pages (title, slug, content, summary, template, status, allow_comments, show_in_nav, sort_order)
VALUES (
    '关于',
    'about',
    '这里用于记录值得长期保存的问题、过程与结论。比起只给答案，更重视交代上下文、约束和选择的理由。',
    '关于这个站点，以及持续写作的理由。',
    'about',
    'published',
    false,
    true,
    10
)
ON CONFLICT (slug) DO NOTHING;
