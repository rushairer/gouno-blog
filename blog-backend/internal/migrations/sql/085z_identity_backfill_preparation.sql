-- Q01a: preparation only; no Principal, Membership, Owner or alias is created.
CREATE TABLE blog_identity_backfill_approvals (
 source_table TEXT NOT NULL, row_id BIGINT NOT NULL, source_column TEXT NOT NULL,
 original_value JSONB NOT NULL, issuer TEXT NOT NULL, subject TEXT NOT NULL,
 principal_id BIGINT NOT NULL REFERENCES blog_principals(id) ON DELETE RESTRICT,
 approved_by TEXT NOT NULL CHECK (btrim(approved_by) <> ''),
 reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
 evidence_reference TEXT NOT NULL CHECK (btrim(evidence_reference) <> ''),
 approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_table,row_id,source_column,original_value)
);
CREATE TABLE blog_identity_legacy_evidence (
 source_table TEXT NOT NULL, row_id BIGINT NOT NULL, source_column TEXT NOT NULL,
 original_value JSONB NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_table,row_id,source_column)
);
CREATE TABLE blog_identity_seed_fingerprints (
 source_table TEXT NOT NULL, fingerprint TEXT NOT NULL,
 PRIMARY KEY(source_table,fingerprint)
);
-- Canonical content/version fingerprints generated from real migrations through 085.
INSERT INTO blog_identity_seed_fingerprints VALUES
('ai_agents','594612c202b7e687862a01d2bc9cb81bd084a708e5547061f13102913b70c5f4'),
('ai_agents','83ec05ea15d29a15e443feb25763ac76cb1629e8eae40d033bd7c413f438d7e7'),
('ai_skills','0bbb240dfde82468021be207ae22ce972ecb2a0ed9925a2cc0ab456b6807c261'),
('ai_skills','7fdcf0a63f6ff51e8cd3e830983063edfd6c32c492ee10f01ae1d3c2501e9a0b'),
('ai_skills','389d9af8de1ba102bf03da28a7c892320c5c4cab8c67d8b16b6f29a328b2ad06'),
('ai_skills','5402ee68202f79f58102453b571b56e60fe4e6268f361179fa97cca3b0961360'),
('ai_skills','8e6bee4c620e01d9f73fb0c2e4a1da10d7c93c27405bd6ac17ba8b08a8676c1f'),
('ai_skills','aaedee01a344c947c2f6064410e74580a57577f05a8a301886adbd937d9631bc'),
('ai_skills','6a8d11d53497cd160ae77dc6d92f016b8a0fca482594ba31de5f007a8a62cab9'),
('ai_skills','8b8ac564efb8e2a226eb214041c66a85eda3647721c240d920162b607737bc3a'),
('ai_skills','c784638e7998822101cd2378822ad241a1a1810e8246e053f027b4d1b5259652'),
('ai_skills','6a56bdbae3e4ab890e902770931bf25724d42408d532a0768818075ae6603f24'),
('ai_skills','c99debb217f9a2de05e73ef139ae22fbc9e2a5ba7f2ae4507a1f6618244938d5'),
('ai_skills','1ee026b9991cda6b59d51eadc70accce151e048f5670aab1f9823175d1fc08b4'),
('ai_skills','68df7069c6af581eaed56f4dc04aa0e161990cd743ca7877d45ceb0166d7e847'),
('ai_skills','b74b2eff69f5f1f522669407d2ecd25265b1e6e11823f3d5ee4f7dfe46b34b68'),
('ai_skills','c2ab4319a22e858d8601a6e1a5ad20eb26efabf44b624fc9661344afbccabd30'),
('ai_skill_versions','364928d7e49e85f59676c6380b179cf5f562b5294734e4c57ed98d806acee563'),
('ai_skill_versions','c5c9abe624c1b63362eb9da7caf4c964d7df7f6a2f619d4e1cf6dbb63a1effab'),
('ai_skill_versions','b4425487532c9482deb69aba77cdc20b2e7954c26c54787b80422b334351e765'),
('ai_skill_versions','6a962ec2a536447910e77ed054b69570738a59c55b0d809739ae44293531df32'),
('ai_skill_versions','a570d186bf8b158d9fbc4acc7819db45a728fdd2e0642566f39a0372d94bd856'),
('ai_skill_versions','fdbc8a377043068bf7f4f76e042ff564e8c8051ee9ff3a2dadc8d905a49cdfb1'),
('ai_skill_versions','f2aca135ac69baf8427d856ecbf76d506c7154144e7ac3690c4ea5c8dbc74472'),
('ai_skill_versions','687716a563a9c63d6ae77678f0c6ba44c4bb3d30ce67cefcf7eae3265027dea2'),
('ai_skill_versions','6f8158319d4a513a4a9a8aedddc6a0aa4aaab97d9121347aba99eee42b69dabc'),
('ai_skill_versions','06c914693770e6a5aa8b8fd633ea843e6417d4e0b529b2afc44ffd7dfe433a3b'),
('ai_skill_versions','f7eaf85ea89136c3791a4bc668013027d690e2afb807fa2dddb6c02bfc0b0f4c'),
('ai_skill_versions','ee32ebf83296b10f37c404424ec206ffc1eb467c9fcdac5842f6333463663fd4'),
('ai_skill_versions','2b9207fac65e1ad7f89c06da1176a610d48668ee538efa98199ec2868797dccb'),
('ai_skill_versions','db1a75d1928531ab6963e15c21ccae7c49f66925407e3ba77419210a4ac23048'),
('ai_skill_versions','3c4f6f250cd9882be001543c6352f5d13f48aa90cfcddcb06c3eab02b1223e35'),
('ai_skill_versions','68d281620bd431b23089671f127805d5b950bbc16a6265414e3760fc96530b82'),
('ai_skill_versions','62daea14f649e1820a4a8068d3b042e3ca5c1748f0e6a384392a6aaf7601144d'),
('ai_skill_versions','27f8cbe40233a259c34be1a4aa707e431d3cf7ddffb68567ff6d4d5123944d7b'),
('ai_skill_versions','8adb28738ab9144ac080a79ab625911df836d08ec64dfda93ce4135bc49a803f'),
('ai_skill_versions','23609e3474b346e19ff29992eede517af84f053682b736c9d759e3d75a2f6989'),
('ai_workflows','5c8a7e4c4812b0226fab5f036c1bce1b01fe5e43bafb4aad287331b92b0638d8'),
('ai_workflows','8878c286bdf37ea4ac740e3f5ce9db37629e37c9d28bff6b311afecedbab4893'),
('ai_workflows','e5bba50086a138e2eeacba9cb7ef46d33d701033b70ccc7b5b533a2eca7bc5b6'),
('ai_workflows','0c9d74997f13c535c3bf89d0043f47f5a4d77c167d382ef9dcabe3d3c129dd57'),
('ai_workflows','97c8ba0bfbe4bc54988127eb71619ce04d54dca01269cd5af2146848dfff2b5e'),
('ai_workflows','6c5eccd450595e1ae19a12fd1825a5140c3ea5de283bc17fd26368b18fd88634'),
('ai_workflows','f1e080280d00ccf45b2c5f580289ebb2f0f07179a82d9a23f8b1212d70dd0ae3'),
('ai_workflows','c1ba6cd43e35e59724bbe7060f43cc27eb7a16208eced0db35ee3d1fae0b6fed'),
('ai_workflows','66797020de65398a84788b53681d5bf734d8280c8387cf3ee99e66b3c3ab64da'),
('ai_workflows','067a219a8864cc72fb885218511cf7d8fd85c3b7e940482d91712f12342668c8'),
('ai_workflows','fae57987e51a2dd7600d9bde7f4be2e8057aa80a3216c381a36b91853af108fc'),
('ai_workflows','b851c65e89899b74a9c3b4c19d914ed3d9fd4a02d3f04b561a7c9b7d48ace5b5'),
('ai_workflows','11f0fd921574958bbc2119c421249bb9cc30e5e35bfe3f4850ca5a98f1c8ccec'),
('ai_workflows','9c8c55323a775487462ac8de9016173d98262b513acc82c8c80a056307ad28bd'),
('ai_workflows','15e935bd8666baea5797100b02930e7ff22804a9fc84d2ef81c81c629b39c71c'),
('ai_workflow_versions','d3c725170b4667612c2e4546283245aee6b57a08a1f2339b38fd284d09136a3a'),
('ai_workflow_versions','ebcde9f64121e16d7c4843bc9eb7ae018ceaf56f4721760f79362c3fe1543d1e'),
('ai_workflow_versions','c00d82b6347ca75a4d904c15990ff30ac0c3170ce7d41c2e7b7a461b6ac0a7dc'),
('ai_workflow_versions','b6deeed1b633eaee168273d176ebb636aa699b089701961060b03d1a68b4494f'),
('ai_workflow_versions','9c0e29aa73ee9a6a245578dc66021715f50c5784199d35b13be27ffdeece52fa'),
('ai_workflow_versions','22076a46afecc091f94a8ef180088e65cd23b5339bb232110aeeb0c52618270a'),
('ai_workflow_versions','89ed2beeaf5e50d18b07676d5b1b47b405bce879ce2cdc549278f41f76a7e350'),
('ai_workflow_versions','e8a86dbadf3cc69278c38120473bb7160bd3689ed26a69193ad27fb511ec3f4b'),
('ai_workflow_versions','aa991077034487901b0b43710fc174bc53b54ae16968b04c2dffcbba54e49de2'),
('ai_workflow_versions','d1fc80ef94429a7aae99075b22b46a962e77c13485fa0f07a58a1e917c6c8584'),
('ai_workflow_versions','26bef895cb3e8b984a7c4caca7f2055c6c601bbe96f397cd97b2e67aa336c635'),
('ai_workflow_versions','34f91afe8ea03546a7611f6ba0018f9bd711a946a7b53fac55d9530c49ec6057'),
('ai_workflow_versions','be6af503c2b12751ebd9dd5860319e0c65dec899dac1bea8b7cf16180dc68fdf'),
('ai_workflow_versions','c9a58765c838ae10fa3e0a32e04cfb9c567bebdfefc6e939bbe0038a123d9a56'),
('ai_workflow_versions','ca400f6d96021995729458d69c2c3a552d45913f683a1dfc96d61efbae325b41'),
('ai_workflow_versions','380e6d764059d26ad29e39181e27698491019e28873049f6789a8c3d51b78404')
ON CONFLICT DO NOTHING;

DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['ai_agents','ai_skills','ai_skill_versions','ai_workflows','ai_workflow_versions'] LOOP
  EXECUTE format('ALTER TABLE %I ADD COLUMN creation_origin TEXT NOT NULL DEFAULT ''legacy''',tbl);
  IF NOT EXISTS (SELECT 1 FROM blog_schema_migrations WHERE version='sql/088_backfill_ai_principal_identity.sql') THEN
   EXECUTE format($q$UPDATE %I t SET creation_origin='system'
    WHERE to_jsonb(t)->>'created_by_principal_id' IS NULL AND EXISTS (SELECT 1 FROM blog_identity_seed_fingerprints f WHERE f.source_table=%L
    AND f.fingerprint=encode(digest((to_jsonb(t)-ARRAY['id','created_at','updated_at','created_by_principal_id','creation_origin'])::text,'sha256'),'hex'))$q$,tbl,tbl);
  END IF;
  EXECUTE format('ALTER TABLE %I ALTER COLUMN creation_origin SET DEFAULT ''human''',tbl);
 END LOOP;
END $$;

-- Static allowlist shared with the local approval tool. JSON expressions let
-- reports inspect partially upgraded databases without referencing absent columns.
CREATE FUNCTION blog_identity_fields() RETURNS TABLE(tbl TEXT,src TEXT,dst TEXT,required TEXT)
LANGUAGE sql IMMUTABLE AS $fields$ VALUES
 ('comments','author_subject','author_principal_id','j->>''author_type''=''user'''),
 ('notifications','recipient_subject','recipient_principal_id','true'),
 ('ai_agents','created_by','created_by_principal_id','j->>''creation_origin''<>''system'''),
 ('ai_skills','created_by','created_by_principal_id','j->>''creation_origin''<>''system'''),
 ('ai_skill_versions','created_by','created_by_principal_id','j->>''creation_origin''<>''system'''),
 ('ai_workflows','created_by','created_by_principal_id','j->>''creation_origin''<>''system'''),
 ('ai_workflow_versions','created_by','created_by_principal_id','j->>''creation_origin''<>''system'''),
 ('ai_workflow_runs','triggered_by','triggered_by_principal_id','j->>''schedule_key'' IS NULL'),
 ('ai_agent_runs','triggered_by','triggered_by_principal_id','NOT (j->>''trigger_type''=''cron'' AND j->>''schedule_key'' IS NOT NULL)'),
 ('ai_approvals','reviewed_by','reviewed_by_principal_id','NULLIF(j->>''reviewed_by'','''') IS NOT NULL OR j->>''reviewed_at'' IS NOT NULL OR j->>''status'' IN (''approved'',''rejected'',''executed'')'),
 ('workflow_interaction_tasks','resolved_by','resolved_by_principal_id','NULLIF(j->>''resolved_by'','''') IS NOT NULL OR j->>''status''=''resolved'''),
 ('ai_media_candidates','reviewed_by','reviewed_by_principal_id','NULLIF(j->>''reviewed_by'','''') IS NOT NULL OR j->>''reviewed_at'' IS NOT NULL'),
 ('ai_feedback','created_by','created_by_principal_id','true')
$fields$;

CREATE FUNCTION blog_identity_pending() RETURNS TABLE(source_table TEXT,row_id BIGINT,source_column TEXT,original_value JSONB,reason TEXT)
LANGUAGE plpgsql AS $fn$
DECLARE f RECORD;
BEGIN
 FOR f IN SELECT * FROM blog_identity_fields() LOOP
  RETURN QUERY EXECUTE format($q$
   SELECT %L,t.id::bigint,%L,COALESCE(j->%L,'null'::jsonb),'explicit identity approval required'::text
   FROM %I t CROSS JOIN LATERAL (SELECT to_jsonb(t) j) x
   WHERE j ? %L AND j->>%L IS NULL AND (%s)
   AND NOT EXISTS (SELECT 1 FROM blog_identity_backfill_approvals a
    JOIN blog_principal_identities i ON i.issuer=a.issuer AND i.subject=a.subject AND i.principal_id=a.principal_id
    WHERE a.source_table=%L AND a.row_id=t.id AND a.source_column=%L
    AND a.original_value=COALESCE(j->%L,'null'::jsonb))
   ORDER BY t.id$q$,f.tbl,f.src,f.src,f.tbl,f.src,f.dst,f.required,f.tbl,f.src,f.src);
 END LOOP;
END $fn$;

CREATE FUNCTION blog_identity_apply(target_table TEXT) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE f RECORD; missing BIGINT;
BEGIN
 SELECT * INTO STRICT f FROM blog_identity_fields() WHERE tbl=target_table;
 EXECUTE format($q$INSERT INTO blog_identity_legacy_evidence(source_table,row_id,source_column,original_value)
  SELECT %L,id,%L,COALESCE(to_jsonb(t)->%L,'null'::jsonb) FROM %I t
  ON CONFLICT DO NOTHING$q$,f.tbl,f.src,f.src,f.tbl);
 EXECUTE format($q$UPDATE %I t SET %I=a.principal_id FROM blog_identity_backfill_approvals a
  JOIN blog_principal_identities i ON i.issuer=a.issuer AND i.subject=a.subject AND i.principal_id=a.principal_id
  WHERE a.source_table=%L AND a.row_id=t.id AND a.source_column=%L
  AND a.original_value=COALESCE(to_jsonb(t)->%L,'null'::jsonb)
  AND t.%I IS NULL AND (%s)$q$,f.tbl,f.dst,f.tbl,f.src,f.src,f.dst,replace(f.required,'j->>','to_jsonb(t)->>'));
 SELECT row_id INTO missing FROM blog_identity_pending() WHERE source_table=target_table LIMIT 1;
 IF missing IS NOT NULL THEN
  RAISE EXCEPTION 'identity backfill unresolved: table=%, row=%, field=%; run identity-backfill report',f.tbl,missing,f.src;
 END IF;
END $fn$;

-- Snapshot only pre-existing attributions whose original source is already lost.
-- Future human API writes must not be misreported as historical cutover results.
CREATE TABLE blog_identity_legacy_attributions (
 source_table TEXT NOT NULL,row_id BIGINT NOT NULL,source_column TEXT NOT NULL,
 principal_id BIGINT NOT NULL,recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_table,row_id,source_column)
);
DO $$ DECLARE f RECORD; BEGIN
 FOR f IN SELECT * FROM blog_identity_fields() LOOP
  EXECUTE format($q$INSERT INTO blog_identity_legacy_attributions(source_table,row_id,source_column,principal_id)
   SELECT %L,id,%L,(to_jsonb(t)->>%L)::bigint FROM %I t
   WHERE NOT (to_jsonb(t) ? %L) AND to_jsonb(t)->>%L IS NOT NULL$q$,f.tbl,f.src,f.dst,f.tbl,f.src,f.dst);
 END LOOP;
END $$;
