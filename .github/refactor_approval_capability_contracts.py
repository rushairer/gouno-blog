from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrences of {old!r}, found {count}")
    p.write_text(text.replace(old, new))


def replace_method_refs(path: str, methods: list[str], owner: str) -> None:
    p = Path(path)
    text = p.read_text()
    for method in methods:
        old = f"s.repo.{method}"
        count = text.count(old)
        if count == 0:
            raise SystemExit(f"{path}: expected at least one {old}")
        text = text.replace(old, f"s.{owner}.{method}")
    p.write_text(text)


approval = Path("blog-backend/internal/agent/approval.go")
text = approval.read_text()

# ApprovalService owns orchestration and depends on explicit consumer-side ports.
old_struct = '''type ApprovalService struct {
\trepo         *repository.AgentRepository
\tposts        *postservice.PostService
\tpages        *pageservice.PageService
\tmanagement   *ManagementService
\tpostVersions postVersionReader
\tmediaAssets  mediaAssetGateway
\tmedia        media.Store
\tgeneration   *GenerationService
}

func (s *ApprovalService) SetGenerationService(generation *GenerationService) {
\ts.generation = generation
}

func (s *ApprovalService) SetPageService(pages *pageservice.PageService) {
\ts.pages = pages
}
'''
new_struct = '''type ApprovalService struct {
\tapprovals            ApprovalStore
\tmediaCandidates      MediaCandidateStore
\tmediaGeneration      MediaGenerationStore
\tworkflowInteractions WorkflowInteractionStore
\tworkflowEvents       WorkflowEventPort
\teffects              ApprovalEffectWriter
\tposts                *postservice.PostService
\tpages                *pageservice.PageService
\tpostVersions         postVersionReader
\tmediaAssets          mediaAssetGateway
\tmedia                media.Store
\tgeneration           *GenerationService
}
'''
if text.count(old_struct) != 1:
    raise SystemExit("ApprovalService struct/setter marker drifted")
text = text.replace(old_struct, new_struct)
if text.count('"github.com/rushairer/blog-backend/internal/repository"\n') != 1:
    raise SystemExit("approval.go flat repository import marker drifted")
text = text.replace('\t"github.com/rushairer/blog-backend/internal/repository"\n', '')
approval.write_text(text)

replace_method_refs(
    approval.as_posix(),
    ["ListApprovals", "GetApproval", "ClaimApproval", "CompleteApproval", "SetApprovalTarget", "RejectApproval", "ReconcileApprovalRun"],
    "approvals",
)
replace_method_refs(
    approval.as_posix(),
    [
        "CreateMediaCandidate", "ListMediaCandidates", "ListMediaCandidatesByWorkflowRun", "GetMediaCandidate",
        "SelectMediaCandidate", "SelectMediaCandidates", "MarkMediaCandidateApplied", "SyncPostVersionToken",
        "AttachMediaAsset", "ReviewMediaCandidate", "RejectMediaCandidate", "RejectMediaCandidates",
        "SetMediaGenerationInstruction",
    ],
    "mediaCandidates",
)
replace_method_refs(
    approval.as_posix(),
    ["ClaimMediaGeneration", "CompleteMediaGeneration", "CancelMediaGeneration"],
    "mediaGeneration",
)
replace_method_refs(
    approval.as_posix(),
    ["GetInteraction", "ListInteractions", "ListPendingInteractions", "ResolveInteraction", "CancelInteraction"],
    "workflowInteractions",
)
replace_method_refs(
    approval.as_posix(),
    ["ListMediaCandidateEvents", "ListWorkflowRunEvents", "AppendWorkflowRunEvent"],
    "workflowEvents",
)
replace_method_refs(
    approval.as_posix(),
    ["CreateReplyDraft", "CreateEditorialTask", "CreateOperationalSuggestion", "CreateContentCandidateSet"],
    "effects",
)

replace_exact(
    approval.as_posix(),
    '''\tfail := func(code, reason string) error {
\t\t_ = s.repo.RecordMediaGenerationError(ctx, id, code, reason)
\t\treturn errors.New(reason)
\t}
''',
    '''\tfail := func(code, reason string) error {
\t\ts.recordMediaGenerationFailure(ctx, id, code, reason)
\t\treturn errors.New(reason)
\t}
''',
)

