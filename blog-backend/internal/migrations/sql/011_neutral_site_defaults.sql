UPDATE site_settings
SET settings = settings
  || CASE
    WHEN settings ->> 'site_title' IN ('Aben', 'Aben K.') THEN '{"site_title":"Gouno Blog"}'::jsonb
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN settings ->> 'author_name' IN ('Aben', 'Aben K.') THEN '{"author_name":"站点作者"}'::jsonb
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN settings ->> 'site_description' = '记录工程架构、产品设计与 AI 实践的长期个人写作现场。'
      THEN '{"site_description":"记录、思考与分享。"}'::jsonb
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN settings ->> 'author_bio' IN (
      '工程师，长期关注系统设计、产品思维与 AI 实践。',
      '工程师、长期关注系统设计、产品思维与 AI 实践。'
    ) THEN '{"author_bio":"欢迎来到我的博客。"}'::jsonb
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN md5(settings ->> 'email') = '0c8816ae5fe96b42802228af0319fb83' THEN '{"email":""}'::jsonb
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN settings ->> 'github_url' = 'https://github.com/rushairer' THEN '{"github_url":""}'::jsonb
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN settings ->> 'default_seo_title' IN ('Aben — 工程、产品与 AI', 'Aben K. — 工程、产品与 AI')
      THEN '{"default_seo_title":"Gouno Blog"}'::jsonb
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN settings ->> 'default_seo_description' = '关于工程架构、产品设计与 AI 实践的长期笔记。'
      THEN '{"default_seo_description":"记录、思考与分享。"}'::jsonb
    ELSE '{}'::jsonb
  END,
  updated_at = NOW();
