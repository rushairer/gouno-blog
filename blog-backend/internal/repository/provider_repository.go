package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	providerrepository "github.com/rushairer/blog-backend/internal/provider/repository"
)

// Provider persistence now belongs to the Provider capability. These methods
// remain as a temporary compatibility facade while Agent management consumers
// are narrowed to the canonical repository.
func (r *AgentRepository) providers() *providerrepository.Repository {
	return providerrepository.New(r.db)
}

func (r *AgentRepository) ReserveProviderID(ctx context.Context) (int64, error) {
	return r.providers().ReserveProviderID(ctx)
}

func (r *AgentRepository) CreateProvider(ctx context.Context, profile *domain.ProviderProfile) error {
	return r.providers().CreateProvider(ctx, profile)
}

func (r *AgentRepository) UpdateProvider(ctx context.Context, profile *domain.ProviderProfile, replaceSecret bool) error {
	return r.providers().UpdateProvider(ctx, profile, replaceSecret)
}

func (r *AgentRepository) GetProvider(ctx context.Context, id int64) (*domain.ProviderProfile, error) {
	return r.providers().GetProvider(ctx, id)
}

func (r *AgentRepository) ListProviders(ctx context.Context) ([]*domain.ProviderProfile, error) {
	return r.providers().ListProviders(ctx)
}

func (r *AgentRepository) SetDefaultProvider(ctx context.Context, id int64, purpose string) error {
	return r.providers().SetDefaultProvider(ctx, id, purpose)
}

func (r *AgentRepository) DeleteProvider(ctx context.Context, id int64) error {
	err := r.providers().DeleteProvider(ctx, id)
	if !errors.Is(err, providerrepository.ErrResourceInUse) {
		return err
	}
	if message := err.Error(); message != "" {
		if idx := strings.Index(message, ": "); idx >= 0 {
			return fmt.Errorf("%w: %s", ErrResourceInUse, message[idx+2:])
		}
	}
	return ErrResourceInUse
}
