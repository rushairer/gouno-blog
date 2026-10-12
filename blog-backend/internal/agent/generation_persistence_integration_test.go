package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/media"
	mediadomain "github.com/rushairer/blog-backend/internal/media/domain"
	mediarepository "github.com/rushairer/blog-backend/internal/media/repository"
	mediaservice "github.com/rushairer/blog-backend/internal/media/service"
	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
	"github.com/rushairer/blog-backend/internal/secretbox"
)

var errMediaPipelineACKLost = errors.New("fixture: committed but acknowledgement lost")

type imagePipelineProviderStore struct {
	ManagementProviderStore
	profile *providerdomain.ProviderProfile
}

func (s imagePipelineProviderStore) ListProviders(context.Context) ([]*providerdomain.ProviderProfile, error) {
	return []*providerdomain.ProviderProfile{s.profile}, nil
}
func (s imagePipelineProviderStore) GetProvider(context.Context, int64) (*providerdomain.ProviderProfile, error) {
	return s.profile, nil
}

type imagePipelineCreator struct {
	base        mediaCreator
	mode        string
	calls       int
	committedID int64
	cancel      context.CancelFunc
}

func (c *imagePipelineCreator) CreateMedia(ctx context.Context, asset *mediadomain.MediaAsset) error {
	c.calls++
	if c.mode == "before_commit" {
		// This port's ErrNoRows is not a candidate-finalization CAS proof.
		return sql.ErrNoRows
	}
	if err := c.base.CreateMedia(ctx, asset); err != nil {
		return err
	}
	c.committedID = asset.ID
	if c.mode == "after_commit" || c.mode == "cancel_after_commit" {
		// A real INSERT committed, but the service receives neither ID nor ACK.
		asset.ID, asset.CreatedAt = 0, time.Time{}
		if c.mode == "cancel_after_commit" {
			c.cancel()
			return context.Canceled
		}
		return errMediaPipelineACKLost
	}
	return nil
}

type imagePipelineStore struct {
	media.Store
	mode    string
	key     string
	puts    int
	deletes int
}

func (s *imagePipelineStore) Put(ctx context.Context, key string, body io.Reader, contentType string) error {
	s.puts++
	s.key = key
	if err := s.Store.Put(ctx, key, body, contentType); err != nil {
		return err
	}
	if s.mode == "put_ack_lost" {
		return errMediaPipelineACKLost
	}
	return nil
}
func (s *imagePipelineStore) Delete(ctx context.Context, key string) error {
	s.deletes++
	return s.Store.Delete(ctx, key)
}

type imagePipelineFixture struct {
	approval    *atomicApprovalFixture
	service     *ApprovalService
	candidates  *agentrepository.MediaCandidateRepository
	candidateID int64
	creator     *imagePipelineCreator
	store       *imagePipelineStore
	requests    *atomic.Int32
	imageBytes  []byte
}

