package gouno

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"github.com/rushairer/blog-backend/config"
	"github.com/rushairer/blog-backend/internal/access"
	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/authbff"
	"github.com/rushairer/blog-backend/internal/connector"
	"github.com/rushairer/blog-backend/internal/controller"
	"github.com/rushairer/blog-backend/internal/knowledge"
	"github.com/rushairer/blog-backend/internal/media"
	"github.com/rushairer/blog-backend/internal/operations"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/secretbox"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/internal/tool"
	workflowservice "github.com/rushairer/blog-backend/internal/workflow"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/blog-backend/router"
	"github.com/rushairer/blog-backend/utility"
	gounoAuth "github.com/rushairer/gouno/auth"
	gounoMiddleware "github.com/rushairer/gouno/middleware"
	"github.com/spf13/cobra"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var webCmd = &cobra.Command{
	Use: "web",
	Run: startWebServer,
}

const (
	aiTextRequestTimeout  = 120 * time.Second
	aiImageRequestTimeout = 300 * time.Second
)

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
	for _, secretEnv := range [][2]string{{"GOUNO_AI_WEBHOOK_SECRET", "GOUNO_AI_WEBHOOK_SECRET_FILE"}} {
		if err := loadSecretFileIntoEnv(secretEnv[0], secretEnv[1]); err != nil {
			log.Fatalf("load %s: %v", secretEnv[0], err)
		}
	}

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

	bootstrapDatabase(db, logger)
	jwksURL := os.Getenv("SSO_JWKS_URL")
	if jwksURL == "" {
		if issuer := strings.TrimRight(os.Getenv("SSO_TOKEN_ISSUER"), "/"); issuer != "" {
			jwksURL = issuer + "/.well-known/jwks.json"
		} else {
			jwksURL = "http://localhost:8088/.well-known/jwks.json"
		}
	}
	authOptions := middleware.AuthOptions{
		Issuer:   os.Getenv("SSO_TOKEN_ISSUER"),
		Audience: os.Getenv("SSO_TOKEN_AUDIENCE"),
		ClientID: os.Getenv("SSO_CLIENT_ID"),
	}

	engine := gin.New()
	if err := engine.SetTrustedProxies(globalConfig.WebServerConfig.TrustedProxies); err != nil {
		log.Fatalf("invalid trusted proxies configuration: %v", err)
	}
	engine.Use(
		gin.LoggerWithFormatter(middleware.SafeAccessLogFormatter),
		func(ctx *gin.Context) {
			ctx.Set("logger", logger)
			ctx.Next()
		},
		middleware.RecoveryMiddleware(),
		middleware.SecurityHeadersMiddleware(!globalConfig.WebServerConfig.Debug),
		middleware.TimeoutMiddlewareWithOverrides(globalConfig.WebServerConfig.RequestTimeout, map[string]time.Duration{
			"/api/admin/provider-profiles/:id/test": aiTextRequestTimeout,
			"/api/admin/ai-workflows/draft":         aiTextRequestTimeout,
			"/api/admin/ai-draft-assist":            aiTextRequestTimeout,
			"/api/admin/ai-generate-image":          aiImageRequestTimeout,
			"/api/admin/ai-index/evaluate":          aiTextRequestTimeout,
			"/api/admin/ai-index/rebuild":           aiTextRequestTimeout,
		}),
		gounoMiddleware.RateLimitMiddleware(ctx, globalConfig.WebServerConfig.RateLimitPerMinute, time.Minute),
	)
	newApplication(ctx, applicationConfig{
		Global: globalConfig, Env: env, DB: db, Engine: engine, Logger: logger,
		JWKSURL: jwksURL, AuthOptions: authOptions,
	})

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

type applicationConfig struct {
	Global      config.GoUnoConfig
	Env         string
	DB          *sql.DB
	Engine      *gin.Engine
	Logger      *zap.Logger
	JWKSURL     string
	AuthOptions middleware.AuthOptions
}

