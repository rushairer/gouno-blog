package tests

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"runtime"

	_ "github.com/lib/pq"

	"github.com/rushairer/blog-backend/config"
)

func NewTestDB() *sql.DB {
	configManager := NewTestConfigManager()

	dsn := configManager.Config().DatabaseConfig.GetDefaultDriver().DSN

	if postgres, err := sql.Open("postgres", dsn); err == nil {
		if err = postgres.Ping(); err == nil {
			return postgres
		} else {
			log.Panic(err)
			return nil
		}
	} else {
		log.Panic(err)
		return nil
	}
}

func NewTestConfigManager() (configManager *config.ConfigManager) {
	projectRoot := projectRoot()
	configPath := filepath.Join(projectRoot, "config")
	configManager, err := config.NewConfigManager(nil, configPath, "test")
	if err != nil {
		log.Panic(err)
	}
	return
}

func projectRoot() string {
	_, b, _, _ := runtime.Caller(0)
	// This will be the directory of the current file (test_engine.go)
	currentDir := filepath.Dir(b)

	// Traverse up the directory tree to find go.mod
	for {
		goModPath := filepath.Join(currentDir, "go.mod")
		if _, err := os.Stat(goModPath); err == nil {
			return currentDir
		}
		parentDir := filepath.Dir(currentDir)
		if parentDir == currentDir { // Reached file system root
			log.Fatalf("go.mod not found in any parent directory")
		}
		currentDir = parentDir
	}
}
