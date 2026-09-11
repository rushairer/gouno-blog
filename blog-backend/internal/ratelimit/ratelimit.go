package ratelimit

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Limiter applies a bounded request rate to a caller-defined key.
type Limiter interface {
	Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error)
}

type RedisLimiter struct {
	client *redis.Client
}

type memoryEntry struct {
	count     int
	expiresAt time.Time
}

// MemoryLimiter is a bounded-process fallback for interaction endpoints.
// It intentionally fails closed only when its own bookkeeping cannot proceed;
// deployments should still use Redis to coordinate limits across replicas.
type MemoryLimiter struct {
	mu      sync.Mutex
	entries map[string]memoryEntry
}

const maxMemoryEntries = 10_000

func NewMemoryLimiter() *MemoryLimiter {
	return &MemoryLimiter{entries: make(map[string]memoryEntry)}
}

func (l *MemoryLimiter) Allow(_ context.Context, key string, limit int, window time.Duration) (bool, error) {
	if limit <= 0 || window <= 0 {
		return false, nil
	}
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	for existingKey, entry := range l.entries {
		if !entry.expiresAt.After(now) {
			delete(l.entries, existingKey)
		}
	}
	entry := l.entries[key]
	if !entry.expiresAt.After(now) {
		if _, exists := l.entries[key]; !exists && len(l.entries) >= maxMemoryEntries {
			return false, nil
		}
		entry = memoryEntry{expiresAt: now.Add(window)}
	}
	entry.count++
	l.entries[key] = entry
	return entry.count <= limit, nil
}

func NewRedisLimiter(dsn string) (*RedisLimiter, error) {
	options, err := redis.ParseURL(dsn)
	if err != nil {
		return nil, err
	}
	return &RedisLimiter{client: redis.NewClient(options)}, nil
}

func (l *RedisLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	count, err := l.client.Incr(ctx, "blog:interaction:"+key).Result()
	if err != nil {
		return true, err
	}
	if count == 1 {
		if err := l.client.Expire(ctx, "blog:interaction:"+key, window).Err(); err != nil {
			return true, err
		}
	}
	return count <= int64(limit), nil
}

func (l *RedisLimiter) Close() error {
	return l.client.Close()
}