# Add service-owned best-effort cross-capability orchestration next to other Workflow event orchestration.
marker = '''func (s *ApprovalService) appendCandidateEvent(ctx context.Context, candidateID int64, eventType string, payload map[string]any) {
\tcandidate, err := s.mediaCandidates.GetMediaCandidate(ctx, candidateID)
\tif err != nil || candidate.WorkflowRunID == nil {
\t\treturn
\t}
\trunID := *candidate.WorkflowRunID
\traw, _ := json.Marshal(payload)
\t_ = s.workflowEvents.AppendWorkflowRunEvent(ctx, &domain.WorkflowRunEvent{WorkflowRunID: &runID, WorkflowStepID: candidate.WorkflowStepID, InteractionTaskID: candidate.InteractionTaskID, EventType: eventType, Payload: raw})
}
'''
addition = marker + '''
func (s *ApprovalService) recordMediaGenerationFailure(ctx context.Context, candidateID int64, code, message string) {
\tworkflowRunID, err := s.mediaGeneration.RecordMediaGenerationError(ctx, candidateID, code, message)
\tif err != nil || workflowRunID == nil {
\t\treturn
\t}
\tpayload, _ := json.Marshal(map[string]any{
\t\t"candidate_id":  candidateID,
\t\t"error_code":    code,
\t\t"error_message": message,
\t})
\t_ = s.workflowEvents.AppendWorkflowRunEvent(ctx, &domain.WorkflowRunEvent{
\t\tWorkflowRunID: workflowRunID,
\t\tEventType:     generationFailureEvent(code),
\t\tPayload:       payload,
\t})
}

func generationFailureEvent(code string) string {
\tif code == "image_generation_timeout" {
\t\treturn "image_generation_timed_out"
\t}
\treturn "image_generation_failed"
}
'''
replace_exact(approval.as_posix(), marker, addition)

if "s.repo." in approval.read_text():
    raise SystemExit("ApprovalService still contains flat aggregate repository calls")

# Consumer-defined contracts. Keep each contract aligned to one ownership boundary.
Path("blog-backend/internal/agent/approval_ports.go").write_text('''package agent

import (
\t"context"
\t"encoding/json"

\t"github.com/rushairer/blog-backend/internal/domain"
)

type ApprovalStore interface {
\tListApprovals(context.Context, string, int, int) ([]*domain.AgentApproval, int, error)
\tGetApproval(context.Context, int64) (*domain.AgentApproval, error)
\tClaimApproval(context.Context, int64, int64, string) error
\tCompleteApproval(context.Context, int64, domain.ApprovalStatus, string) error
\tSetApprovalTarget(context.Context, int64, int64) error
\tRejectApproval(context.Context, int64, int64, string) error
\tReconcileApprovalRun(context.Context, int64) (*domain.AgentRun, error)
}

type MediaCandidateStore interface {
\tCreateMediaCandidate(context.Context, *domain.AgentApproval) error
\tListMediaCandidates(context.Context) ([]*domain.MediaCandidate, error)
\tListMediaCandidatesByWorkflowRun(context.Context, int64) ([]*domain.MediaCandidate, error)
\tGetMediaCandidate(context.Context, int64) (*domain.MediaCandidate, error)
\tSelectMediaCandidate(context.Context, int64, string, string) error
\tSelectMediaCandidates(context.Context, []domain.MediaCandidateSelection) error
\tMarkMediaCandidateApplied(context.Context, int64, int64) error
\tSyncPostVersionToken(context.Context, int64, string) error
\tAttachMediaAsset(context.Context, int64, int64) error
\tReviewMediaCandidate(context.Context, int64, string, int64, string) error
\tRejectMediaCandidate(context.Context, int64, string) error
\tRejectMediaCandidates(context.Context, []int64) error
\tSetMediaGenerationInstruction(context.Context, int64, string) error
}

type MediaGenerationStore interface {
\tClaimMediaGeneration(context.Context, int64) (*domain.MediaCandidate, error)
\tCompleteMediaGeneration(context.Context, int64, int64, bool) error
\tRecordMediaGenerationError(context.Context, int64, string, string) (*int64, error)
\tCancelMediaGeneration(context.Context, int64) error
}

type WorkflowInteractionStore interface {
\tGetInteraction(context.Context, int64) (*domain.WorkflowInteractionTask, error)
\tListInteractions(context.Context, int64) ([]*domain.WorkflowInteractionTask, error)
\tListPendingInteractions(context.Context) ([]*domain.WorkflowInteractionTask, error)
\tResolveInteraction(context.Context, int64, string, json.RawMessage, int64) (*domain.WorkflowInteractionTask, error)
\tCancelInteraction(context.Context, int64, string, int64) error
}

type WorkflowEventPort interface {
\tAppendWorkflowRunEvent(context.Context, *domain.WorkflowRunEvent) error
\tListWorkflowRunEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error)
\tListMediaCandidateEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error)
}

type ApprovalEffectWriter interface {
\tCreateContentCandidateSet(context.Context, *domain.AgentApproval) error
\tCreateEditorialTask(context.Context, int64, string, string, string) error
\tCreateReplyDraft(context.Context, int64, int64, string) error
\tCreateOperationalSuggestion(context.Context, *domain.OperationalSuggestion) error
}
''')

