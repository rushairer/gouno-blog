import { installApiFixtures, setTheme } from "./mock-api.mjs";
import {
  agentRunDetail,
  agentRuns,
  aiAgents,
  aiProvider,
  aiSkill,
  aiTools,
  approvals,
  connectorOutbox,
  connectorProfiles,
  embeddingProfile,
  indexStatus,
  indexedKnowledgeContent,
  knowledgeSearchResponse,
  suggestions,
  workflowInteractions,
  workflowMetrics,
  workflowRunEvents,
  workflowRunResources,
  workflowRuns,
  workflowRunSteps,
  workflows,
} from "./ai-fixtures.mjs";

const envelope = (data) => JSON.stringify({ data });
const productApiUrl = /^https?:\/\/[^/]+\/api\//;

const knownAiPath = (path) =>
  path.startsWith("/api/admin/agent-") ||
  path === "/api/admin/agents" ||
  path.startsWith("/api/admin/agents/") ||
  path.startsWith("/api/admin/provider-profiles") ||
  path.startsWith("/api/admin/embedding-profiles") ||
  path.startsWith("/api/admin/external-api") ||
  path.startsWith("/api/admin/ai-");

const externalCapabilities = [
  {
    name: "content.list_published_posts",
    description: "List published blog posts through the public content boundary.",
    description_zh: "通过公开内容边界分页读取已发布文章目录与基础元数据。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.get_published_post",
    description: "Read one published blog post through the public content boundary.",
    description_zh: "通过公开内容边界读取一篇已发布文章的完整内容与元数据。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.search_posts",
    description: "Search published Blog posts.",
    description_zh: "按关键词和受控条件检索 Blog 文章。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.list_published_pages",
    description: "List published custom pages.",
    description_zh: "读取已发布独立页面目录。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.get_published_page",
    description: "Read one published custom page by slug.",
    description_zh: "通过公开内容边界按 Slug 读取一个已发布独立页面。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.search_knowledge",
    description: "Search indexed published content.",
    description_zh: "查询已发布内容形成的知识索引与证据片段。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.list_tags",
    description: "List Blog tags.",
    description_zh: "读取已发布文章实际使用的标签目录。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.list_stale_posts",
    description: "List stale published posts.",
    description_zh: "按维护周期读取长期未更新的已发布文章。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.list_orphan_posts",
    description: "List published posts without inbound internal links.",
    description_zh: "读取缺少站内引用关系的已发布文章。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "analytics.list_low_engagement_posts",
    description: "List low-engagement published posts.",
    description_zh: "读取已发布文章的低互动清单用于外部分析。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read",
  },
];

const externalClientSeed = [
  {
    id: 91,
    name: "Editorial Reporting SDK",
    key_prefix: "gouno_live_A7k3Q2p9",
    capabilities: [
      "content.list_published_posts",
      "content.get_published_post",
      "analytics.list_low_engagement_posts",
    ],
    enabled: true,
    rate_limit_per_minute: 120,
    expires_at: "2026-12-31T15:59:00Z",
    last_used_at: "2026-09-28T05:42:00Z",
    created_by_principal_id: 1,
    revoked_at: null,
    created_at: "2026-09-20T08:00:00Z",
    updated_at: "2026-09-28T05:42:00Z",
  },
  {
    id: 92,
    name: "Knowledge Export Worker",
    key_prefix: "gouno_live_K9m2V6s4",
    capabilities: ["content.search_posts", "content.search_knowledge"],
    enabled: false,
    rate_limit_per_minute: 30,
    expires_at: null,
    last_used_at: "2026-09-27T14:16:00Z",
    created_by_principal_id: 1,
    revoked_at: null,
    created_at: "2026-09-21T08:00:00Z",
    updated_at: "2026-09-27T14:16:00Z",
  },
];

