
-- Separate HTTP header receipt from successful model-response decoding.
ALTER TABLE ai_text_dispatch_audits
    ADD COLUMN decode_status TEXT,
    ADD COLUMN decoded_at TIMESTAMPTZ,
    ADD CONSTRAINT ai_text_dispatch_decode_evidence_check CHECK (
        (decode_status IS NULL AND decoded_at IS NULL)
        OR (
            decode_status IN ('decoded','invalid','incomplete','rejected')
            AND decoded_at IS NOT NULL
            AND status='response_received'
        )
    );