# Explicit composition: no flat AgentRepository and no unused ManagementService dependency.
Path("blog-backend/internal/agent/approval_composition.go").write_text('''package agent

import (
\t"github.com/rushairer/blog-backend/internal/media"
\tpageservice "github.com/rushairer/blog-backend/internal/page/service"
\tpostservice "github.com/rushairer/blog-backend/internal/post/service"
)

type ApprovalServiceDependencies struct {
\tApprovals            ApprovalStore
\tMediaCandidates      MediaCandidateStore
\tMediaGeneration      MediaGenerationStore
\tWorkflowInteractions WorkflowInteractionStore
\tWorkflowEvents       WorkflowEventPort
\tEffects              ApprovalEffectWriter
\tPosts                *postservice.PostService
\tPages                *pageservice.PageService
\tPostVersions         postVersionReader
\tMediaAssets          mediaAssetGateway
\tMediaStore           media.Store
\tGeneration           *GenerationService
}

func NewApprovalService(deps ApprovalServiceDependencies) *ApprovalService {
\treturn &ApprovalService{
\t\tapprovals: deps.Approvals, mediaCandidates: deps.MediaCandidates, mediaGeneration: deps.MediaGeneration,
\t\tworkflowInteractions: deps.WorkflowInteractions, workflowEvents: deps.WorkflowEvents, effects: deps.Effects,
\t\tposts: deps.Posts, pages: deps.Pages, postVersions: deps.PostVersions,
\t\tmediaAssets: deps.MediaAssets, media: deps.MediaStore, generation: deps.Generation,
\t}
}
''')

# Operations owns approval execution effects and their transactions.
Path("blog-backend/internal/operations/approval_effects.go").write_text('''package operations

import (
\t"context"
\t"crypto/sha256"
\t"database/sql"
\t"encoding/json"
\t"errors"
\t"fmt"
\t"strings"

\t"github.com/rushairer/blog-backend/internal/domain"
)

func (s *Service) CreateContentCandidateSet(ctx context.Context, approval *domain.AgentApproval) error {
\tvar payload struct {
\t\tPostID     int64                     `json:"post_id"`
\t\tFieldType  string                    `json:"field_type"`
\t\tCandidates []domain.ContentCandidate `json:"candidates"`
\t}
\tif err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
\t\treturn err
\t}
\tif payload.PostID <= 0 && approval.TargetID != nil {
\t\tpayload.PostID = *approval.TargetID
\t}
\tif payload.PostID <= 0 || len(payload.Candidates) == 0 {
\t\treturn errors.New("content candidate proposal requires a post and at least one candidate")
\t}
\tvar before domain.Post
\tif err := json.Unmarshal(approval.BeforeSnapshot, &before); err != nil {
\t\treturn err
\t}
\tbeforeValue := ""
\tswitch payload.FieldType {
\tcase "title":
\t\tbeforeValue = before.Title
\tcase "summary":
\t\tbeforeValue = before.Summary
\tcase "cover_alt":
\t\tbeforeValue = before.CoverAlt
\tdefault:
\t\treturn errors.New("unsupported candidate field")
\t}
\treturn s.transactor.Run(ctx, func(tx *sql.Tx) error {
\t\tvar setID int64
\t\tif err := tx.QueryRowContext(ctx, `INSERT INTO ai_content_candidate_sets
\t\t\t(post_id,source_run_id,source_approval_id,field_type,before_value)
\t\t\tVALUES($1,$2,$3,$4,$5) RETURNING id`, payload.PostID, approval.RunID, approval.ID, payload.FieldType, beforeValue).Scan(&setID); err != nil {
\t\t\treturn err
\t\t}
\t\tfor _, item := range payload.Candidates {
\t\t\tif _, err := tx.ExecContext(ctx, `INSERT INTO ai_content_candidates
\t\t\t\t(candidate_set_id,value,rationale)VALUES($1,$2,$3)`, setID, item.Value, item.Rationale); err != nil {
\t\t\t\treturn err
\t\t\t}
\t\t}
\t\treturn nil
\t})
}

func (s *Service) CreateEditorialTask(ctx context.Context, approvalID int64, title, description, priority string) error {
\t_, err := s.db.ExecContext(ctx, `INSERT INTO ai_editorial_tasks
\t\t(title, description, priority, source_approval_id) VALUES ($1,$2,$3,$4)`,
\t\ttitle, description, priority, approvalID)
\treturn err
}

func (s *Service) CreateReplyDraft(ctx context.Context, approvalID, commentID int64, content string) error {
\t_, err := s.db.ExecContext(ctx, `INSERT INTO ai_comment_reply_drafts
\t\t(comment_id, content, source_approval_id) VALUES ($1,$2,$3)`,
\t\tcommentID, content, approvalID)
\treturn err
}

func (s *Service) CreateOperationalSuggestion(ctx context.Context, value *domain.OperationalSuggestion) error {
\tsum := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join([]string{value.SourceType, value.SourceKey, value.Title}, ":"))))
\t_, err := s.db.ExecContext(ctx, `INSERT INTO ai_operational_suggestions
\t\t(source_type,source_key,source_run_id,workflow_run_id,title,description,priority,evidence,
\t\t window_start,window_end,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
\t\tON CONFLICT(dedupe_key) DO UPDATE SET evidence=EXCLUDED.evidence,updated_at=NOW()
\t\tWHERE ai_operational_suggestions.status='new'`, value.SourceType, value.SourceKey, value.SourceRunID,
\t\tvalue.WorkflowRunID, value.Title, value.Description, value.Priority, value.Evidence, value.WindowStart, value.WindowEnd, sum)
\treturn err
}
''')