// newApplication is the sole composition root for repositories, services,
// workers, controllers and router dependencies.
func newApplication(ctx context.Context, cfg applicationConfig) {
	visitorSecret := readSecretFromFileOrEnv(os.Getenv("BLOG_VISITOR_SECRET_FILE"), os.Getenv("BLOG_VISITOR_SECRET"))
	if cfg.Env == "production" && visitorSecret == "" {
		log.Fatal("BLOG_VISITOR_SECRET is required in production")
	}
	if cfg.Env == "production" && cfg.Global.AIAgentConfig.Enabled && !controller.ValidWebhookSecret(os.Getenv("GOUNO_AI_WEBHOOK_SECRET")) {
		log.Fatal("GOUNO_AI_WEBHOOK_SECRET must be at least 32 characters in production when AI Agents are enabled")
	}
	mediaDir := os.Getenv("BLOG_MEDIA_DIR")
	if mediaDir == "" {
		mediaDir = "./data/media"
	}
	if err := configureMediaS3Credentials(cfg.Env); err != nil {
		log.Fatalf("configure S3 media credentials: %v", err)
	}
	mediaStore, err := media.FromEnvironment(ctx, mediaDir)
	if err != nil {
		log.Fatalf("configure media storage: %v", err)
	}

	var bffClient *authbff.Client
	if enabled, parseErr := strconv.ParseBool(os.Getenv("BLOG_BFF_ENABLED")); parseErr == nil && enabled {
		redisOptions, parseErr := redis.ParseURL(cfg.Global.RedisConfig.DSN)
		if parseErr != nil {
			log.Fatalf("configure Blog BFF Redis: %v", parseErr)
		}
		redisClient := redis.NewClient(redisOptions)
		if parseErr = redisClient.Ping(ctx).Err(); parseErr != nil {
			log.Fatalf("connect Blog BFF Redis: %v", parseErr)
		}
		primitive, parseErr := authbff.LoadAEAD(os.Getenv("BLOG_BFF_TINK_KEYSET_PATH"))
		if parseErr != nil {
			log.Fatalf("load Blog BFF Tink keyset: %v", parseErr)
		}
		clientSecret := readSecretFromFileOrEnv(os.Getenv("BLOG_OIDC_CLIENT_SECRET_FILE"), os.Getenv("BLOG_OIDC_CLIENT_SECRET"))
		bffConfig := authbff.Config{
			Issuer: os.Getenv("BLOG_OIDC_ISSUER"), ClientID: os.Getenv("BLOG_OIDC_CLIENT_ID"),
			ClientSecret: clientSecret, RedirectURL: os.Getenv("BLOG_OIDC_REDIRECT_URL"),
			PostLogoutURL: os.Getenv("BLOG_OIDC_POST_LOGOUT_URL"), Resource: os.Getenv("BLOG_OIDC_RESOURCE"),
			Scopes: strings.Fields(os.Getenv("BLOG_OIDC_SCOPES")), TinkKeysetPath: os.Getenv("BLOG_BFF_TINK_KEYSET_PATH"),
		}
		store, storeErr := authbff.NewStore(redisClient, primitive, "blog:auth:v1")
		if storeErr != nil {
			log.Fatalf("configure Blog BFF store: %v", storeErr)
		}
		bffClient, parseErr = authbff.NewClient(ctx, bffConfig, store, nil)
		if parseErr != nil {
			log.Fatalf("configure Blog BFF OIDC client: %v", parseErr)
		}
	} else {
		if parseErr != nil && os.Getenv("BLOG_BFF_ENABLED") != "" {
			log.Fatalf("BLOG_BFF_ENABLED must be a boolean: %v", parseErr)
		}
		if cfg.Env == "production" {
			log.Fatal("BLOG_BFF_ENABLED must be true in production")
		}
	}

	transactor := repository.NewTransactor(cfg.DB, cfg.Logger)
	postRepo := repository.NewPostRepository(cfg.DB)
	postSvc := service.NewPostService(postRepo)
	pageSvc := service.NewPageService(repository.NewPageRepository(cfg.DB))
	catSvc := service.NewCategoryService(repository.NewCategoryRepository(cfg.DB))
	communitySvc := service.NewCommunityService(repository.NewCommunityRepository(cfg.DB), postRepo)
	growthSvc := service.NewGrowthService(repository.NewGrowthRepository(cfg.DB))
	service.StartScheduledPublisher(ctx, postSvc, cfg.Logger)

	var agentCtrl *controller.AgentController
	if cfg.Global.AIAgentConfig.Enabled {
		secrets, err := secretbox.NewKeyring(
			readSecretFromFileOrEnv(os.Getenv("BLOG_AGENT_MASTER_KEY_FILE"), os.Getenv("BLOG_AGENT_MASTER_KEY")),
			os.Getenv("BLOG_AGENT_MASTER_KEY_VERSION"),
			readOptionalSecretFromFileOrEnv(os.Getenv("BLOG_AGENT_PREVIOUS_MASTER_KEYS_FILE"), os.Getenv("BLOG_AGENT_PREVIOUS_MASTER_KEYS")),
		)
		if err != nil {
			log.Fatalf("configure AI Agent secret encryption: %v", err)
		}
		agentRepo := repository.NewAgentRepository(cfg.DB)
		knowledgeSvc := knowledge.NewService(cfg.DB, secrets, cfg.Global.AIAgentConfig.AllowedHosts, cfg.Logger, transactor)
		knowledgeSvc.Start(ctx)
		toolRegistry := tool.NewBlogRegistry(postSvc, communitySvc, growthSvc, pageSvc, knowledgeSvc)
		operationsSvc := operations.NewService(cfg.DB, toolRegistry, cfg.Logger, transactor)
		operationsSvc.ConfigureGovernance(agentRepo, postSvc)
		if err := operationsSvc.RegisterTools(); err != nil {
			log.Fatalf("register AI operations tools: %v", err)
		}
		operationsSvc.Start(ctx)
		management := agentservice.NewManagementService(
			agentRepo, secrets, cfg.Global.AIAgentConfig.AllowedHosts,
			toolRegistry.AgentNames(), toolRegistry.ProposalNames(),
		)
		if created, err := management.BootstrapStarterPack(ctx); err != nil {
			log.Fatalf("reconcile AI workspace starter pack: %v", err)
		} else if created > 0 {
			cfg.Logger.Info("Reconciled AI workspace starter Agents", zap.Int("created", created))
		}
		runner := agentservice.NewRunner(agentRepo, management, toolRegistry, postSvc)
		generation := agentservice.NewGenerationService(agentRepo, management, growthSvc, mediaStore)
		approvals := agentservice.NewApprovalService(agentRepo, postSvc, management, growthSvc, mediaStore, pageSvc)
		approvals.SetGenerationService(generation)
		workflowSvc := workflowservice.NewService(cfg.DB, runner, management, toolRegistry, transactor)
		workflowSvc.StartScheduler(ctx, cfg.Global.AIAgentConfig.SchedulerInterval)
		connectorSvc := connector.NewService(cfg.DB, secrets, transactor, os.Getenv("BLOG_CONNECTOR_OAUTH_REDIRECT_URL"))
		agentCtrl = controller.NewAgentControllerWithOptions(controller.AgentControllerOptions{
			Management: management, Runner: runner, Approvals: approvals, Tools: toolRegistry,
			WorkerCtx: ctx, Knowledge: knowledgeSvc, Workflows: workflowSvc, Operations: operationsSvc,
			Connectors: connectorSvc, Generation: generation,
		})
		agentservice.NewScheduler(agentRepo, runner, cfg.Global.AIAgentConfig.SchedulerInterval, cfg.Logger).Start(ctx)
	}

	verifier := gounoAuth.NewVerifier(cfg.JWKSURL)
	accessService := access.NewService(cfg.DB, access.Bootstrap{
		Issuer: os.Getenv("BLOG_BOOTSTRAP_OWNER_ISSUER"), Subject: os.Getenv("BLOG_BOOTSTRAP_OWNER_SUBJECT"),
	})
	router.RegisterWebRouterWithOptions(cfg.Engine, router.WebRouterOptions{
		DB: cfg.DB, AuthOptions: cfg.AuthOptions, RedisDSN: cfg.Global.RedisConfig.DSN,
		VisitorSecret: visitorSecret, MediaDir: mediaDir, MediaStore: mediaStore,
		CORSAllowedOrigins: cfg.Global.WebServerConfig.CORSAllowedOrigins,
		PostSvc:            postSvc, PageSvc: pageSvc, CategorySvc: catSvc, CommunitySvc: communitySvc,
		GrowthSvc: growthSvc, AgentCtrl: agentCtrl, Logger: cfg.Logger, Verifier: verifier,
		AccessService: accessService, SecureCookies: cfg.Global.WebServerConfig.ResolveSecureCookies(cfg.Env),
		BFFClient: bffClient,
	})
}