const externalAuditSeed = [
  {
    id: 701,
    client_id: 91,
    request_id: "req-ext-701",
    capability: "analytics.list_low_engagement_posts",
    result: "success",
    status_code: 200,
    source_ip: "203.0.113.10",
    input_digest: "a".repeat(64),
    duration_ms: 42,
    created_at: "2026-09-28T05:42:18Z",
  },
  {
    id: 702,
    client_id: 91,
    request_id: "req-ext-702",
    capability: "content.get_published_post",
    result: "success",
    status_code: 200,
    source_ip: "203.0.113.10",
    input_digest: "b".repeat(64),
    duration_ms: 31,
    created_at: "2026-09-28T05:41:52Z",
  },
  {
    id: 703,
    client_id: 92,
    request_id: "req-ext-703",
    capability: "content.get_published_post",
    result: "denied",
    status_code: 403,
    source_ip: "203.0.113.11",
    input_digest: "c".repeat(64),
    duration_ms: 1,
    created_at: "2026-09-27T14:16:04Z",
  },
];

export async function installAiFixtures(page) {
  const baseUnknown = await installApiFixtures(page);
  const unexpectedWrites = [];
  const externalClients = externalClientSeed.map((item) => ({
    ...item,
    capabilities: [...item.capabilities],
  }));
  const externalAudits = externalAuditSeed.map((item) => ({ ...item }));
  let nextExternalClientID = 93;

  await page.route(productApiUrl, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (!knownAiPath(path)) {
      await route.fallback();
      return;
    }

    const respond = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: envelope(data),
      });

    if (path.startsWith("/api/admin/external-api")) {
      if (method === "GET" || method === "HEAD") {
        if (path === "/api/admin/external-api/capabilities") {
          return respond(externalCapabilities);
        }
        if (path === "/api/admin/external-api/clients") {
          return respond(externalClients);
        }
        if (path === "/api/admin/external-api/audits") {
          return respond(externalAudits);
        }
      }

      if (method === "POST" && path === "/api/admin/external-api/clients") {
        const payload = request.postDataJSON() || {};
        const now = new Date().toISOString();
        const id = nextExternalClientID++;
        const client = {
          id,
          name: payload.name || `External Client ${id}`,
          key_prefix: `gouno_live_fixture_${id}`,
          capabilities: Array.isArray(payload.capabilities)
            ? [...payload.capabilities]
            : [],
          enabled: payload.enabled !== false,
          rate_limit_per_minute: payload.rate_limit_per_minute || 60,
          expires_at: payload.expires_at || null,
          last_used_at: null,
          created_by_principal_id: 1,
          revoked_at: null,
          created_at: now,
          updated_at: now,
        };
        externalClients.unshift(client);
        return respond(
          {
            client,
            api_key: `gouno_live_fixture-secret-once_${id}`,
          },
          201,
        );
      }

      const clientMatch = path.match(/^\/api\/admin\/external-api\/clients\/(\d+)$/);
      if (clientMatch && method === "PUT") {
        const id = Number(clientMatch[1]);
        const client = externalClients.find((item) => item.id === id);
        if (!client) return respond({ message: "not found" }, 404);
        const payload = request.postDataJSON() || {};
        Object.assign(client, {
          name: payload.name,
          capabilities: Array.isArray(payload.capabilities)
            ? [...payload.capabilities]
            : [],
          enabled: Boolean(payload.enabled),
          rate_limit_per_minute: payload.rate_limit_per_minute || 60,
          expires_at: payload.expires_at || null,
          updated_at: new Date().toISOString(),
        });
        return respond(client);
      }

      const rotateMatch = path.match(
        /^\/api\/admin\/external-api\/clients\/(\d+)\/rotate$/,
      );
      if (rotateMatch && method === "POST") {
        const id = Number(rotateMatch[1]);
        const client = externalClients.find((item) => item.id === id);
        if (!client) return respond({ message: "not found" }, 404);
        client.key_prefix = `gouno_live_rotated_${id}`;
        client.updated_at = new Date().toISOString();
        return respond({
          client,
          api_key: `gouno_live_rotated-secret-once_${id}`,
        });
      }

      if (clientMatch && method === "DELETE") {
        const id = Number(clientMatch[1]);
        const client = externalClients.find((item) => item.id === id);
        if (!client) return respond({ message: "not found" }, 404);
        client.enabled = false;
        client.revoked_at = new Date().toISOString();
        client.updated_at = client.revoked_at;
        return respond({ revoked: true });
      }

      unexpectedWrites.push(`${method} ${path}`);
      return respond({ message: "unexpected external API fixture request" }, 400);
    }

    if (method !== "GET" && method !== "HEAD") {
      unexpectedWrites.push(`${method} ${path}`);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (path === "/api/admin/agents") return respond(aiAgents);
    if (path === "/api/admin/agent-tools") return respond(aiTools);
    if (path === "/api/admin/agent-skills") return respond([aiSkill]);
    if (path === "/api/admin/provider-profiles") return respond([aiProvider]);
    if (path === "/api/admin/embedding-profiles") return respond([embeddingProfile]);
    if (path === "/api/admin/ai-connectors") return respond(connectorProfiles);
    if (path === "/api/admin/ai-connector-outbox") return respond(connectorOutbox);
    if (path === "/api/admin/ai-index/status") return respond(indexStatus);
    if (path === "/api/admin/ai-index/content") return respond(indexedKnowledgeContent);
    if (path === "/api/admin/ai-index/search") {
      return respond({
        ...knowledgeSearchResponse,
        query: url.searchParams.get("q") || knowledgeSearchResponse.query,
      });
    }

    if (path === "/api/admin/agent-runs") return respond({ list: agentRuns });
    if (/^\/api\/admin\/agent-runs\/\d+$/.test(path)) {
      const id = Number(path.split("/").at(-1));
      const run = agentRuns.find((item) => item.id === id) || agentRuns[0];
      return respond({
        run: { ...run, output_summary: agentRunDetail.run.output_summary },
        tool_calls: agentRunDetail.tool_calls.map((call) => ({ ...call, run_id: run.id })),
      });
    }
    if (path === "/api/admin/agent-approvals") return respond({ list: approvals });

    if (path === "/api/admin/ai-workflows") return respond(workflows);
    if (path === "/api/admin/ai-workflow-runs") return respond(workflowRuns);
    if (path === "/api/admin/ai-workflow-metrics") {
      return respond({ workflows: workflowMetrics });
    }
    if (/^\/api\/admin\/ai-workflow-runs\/\d+\/steps$/.test(path)) {
      return respond(workflowRunSteps);
    }
    if (/^\/api\/admin\/ai-workflow-runs\/\d+\/resources$/.test(path)) {
      return respond(workflowRunResources);
    }
    if (/^\/api\/admin\/ai-workflow-runs\/\d+\/interactions$/.test(path)) {
      return respond(workflowInteractions);
    }
    if (/^\/api\/admin\/ai-workflow-runs\/\d+\/media-candidates$/.test(path)) {
      return respond([]);
    }
    if (/^\/api\/admin\/ai-workflow-runs\/\d+\/events$/.test(path)) {
      return respond(workflowRunEvents);
    }

    if (path === "/api/admin/ai-interactions") return respond(workflowInteractions);
    if (path === "/api/admin/ai-suggestions") return respond(suggestions);
    if (path === "/api/admin/ai-candidates") return respond([]);
    if (path === "/api/admin/ai-media-candidates") return respond([]);
    if (path === "/api/admin/ai-editorial-tasks") return respond([]);

    await route.fallback();
  });

  return { unknown: baseUnknown, unexpectedWrites };
}

export async function prepareAiBrowserState(page, theme) {
  await setTheme(page, theme);
  await page.addInitScript(() => {
    localStorage.setItem("gouno-blog:locale", "en");
    localStorage.setItem("gouno:sudo_activated_at", Date.now().toString());
  });
}
