// Package identitybackfill records operator-attested row mappings. It never
// creates identities, aliases, memberships or roles, nor rewrites source rows.
package identitybackfill

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/lib/pq"
)

type Mapping struct {
	SourceTable       string          `json:"source_table"`
	RowID             int64           `json:"row_id"`
	SourceColumn      string          `json:"source_column"`
	OriginalValue     json.RawMessage `json:"original_value"`
	Issuer            string          `json:"issuer"`
	Subject           string          `json:"subject"`
	EvidenceReference string          `json:"evidence_reference"`
}

type Finding struct {
	SourceTable   string          `json:"source_table"`
	RowID         int64           `json:"row_id"`
	SourceColumn  string          `json:"source_column"`
	OriginalValue json.RawMessage `json:"original_value,omitempty"`
	Reason        string          `json:"reason"`
}

func Report(ctx context.Context, db *sql.DB) ([]Finding, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT * FROM blog_identity_pending() ORDER BY source_table,row_id`)
	if err != nil {
		return nil, fmt.Errorf("report unavailable; run migrations to the preparation stage: %w", err)
	}
	items := []Finding{}
	for rows.Next() {
		var item Finding
		if err = rows.Scan(&item.SourceTable, &item.RowID, &item.SourceColumn, &item.OriginalValue, &item.Reason); err != nil {
			rows.Close()
			return nil, err
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	// Old cutovers already discarded source text. Report, but never infer a
	// replacement identity from the principal that the old migration assigned.
	fields, err := tx.QueryContext(ctx, `SELECT tbl,src,dst FROM blog_identity_fields()`)
	if err != nil {
		return nil, err
	}
	type field struct{ table, source, target string }
	var registry []field
	for fields.Next() {
		var f field
		if err = fields.Scan(&f.table, &f.source, &f.target); err != nil {
			fields.Close()
			return nil, err
		}
		registry = append(registry, f)
	}
	err = fields.Err()
	fields.Close()
	if err != nil {
		return nil, err
	}
	for _, f := range registry {
		rows, err = tx.QueryContext(ctx, `SELECT id FROM `+pq.QuoteIdentifier(f.table)+` t
   WHERE to_jsonb(t)->>$1 IS NOT NULL AND (
    to_jsonb(t)->>'creation_origin'='legacy' OR
    EXISTS (SELECT 1 FROM blog_identity_legacy_attributions e WHERE e.source_table=$3 AND e.row_id=t.id AND e.source_column=$2)) ORDER BY id`, f.target, f.source, f.table)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			if err = rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			items = append(items, Finding{SourceTable: f.table, RowID: id, SourceColumn: f.target, Reason: "legacy attribution retained; external evidence required before any correction"})
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}

	return items, tx.Commit()
}

func Approve(ctx context.Context, db *sql.DB, mappings []Mapping, approvedBy, reason string) error {
	if strings.TrimSpace(approvedBy) == "" || strings.TrimSpace(reason) == "" || len(mappings) == 0 || len(mappings) > 1000 {
		return fmt.Errorf("approval requires operator, reason and 1..1000 mappings")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, m := range mappings {
		if m.RowID <= 0 || !json.Valid(m.OriginalValue) || strings.TrimSpace(m.Issuer) == "" || strings.TrimSpace(m.Subject) == "" || strings.TrimSpace(m.EvidenceReference) == "" {
			return fmt.Errorf("invalid mapping metadata")
		}
		var target, required string
		if err = tx.QueryRowContext(ctx, `SELECT dst,required FROM blog_identity_fields() WHERE tbl=$1 AND src=$2`, m.SourceTable, m.SourceColumn).Scan(&target, &required); err != nil {
			return fmt.Errorf("source table/field is not allowed")
		}
		// Lock the actual row, compare JSON null separately from an empty string,
		// and refuse absent columns or already attributed records.
		var matches, exists, needed bool
		var current sql.NullInt64
		query := `SELECT to_jsonb(t) ? $2, COALESCE(to_jsonb(t)->$2,'null'::jsonb)=$3::jsonb,
		(j->>$4)::bigint, (` + required + `) FROM ` + pq.QuoteIdentifier(m.SourceTable) + ` t CROSS JOIN LATERAL (SELECT to_jsonb(t) j) x WHERE id=$1 FOR UPDATE OF t`
		if err = tx.QueryRowContext(ctx, query, m.RowID, m.SourceColumn, string(m.OriginalValue), target).Scan(&exists, &matches, &current, &needed); err != nil || !exists || !matches {
			return fmt.Errorf("source row missing or original value changed: %s/%d/%s", m.SourceTable, m.RowID, m.SourceColumn)
		}
		if current.Valid {
			return fmt.Errorf("source already has a principal: %s/%d", m.SourceTable, m.RowID)
		}
		if !needed {
			return fmt.Errorf("source does not require a human identity: %s/%d", m.SourceTable, m.RowID)
		}
		var principal int64
		if err = tx.QueryRowContext(ctx, `SELECT principal_id FROM blog_principal_identities WHERE issuer=$1 AND subject=$2 FOR SHARE`, m.Issuer, m.Subject).Scan(&principal); err != nil {
			return fmt.Errorf("exact target identity does not exist")
		}
		result, err := tx.ExecContext(ctx, `INSERT INTO blog_identity_backfill_approvals
		(source_table,row_id,source_column,original_value,issuer,subject,principal_id,approved_by,reason,evidence_reference)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`, m.SourceTable, m.RowID, m.SourceColumn, string(m.OriginalValue), m.Issuer, m.Subject, principal, approvedBy, reason, m.EvidenceReference)
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n == 0 {
			var same bool
			err = tx.QueryRowContext(ctx, `SELECT original_value=$4::jsonb AND issuer=$5 AND subject=$6 AND principal_id=$7 AND approved_by=$8 AND reason=$9 AND evidence_reference=$10
			FROM blog_identity_backfill_approvals WHERE source_table=$1 AND row_id=$2 AND source_column=$3 AND original_value=$4::jsonb`, m.SourceTable, m.RowID, m.SourceColumn, string(m.OriginalValue), m.Issuer, m.Subject, principal, approvedBy, reason, m.EvidenceReference).Scan(&same)
			if err != nil || !same {
				return fmt.Errorf("conflicting prior approval: %s/%d/%s", m.SourceTable, m.RowID, m.SourceColumn)
			}
		}
	}
	return tx.Commit()
}
