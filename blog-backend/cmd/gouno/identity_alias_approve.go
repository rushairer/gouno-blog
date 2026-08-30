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

// identity-alias-approve is deliberately local and explicit. Operators must
// verify a one-to-one GOSSO account mapping outside the Blog database before
// creating a cross-issuer identity alias.
var identityAliasApproveCmd = &cobra.Command{
	Use:   "identity-alias-approve",
	Short: "record an explicit, audited cross-issuer Blog identity alias",
	RunE: func(cmd *cobra.Command, _ []string) error {
		confirmed, _ := cmd.Flags().GetBool("confirm")
		if !confirmed {
			return fmt.Errorf("refusing identity alias approval without --confirm")
		}
		configPath, _ := cmd.Flags().GetString("config_path")
		env, _ := cmd.Flags().GetString("env")
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
		approval := access.IdentityAliasApproval{}
		approval.LegacyIssuer, _ = cmd.Flags().GetString("legacy-issuer")
		approval.LegacySubject, _ = cmd.Flags().GetString("legacy-subject")
		approval.NewIssuer, _ = cmd.Flags().GetString("new-issuer")
		approval.NewSubject, _ = cmd.Flags().GetString("new-subject")
		approval.ApprovedBy, _ = cmd.Flags().GetString("approved-by")
		approval.EvidenceReference, _ = cmd.Flags().GetString("evidence-reference")
		if err = access.NewService(db, access.Bootstrap{}).ApproveIdentityAlias(ctx, approval); err != nil {
			return fmt.Errorf("approve identity alias: %w", err)
		}
		cmd.Println("Blog identity alias approved and audit recorded.")
		return nil
	},
}

func init() {
	for _, name := range []string{"legacy-issuer", "legacy-subject", "new-issuer", "new-subject", "approved-by", "evidence-reference"} {
		identityAliasApproveCmd.Flags().String(name, "", name)
		_ = identityAliasApproveCmd.MarkFlagRequired(name)
	}
	identityAliasApproveCmd.Flags().StringP("config_path", "c", "./config", "config file path")
	identityAliasApproveCmd.Flags().String("env", "production", "environment")
	identityAliasApproveCmd.Flags().Bool("confirm", false, "confirm the externally verified mapping")
}
