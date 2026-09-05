package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/rushairer/blog-backend/internal/domain"
)

type providerStarterWorkflow struct {
	key, name, description, cron, agentKey string
	inputSchema, scopePolicy               json.RawMessage
	steps                                  func(int64) []domain.WorkflowStep
}

func modelResultSteps(agentID int64, approval bool) []domain.WorkflowStep {
	steps := []domain.WorkflowStep{{ID: "agent", Type: "model", AgentID: agentID}}
	if approval {
		steps = append(steps, domain.WorkflowStep{ID: "approval", Type: "approval_gate"})
	}
	return append(steps, domain.WorkflowStep{ID: "result", Type: "output", OutputPointer: "/steps/agent"})
}

func batchSteps(collection string, maxItems int, agentID int64, approval bool) []domain.WorkflowStep {
	steps := []domain.WorkflowStep{{
		ID: "batch", Type: "for_each", CollectionPointer: collection, MaxItems: maxItems,
		Steps: []domain.WorkflowStep{{ID: "agent", Type: "model", AgentID: agentID, IncludeContext: true}},
	}}
	if approval {
		steps = append(steps, domain.WorkflowStep{ID: "approval", Type: "approval_gate"})
	}
	return append(steps, domain.WorkflowStep{ID: "result", Type: "output", OutputPointer: "/steps/batch"})
}

func queryBatchSteps(resourceType string, filter json.RawMessage, maxItems int, agentID int64, approval bool) []domain.WorkflowStep {
	steps := []domain.WorkflowStep{
		{ID: "select_resources", Type: "resource_query", ResourceType: resourceType, Filter: filter, MaxItems: maxItems},
		{ID: "batch", Type: "for_each", CollectionPointer: "/steps/select_resources", MaxItems: maxItems, ContinueOnError: true,
			Steps: []domain.WorkflowStep{{ID: "agent", Type: "model", AgentID: agentID, IncludeContext: true}}},
	}
	if approval {
		steps = append(steps, domain.WorkflowStep{ID: "approval", Type: "approval_gate"})
	}
	return append(steps, domain.WorkflowStep{ID: "result", Type: "output", OutputPointer: "/steps/batch"})
}

