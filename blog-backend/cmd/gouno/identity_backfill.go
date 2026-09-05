package gouno

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/rushairer/blog-backend/config"
	"github.com/rushairer/blog-backend/internal/identitybackfill"
	"github.com/spf13/cobra"
)

func newIdentityBackfillCommand() *cobra.Command {
	parent := &cobra.Command{Use: "identity-backfill", Short: "inspect and approve exact historical identity mappings"}
	parent.PersistentFlags().StringP("config_path", "c", "./config", "config file path")
	parent.PersistentFlags().String("env", "production", "environment")
	withDB := func(cmd *cobra.Command, fn func(context.Context, *sql.DB) error) error {
		path, _ := cmd.Flags().GetString("config_path")
		env, _ := cmd.Flags().GetString("env")
		manager, err := config.NewConfigManager(cmd, path, env)
		if err != nil {
			return err
		}
		driver := manager.Config().DatabaseConfig.GetDefaultDriver()
		if driver == nil {
			return fmt.Errorf("default database driver not configured")
		}
		db, err := sql.Open(driver.Driver, driver.DSN)
		if err != nil {
			return err
		}
		defer db.Close()
		ctx, cancel := context.WithTimeout(cmd.Context(), 30*time.Second)
		defer cancel()
		return fn(ctx, db)
	}
	report := &cobra.Command{Use: "report", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		return withDB(cmd, func(ctx context.Context, db *sql.DB) error {
			items, err := identitybackfill.Report(ctx, db)
			if err != nil {
				return err
			}
			return json.NewEncoder(cmd.OutOrStdout()).Encode(items)
		})
	}}
	approve := &cobra.Command{Use: "approve", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		confirmed, _ := cmd.Flags().GetBool("confirm")
		if !confirmed {
			return fmt.Errorf("explicit --confirm is required")
		}
		path, _ := cmd.Flags().GetString("file")
		operator, _ := cmd.Flags().GetString("approved-by")
		reason, _ := cmd.Flags().GetString("reason")
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		stat, err := file.Stat()
		if err != nil {
			return err
		}
		if stat.Size() > 1024*1024 {
			return fmt.Errorf("mapping file exceeds 1 MiB")
		}
		decoder := json.NewDecoder(io.LimitReader(file, 1024*1024+1))
		decoder.DisallowUnknownFields()
		var mappings []identitybackfill.Mapping
		if err = decoder.Decode(&mappings); err != nil {
			return fmt.Errorf("invalid mapping JSON")
		}
		if err = decoder.Decode(new(any)); err != io.EOF {
			return fmt.Errorf("mapping file must contain one JSON array")
		}
		return withDB(cmd, func(ctx context.Context, db *sql.DB) error {
			if err := identitybackfill.Approve(ctx, db, mappings, operator, reason); err != nil {
				return err
			}
			cmd.Printf("Recorded %d identity mapping approvals; source rows and roles unchanged.\n", len(mappings))
			return nil
		})
	}}
	for _, name := range []string{"file", "approved-by", "reason"} {
		approve.Flags().String(name, "", name)
		_ = approve.MarkFlagRequired(name)
	}
	approve.Flags().Bool("confirm", false, "confirm externally verified row mappings")
	parent.AddCommand(report, approve)
	return parent
}
