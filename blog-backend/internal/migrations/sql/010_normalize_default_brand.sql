UPDATE site_settings
SET settings = settings
  || CASE
    WHEN settings ->> 'site_title' = 'Aben K.' THEN '{"site_title":"Aben"}'::jsonb
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN settings ->> 'author_name' = 'Aben K.' THEN '{"author_name":"Aben"}'::jsonb
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN settings ->> 'default_seo_title' = 'Aben K. — 工程、产品与 AI'
      THEN '{"default_seo_title":"Aben — 工程、产品与 AI"}'::jsonb
    ELSE '{}'::jsonb
  END,
  updated_at = NOW()
WHERE settings ->> 'site_title' = 'Aben K.'
   OR settings ->> 'author_name' = 'Aben K.'
   OR settings ->> 'default_seo_title' = 'Aben K. — 工程、产品与 AI';
