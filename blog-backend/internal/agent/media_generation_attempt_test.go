package agent

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"testing"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	mediadomain "github.com/rushairer/blog-backend/internal/media/domain"
)

type finalizationStoreSpy struct {
	MediaGenerationStore
	result error
	calls int
	attempt int
	assetID int64
}

func (s *finalizationStoreSpy) CompleteMediaGeneration(_ context.Context, _ int64, attempt int, assetID int64, _ bool) error {
	s.calls++
	s.attempt=attempt
	s.assetID=assetID
	return s.result
}

type finalizedMediaCleanupSpy struct{ deleted int }
func (s *finalizedMediaCleanupSpy) GetMedia(context.Context,int64)(*mediadomain.MediaAsset,error) { return nil,nil }
func (s *finalizedMediaCleanupSpy) CreateMedia(context.Context,*mediadomain.MediaAsset) error { return nil }
func (s *finalizedMediaCleanupSpy) DeleteMedia(_ context.Context,_ int64)(*mediadomain.MediaAsset,error) {
	s.deleted++
	return nil,nil
}

type finalizedObjectCleanupSpy struct{ deleted int }
func (s *finalizedObjectCleanupSpy) Put(context.Context,string,io.Reader,string) error { return nil }
func (s *finalizedObjectCleanupSpy) URL(string) string { return "" }
func (s *finalizedObjectCleanupSpy) Delete(context.Context,string) error {
	s.deleted++
	return nil
}

type generatedCandidateLookupStub struct{ MediaCandidateStore }
func (s *generatedCandidateLookupStub) GetMediaCandidate(_ context.Context,id int64)(*domain.MediaCandidate,error) {
	return &domain.MediaCandidate{ID:id},nil
}

func TestGenerationFinalizationNeverDeletesAssetAfterAmbiguousCommit(t *testing.T) {
	unknownCommit := errors.New("injected: database committed but acknowledgement disappeared")
	for _,tc := range []struct {
		name string
		writeErr error
		wantDeletes int
	}{
		{"lost commit acknowledgement retains media for reconciliation",unknownCommit,0},
		{"definite stale attempt CAS miss compensates orphan",sql.ErrNoRows,1},
		{"completed candidate retains media",nil,0},
	} {
		t.Run(tc.name,func(t *testing.T){
			result := &finalizationStoreSpy{result:tc.writeErr}
			mediaRows := &finalizedMediaCleanupSpy{}
			objectBytes := &finalizedObjectCleanupSpy{}
			svc:=&ApprovalService{
				mediaGeneration:result,mediaAssets:mediaRows,media:objectBytes,
				mediaCandidates:&generatedCandidateLookupStub{},
			}
			candidate:=&domain.MediaCandidate{ID:314,GenerationAttempt:6}
			asset:=&mediadomain.MediaAsset{ID:819,StorageName:"ai-reconciliation-asset.png"}
			err:=svc.completeGeneratedMediaCandidate(context.Background(),candidate,asset)
			if !errors.Is(err,tc.writeErr) && !(tc.writeErr==nil && err==nil) {
				t.Fatalf("finalization=%v want=%v",err,tc.writeErr)
			}
			if result.calls!=1 || result.attempt!=6 || result.assetID!=819 {
				t.Fatalf("lost generation attempt fence: calls=%d attempt=%d asset=%d",
					result.calls,result.attempt,result.assetID)
			}
			if mediaRows.deleted!=tc.wantDeletes || objectBytes.deleted!=tc.wantDeletes {
				t.Fatalf("dangerous media compensation: metadata=%d bytes=%d expected=%d",
					mediaRows.deleted,objectBytes.deleted,tc.wantDeletes)
			}
		})
	}
}

func TestGenerationFinalizationRejectsMissingAttemptOrAsset(t *testing.T) {
	svc:=&ApprovalService{mediaGeneration:&finalizationStoreSpy{}}
	for _,item :=range []struct{candidate *domain.MediaCandidate;asset *mediadomain.MediaAsset}{
		{nil,&mediadomain.MediaAsset{ID:8}},
		{&domain.MediaCandidate{ID:2,GenerationAttempt:0},&mediadomain.MediaAsset{ID:8}},
		{&domain.MediaCandidate{ID:2,GenerationAttempt:1},&mediadomain.MediaAsset{ID:0}},
	}{
		if err:=svc.completeGeneratedMediaCandidate(context.Background(),item.candidate,item.asset); !errors.Is(err,ErrInvalid) {
			t.Fatalf("incomplete generation attempt accepted: %v",err)
		}
	}
}
