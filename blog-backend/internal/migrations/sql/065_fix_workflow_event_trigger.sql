-- 053 used PL/pgSQL variable names that were identical to the destination
-- columns. PostgreSQL therefore rejected every domain insert with
-- "column reference event_key is ambiguous". Keep the event contract intact
-- while making every procedural value unambiguous.
CREATE OR REPLACE FUNCTION ai_enqueue_domain_event() RETURNS trigger AS $$
DECLARE
    v_event_type TEXT;
    v_event_key TEXT;
    v_payload JSONB;
BEGIN
    IF TG_TABLE_NAME = 'posts' THEN
        v_event_type := CASE WHEN TG_OP = 'INSERT' OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'published') THEN 'post.published' ELSE 'post.updated' END;
        v_event_key := v_event_type || ':' || NEW.id::text || ':' || extract(epoch FROM NEW.updated_at)::bigint::text;
        v_payload := jsonb_build_object('post_id', NEW.id, 'status', NEW.status::text, 'updated_at', NEW.updated_at);
    ELSIF TG_TABLE_NAME = 'comments' THEN
        v_event_type := 'comment.created';
        v_event_key := v_event_type || ':' || NEW.id::text;
        v_payload := jsonb_build_object('comment_id', NEW.id, 'post_id', NEW.post_id, 'status', NEW.status);
    ELSIF TG_TABLE_NAME = 'comment_reports' THEN
        v_event_type := 'comment.reported';
        v_event_key := v_event_type || ':' || NEW.comment_id::text || ':' || NEW.id::text;
        v_payload := jsonb_build_object('comment_id', NEW.comment_id, 'report_id', NEW.id);
    ELSIF TG_TABLE_NAME = 'media_assets' THEN
        v_event_type := 'media.uploaded';
        v_event_key := v_event_type || ':' || NEW.id::text;
        v_payload := jsonb_build_object('media_asset_id', NEW.id, 'content_type', NEW.content_type);
    ELSE
        v_event_type := 'suggestion.created';
        v_event_key := v_event_type || ':' || NEW.id::text;
        v_payload := jsonb_build_object('suggestion_id', NEW.id, 'status', NEW.status, 'priority', NEW.priority);
    END IF;
    INSERT INTO ai_workflow_events(event_key, event_type, payload)
    VALUES(v_event_key, v_event_type, v_payload)
    ON CONFLICT (event_key) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
