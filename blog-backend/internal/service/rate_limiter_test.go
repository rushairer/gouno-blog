package service

import (
	"context"
	"testing"
	"time"
)

func TestMemoryRateLimiterRejectsRequestsPastLimit(t *testing.T) {
	limiter := NewMemoryRateLimiter()
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
