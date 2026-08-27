package gouno

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/config"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/spf13/cobra"
)

// owner-recover is intentionally a local, one-shot recovery path. It has no
// HTTP equivalent: operators must explicitly name the immutable SSO subject,
// explain the recovery, and confirm the operation at the command line.
var ownerRecoverCmd = &cobra.Command{
	Use:   "owner-recover",
	Short: "recover a missing Blog owner through local operations",
	RunE: func(cmd *cobra.Command, _ []string) error {
		confirmed, _ := cmd.Flags().GetBool("confirm")
		issuer, _ := cmd.Flags().GetString("issuer")
		subject, _ := cmd.Flags().GetString("subject")
		reason, _ := cmd.Flags().GetString("reason")
		configPath, _ := cmd.Flags().GetString("config_path")
		env, _ := cmd.Flags().GetString("env")
		if !confirmed {
			return fmt.Errorf("refusing owner recovery without --confirm")
		}
		manager, err := config.NewConfigManager(cmd, configPath, env)
		if err != nil {
			return fmt.Errorf("load config: %w", err)
		}
		dbConfig := manager.Config().DatabaseConfig.GetDefaultDriver()
		if dbConfig == nil {
			return fmt.Errorf("default database driver not configured")
		}
		db, err := sql.Open(dbConfig.Driver, dbConfig.DSN)
		if err != nil {
			return fmt.Errorf("open database: %w", err)
		}
		defer db.Close()
		ctx, cancel := context.WithTimeout(cmd.Context(), 15*time.Second)
		defer cancel()
		if err = db.PingContext(ctx); err != nil {
			return fmt.Errorf("connect database: %w", err)
		}
		if err = access.NewService(db, access.Bootstrap{}).RecoverOwner(ctx, issuer, subject, reason); err != nil {
			return fmt.Errorf("recover owner: %w", err)
		}
		cmd.Println("Blog owner recovered and authorization audit recorded.")
		return nil
	},
}

func init() {
	ownerRecoverCmd.Flags().String("issuer", "", "exact verified SSO issuer")
	ownerRecoverCmd.Flags().String("subject", "", "exact verified SSO subject")
	ownerRecoverCmd.Flags().String("reason", "", "operator recovery reason")
	ownerRecoverCmd.Flags().StringP("config_path", "c", "./config", "config file path")
	ownerRecoverCmd.Flags().String("env", "production", "environment")
	ownerRecoverCmd.Flags().Bool("confirm", false, "confirm this local recovery operation")
	_ = ownerRecoverCmd.MarkFlagRequired("issuer")
	_ = ownerRecoverCmd.MarkFlagRequired("subject")
	_ = ownerRecoverCmd.MarkFlagRequired("reason")
}
