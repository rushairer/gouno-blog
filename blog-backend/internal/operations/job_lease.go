package operations

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

const (
	linkHealthJobLeaseTimeout      = 15 * time.Minute
	linkHealthJobHeartbeatInterval = time.Minute
)

func (s *Service) claimLinkHealthJob(ctx context.Context) (jobID, postID int64, attempt int, found bool, err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, 0, false, err
	}
	defer func() {
		if err != nil || !found {
			_ = tx.Rollback()
		}
	}()

	leaseSeconds := int(linkHealthJobLeaseTimeout / time.Second)
	if _, err = tx.ExecContext(ctx, `UPDATE ai_link_health_jobs
		SET status='failed', error_code='worker_lease_expired', finished_at=NOW()
		WHERE status='running' AND attempts>=5 AND claimed_at IS NOT NULL
		  AND claimed_at < NOW()-make_interval(secs=>$1)`, leaseSeconds); err != nil {
		return 0, 0, 0, false, err
	}

	err = tx.QueryRowContext(ctx, `SELECT id, post_id FROM ai_link_health_jobs
		WHERE attempts<5 AND (
			(status IN ('queued','failed') AND available_at<=NOW()) OR
			(status='running' AND claimed_at IS NOT NULL
			 AND claimed_at < NOW()-make_interval(secs=>$1))
		)
		ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`, leaseSeconds).Scan(&jobID, &postID)
	if errors.Is(err, sql.ErrNoRows) {
		err = nil
		return 0, 0, 0, false, nil
	}
	if err != nil {
		return 0, 0, 0, false, err
	}

	if err = tx.QueryRowContext(ctx, `UPDATE ai_link_health_jobs
		SET status='running', attempts=attempts+1, claimed_at=NOW(), finished_at=NULL, error_code=NULL
		WHERE id=$1 RETURNING attempts`, jobID).Scan(&attempt); err != nil {
		return 0, 0, 0, false, err
	}
	if err = tx.Commit(); err != nil {
		return 0, 0, 0, false, err
	}
	return jobID, postID, attempt, true, nil
}

func (s *Service) startLinkHealthJobHeartbeat(ctx context.Context, jobID int64, attempt int) func() {
	heartbeatCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(linkHealthJobHeartbeatInterval)
		defer ticker.Stop()
		for {
			select {
			case <-heartbeatCtx.Done():
				return
			case <-ticker.C:
				_, _ = s.db.ExecContext(heartbeatCtx, `UPDATE ai_link_health_jobs
					SET claimed_at=NOW()
					WHERE id=$1 AND status='running' AND attempts=$2`, jobID, attempt)
			}
		}
	}()
	return func() {
		cancel()
		<-done
	}
}
