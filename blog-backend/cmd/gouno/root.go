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
	rootCmd.AddCommand(generator.GeneratorCmd, webCmd, ownerRecoverCmd, identityAliasApproveCmd, bffKeygenCmd)
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		log.Fatalf("Error executing root command: %v", err)
		os.Exit(1)
	}
}
