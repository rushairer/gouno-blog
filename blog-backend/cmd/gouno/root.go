package gouno

import (
	"log"
	"os"

	"github.com/rushairer/gouno/generator"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "gouno",
	Short: "gouno-blog is a modern headless CMS and blogging platform backend",
	Long:  `gouno-blog is a modern headless CMS and blogging platform backend powered by gouno framework and Gosso authentication.`,
	CompletionOptions: cobra.CompletionOptions{
		DisableDefaultCmd: true,
	},
}

func init() {
	rootCmd.AddCommand(newIdentityBackfillCommand(), webCmd, ownerRecoverCmd, identityAliasApproveCmd, bffKeygenCmd)
}

func Execute() {
	if _, err := generator.AttachProjectCommand(rootCmd, ""); err != nil {
		log.Fatalf("load project commands: %v", err)
	}
	if err := rootCmd.Execute(); err != nil {
		log.Fatalf("Error executing root command: %v", err)
		os.Exit(1)
	}
}