func providerStarterWorkflows() []providerStarterWorkflow {
	strict := json.RawMessage(`{"mode":"strict","discovery_tools":[]}`)
	strictKnowledge := json.RawMessage(`{"mode":"strict","discovery_tools":["content.search_knowledge"]}`)
	noInput := json.RawMessage(`{"type":"object","additionalProperties":false}`)
	posts := json.RawMessage(`{"type":"object","additionalProperties":false,"required":["post_ids"],"properties":{"post_ids":{"title":"文章","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"}}}`)
	comments := json.RawMessage(`{"type":"object","additionalProperties":false,"required":["comment_ids"],"properties":{"comment_ids":{"title":"评论","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"comment","x-gouno-widget":"entity-multi-select"}}}`)
	media := json.RawMessage(`{"type":"object","additionalProperties":false,"required":["media_ids"],"properties":{"media_ids":{"title":"媒体","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":30,"x-gouno-resource":"media_asset","x-gouno-widget":"entity-multi-select"}}}`)
	pages := json.RawMessage(`{"type":"object","additionalProperties":false,"required":["page_ids"],"properties":{"page_ids":{"title":"单页","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"page","x-gouno-widget":"entity-multi-select"}}}`)
	suggestions := json.RawMessage(`{"type":"object","additionalProperties":false,"required":["suggestion_ids"],"properties":{"suggestion_ids":{"title":"运营建议","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"operational_suggestion","x-gouno-widget":"entity-multi-select"}}}`)
	distribution := json.RawMessage(`{"type":"object","additionalProperties":false,"required":["post_ids","format"],"properties":{"post_ids":{"title":"文章","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"},"format":{"title":"输出格式","type":"string","enum":["social","newsletter","faq","image_brief"]}}}`)
	imageBrief := json.RawMessage(`{"type":"object","additionalProperties":false,"required":["post_ids","format"],"properties":{"post_ids":{"title":"文章","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"},"format":{"title":"图片任务","type":"string","enum":["image_brief"],"default":"image_brief"},"images_per_post":{"title":"每篇图片数量","type":"integer","minimum":1,"maximum":5,"default":1},"instruction":{"title":"配图要求/风格","type":"string","maxLength":1000}}}`)
	taxonomy := json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"category_ids":{"title":"分类","type":"array","items":{"type":"integer"},"maxItems":30,"x-gouno-resource":"category","x-gouno-widget":"entity-multi-select"},"tags":{"title":"标签","type":"array","items":{"type":"string"},"maxItems":30,"x-gouno-resource":"tag","x-gouno-widget":"entity-multi-select"}},"anyOf":[{"required":["category_ids"]},{"required":["tags"]}]}`)
	mixed := json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"post_ids":{"title":"文章","type":"array","items":{"type":"integer"},"maxItems":20,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"},"comment_ids":{"title":"评论","type":"array","items":{"type":"integer"},"maxItems":20,"x-gouno-resource":"comment","x-gouno-widget":"entity-multi-select"},"suggestion_ids":{"title":"运营建议","type":"array","items":{"type":"integer"},"maxItems":20,"x-gouno-resource":"operational_suggestion","x-gouno-widget":"entity-multi-select"}},"anyOf":[{"required":["post_ids"]},{"required":["comment_ids"]},{"required":["suggestion_ids"]}]}`)
	return []providerStarterWorkflow{
		{key: "selected_pre_publish_review", name: "批量发布前审校", description: "审校手选文章并为每篇生成可核验建议。", agentKey: "pre_publish_review", inputSchema: posts, scopePolicy: strictKnowledge, steps: func(id int64) []domain.WorkflowStep { return batchSteps("/input/post_ids", 20, id, true) }},
		{key: "selected_internal_linking", name: "站内链接优化（手选）", description: "为手选文章发现相关内链，只允许修改原目标。", agentKey: "internal_linking", inputSchema: posts, scopePolicy: strictKnowledge, steps: func(id int64) []domain.WorkflowStep { return batchSteps("/input/post_ids", 20, id, true) }},
		{key: "selected_distribution", name: "内容再分发（手选）", description: "为手选文章生成社媒、Newsletter、FAQ 或图片 Brief。", agentKey: "content_distribution", inputSchema: distribution, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep { return batchSteps("/input/post_ids", 20, id, true) }},
		{key: "selected_article_image_generation", name: "生成封面/文配图（手选）", description: "为手选文章创建内部图片任务；无需审批 Brief，生成后由你选择并应用到封面或正文。", agentKey: "content_distribution", inputSchema: imageBrief, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep { return batchSteps("/input/post_ids", 20, id, false) }},
		{key: "selected_comment_replies", name: "评论回复草稿（手选）", description: "为手选评论逐条创建待审批回复草稿。", agentKey: "comment_reply_draft", inputSchema: comments, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep { return batchSteps("/input/comment_ids", 20, id, true) }},
		{key: "selected_media_review", name: "媒体无障碍检查", description: "检查手选媒体的 Alt 文本与复用质量。", agentKey: "media_alt_review", inputSchema: media, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep { return batchSteps("/input/media_ids", 30, id, false) }},
		{key: "selected_page_review", name: "单页审校与优化（手选）", description: "审校手选单页并为每页生成可核验的优化建议。", agentKey: "page_review", inputSchema: pages, scopePolicy: strictKnowledge, steps: func(id int64) []domain.WorkflowStep { return batchSteps("/input/page_ids", 20, id, true) }},
		{key: "selected_operations_deep_dive", name: "运营建议深挖", description: "补充手选运营建议的证据和优先级。", agentKey: "operations_deep_dive", inputSchema: suggestions, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep { return batchSteps("/input/suggestion_ids", 20, id, true) }},
		{key: "selected_taxonomy_review", name: "分类与标签整理", description: "联合分析手选分类与标签的结构质量。", agentKey: "taxonomy_review", inputSchema: taxonomy, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep { return modelResultSteps(id, false) }},
		{key: "selected_mixed_review", name: "混合内容复盘", description: "联合复盘手选文章、评论和运营建议。", agentKey: "mixed_content_review", inputSchema: mixed, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep { return modelResultSteps(id, true) }},
		{key: "scheduled_stale_resource_review", name: "陈旧文章规则审查", description: "每周固定一批超过 180 天未更新的文章，再逐篇提出更新建议。", cron: "0 9 * * 2", agentKey: "stale_content_refresh", inputSchema: noInput, scopePolicy: strictKnowledge, steps: func(id int64) []domain.WorkflowStep {
			return queryBatchSteps("post", json.RawMessage(`{"status":"published","updated_before_days":180}`), 20, id, true)
		}},
		{key: "scheduled_post_publish_review", name: "发布后内容复盘", description: "每天复盘最近两天发布的文章，生成需要人工确认的质量改进建议。", cron: "15 10 * * *", agentKey: "pre_publish_review", inputSchema: noInput, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep {
			return queryBatchSteps("post", json.RawMessage(`{"status":"published","published_within_days":2}`), 20, id, true)
		}},
		{key: "scheduled_page_review", name: "定期单页健康审查", description: "定期调度单页审校 Agent，审查超过 90 天未更新的单页。", cron: "0 10 1 * *", agentKey: "page_review", inputSchema: noInput, scopePolicy: strictKnowledge, steps: func(id int64) []domain.WorkflowStep {
			return queryBatchSteps("page", json.RawMessage(`{"updated_before_days":90}`), 20, id, true)
		}},
		{key: "scheduled_reported_comment_review", name: "被举报评论复盘", description: "每天汇总被举报评论并生成待审批的回复或处理建议。", cron: "30 10 * * *", agentKey: "comment_reply_draft", inputSchema: noInput, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep {
			return queryBatchSteps("comment", json.RawMessage(`{"reported":true}`), 30, id, true)
		}},
		{key: "scheduled_missing_alt_review", name: "缺失 Alt 媒体检查", description: "每周检查缺失 Alt 文本的媒体并生成无障碍改进建议。", cron: "0 11 * * 3", agentKey: "media_alt_review", inputSchema: noInput, scopePolicy: strict, steps: func(id int64) []domain.WorkflowStep {
			return queryBatchSteps("media_asset", json.RawMessage(`{"missing_alt":true}`), 30, id, false)
		}},
	}
}

