package gouno

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/tink-crypto/tink-go/v2/aead"
	"github.com/tink-crypto/tink-go/v2/insecurecleartextkeyset"
	"github.com/tink-crypto/tink-go/v2/keyset"
)

var bffKeygenCmd = &cobra.Command{
	Use:   "bff-keygen",
	Short: "generate a Google Tink AEAD keyset for encrypted BFF session records",
	RunE: func(cmd *cobra.Command, _ []string) error {
		output, _ := cmd.Flags().GetString("out")
		if err := writeBFFKeyset(output); err != nil {
			return err
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "Generated BFF keyset at %s\n", output)
		return err
	},
}

func init() {
	bffKeygenCmd.Flags().String("out", "", "new keyset output path (must not already exist)")
	_ = bffKeygenCmd.MarkFlagRequired("out")
}

func writeBFFKeyset(path string) error {
	if path == "" || filepath.Clean(path) == "." {
		return errors.New("BFF keyset output path is required")
	}
	handle, err := keyset.NewHandle(aead.AES256GCMKeyTemplate())
	if err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	writeErr := insecurecleartextkeyset.Write(handle, keyset.NewJSONWriter(file))
	closeErr := file.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}
