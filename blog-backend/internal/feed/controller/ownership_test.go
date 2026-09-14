package controller

import (
	"errors"
	"os"
	"strings"
	"testing"
)

func TestFeedTransportIsCapabilityOwned(t *testing.T) {
	for _, legacy := range []string{
		"../../controller/feed_controller.go",
		"../../controller/feed_controller_test.go",
	} {
		if _, err := os.Stat(legacy); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("legacy flat Feed transport still exists at %s: %v", legacy, err)
		}
	}

	routerSource, err := os.ReadFile("../../../router/web.go")
	if err != nil {
		t.Fatal(err)
	}
	router := string(routerSource)
	if !strings.Contains(router, "feedcontroller.NewFeedController(") {
		t.Fatal("router does not construct the capability-owned Feed controller")
	}
	if strings.Contains(router, "\tfeedCtrl := controller.NewFeedController(") {
		t.Fatal("router still constructs Feed transport from the flat controller package")
	}
	for _, route := range []string{"/feed.xml", "/rss", "/sitemap.xml"} {
		if !strings.Contains(router, route) {
			t.Fatalf("Feed route %s was lost during ownership migration", route)
		}
	}
}