# Agent Approval repository becomes Agent-approval persistence only.
approval_repo = Path("blog-backend/internal/agent/repository/approval_repository.go")
repo_text = approval_repo.read_text()
for block_start, block_end in [
    ("func (r *ApprovalRepository) CreateContentCandidateSet", "func (r *ApprovalRepository) GetApproval"),
    ("func (r *ApprovalRepository) CreateEditorialTask", None),
]:
    start = repo_text.find(block_start)
    if start < 0:
        raise SystemExit(f"approval repository marker missing: {block_start}")
    if block_end is not None:
        end = repo_text.find(block_end, start)
        if end < 0:
            raise SystemExit(f"approval repository end marker missing: {block_end}")
        repo_text = repo_text[:start] + repo_text[end:]
    else:
        repo_text = repo_text[:start].rstrip() + "\n"
for unused in ['\t"crypto/sha256"\n', '\t"errors"\n', '\t"fmt"\n', '\t"strings"\n']:
    if unused not in repo_text:
        raise SystemExit(f"expected removable import missing: {unused!r}")
    repo_text = repo_text.replace(unused, '')
approval_repo.write_text(repo_text)

# Flat Approval compatibility now exists only for Runner's CreateApproval call.
Path("blog-backend/internal/repository/approval_repository.go").write_text('''package repository

import (
\t"context"

\tagentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
\t"github.com/rushairer/blog-backend/internal/domain"
)

// Approval creation remains as a transitional Runner facade. ApprovalService
// consumes the canonical Agent ApprovalRepository directly.
func (r *AgentRepository) approvals() *agentrepository.ApprovalRepository {
\treturn agentrepository.NewApprovalRepository(r.db)
}

func (r *AgentRepository) CreateApproval(ctx context.Context, approval *domain.AgentApproval) error {
\treturn r.approvals().CreateApproval(ctx, approval)
}
''')

# Flat MediaCandidate compatibility now exists only for Runner/run-facade consumers.
Path("blog-backend/internal/repository/media_candidate_repository.go").write_text('''package repository

import (
\t"context"

\tagentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
)

// Media Candidate persistence is canonical under Agent. This helper remains
// only while Runner/run compatibility code still consumes the flat aggregate.
func (r *AgentRepository) mediaCandidates() *agentrepository.MediaCandidateRepository {
\treturn agentrepository.NewMediaCandidateRepository(r.db)
}

func (r *AgentRepository) CreateMediaCandidateFromRun(ctx context.Context, runID, postID int64, headline, brief, platform, altText string) (int64, *int64, error) {
\treturn r.mediaCandidates().CreateMediaCandidateFromRun(ctx, runID, postID, headline, brief, platform, altText)
}
''')

# Approval is the last consumer of this flat Workflow facade; remove it completely.
workflow_facade = Path("blog-backend/internal/repository/workflow_interaction_repository.go")
if not workflow_facade.exists():
    raise SystemExit("expected flat Workflow interaction facade")
workflow_facade.unlink()

# The old flat test only covered repository-layer generation event orchestration.
flat_event_test = Path("blog-backend/internal/repository/agent_repository_test.go")
if flat_event_test.read_text().count("TestGenerationFailureEvent") != 1:
    raise SystemExit("unexpected flat generation event test content")
flat_event_test.unlink()

# Composition root wires each owner explicitly.
web = Path("blog-backend/cmd/gouno/web.go")
web_text = web.read_text()
old_import = '\tworkflowservice "github.com/rushairer/blog-backend/internal/workflow"\n'
new_import = '\tworkflowservice "github.com/rushairer/blog-backend/internal/workflow"\n\tworkflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"\n'
if web_text.count(old_import) != 1:
    raise SystemExit("web.go workflow import marker drifted")
web_text = web_text.replace(old_import, new_import)
old_repos = '''\t\tagentRunRepo := agentrepository.NewRunRepository(cfg.DB)
\t\tagentApprovalRepo := agentrepository.NewApprovalRepository(cfg.DB)
\t\tgenerationAuditRepo := agentrepository.NewGenerationAuditRepository(cfg.DB)
'''
new_repos = '''\t\tagentRunRepo := agentrepository.NewRunRepository(cfg.DB)
\t\tagentApprovalRepo := agentrepository.NewApprovalRepository(cfg.DB)
\t\tagentMediaCandidateRepo := agentrepository.NewMediaCandidateRepository(cfg.DB)
\t\tworkflowInteractionRepo := workflowrepository.NewInteractionRepository(cfg.DB)
\t\tgenerationAuditRepo := agentrepository.NewGenerationAuditRepository(cfg.DB)
'''
if web_text.count(old_repos) != 1:
    raise SystemExit("web.go Agent repository marker drifted")
