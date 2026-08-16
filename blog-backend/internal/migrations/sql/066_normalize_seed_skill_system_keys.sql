-- Every bundled Skill is platform-managed. Earlier resource-oriented seeds
-- omitted system_key, which made their deletion policy depend on seed order.
-- Give them stable identities, then attach the existing bundled Agents to the
-- same identities so bootstrap and Workflow binding never depend on labels.
WITH seed(system_key, name) AS (
    VALUES
        ('media_alt_review', '媒体无障碍检查'),
        ('taxonomy_review', '分类与标签整理'),
        ('operations_deep_dive', '运营建议深挖'),
        ('mixed_content_review', '混合内容复盘')
)
UPDATE ai_skills s
SET system_key = seed.system_key, updated_at = NOW()
FROM seed
WHERE s.name = seed.name
  AND s.system_key IS NULL
  AND s.deleted_at IS NULL;

UPDATE ai_agents a
SET system_key = s.system_key, updated_at = NOW()
FROM ai_skill_versions sv
JOIN ai_skills s ON s.id = sv.skill_id AND s.version = sv.version
WHERE a.skill_version_id = sv.id
  AND a.system_key IS NULL
  AND s.system_key IN ('media_alt_review', 'taxonomy_review', 'operations_deep_dive', 'mixed_content_review')
  AND a.deleted_at IS NULL;