func newImagePipelineFixture(t *testing.T, mode string, cancel context.CancelFunc) *imagePipelineFixture {
	t.Helper()
	f := newAtomicApprovalFixture(t, "create_media_candidate")
	ctx := context.Background()
	service := f.service(f.repo, f.transactor)
	if err := service.Approve(ctx, f.approvalID, f.principal, "approved"); err != nil {
		t.Fatal(err)
	}
	candidates := agentrepository.NewMediaCandidateRepository(f.db)
	var candidateID int64
	if err := f.db.QueryRow(`SELECT id FROM ai_media_candidates WHERE source_approval_id=$1`, f.approvalID).Scan(&candidateID); err != nil {
		t.Fatal(err)
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	imageBytes := append([]byte(nil), encoded.Bytes()...)
	requests := &atomic.Int32{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Method != http.MethodPost || r.URL.Path != "/v1/responses" {
			t.Errorf("unexpected image request: %s %s", r.Method, r.URL.Path)
		}
		_, _ = io.Copy(io.Discard, r.Body)
		_ = r.Body.Close()
		if mode == "provider_error" {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = io.WriteString(w, `{"error":{"message":"fixture unavailable"}}`)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[{"b64_json":"`+base64.StdEncoding.EncodeToString(imageBytes)+`"}]}`)
	}))
	t.Cleanup(server.Close)
	box, err := secretbox.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	profile := &providerdomain.ProviderProfile{
		ID: 42, Name: "image-pipeline-fixture", ProviderType: providerdomain.ProviderOpenAI,
		BaseURL: server.URL, Model: "pipeline-" + strconv.FormatInt(candidateID, 10), ProtocolMode: "auto", StreamMode: "auto",
		Enabled: true, IsDefaultImage: true, RequestTimeoutSeconds: 2, KeyVersion: box.KeyVersion(),
	}
	profile.APIKeyCiphertext, profile.APIKeyNonce, err = box.EncryptWithAAD("fixture-key", secretbox.ProviderAPIKeyAAD(profile.ID, profile.KeyVersion))
	if err != nil {
		t.Fatal(err)
	}
	management := NewManagementService(ManagementServiceDependencies{Providers: imagePipelineProviderStore{profile: profile}}, box, []string{"127.0.0.1"}, nil, nil)
	realMedia := mediaservice.New(mediarepository.New(f.db))
	creator := &imagePipelineCreator{base: realMedia, mode: mode, cancel: cancel}
	store := &imagePipelineStore{Store: media.NewLocal(t.TempDir()), mode: mode}
	service.mediaGeneration = candidates
	service.mediaAssets = realMedia
	service.media = store
	service.generation = NewGenerationService(agentrepository.NewGenerationAuditRepository(f.db), management, creator, store)
	t.Cleanup(func() {
		_, _ = f.db.Exec(`DELETE FROM ai_generation_audits WHERE media_candidate_id=$1 OR media_asset_id=$2 OR model=$3`, candidateID, creator.committedID, profile.Model)
		_, _ = f.db.Exec(`DELETE FROM ai_media_candidates WHERE id=$1`, candidateID)
		if creator.committedID > 0 {
			_, _ = f.db.Exec(`DELETE FROM media_assets WHERE id=$1`, creator.committedID)
		}
	})
	return &imagePipelineFixture{f, service, candidates, candidateID, creator, store, requests, imageBytes}
}

func (f *imagePipelineFixture) assertRetainedBytes(t *testing.T, metadataCount int) {
	t.Helper()
	if f.store.puts != 1 || f.store.deletes != 0 || f.store.key == "" {
		t.Fatalf("unexpected storage effects: puts=%d deletes=%d key=%q", f.store.puts, f.store.deletes, f.store.key)
	}
	path, ok := f.store.LocalPath(f.store.key)
	if !ok {
		t.Fatal("fixture image has no local path")
	}
	stored, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(stored, f.imageBytes) {
		t.Fatalf("generated bytes were lost or changed: %v", err)
	}
	var count int
	if err := f.approval.db.QueryRow(`SELECT COUNT(*) FROM media_assets WHERE storage_name=$1`, f.store.key).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != metadataCount {
		t.Fatalf("metadata rows=%d, want %d", count, metadataCount)
	}
}

func (f *imagePipelineFixture) assertQuarantinedWithoutReplay(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	candidate, err := f.candidates.GetMediaCandidate(ctx, f.candidateID)
	if err != nil {
		t.Fatal(err)
	}
	if candidate.GenerationStatus != "generating" || candidate.GenerationAttempt != 1 || candidate.MediaAssetID != nil || candidate.ErrorCode != domain.MediaGenerationOutcomeUncertainCode {
		t.Fatalf("uncertain result escaped quarantine: %#v", candidate)
	}
	// The actual service entrypoint must stop a second request at the DB claim.
	if err := f.service.GenerateMediaCandidate(ctx, f.candidateID, f.approval.principal); !errors.Is(err, ErrApprovalConflict) {
		t.Fatalf("uncertain generation was claimable again: %v", err)
	}
	if f.requests.Load() != 1 {
		t.Fatalf("provider received %d HTTP requests for this candidate", f.requests.Load())
	}
	reports, err := f.candidates.ListMediaGenerationReconciliation(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	var evidence *domain.MediaGenerationReconciliation
	for _, item := range reports {
		if item.CandidateID == f.candidateID {
			evidence = item
			break
		}
	}
	if evidence == nil || evidence.CurrentAttemptAudit == nil || evidence.CurrentAttemptAudit.GenerationAttempt != 1 || evidence.CurrentAttemptAudit.Status != domain.MediaGenerationOutcomeUncertainCode || evidence.CurrentAttemptAudit.MediaAssetID != nil {
		t.Fatalf("missing exact-attempt uncertainty evidence: %#v", evidence)
	}
	audit := evidence.CurrentAttemptAudit
	if audit.ProviderProfileID == nil || *audit.ProviderProfileID != 42 || audit.ProviderVendor != "openai" ||
		len(audit.ProviderConfigFingerprint) != 64 || len(audit.DispatchID) != 32 {
		t.Fatalf("missing bounded provider evidence: %#v", audit)
	}
	if f.store.key != "" && (audit.StorageName != f.store.key || audit.StorageURL != f.store.URL(f.store.key)) {
		t.Fatalf("object locator was not retained: audit=%#v key=%q", audit, f.store.key)
	}
	after, err := f.candidates.GetMediaCandidate(ctx, f.candidateID)
	if err != nil || after.GenerationStatus != candidate.GenerationStatus || after.GenerationAttempt != candidate.GenerationAttempt || after.MediaAssetID != nil {
		t.Fatalf("read-only reconciliation mutated candidate: %#v, %v", after, err)
	}
}

func TestImageMetadataCommitACKLossPreservesBytesAndQuarantine(t *testing.T) {
	for _, mode := range []string{"after_commit", "cancel_after_commit"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			f := newImagePipelineFixture(t, mode, cancel)
			err := f.service.GenerateMediaCandidate(ctx, f.candidateID, f.approval.principal)
			if err == nil || f.creator.committedID <= 0 || f.creator.calls != 1 {
				t.Fatalf("commit-ACK fault not reached: id=%d calls=%d err=%v", f.creator.committedID, f.creator.calls, err)
			}
			f.assertRetainedBytes(t, 1)
			f.assertQuarantinedWithoutReplay(t)
			f.assertRetainedBytes(t, 1)
		})
	}
}

func TestImageMetadataPrecommitFailureDoesNotAuthorizeCleanupOrReplay(t *testing.T) {
	f := newImagePipelineFixture(t, "before_commit", nil)
	if err := f.service.GenerateMediaCandidate(context.Background(), f.candidateID, f.approval.principal); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("unexpected precommit failure: %v", err)
	}
	if f.creator.calls != 1 || f.creator.committedID != 0 {
		t.Fatal("precommit fixture unexpectedly wrote metadata")
	}
	f.assertRetainedBytes(t, 0)
	f.assertQuarantinedWithoutReplay(t)
}

func TestImageObjectPutACKLossPreservesBytesAndSkipsMetadata(t *testing.T) {
	f := newImagePipelineFixture(t, "put_ack_lost", nil)
	if err := f.service.GenerateMediaCandidate(context.Background(), f.candidateID, f.approval.principal); !errors.Is(err, errMediaPipelineACKLost) {
		t.Fatalf("unexpected object-write failure: %v", err)
	}
	if f.creator.calls != 0 {
		t.Fatal("metadata was written after an unconfirmed object PUT")
	}
	f.assertRetainedBytes(t, 0)
	f.assertQuarantinedWithoutReplay(t)
}

func TestImageProviderErrorQuarantinesAfterOneActualHTTPRequest(t *testing.T) {
	f := newImagePipelineFixture(t, "provider_error", nil)
	if err := f.service.GenerateMediaCandidate(context.Background(), f.candidateID, f.approval.principal); err == nil {
		t.Fatal("provider failure became success")
	}
	if f.store.puts != 0 || f.store.deletes != 0 || f.creator.calls != 0 {
		t.Fatal("provider failure reached media persistence")
	}
	f.assertQuarantinedWithoutReplay(t)
}

func TestImageSuccessfulPersistenceStillCompletesExactCandidate(t *testing.T) {
	f := newImagePipelineFixture(t, "success", nil)
	ctx := context.Background()
	if err := f.service.GenerateMediaCandidate(ctx, f.candidateID, f.approval.principal); err != nil {
		t.Fatal(err)
	}
	f.assertRetainedBytes(t, 1)
	candidate, err := f.candidates.GetMediaCandidate(ctx, f.candidateID)
	if err != nil || candidate.GenerationStatus != "generated" || candidate.GenerationAttempt != 1 || candidate.MediaAssetID == nil || *candidate.MediaAssetID != f.creator.committedID {
		t.Fatalf("success did not finalize its own candidate: %#v, %v", candidate, err)
	}
	var status, dispatchID, fingerprint, storageName string
	var assetID int64
	if err := f.approval.db.QueryRow(`SELECT status,media_asset_id,dispatch_id,provider_config_fingerprint,storage_name
		FROM ai_generation_audits WHERE media_candidate_id=$1 AND generation_attempt=1`, f.candidateID).
		Scan(&status, &assetID, &dispatchID, &fingerprint, &storageName); err != nil {
		t.Fatal(err)
	}
	if status != "succeeded" || assetID != f.creator.committedID || len(dispatchID) != 32 ||
		len(fingerprint) != 64 || storageName != f.store.key || f.requests.Load() != 1 || f.creator.calls != 1 {
		t.Fatalf("incorrect success evidence: status=%s asset=%d dispatch=%q storage=%q requests=%d",
			status, assetID, dispatchID, storageName, f.requests.Load())
	}
	if err := f.service.GenerateMediaCandidate(ctx, f.candidateID, f.approval.principal); !errors.Is(err, ErrApprovalConflict) || f.requests.Load() != 1 {
		t.Fatalf("completed candidate unexpectedly generated again: %v", err)
	}
}

func TestDirectEditorImageMetadataACKLossAlsoPreservesBytes(t *testing.T) {
	f := newImagePipelineFixture(t, "after_commit", nil)
	asset, err := f.service.GenerateDirectImage(context.Background(), "fixture image", "fixture alt", f.approval.principal)
	if err == nil || asset != nil || f.creator.calls != 1 || f.requests.Load() != 1 {
		t.Fatalf("direct image failure was hidden: asset=%#v calls=%d err=%v", asset, f.creator.calls, err)
	}
	f.assertRetainedBytes(t, 1)
	// Direct editor requests have no candidate/attempt idempotency contract.
	// Do not call them again here or claim cross-request deduplication.
}