web_text = web_text.replace(old_repos, new_repos)
old_ctor = '\t\tapprovals := agentservice.NewApprovalServiceWithGeneration(agentRepo, postSvc, management, postVersionSvc, mediaSvc, mediaStore, pageSvc, generation)\n'
new_ctor = '''\t\tapprovals := agentservice.NewApprovalService(agentservice.ApprovalServiceDependencies{
\t\t\tApprovals: agentApprovalRepo, MediaCandidates: agentMediaCandidateRepo, MediaGeneration: agentMediaCandidateRepo,
\t\t\tWorkflowInteractions: workflowInteractionRepo, WorkflowEvents: workflowInteractionRepo, Effects: operationsSvc,
\t\t\tPosts: postSvc, Pages: pageSvc, PostVersions: postVersionSvc, MediaAssets: mediaSvc, MediaStore: mediaStore, Generation: generation,
\t\t})
'''
if web_text.count(old_ctor) != 1:
    raise SystemExit("web.go Approval constructor marker drifted")
web_text = web_text.replace(old_ctor, new_ctor)
web.write_text(web_text)

# Unit coverage for service-owned failure/event orchestration.
approval_test = Path("blog-backend/internal/agent/approval_test.go")
test_text = approval_test.read_text()
if test_text.count('import (\n\t"encoding/json"') != 1:
    raise SystemExit("approval_test import marker drifted")
test_text = test_text.replace('import (\n\t"encoding/json"', 'import (\n\t"context"\n\t"encoding/json"\n\t"errors"')
test_text += r'''

type mediaGenerationFailureStub struct {
\tworkflowRunID *int64
\trecordErr     error
\tcandidateID   int64
\tcode          string
\tmessage       string
}

func (s *mediaGenerationFailureStub) ClaimMediaGeneration(context.Context, int64) (*domain.MediaCandidate, error) {
\treturn nil, errors.New("unused")
}
func (s *mediaGenerationFailureStub) CompleteMediaGeneration(context.Context, int64, int64, bool) error {
\treturn errors.New("unused")
}
func (s *mediaGenerationFailureStub) CancelMediaGeneration(context.Context, int64) error {
\treturn errors.New("unused")
}
func (s *mediaGenerationFailureStub) RecordMediaGenerationError(_ context.Context, candidateID int64, code, message string) (*int64, error) {
\ts.candidateID, s.code, s.message = candidateID, code, message
\treturn s.workflowRunID, s.recordErr
}

type workflowEventStub struct {
\tevents    []*domain.WorkflowRunEvent
\tappendErr error
}

func (s *workflowEventStub) AppendWorkflowRunEvent(_ context.Context, event *domain.WorkflowRunEvent) error {
\ts.events = append(s.events, event)
\treturn s.appendErr
}
func (s *workflowEventStub) ListWorkflowRunEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error) {
\treturn nil, nil
}
func (s *workflowEventStub) ListMediaCandidateEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error) {
\treturn nil, nil
}

func TestRecordMediaGenerationFailureOwnsWorkflowOrchestration(t *testing.T) {
\trunID := int64(41)
\tmediaStore := &mediaGenerationFailureStub{workflowRunID: &runID}
\tevents := &workflowEventStub{appendErr: errors.New("audit unavailable")}
\tsvc := &ApprovalService{mediaGeneration: mediaStore, workflowEvents: events}

\tsvc.recordMediaGenerationFailure(context.Background(), 7, "image_generation_timeout", "provider timed out")

\tif mediaStore.candidateID != 7 || mediaStore.code != "image_generation_timeout" || mediaStore.message != "provider timed out" {
\t\tt.Fatalf("media failure write = id:%d code:%q message:%q", mediaStore.candidateID, mediaStore.code, mediaStore.message)
\t}
\tif len(events.events) != 1 {
\t\tt.Fatalf("workflow events = %d, want 1", len(events.events))
\t}
\tevent := events.events[0]
\tif event.WorkflowRunID == nil || *event.WorkflowRunID != runID || event.EventType != "image_generation_timed_out" {
\t\tt.Fatalf("workflow event = %#v", event)
\t}
\tvar payload map[string]any
\tif err := json.Unmarshal(event.Payload, &payload); err != nil {
\t\tt.Fatal(err)
\t}
\tif payload["candidate_id"] != float64(7) || payload["error_code"] != "image_generation_timeout" || payload["error_message"] != "provider timed out" {
\t\tt.Fatalf("workflow payload = %#v", payload)
\t}
}

func TestRecordMediaGenerationFailureSkipsWorkflowWhenUnavailable(t *testing.T) {
\tfor _, test := range []struct {
\t\tname     string
\t\tstore    *mediaGenerationFailureStub
\t\twantSeen int
\t}{
\t\t{name: "no workflow run", store: &mediaGenerationFailureStub{}},
\t\t{name: "agent persistence failed", store: &mediaGenerationFailureStub{recordErr: errors.New("write failed")}},
\t} {
\t\tt.Run(test.name, func(t *testing.T) {
\t\t\tevents := &workflowEventStub{}
\t\t\tsvc := &ApprovalService{mediaGeneration: test.store, workflowEvents: events}
\t\t\tsvc.recordMediaGenerationFailure(context.Background(), 9, "image_generation_failed", "failed")
\t\t\tif len(events.events) != test.wantSeen {
\t\t\t\tt.Fatalf("workflow events = %d, want %d", len(events.events), test.wantSeen)
\t\t\t}
\t\t})
\t}
}

func TestGenerationFailureEvent(t *testing.T) {
\tif got := generationFailureEvent("image_generation_timeout"); got != "image_generation_timed_out" {
\t\tt.Fatalf("timeout event = %q", got)
\t}
\tif got := generationFailureEvent("image_generation_failed"); got != "image_generation_failed" {
\t\tt.Fatalf("failure event = %q", got)
\t}
}
'''
approval_test.write_text(test_text)

