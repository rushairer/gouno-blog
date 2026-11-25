package ratelimit

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestMemoryLimiterRejectsRequestsPastLimit(t *testing.T) {
	limiter := NewMemoryLimiter()
	for request := 0; request < 2; request++ {
		allowed, err := limiter.Allow(context.Background(), "comment:user:1", 2, time.Minute)
		if err != nil || !allowed {
			t.Fatalf("request %d allowed=%v err=%v", request+1, allowed, err)
		}
	}
	allowed, err := limiter.Allow(context.Background(), "comment:user:1", 2, time.Minute)
	if err != nil || allowed {
		t.Fatalf("request above limit allowed=%v err=%v", allowed, err)
	}
}

func newTestRedisLimiter(t *testing.T) (*RedisLimiter, *miniredis.Miniredis) {
	t.Helper()
	server := miniredis.RunT(t)
	limiter, err := NewRedisLimiter("redis://" + server.Addr())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := limiter.Close(); err != nil {
			t.Errorf("close Redis client: %v", err)
		}
	})
	return limiter, server
}

func TestRedisLimiterFixedWindowDoesNotExtendDeadline(t *testing.T) {
	limiter, server := newTestRedisLimiter(t)
	ctx := context.Background()
	const key = "external-capability:test"
	const storedKey = "blog:interaction:" + key
	const window = time.Minute

	check := func(want bool) {
		t.Helper()
		allowed, err := limiter.Allow(ctx, key, 2, window)
		if err != nil || allowed != want {
			t.Fatalf("allowed=%v err=%v want=%v", allowed, err, want)
		}
	}
	check(true)
	if ttl := limiter.client.PTTL(ctx, storedKey).Val(); ttl <= 0 || ttl > window {
		t.Fatalf("first increment must have a finite TTL, got %v", ttl)
	}
	server.FastForward(20 * time.Second)
	before := limiter.client.PTTL(ctx, storedKey).Val()
	check(true)
	check(false)
	after := limiter.client.PTTL(ctx, storedKey).Val()
	if after <= 0 || after > before {
		t.Fatalf("subsequent requests extended fixed window: before=%v after=%v", before, after)
	}
	server.FastForward(window)
	check(true)
}

func TestRedisLimiterRepairsLegacyPersistentCounterWithoutResettingQuota(t *testing.T) {
	limiter, server := newTestRedisLimiter(t)
	ctx := context.Background()
	const key = "external-capability:legacy"
	const storedKey = "blog:interaction:" + key
	if err := limiter.client.Set(ctx, storedKey, 2, 0).Err(); err != nil {
		t.Fatal(err)
	}
	allowed, err := limiter.Allow(ctx, key, 2, time.Minute)
	if err != nil || allowed {
		t.Fatalf("repair must preserve consumed quota: allowed=%v err=%v", allowed, err)
	}
	if count := limiter.client.Get(ctx, storedKey).Val(); count != "3" {
		t.Fatalf("repaired counter = %q, want 3", count)
	}
	if ttl := limiter.client.PTTL(ctx, storedKey).Val(); ttl <= 0 || ttl > time.Minute {
		t.Fatalf("legacy counter was not repaired: TTL=%v", ttl)
	}
	server.FastForward(time.Minute)
	allowed, err = limiter.Allow(ctx, key, 2, time.Minute)
	if err != nil || !allowed {
		t.Fatalf("repaired counter did not recover after expiry: allowed=%v err=%v", allowed, err)
	}
}

func TestRedisLimiterConcurrentRequestsShareOneQuota(t *testing.T) {
	limiter, _ := newTestRedisLimiter(t)
	const requests, limit = 32, 8
	type decision struct {
		allowed bool
		err     error
	}
	results := make(chan decision, requests)
	var wg sync.WaitGroup
	for i := 0; i < requests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, err := limiter.Allow(context.Background(), "shared", limit, time.Minute)
			results <- decision{ok, err}
		}()
	}
	wg.Wait()
	close(results)
	allowed := 0
	for result := range results {
		if result.err != nil {
			t.Fatal(result.err)
		}
		if result.allowed {
			allowed++
		}
	}
	if allowed != limit {
		t.Fatalf("allowed %d of %d requests, want %d", allowed, requests, limit)
	}
}

func TestRedisLimiterRejectsInvalidLimitsAndUnconfirmedOperations(t *testing.T) {
	limiter, _ := newTestRedisLimiter(t)
	ctx := context.Background()
	for _, tc := range []struct {
		limit  int
		window time.Duration
	}{
		{0, time.Minute},
		{1, 0},
		{-1, time.Minute},
		{1, -time.Second},
	} {
		allowed, err := limiter.Allow(ctx, "invalid", tc.limit, tc.window)
		if err != nil || allowed {
			t.Fatalf("invalid input allowed=%v err=%v", allowed, err)
		}
	}
	if err := limiter.client.Get(ctx, "blog:interaction:invalid").Err(); err != redis.Nil {
		t.Fatalf("invalid input mutated Redis: %v", err)
	}
	if err := limiter.client.Set(ctx, "blog:interaction:corrupt", "not-an-integer", time.Minute).Err(); err != nil {
		t.Fatal(err)
	}
	allowed, err := limiter.Allow(ctx, "corrupt", 10, time.Minute)
	if err == nil || allowed {
		t.Fatalf("unconfirmed Redis decision allowed=%v err=%v", allowed, err)
	}
}
