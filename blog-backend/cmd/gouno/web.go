package gouno

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	gounoMiddleware "github.com/rushairer/gouno/middleware"
	"github.com/spf13/cobra"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"github.com/rushairer/blog-backend/config"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/blog-backend/router"
	"github.com/rushairer/blog-backend/utility"
)

var webCmd = &cobra.Command{
	Use: "web",
	Run: startWebServer,
}

func init() {
	webCmd.Flags().StringP("config_path", "c", "./config", "config file path")
	webCmd.Flags().StringP("address", "a", "0.0.0.0", "address to listen on")
	webCmd.Flags().StringP("port", "p", "8080", "port to listen on")
	webCmd.Flags().BoolP("debug", "d", false, "debug mode")
	webCmd.Flags().StringP("env", "e", "production", "env: development, test, production")
}

func startWebServer(cmd *cobra.Command, args []string) {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	configPath := cmd.Flag("config_path").Value.String()
	env := cmd.Flag("env").Value.String()

	configManager, err := config.NewConfigManager(cmd, configPath, env)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	globalConfig := configManager.Config()

	if globalConfig.WebServerConfig.Debug {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	loggerLevel := zap.NewAtomicLevelAt(zapcore.Level(globalConfig.LogConfig.Level))
	logger := utility.NewLogger(loggerLevel)

	logger.Sugar().Info("starting web server...")

	// init db
	dbConfig := globalConfig.DatabaseConfig.GetDefaultDriver()
	if dbConfig == nil {
		log.Fatalf("default database driver not found")
	}

	db, err := sql.Open(dbConfig.Driver, dbConfig.DSN)
	if err != nil {
		log.Fatalf("open database connection: %v", err)
	}
	defer db.Close()

	// Wait for db to be ready in Docker container
	for i := 0; i < 10; i++ {
		err = db.Ping()
		if err == nil {
			break
		}
		logger.Sugar().Warnf("database not ready, retrying in 2s... (error: %v)", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("ping database: %v", err)
	}

	bootstrapDatabase(db, dbConfig.DSN, logger)

	jwksURL := os.Getenv("SSO_JWKS_URL")
	if jwksURL == "" {
		jwksURL = "http://localhost:8080/.well-known/jwks.json"
	}

	engine := gin.New()
	engine.Use(
		gin.Logger(),
		middleware.RecoveryMiddleware(),
		middleware.SecurityHeadersMiddleware(!globalConfig.WebServerConfig.Debug),
		middleware.TimeoutMiddleware(globalConfig.WebServerConfig.RequestTimeout),
		gounoMiddleware.RateLimitMiddleware(ctx, globalConfig.WebServerConfig.RateLimitPerMinute, time.Minute),
	)
	router.RegisterWebRouter(engine, db, jwksURL)

	httpServer := &http.Server{
		Addr:              fmt.Sprintf("%s:%s", globalConfig.WebServerConfig.Address, globalConfig.WebServerConfig.Port),
		IdleTimeout:       globalConfig.WebServerConfig.IdleTimeout,
		WriteTimeout:      globalConfig.WebServerConfig.WriteTimeout,
		ReadTimeout:       globalConfig.WebServerConfig.ReadTimeout,
		ReadHeaderTimeout: globalConfig.WebServerConfig.ReadHeaderTimeout,
		Handler:           engine,
	}

	logger.Sugar().Infof("web server listening on %s", httpServer.Addr)
	logger.Sugar().Info("press Ctrl+C to exit")

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	<-ctx.Done()

	// Restore default behavior on the interrupt signal and notify user of shutdown.
	stop()
	logger.Sugar().Info("shutting down gracefully, press Ctrl+C again to force")

	// The context is used to inform the server it has 5 seconds to finish
	// the request it is currently handling
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}

	// Close

	logger.Sugar().Info("server exiting")
}
