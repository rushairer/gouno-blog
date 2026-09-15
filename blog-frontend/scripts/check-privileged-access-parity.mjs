import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const failures = [];

const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const requireText = (source, relativePath, expected, reason) => {
  if (!source.includes(expected)) {
    failures.push(`${relativePath}: ${reason}`);
  }
};

const gatePath = "components/auth/SudoGate.tsx";
const sudoPath = "hooks/useSudoMode.ts";
const stepUpPath = "components/auth/StepUpMfaModal.tsx";
const usersPath = "pages/admin/Users.tsx";
const settingsPath = "pages/admin/SiteSettings.tsx";
const advancedPath = "components/agent/AdvancedWorkspace.tsx";
const gate = await read(gatePath);
const sudo = await read(sudoPath);
const stepUp = await read(stepUpPath);
const users = await read(usersPath);
const settings = await read(settingsPath);
const advanced = await read(advancedPath);

for (const [text, reason] of [
  ['data-slot="blog-privileged-access-gate"', "must expose the canonical privileged-access slot"],
  ["高权限操作需要身份验证", "must render the canonical locked state"],
  ["高权限操作已解锁", "must render the canonical unlocked state"],
  ["近期 MFA 即将过期", "must render the canonical expired-on-action state"],
  ["下一次高权限写操作将触发 Step-Up", "must explain preserved-action Step-Up behavior"],
  ["重新锁定", "must expose explicit relock behavior"],
]) {
  requireText(gate, gatePath, text, reason);
}

requireText(
  sudo,
  sudoPath,
  "SUDO_SESSION_STALE_EVENT",
  "must subscribe to backend-confirmed stale sudo state",
);
requireText(
  sudo,
  sudoPath,
  "isSudoExpiring",
  "must expose the expired-on-action state to the product gate",
);
requireText(
  stepUp,
  stepUpPath,
  "markSudoSessionStale()",
  "Step-Up UI must mark the current sudo session stale before verification",
);

for (const [relativePath, source] of [
  [usersPath, users],
  [settingsPath, settings],
  [advancedPath, advanced],
]) {
  requireText(
    source,
    relativePath,
    "<SudoGate",
    "privileged Blog Admin surfaces must use the shared product gate",
  );
  if (source.includes("Sudo 已解锁")) {
    failures.push(
      `${relativePath}: legacy one-off sudo presentation must not replace the canonical gate`,
    );
  }
  if (source.includes("unlockedPresentation")) {
    failures.push(
      `${relativePath}: legacy presentation selector must stay retired`,
    );
  }
  if (source.includes("无打扰操作期") || source.includes("无打扰编辑期")) {
    failures.push(
      `${relativePath}: session lifetime copy belongs to SudoGate state, not page policy descriptions`,
    );
  }
}

requireText(
  users,
  usersPath,
  'description="修改 Blog 成员角色、移交所有权或暂停成员资格需要近期多因素身份认证。"',
  "member policy description must match Showcase",
);
requireText(
  users,
  usersPath,
  'actionLabel="完成 MFA 并解锁"',
  "member unlock action must match Showcase",
);
requireText(
  settings,
  settingsPath,
  'description="修改站点品牌、SEO、页脚或联系方式等敏感设置需要近期多因素身份认证。"',
  "site settings policy description must match Showcase",
);

const providerPolicyTitleCount = advanced.split("模型连接与密钥保护").length - 1;
if (providerPolicyTitleCount !== 1) {
  failures.push(
    `${advancedPath}: model credential policy must be rendered exactly once by SudoGate (found ${providerPolicyTitleCount})`,
  );
}
if (advanced.includes("敏感配置需要近期 MFA")) {
  failures.push(
    `${advancedPath}: knowledge policy must not be duplicated by a nested informational Alert`,
  );
}
requireText(
  advanced,
  advancedPath,
  'description="添加、修改、导出或删除模型连接涉及敏感 API Key 凭据，需要近期多因素身份认证。"',
  "model credential policy description must match Showcase",
);
requireText(
  advanced,
  advancedPath,
  'description="添加、编辑、删除 Embedding 配置或执行全量重建需要近期多因素身份认证。"',
  "knowledge policy description must match Showcase",
);

if (failures.length) {
  console.error(
    `Blog Admin privileged-access parity contract failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}

console.log("Blog Admin privileged-access parity contract passed.");