func stepsHaveFixedAgents(steps []domain.WorkflowStep) bool {
	found := false
	for _, step := range steps {
		if step.Type == "model" {
			found = true
			if step.AgentID <= 0 {
				return false
			}
		}
		if len(step.Steps) > 0 {
			if !stepsHaveFixedAgents(step.Steps) {
				return false
			}
			found = true
		}
	}
	return found
}

func reconcileProviderDependentStarters(ctx context.Context, tx *sql.Tx, systemAgents map[string]int64) (int, error) {
	created := 0
	for _, definition := range providerStarterWorkflows() {
		agentID := systemAgents[definition.agentKey]
		if agentID <= 0 {
			return created, fmt.Errorf("starter Workflow %q has no system Agent binding for %q", definition.key, definition.agentKey)
		}
		steps := definition.steps(agentID)
		stepsJSON, _ := json.Marshal(steps)
		var workflowID int64
		var version int
		var currentSteps []byte
		err := tx.QueryRowContext(ctx, `SELECT w.id,w.current_version,v.steps FROM ai_workflows w
			LEFT JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version
			WHERE w.template_key=$1 AND w.deleted_at IS NULL FOR UPDATE OF w`, definition.key).Scan(&workflowID, &version, &currentSteps)
		if errors.Is(err, sql.ErrNoRows) {
			name := definition.name
			var nameTaken bool
			if queryErr := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflows WHERE name=$1 AND deleted_at IS NULL)`, name).Scan(&nameTaken); queryErr != nil {
				return created, queryErr
			}
			if nameTaken {
				name += " [" + definition.key + "]"
			}
			err = tx.QueryRowContext(ctx, `INSERT INTO ai_workflows
				(name,description,enabled,template_key,cron_expression,timezone,current_version,resource_query_empty_policy,creation_origin)
				VALUES($1,$2,FALSE,$3,NULLIF($4,''),'Asia/Shanghai',1,'succeed',$5) RETURNING id,current_version`,
				name, definition.description, definition.key, definition.cron, "system").Scan(&workflowID, &version)
			if err != nil {
				return created, fmt.Errorf("create starter Workflow %q: %w", definition.key, err)
			}
			currentSteps = nil
		} else if err != nil {
			return created, fmt.Errorf("load starter Workflow %q: %w", definition.key, err)
		}
		var decoded []domain.WorkflowStep
		valid := len(currentSteps) > 0 && json.Unmarshal(currentSteps, &decoded) == nil && stepsHaveFixedAgents(decoded)
		if valid {
			continue
		}
		if len(currentSteps) > 0 {
			if err := tx.QueryRowContext(ctx, `UPDATE ai_workflows SET enabled=FALSE,next_run_at=NULL,
				current_version=current_version+1,updated_at=NOW() WHERE id=$1 RETURNING current_version`, workflowID).Scan(&version); err != nil {
				return created, err
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy,creation_origin)
			VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workflow_id,version) DO UPDATE
			SET input_schema=EXCLUDED.input_schema,steps=EXCLUDED.steps,scope_policy=EXCLUDED.scope_policy`,
			workflowID, version, definition.inputSchema, stepsJSON, definition.scopePolicy, "system"); err != nil {
			return created, fmt.Errorf("version starter Workflow %q: %w", definition.key, err)
		}
	}
	return created, nil
}
