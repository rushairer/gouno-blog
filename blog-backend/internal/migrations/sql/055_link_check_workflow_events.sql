CREATE OR REPLACE FUNCTION ai_enqueue_link_check_failure() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'failed' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.error_code IS DISTINCT FROM NEW.error_code) THEN
        INSERT INTO ai_workflow_events(event_key,event_type,payload)
        VALUES(
            'link_check.failed:' || NEW.id::text || ':' || COALESCE(NEW.error_code,''),
            'link_check.failed',
            jsonb_build_object('job_id',NEW.id,'post_id',NEW.post_id,'error_code',NEW.error_code)
        ) ON CONFLICT (event_key) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_link_check_failure_event ON ai_link_health_jobs;
CREATE TRIGGER ai_link_check_failure_event AFTER UPDATE OF status,error_code ON ai_link_health_jobs
    FOR EACH ROW EXECUTE FUNCTION ai_enqueue_link_check_failure();
