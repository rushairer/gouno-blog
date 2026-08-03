package workflowplan

import (
	"strings"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/tool"
)

func TestParseIntentDistinguishesImageBriefFromSocial(t *testing.T) {
	brief := ParseIntent("为文章生成封面和文中配图 Brief")
	if brief.Status != "ready" || brief.Action != "image_brief" || brief.OutputType != "image_brief" || brief.RequiresImage {
		t.Fatalf("unexpected image brief intent: %#v", brief)
	}
	social := ParseIntent("把文章生成社媒分发草稿")
	if social.Action != "social" || social.OutputType != "social_draft" {
		t.Fatalf("unexpected social intent: %#v", social)
	}
	briefWithGenerationWord := ParseIntent("生成图片 Brief 和提示词")
	if briefWithGenerationWord.Action != "image_brief" || briefWithGenerationWord.RequiresImage {
		t.Fatalf("brief must not require image provider: %#v", briefWithGenerationWord)
	}
}

func TestParseIntentAmbiguous(t *testing.T) {
	intent := ParseIntent("帮我自动处理一下")
	if intent.Status != "ambiguous" || intent.AmbiguityReason == "" {
		t.Fatalf("expected ambiguity: %#v", intent)
	}
}

func TestMatchRequiresAuthorizedToolAndProvider(t *testing.T) {
	provider := &domain.ProviderProfile{ID: 1, Enabled: true, IsDefaultWriting: true}
	skill := &domain.AgentSkill{VersionID: 2, Capabilities: []string{"content.propose_distribution_draft"}, ExecutionMode: domain.AgentModeApproval}
	agent := &domain.Agent{ID: 3, Enabled: true, SkillVersionID: &skill.VersionID, Skill: skill, ProviderProfile: provider, ProviderProfileID: 1}
	intent := ParseIntent("生成配图 Brief")
	match, template, selected := Match(intent, []*domain.ProviderProfile{provider}, []*domain.Agent{agent}, []*domain.AgentSkill{skill}, []tool.CatalogItem{{Name: "content.propose_distribution_draft"}})
	if match.Status != "ready" || template == nil || selected != agent {
		t.Fatalf("expected ready match: %#v", match)
	}
	badSkill := &domain.AgentSkill{VersionID: 4, Capabilities: []string{"content.audit_post"}}
	badAgent := &domain.Agent{ID: 5, Enabled: true, SkillVersionID: &badSkill.VersionID, Skill: badSkill, ProviderProfile: provider, ProviderProfileID: 1}
	missing, _, _ := Match(intent, []*domain.ProviderProfile{provider}, []*domain.Agent{badAgent}, nil, []tool.CatalogItem{{Name: "content.propose_distribution_draft"}})
	if missing.Status != "needs_configuration" || !strings.Contains(strings.Join(missing.Missing, ","), "Tool") {
		t.Fatalf("expected missing tool: %#v", missing)
	}
}

func TestCompileImageBriefContract(t *testing.T) {
	intent := ParseIntent("为文章生成图片 Brief")
	var template *Template
	for _, candidate := range templates {
		if candidate.Key == "article_image_brief" {
			template = &candidate
			break
		}
	}
	draft := Compile(intent, template, nil)
	if !strings.Contains(string(draft.InputSchema), "image_brief") || draft.Steps[0].InputPointer != "/input" {
		t.Fatalf("invalid compiled contract: %#v", draft)
	}
}

func TestMatchRealImageNeedsImageProvider(t *testing.T) {
	intent := ParseIntent("为文章真实生成图片")
	match, template, _ := Match(intent, nil, nil, nil, nil)
	if match.Status != "needs_configuration" || template == nil || !strings.Contains(strings.Join(match.Missing, ","), "图片 Provider") {
		t.Fatalf("expected image provider requirement: %#v", match)
	}
}
