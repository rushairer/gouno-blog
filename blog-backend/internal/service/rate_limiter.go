package service

import "github.com/rushairer/blog-backend/internal/ratelimit"

// RateLimiter is retained as a compatibility alias while callers migrate to the shared infrastructure package.
type RateLimiter = ratelimit.Limiter

// RedisRateLimiter is retained as a compatibility alias while callers migrate to the shared infrastructure package.
type RedisRateLimiter = ratelimit.RedisLimiter

// MemoryRateLimiter is retained as a compatibility alias while callers migrate to the shared infrastructure package.
type MemoryRateLimiter = ratelimit.MemoryLimiter

func NewMemoryRateLimiter() *MemoryRateLimiter {
	return ratelimit.NewMemoryLimiter()
}

func NewRedisRateLimiter(dsn string) (*RedisRateLimiter, error) {
	return ratelimit.NewRedisLimiter(dsn)
}
