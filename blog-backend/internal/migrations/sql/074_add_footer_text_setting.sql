UPDATE site_settings
SET settings = CASE
  WHEN settings ? 'footer_text' THEN settings
  ELSE settings || '{"footer_text":"Built with care, code, and curiosity."}'::jsonb
END,
updated_at = NOW();
