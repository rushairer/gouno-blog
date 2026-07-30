package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/repository"
	"go.uber.org/zap"
)

type Scheduler struct {
	repo     *repository.AgentRepository
	runner   *Runner
	interval time.Duration
	logger   *zap.Logger
}

func NewScheduler(repo *repository.AgentRepository, runner *Runner, interval time.Duration, logger *zap.Logger) *Scheduler {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Scheduler{repo: repo, runner: runner, interval: interval, logger: logger}
}

func (s *Scheduler) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()
		s.tick(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.tick(ctx)
			}
		}
	}()
}

func (s *Scheduler) tick(ctx context.Context) {
	due, err := s.repo.ListDueAgents(ctx, 20)
	if err != nil {
		s.logger.Error("AI Agent scheduler could not list due agents", zap.Error(err))
		return
	}
	for _, value := range due {
		s.schedule(ctx, value)
	}
}

func (s *Scheduler) schedule(ctx context.Context, value *domain.Agent) {
	if value.NextRunAt == nil {
		return
	}
	scheduleKey := fmt.Sprintf("%d:%s", value.ID, value.NextRunAt.UTC().Format(time.RFC3339))
	run, err := s.runner.Queue(
		ctx, value.ID, domain.AgentTriggerCron, nil,
		json.RawMessage(`{"scheduled":true}`), &scheduleKey,
	)
	if err == nil {
		go s.runner.Execute(ctx, run.ID)
	} else if !errors.Is(err, ErrAlreadyRunning) {
		s.logger.Warn("AI Agent scheduled run was not queued",
			zap.Int64("agent_id", value.ID), zap.Error(err))
	}
	next, nextErr := NextRun(value, value.NextRunAt.Add(time.Second))
	if nextErr != nil {
		s.logger.Error("AI Agent next run could not be calculated",
			zap.Int64("agent_id", value.ID), zap.Error(nextErr))
		return
	}
	if err := s.repo.SetAgentNextRun(ctx, value.ID, next); err != nil {
		s.logger.Error("AI Agent next run could not be saved",
			zap.Int64("agent_id", value.ID), zap.Error(err))
	}
}
