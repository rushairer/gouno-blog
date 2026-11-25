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

// Create a counter with its TTL in one operation. Existing counters retain
// their original fixed-window deadline. Repair persistent counters left by
// the previous separate INCR/EXPIRE implementation without resetting usage.
var fixedWindowScript = redis.NewScript(`
local ttl = redis.call("PTTL", KEYS[1])
if ttl == -2 then
    redis.call("SET", KEYS[1], "1", "PX", ARGV[1])
    return 1
end
local count = redis.call("INCR", KEYS[1])
if ttl == -1 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return count
`)

func (l *RedisLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	if limit <= 0 || window <= 0 {
		return false, nil
	}
	windowMillis := window.Milliseconds()
	if windowMillis == 0 {
		windowMillis = 1
	}
	count, err := fixedWindowScript.Run(ctx, l.client, []string{"blog:interaction:" + key}, windowMillis).Int64()
	if err != nil {
		// Callers retain their existing outage policy. Never report an
		// affirmative decision for an unconfirmed Redis operation.
		return false, err
	}
	return count <= int64(limit), nil
}

func (l *RedisLimiter) Close() error {
	return l.client.Close()
}