# Capability-owned database integration proof for the Operations effects moved out of Agent persistence.
Path("blog-backend/internal/operations/approval_effects_integration_test.go").write_text(r'''package operations

import (
\t"context"
\t"encoding/json"
\t"fmt"
\t"testing"
\t"time"

\t"github.com/rushairer/blog-backend/internal/dbtx"
\t"github.com/rushairer/blog-backend/internal/domain"
\t"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestApprovalEffectsPersistUnderOperationsOwnership(t *testing.T) {
\tdb := testsupport.OpenTestDB(t)
\tdefer db.Close()
\tctx := context.Background()
\tsuffix := fmt.Sprintf("%d", time.Now().UnixNano())

\tvar skillVersionID int64
\tif err := db.QueryRowContext(ctx, `SELECT id FROM ai_skill_versions ORDER BY id LIMIT 1`).Scan(&skillVersionID); err != nil {
\t\tt.Fatal(err)
\t}
\tvar providerID int64
\tif err := db.QueryRowContext(ctx, `INSERT INTO ai_provider_profiles(name,provider_type,base_url,model,enabled)
\t\tVALUES($1,'openai','https://provider.example.test','test-model',TRUE) RETURNING id`, "approval-effects-provider-"+suffix).Scan(&providerID); err != nil {
\t\tt.Fatal(err)
\t}
\tvar agentID int64
\tif err := db.QueryRowContext(ctx, `INSERT INTO ai_agents(name,description,provider_profile_id,skill_version_id,enabled,trigger_type,timezone,daily_run_limit,monthly_token_budget)
\t\tVALUES($1,'',$2,$3,FALSE,'manual','Asia/Shanghai',10,1000000) RETURNING id`, "approval-effects-agent-"+suffix, providerID, skillVersionID).Scan(&agentID); err != nil {
\t\tt.Fatal(err)
\t}
\tvar runID int64
\tif err := db.QueryRowContext(ctx, `INSERT INTO ai_agent_runs(agent_id,trigger_type,status,input,provider,model,skill_version_id)
\t\tVALUES($1,'manual','awaiting_approval','{}'::jsonb,'openai','test-model',$2) RETURNING id`, agentID, skillVersionID).Scan(&runID); err != nil {
\t\tt.Fatal(err)
\t}
\tvar toolCallID int64
\tif err := db.QueryRowContext(ctx, `INSERT INTO ai_tool_calls(run_id,tool_name,risk_level,arguments,status)
\t\tVALUES($1,'operations.test','propose','{}'::jsonb,'executed') RETURNING id`, runID).Scan(&toolCallID); err != nil {
\t\tt.Fatal(err)
\t}
\tvar approvalID int64
\tif err := db.QueryRowContext(ctx, `INSERT INTO ai_approvals(run_id,tool_call_id,action_type,target_type,proposed_payload)
\t\tVALUES($1,$2,'create_content_candidates','post','{}'::jsonb) RETURNING id`, runID, toolCallID).Scan(&approvalID); err != nil {
\t\tt.Fatal(err)
\t}
\tvar postID int64
\tif err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,summary,content,status)
\t\tVALUES($1,$2,'before summary','body','draft') RETURNING id`, "Approval effects "+suffix, "approval-effects-"+suffix).Scan(&postID); err != nil {
\t\tt.Fatal(err)
\t}
\tvar commentID int64
\tif err := db.QueryRowContext(ctx, `INSERT INTO comments(post_id,author,author_type,content,status,is_visible)
\t\tVALUES($1,'Fixture','anonymous','Needs reply','pending',FALSE) RETURNING id`, postID).Scan(&commentID); err != nil {
\t\tt.Fatal(err)
\t}

\tsvc := &Service{db: db, transactor: dbtx.NewTransactor(db, nil)}
\tbefore, _ := json.Marshal(domain.Post{Title: "before title", Summary: "before summary"})
\ttargetID := postID
\tapproval := &domain.AgentApproval{
\t\tID: approvalID, RunID: runID, TargetID: &targetID, BeforeSnapshot: before,
\t\tProposedPayload: json.RawMessage(`{"post_id":` + fmt.Sprint(postID) + `,"field_type":"title","candidates":[{"value":"Candidate A","rationale":"a"},{"value":"Candidate B","rationale":"b"}]}`),
\t}
\tif err := svc.CreateContentCandidateSet(ctx, approval); err != nil {
\t\tt.Fatal(err)
\t}
\tvar setCount, candidateCount int
\tif err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_content_candidate_sets WHERE source_approval_id=$1`, approvalID).Scan(&setCount); err != nil {
\t\tt.Fatal(err)
\t}
\tif err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_content_candidates WHERE candidate_set_id IN (SELECT id FROM ai_content_candidate_sets WHERE source_approval_id=$1)`, approvalID).Scan(&candidateCount); err != nil {
\t\tt.Fatal(err)
\t}
\tif setCount != 1 || candidateCount != 2 {
\t\tt.Fatalf("candidate persistence = sets:%d candidates:%d", setCount, candidateCount)
\t}

\tif err := svc.CreateEditorialTask(ctx, approvalID, "Edit "+suffix, "description", "medium"); err != nil {
\t\tt.Fatal(err)
\t}
\tif err := svc.CreateReplyDraft(ctx, approvalID, commentID, "Draft reply"); err != nil {
\t\tt.Fatal(err)
\t}
\tsuggestion := &domain.OperationalSuggestion{SourceType: "approval_test", SourceKey: suffix, SourceRunID: &runID, Title: "Suggestion " + suffix, Description: "description", Priority: "medium", Evidence: json.RawMessage(`{"source":"test"}`)}
\tif err := svc.CreateOperationalSuggestion(ctx, suggestion); err != nil {
\t\tt.Fatal(err)
\t}

\tfor name, query := range map[string]string{
\t\t"editorial task": `SELECT COUNT(*) FROM ai_editorial_tasks WHERE source_approval_id=$1`,
\t\t"reply draft":    `SELECT COUNT(*) FROM ai_comment_reply_drafts WHERE source_approval_id=$1`,
\t} {
\t\tvar count int
\t\tif err := db.QueryRowContext(ctx, query, approvalID).Scan(&count); err != nil {
\t\t\tt.Fatal(err)
\t\t}
\t\tif count != 1 {
\t\t\tt.Fatalf("%s count = %d, want 1", name, count)
\t\t}
\t}
\tvar suggestionCount int
\tif err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_operational_suggestions WHERE source_run_id=$1 AND source_key=$2`, runID, suffix).Scan(&suggestionCount); err != nil {
\t\tt.Fatal(err)
\t}
\tif suggestionCount != 1 {
\t\tt.Fatalf("operational suggestion count = %d, want 1", suggestionCount)
\t}
}
''')

