package agent

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
)

// A cancelled attempt may still have an external image request in flight.
// It must never complete or fail the next editor-requested generation attempt.
func TestMediaGenerationAttemptFencesStaleCompletionAndFailure(t *testing.T) {
	f:=newAtomicApprovalFixture(t,"create_media_candidate")
	ctx:=context.Background()
	if err:=f.service(f.repo,f.transactor).Approve(ctx,f.approvalID,f.principal,"approved");err!=nil {
		t.Fatal(err)
	}
	repo:=agentrepository.NewMediaCandidateRepository(f.db)
	items,err:=repo.ListMediaCandidates(ctx)
	if err!=nil { t.Fatal(err) }
	var candidate *domain.MediaCandidate
	for _,item:=range items {
		if item.SourceApprovalID!=nil && *item.SourceApprovalID==f.approvalID {
			candidate=item
			break
		}
	}
	if candidate==nil { t.Fatal("approved candidate was not persisted") }

	first,err:=repo.ClaimMediaGeneration(ctx,candidate.ID)
	if err!=nil { t.Fatal(err) }
	if first.GenerationAttempt<1 { t.Fatalf("first attempt=%d",first.GenerationAttempt) }
	if err:=repo.CancelMediaGeneration(ctx,candidate.ID);err!=nil {t.Fatal(err)}
	second,err:=repo.ClaimMediaGeneration(ctx,candidate.ID)
	if err!=nil {t.Fatal(err)}
	if second.GenerationAttempt!=first.GenerationAttempt+1 {
		t.Fatalf("failed to fence restarted attempt: first=%d second=%d",first.GenerationAttempt,second.GenerationAttempt)
	}

	storageName:=fmt.Sprintf("fence-%d.png",time.Now().UnixNano())
	var mediaAssetID int64
	if err:=f.db.QueryRowContext(ctx,`INSERT INTO media_assets
		(filename,storage_name,url,content_type,size_bytes,alt_text)
		VALUES('candidate.png',$1,$2,'image/png',8,'test') RETURNING id`,
		storageName,"/media/"+storageName).Scan(&mediaAssetID);err!=nil {t.Fatal(err)}
	t.Cleanup(func(){
		_,_=f.db.ExecContext(context.Background(),`DELETE FROM ai_media_candidates WHERE source_approval_id=$1`,f.approvalID)
		_,_=f.db.ExecContext(context.Background(),`DELETE FROM media_assets WHERE id=$1`,mediaAssetID)
	})

	if _,err:=repo.RecordMediaGenerationError(ctx,candidate.ID,first.GenerationAttempt,"expired","stale failure"); !errors.Is(err,sql.ErrNoRows) {
		t.Fatalf("old attempt incorrectly marked retry as failed: %v",err)
	}
	if err:=repo.CompleteMediaGeneration(ctx,candidate.ID,first.GenerationAttempt,mediaAssetID,false);!errors.Is(err,sql.ErrNoRows) {
		t.Fatalf("old attempt incorrectly attached stale asset: %v",err)
	}
	var beforeStatus string
	var beforeAttempt int
	var beforeAsset sql.NullInt64
	if err:=f.db.QueryRowContext(ctx,`SELECT generation_status,generation_attempt,media_asset_id
		FROM ai_media_candidates WHERE id=$1`,candidate.ID).Scan(&beforeStatus,&beforeAttempt,&beforeAsset);err!=nil {
		t.Fatal(err)
	}
	if beforeStatus!="generating" || beforeAttempt!=second.GenerationAttempt || beforeAsset.Valid {
		t.Fatalf("stale attempt corrupted current generation: status=%q attempt=%d asset=%v",
			beforeStatus,beforeAttempt,beforeAsset)
	}
	if err:=repo.CompleteMediaGeneration(ctx,candidate.ID,second.GenerationAttempt,mediaAssetID,false);err!=nil {
		t.Fatal(err)
	}
	var afterStatus string
	var afterAsset sql.NullInt64
	if err:=f.db.QueryRowContext(ctx,`SELECT generation_status,media_asset_id
		FROM ai_media_candidates WHERE id=$1`,candidate.ID).Scan(&afterStatus,&afterAsset);err!=nil {t.Fatal(err)}
	if afterStatus!="generated" || !afterAsset.Valid || afterAsset.Int64!=mediaAssetID {
		t.Fatalf("latest attempt did not bind its own asset: status=%q asset=%v",afterStatus,afterAsset)
	}
}
