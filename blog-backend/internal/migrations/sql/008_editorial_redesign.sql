CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_alt VARCHAR(255);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_description TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_category_published
ON posts (category_id, published_at DESC)
WHERE status = 'published';

CREATE TABLE IF NOT EXISTS site_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_settings (id, settings)
VALUES (1, '{
  "site_title": "Gouno Blog",
  "site_description": "记录、思考与分享。",
  "author_name": "站点作者",
  "author_bio": "欢迎来到我的博客。",
  "email": "",
  "github_url": "",
  "rss_url": "/feed.xml",
  "default_seo_title": "Gouno Blog",
  "default_seo_description": "记录、思考与分享。"
}'::jsonb)
ON CONFLICT (id) DO NOTHING;