# Update convergence map to describe the new canonical runtime graph.
conv = Path("blog-backend/ARCHITECTURE_CONVERGENCE.md")
conv_text = conv.read_text()
conv_text = conv_text.replace(
    "**In progress.** Scheduler and GenerationService use narrow canonical repositories. ManagementService, Runner and ApprovalService still depend on flat `repository.AgentRepository`; Agent HTTP ownership remains flat.",
    "**In progress.** Scheduler, GenerationService and ApprovalService use explicit canonical repositories/ports. ManagementService and Runner still depend on flat `repository.AgentRepository`; Agent HTTP ownership remains flat.",
)
conv_text = conv_text.replace(
    "**In progress.** Persistence ownership is canonical, but Agent consumers still reach Workflow persistence through flat AgentRepository facades; HTTP ownership remains flat.",
    "**In progress.** Persistence ownership is canonical and ApprovalService consumes Workflow interaction/event ports directly. Runner still uses transitional Workflow scope/resource facades; HTTP ownership remains flat.",
)
conv_text = conv_text.replace(
    "**Service dependency converged.** Dead broad `ConfigureGovernance(*AgentRepository, ...)` facade is retired in the shared-DB slice. HTTP ownership remains a later controller phase.",
    "**Service dependency and approval-effect ownership converged.** Governance uses narrow Agent writers, and approved candidate/task/reply/suggestion effects are persisted by Operations rather than Agent ApprovalRepository. HTTP ownership remains a later controller phase.",
)
conv_text = conv_text.replace(
    "- **Approval -> Media Candidate -> Workflow event:** Media Candidate state is Agent-owned; Workflow event persistence is Workflow-owned. Workflow audit delivery is currently best-effort rather than an atomic cross-capability transaction. The orchestration belongs in Approval/application service code. A repository that updates Agent state and then calls Workflow persistence is not an acceptable final owner.",
    "- **Approval -> Media Candidate -> Workflow event:** Media Candidate state is Agent-owned; Workflow event persistence is Workflow-owned. ApprovalService now owns the best-effort orchestration through `MediaGenerationStore` and `WorkflowEventPort`; repositories remain persistence-only and no cross-capability transaction is implied.",
)
conv_text = conv_text.replace(
    "| `internal/repository.AgentRepository` aggregate | Accidental aggregate / transitional | Agent ManagementService, Runner, ApprovalService, Starter Pack/bootstrap tests | Cut services to consumer-defined narrow contracts and canonical repositories; move Starter Pack orchestration to application coordinator; then delete aggregate. |",
    "| `internal/repository.AgentRepository` aggregate | Accidental aggregate / transitional | Agent ManagementService, Runner, Starter Pack/bootstrap tests | Cut the remaining services to consumer-defined narrow contracts and canonical repositories; move Starter Pack orchestration to application coordinator; then delete aggregate. |",
)
conv_text = conv_text.replace(
    "| Flat Agent Definition/Skill/Run/Approval/MediaCandidate delegates | Transitional | Methods reached through aggregate Agent services | Delete each method group when its final service consumer is cut over. Do not replace the aggregate with another broad interface. |",
    "| Flat Agent Definition/Skill/Run delegates plus minimal Approval/MediaCandidate Runner adapters | Transitional | ManagementService / Runner and run compatibility code | ApprovalService delegates are retired; delete the remaining method groups as ManagementService and Runner cut over. Do not replace the aggregate with another broad interface. |",
)
conv_text = conv_text.replace(
    "| Flat Workflow interaction/scope delegates on AgentRepository | Transitional cross-capability facade | Runner and Approval paths | Inject Workflow-owned narrow interaction/event/scope ports directly into consuming Agent services, update composition root, then delete delegates. |",
    "| Flat Workflow scope delegates on AgentRepository | Transitional cross-capability facade | Runner | The flat interaction/event facade is retired; inject Workflow-owned scope/resource ports into Runner, then delete the remaining Workflow delegates. |",
)
conv_text = conv_text.replace(
    "2. **Agent Approval / Media Candidate / Workflow Event orchestration:** replace repository-layer cross-capability orchestration with Approval-side narrow stores and Workflow event port; supersede any PR that keeps orchestration in a repository.\n3. **Agent ManagementService dependency model:**",
    "2. **Agent ManagementService dependency model:** split Provider, Skill/Definition, Notification and Starter Pack dependencies; assign Starter Pack transaction to an application coordinator.\n3. **Runner dependency model:** split RunStore, Agent reader, Workflow scope/resource ports, usage/tool-call persistence and Media Candidate creation according to actual call cohesion.\n4. **Workflow consolidation:** understand execution, preflight, scheduling, resource resolution, interactions, events, persistence and planning before any internal decomposition.\n5. **Controller / composition-root convergence:** move Agent/Workflow/Operations/Knowledge HTTP ownership only after service contracts are stable.\n6. **Transitional layer retirement:** delete remaining flat repository/controller facades and stale adapters only after consumer proof and full gates.\n\nCompleted slice: **Agent Approval / Media Candidate / Workflow Event orchestration** now uses consumer-side Agent stores, Workflow ports, Operations-owned approval effects and explicit composition-root wiring. The superseded repository-layer PR was closed without merge.\n\n<!-- prior priority tail retained below only if marker replacement failed -->\n3. **Agent ManagementService dependency model:**",
)
# Remove duplicated old tail introduced by the replacement above if present.
duplicate = '''3. **Agent ManagementService dependency model:** split Provider, Skill/Definition, Notification and Starter Pack dependencies; assign Starter Pack transaction to an application coordinator.
4. **Runner dependency model:** split RunStore, Agent reader, Workflow scope/resource ports, usage/tool-call persistence and Media Candidate creation according to actual call cohesion.
5. **Workflow consolidation:** understand execution, preflight, scheduling, resource resolution, interactions, events, persistence and planning before any internal decomposition.
6. **Controller / composition-root convergence:** move Agent/Workflow/Operations/Knowledge HTTP ownership only after service contracts are stable.
7. **Transitional layer retirement:** delete remaining flat repository/controller facades and stale adapters only after consumer proof and full gates.
'''
if conv_text.count(duplicate) == 1:
    conv_text = conv_text.replace(duplicate, "")
