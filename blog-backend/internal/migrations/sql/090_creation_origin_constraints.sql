-- Applied 088/089 databases retain their principals and legacy attribution.
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['ai_agents','ai_skills','ai_skill_versions','ai_workflows','ai_workflow_versions'] LOOP
  EXECUTE format('ALTER TABLE %I ALTER COLUMN created_by_principal_id DROP NOT NULL',tbl);
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (
   (creation_origin=''system'' AND created_by_principal_id IS NULL) OR
   (creation_origin IN (''human'',''legacy'') AND created_by_principal_id IS NOT NULL))',tbl,tbl||'_creation_origin_check');
 END LOOP;
END $$;
