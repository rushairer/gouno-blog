package service

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisRateLimiter struct {
	client *redis.Client
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