if "ApprovalService still depend" in conv_text:
    raise SystemExit("convergence map still says ApprovalService uses flat aggregate")
conv.write_text(conv_text)

# Fail closed on final ownership and migration-debt result.
checks = {
    "blog-backend/internal/agent/approval.go": ["internal/repository", "s.repo.", "ManagementService"],
    "blog-backend/internal/agent/repository/approval_repository.go": ["ai_content_candidate_sets", "ai_content_candidates", "ai_editorial_tasks", "ai_comment_reply_drafts", "ai_operational_suggestions"],
    "blog-backend/internal/repository/approval_repository.go": ["CreateContentCandidateSet", "ListApprovals", "GetApproval", "ClaimApproval", "CompleteApproval", "RejectApproval", "ReconcileApprovalRun", "CreateApprovalTx"],
    "blog-backend/internal/repository/media_candidate_repository.go": ["RecordMediaGenerationError", "AppendWorkflowRunEvent", "ListMediaCandidates", "GetMediaCandidate", "SelectMediaCandidate"],
}
for path, forbidden in checks.items():
    body = Path(path).read_text()
    for item in forbidden:
        if item in body:
            raise SystemExit(f"{path}: forbidden residual {item}")
if Path("blog-backend/internal/repository/workflow_interaction_repository.go").exists():
    raise SystemExit("flat Workflow interaction facade still exists")
if "NewApprovalServiceWithGeneration" in Path("blog-backend/cmd/gouno/web.go").read_text():
    raise SystemExit("composition root still uses legacy Approval constructor")
if "repository.AgentRepository" in Path("blog-backend/internal/agent/approval_composition.go").read_text():
    raise SystemExit("Approval composition still depends on flat aggregate")
