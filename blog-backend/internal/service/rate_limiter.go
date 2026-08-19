package service

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type RateLimiter interface {
	Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error)
}

type RedisRateLimiter struct {
	client *redis.Client
}

type memoryRateLimitEntry struct {
	count     int
	expiresAt time.Time
}

// MemoryRateLimiter is a bounded-process fallback for interaction endpoints.
// It intentionally fails closed only when its own bookkeeping cannot proceed;
// deployments should still use Redis to coordinate limits across replicas.
type MemoryRateLimiter struct {
	mu      sync.Mutex
	entries map[string]memoryRateLimitEntry
}

const maxMemoryRateLimitEntries = 10_000

func NewMemoryRateLimiter() *MemoryRateLimiter {
	return &MemoryRateLimiter{entries: make(map[string]memoryRateLimitEntry)}
}

func (l *MemoryRateLimiter) Allow(_ context.Context, key string, limit int, window time.Duration) (bool, error) {
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
		if _, exists := l.entries[key]; !exists && len(l.entries) >= maxMemoryRateLimitEntries {
			return false, nil
		}
		entry = memoryRateLimitEntry{expiresAt: now.Add(window)}
	}
	entry.count++
	l.entries[key] = entry
	return entry.count <= limit, nil
}

func NewRedisRateLimiter(dsn string) (*RedisRateLimiter, error) {
	options, err := redis.ParseURL(dsn)
	if err != nil {
		return nil, err
	}
	return &RedisRateLimiter{client: redis.NewClient(options)}, nil
}

func (l *RedisRateLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
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

func (l *RedisRateLimiter) Close() error {
	return l.client.Close()
}
