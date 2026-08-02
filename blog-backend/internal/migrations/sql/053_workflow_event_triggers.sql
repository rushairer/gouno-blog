ALTER TABLE ai_workflows
    ADD COLUMN IF NOT EXISTS event_triggers JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS ai_workflow_events (
    id BIGSERIAL PRIMARY KEY,
    event_key VARCHAR(180) NOT NULL UNIQUE,
    event_type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'accepted',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT ai_workflow_event_status_check CHECK (status IN ('accepted','processed','failed'))
);

CREATE INDEX IF NOT EXISTS idx_ai_workflow_events_type_created
    ON ai_workflow_events (event_type, created_at DESC);

CREATE OR REPLACE FUNCTION ai_enqueue_domain_event() RETURNS trigger AS $$
DECLARE
    event_type TEXT;
    event_key TEXT;
    payload JSONB;
BEGIN
    IF TG_TABLE_NAME = 'posts' THEN
        event_type := CASE WHEN TG_OP = 'INSERT' OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'published') THEN 'post.published' ELSE 'post.updated' END;
        event_key := event_type || ':' || NEW.id::text || ':' || extract(epoch FROM NEW.updated_at)::bigint::text;
        payload := jsonb_build_object('post_id', NEW.id, 'status', NEW.status::text, 'updated_at', NEW.updated_at);
    ELSIF TG_TABLE_NAME = 'comments' THEN
        event_type := 'comment.created';
        event_key := event_type || ':' || NEW.id::text;
        payload := jsonb_build_object('comment_id', NEW.id, 'post_id', NEW.post_id, 'status', NEW.status);
    ELSIF TG_TABLE_NAME = 'comment_reports' THEN
        event_type := 'comment.reported';
        event_key := event_type || ':' || NEW.comment_id::text || ':' || NEW.id::text;
        payload := jsonb_build_object('comment_id', NEW.comment_id, 'report_id', NEW.id);
    ELSIF TG_TABLE_NAME = 'media_assets' THEN
        event_type := 'media.uploaded';
        event_key := event_type || ':' || NEW.id::text;
        payload := jsonb_build_object('media_asset_id', NEW.id, 'content_type', NEW.content_type);
    ELSE
        event_type := 'suggestion.created';
        event_key := event_type || ':' || NEW.id::text;
        payload := jsonb_build_object('suggestion_id', NEW.id, 'status', NEW.status, 'priority', NEW.priority);
    END IF;
    INSERT INTO ai_workflow_events(event_key, event_type, payload) VALUES(event_key, event_type, payload)
    ON CONFLICT (event_key) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_posts_domain_event ON posts;
CREATE TRIGGER ai_posts_domain_event AFTER INSERT OR UPDATE OF status, updated_at ON posts
    FOR EACH ROW EXECUTE FUNCTION ai_enqueue_domain_event();
DROP TRIGGER IF EXISTS ai_comments_domain_event ON comments;
CREATE TRIGGER ai_comments_domain_event AFTER INSERT ON comments
    FOR EACH ROW EXECUTE FUNCTION ai_enqueue_domain_event();
DROP TRIGGER IF EXISTS ai_comment_reports_domain_event ON comment_reports;
CREATE TRIGGER ai_comment_reports_domain_event AFTER INSERT ON comment_reports
    FOR EACH ROW EXECUTE FUNCTION ai_enqueue_domain_event();
DROP TRIGGER IF EXISTS ai_media_assets_domain_event ON media_assets;
CREATE TRIGGER ai_media_assets_domain_event AFTER INSERT ON media_assets
    FOR EACH ROW EXECUTE FUNCTION ai_enqueue_domain_event();
DROP TRIGGER IF EXISTS ai_suggestions_domain_event ON ai_operational_suggestions;
CREATE TRIGGER ai_suggestions_domain_event AFTER INSERT ON ai_operational_suggestions
    FOR EACH ROW EXECUTE FUNCTION ai_enqueue_domain_event();
