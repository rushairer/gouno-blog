import { installApiFixtures, setTheme } from "./mock-api.mjs";
import {
  agentRunDetail,
  agentRuns,
  aiAgents,
  aiProvider,
  aiSkill,
  aiTools,
  approvals,
  embeddingProfile,
  indexStatus,
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
  path.startsWith("/api/admin/ai-");

export async function installAiFixtures(page) {
  const baseUnknown = await installApiFixtures(page);
  const unexpectedWrites = [];

  await page.route(productApiUrl, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (!knownAiPath(path)) {
      await route.fallback();
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      unexpectedWrites.push(`${method} ${path}`);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    const respond = (data) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope(data),
      });

    if (path === "/api/admin/agents") return respond(aiAgents);
    if (path === "/api/admin/agent-tools") return respond(aiTools);
    if (path === "/api/admin/agent-skills") return respond([aiSkill]);
    if (path === "/api/admin/provider-profiles") return respond([aiProvider]);
    if (path === "/api/admin/embedding-profiles") return respond([embeddingProfile]);
    if (path === "/api/admin/ai-index/status") return respond(indexStatus);

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
