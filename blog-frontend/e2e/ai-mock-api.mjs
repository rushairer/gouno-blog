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
  externalApiAudits,
  externalApiClients,
  externalCapabilities,
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

export async function installAiFixtures(page) {
  const baseUnknown = await installApiFixtures(page);
  const unexpectedWrites = [];
  let externalClients = externalApiClients.map((item) => ({
    ...item,
    capabilities: [...item.capabilities],
  }));
  let externalAudits = externalApiAudits.map((item) => ({ ...item }));
  let nextExternalClientID =
    externalClients.reduce((max, item) => Math.max(max, item.id), 0) + 1;

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
      if (method === "GET" && path === "/api/admin/external-api/capabilities") {
        return respond(externalCapabilities);
      }
      if (method === "GET" && path === "/api/admin/external-api/clients") {
        return respond(externalClients);
      }
      if (method === "GET" && path === "/api/admin/external-api/audits") {
        const clientID = Number(url.searchParams.get("client_id") || 0);
        const limit = Number(url.searchParams.get("limit") || 100);
        const filtered = clientID
          ? externalAudits.filter((item) => item.client_id === clientID)
          : externalAudits;
        return respond(filtered.slice(0, limit));
      }

      if (method === "POST" && path === "/api/admin/external-api/clients") {
        const payload = request.postDataJSON();
        const client = {
          id: nextExternalClientID++,
          name: payload.name,
          key_prefix: `gouno_live_fixture_${nextExternalClientID}`,
          capabilities: [...(payload.capabilities || [])],
          enabled: payload.enabled ?? true,
          rate_limit_per_minute: payload.rate_limit_per_minute || 60,
          expires_at: payload.expires_at ?? null,
          last_used_at: null,
          revoked_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        externalClients = [client, ...externalClients];
        return respond(
          {
            client,
            api_key: `gouno_live_fixture-secret-once_${client.id}`,
          },
          201,
        );
      }

      const clientMatch = path.match(
        /^\/api\/admin\/external-api\/clients\/(\d+)$/,
      );
      if (clientMatch && method === "PUT") {
        const id = Number(clientMatch[1]);
        const payload = request.postDataJSON();
        externalClients = externalClients.map((item) =>
          item.id === id
            ? {
                ...item,
                name: payload.name,
                capabilities: [...(payload.capabilities || [])],
                enabled: payload.enabled,
                rate_limit_per_minute:
                  payload.rate_limit_per_minute || item.rate_limit_per_minute,
                expires_at: payload.expires_at ?? null,
                updated_at: new Date().toISOString(),
              }
            : item,
        );
        return respond(externalClients.find((item) => item.id === id));
      }

      const rotateMatch = path.match(
        /^\/api\/admin\/external-api\/clients\/(\d+)\/rotate$/,
      );
      if (rotateMatch && method === "POST") {
        const id = Number(rotateMatch[1]);
        const rotatedPrefix = `gouno_live_rotated_${id}`;
        externalClients = externalClients.map((item) =>
          item.id === id
            ? {
                ...item,
                key_prefix: rotatedPrefix,
                updated_at: new Date().toISOString(),
              }
            : item,
        );
        return respond({
          client: externalClients.find((item) => item.id === id),
          api_key: `gouno_live_rotated-secret-once_${id}`,
        });
      }

      if (clientMatch && method === "DELETE") {
        const id = Number(clientMatch[1]);
        const revokedAt = new Date().toISOString();
        externalClients = externalClients.map((item) =>
          item.id === id
            ? {
                ...item,
                enabled: false,
                revoked_at: revokedAt,
                updated_at: revokedAt,
              }
            : item,
        );
        return respond({ revoked: true });
      }
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