// configureMediaS3Credentials loads optional local-development credentials from
// files, while production accepts S3 static credentials exclusively from
// Docker Secret files. The AWS SDK reads the resulting standard variables.
func configureMediaS3Credentials(env string) error {
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("BLOG_MEDIA_STORAGE")), "s3") {
		return nil
	}
	for _, secret := range [][2]string{
		{"AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID_FILE"},
		{"AWS_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY_FILE"},
	} {
		valueName, fileName := secret[0], secret[1]
		path := strings.TrimSpace(os.Getenv(fileName))
		if env == "production" && strings.TrimSpace(os.Getenv(valueName)) != "" {
			return fmt.Errorf("%s must not be supplied through the environment in production", valueName)
		}
		if env == "production" && path == "" {
			return fmt.Errorf("%s is required when BLOG_MEDIA_STORAGE=s3 in production", fileName)
		}
		if path == "" {
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", fileName, err)
		}
		value := strings.TrimSpace(string(data))
		if value == "" {
			return fmt.Errorf("%s is empty", fileName)
		}
		if err := os.Setenv(valueName, value); err != nil {
			return fmt.Errorf("set %s: %w", valueName, err)
		}
	}
	return nil
}

func readSecretFromFileOrEnv(filePath, envVal string) string {
	if filePath == "" {
		return envVal
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		log.Fatalf("read configured secret file %q: %v", filePath, err)
	}
	value := strings.TrimSpace(string(data))
	if value == "" {
		log.Fatalf("configured secret file %q is empty", filePath)
	}
	return value
}

// readOptionalSecretFromFileOrEnv has the same fail-closed file semantics as
// readSecretFromFileOrEnv, but allows an intentionally empty value for optional
// historical encryption keys.
func readOptionalSecretFromFileOrEnv(filePath, envVal string) string {
	if filePath == "" {
		return envVal
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		log.Fatalf("read configured secret file %q: %v", filePath, err)
	}
	return strings.TrimSpace(string(data))
}

func loadSecretFileIntoEnv(valueName, fileName string) error {
	path := strings.TrimSpace(os.Getenv(fileName))
	if path == "" {
		return nil
	}
	value := readSecretFromFileOrEnv(path, "")
	if value == "" {
		return fmt.Errorf("%s is unreadable or empty", fileName)
	}
	return os.Setenv(valueName, value)
}
