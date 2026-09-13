package repository

import (
	"context"
	"database/sql"

	"github.com/rushairer/blog-backend/internal/workflow/readmodel"
)

type MetricsRepository struct {
	db *sql.DB
}

func NewMetricsRepository(db *sql.DB) *MetricsRepository {
	if db == nil {
		panic("workflow repository.NewMetricsRepository: db is required")
	}
	return &MetricsRepository{db: db}
}

func (r *MetricsRepository) ListWorkflowMetrics(ctx context.Context) ([]readmodel.Metric, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT w.id, w.name, COUNT(r.id),
		COUNT(r.id) FILTER (WHERE r.status='failed'),
		COALESCE(SUM(r.input_tokens+r.output_tokens),0)
		FROM ai_workflows w LEFT JOIN ai_workflow_runs r ON r.workflow_id=w.id
		WHERE w.deleted_at IS NULL GROUP BY w.id, w.name ORDER BY w.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]readmodel.Metric, 0)
	for rows.Next() {
		var item readmodel.Metric
		if err := rows.Scan(&item.WorkflowID, &item.Name, &item.Runs, &item.Failures, &item.Tokens); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
