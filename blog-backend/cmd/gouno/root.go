package gouno

import (
	"log"
	"os"

	"github.com/rushairer/gouno/generator"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "gouno",
	Short: "gouno is a tool to generate go code",
	Long: `gouno is a tool to generate go code.
It can generate go code from proto file.`,
	CompletionOptions: cobra.CompletionOptions{
		DisableDefaultCmd: true,
	},
}

func init() {
	rootCmd.AddCommand(generator.GeneratorCmd, webCmd)
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		log.Fatalf("Error executing root command: %v", err)
		os.Exit(1)
	}
}
