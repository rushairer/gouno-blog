import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const failures = [];

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function requireText(name, text, message) {
  if (!name.includes(text)) failures.push(message ?? `missing canonical text ${JSON.stringify(text)}`);
}

function forbidText(name, text, message) {
  if (name.includes(text)) failures.push(message ?? `forbidden text remains: ${JSON.stringify(text)}`);
}

const media = await source("pages/admin/MediaLibrary.tsx");
for (const text of ["相对地址", "Markdown", "Alt Text", "重新载入"]) {
  requireText(media, text, `MediaLibrary.tsx: missing canonical action ${text}`);
}
requireText(media, 'aria-label={`${t("copyRelativeUrl")} ${asset.filename}`}', "MediaLibrary.tsx: compact visible label must retain a full copy accessible name");
requireText(media, 'aria-label={`${t("editAltText")} ${asset.filename}`}', "MediaLibrary.tsx: compact Alt Text action must retain a full edit accessible name");
requireText(media, "openUploadDrawer", "MediaLibrary.tsx: empty-state upload CTA must reuse the canonical upload action");

const users = await source("pages/admin/Users.tsx");
requireText(users, "打开 GOSSO Admin", "Users.tsx: GOSSO handoff must use 打开 GOSSO Admin");
forbidText(users, "前往 GOSSO 管理", "Users.tsx: retired GOSSO handoff wording reintroduced");
requireText(users, "成员显示昵称 / 备注名", "Users.tsx: product-accurate member naming vocabulary is required");
requireText(users, "Blog 角色分配（单选）", "Users.tsx: product-accurate role assignment vocabulary is required");
requireText(users, "完整 Subject ID", "Users.tsx: compact account ID copy actions must expose the full target in their accessible name");
if (!/<ButtonLink\s+[\s\S]{0,240}?variant="outline"[\s\S]{0,240}?打开 GOSSO Admin/.test(users)) {
  failures.push("Users.tsx: GOSSO PageHeader handoff must remain a real outline ButtonLink");
}

const settings = await source("pages/Settings.tsx");
requireText(settings, 't("accountSettings")', "Settings.tsx: account title must come from the locale resource instead of a locale-specific component literal");
forbidText(settings, 'locale === "zh" ? "账户设置"', "Settings.tsx: do not bypass canonical locale vocabulary with a component-level Chinese title override");
requireText(settings, "打开 GOSSO Admin", "Settings.tsx: GOSSO handoff wording must remain consistent");

const zhLocale = JSON.parse(await source("i18n/locales/zh.json"));
if (zhLocale.accountSettings !== "账户设置") {
  failures.push("zh.json: canonical Chinese accountSettings terminology must be 账户设置");
}

const notFound = await source("pages/NotFound.tsx");
for (const text of ["返回首页", "浏览文章", "搜索内容", "返回上一页"]) {
  requireText(notFound, text, `NotFound.tsx: missing canonical CTA ${text}`);
}

const notifications = await source("pages/AccountNotifications.tsx");
for (const text of ["全部", "未读", "查看", "重新载入"]) {
  requireText(notifications, text, `AccountNotifications.tsx: missing canonical notification action ${text}`);
}
requireText(notifications, "<Segmented<NotificationFilter>", "AccountNotifications.tsx: canonical all/unread filtering must remain available");
requireText(notifications, "item.href", "AccountNotifications.tsx: notification destinations must remain actionable when supplied by the API");

for (const fileName of await readdir(path.join(root, "pages/admin"))) {
  if (!fileName.endsWith(".tsx")) continue;
  const adminSource = await readFile(path.join(root, "pages/admin", fileName), "utf8");
  if (/okText\s*=\s*["'{]继续/.test(adminSource)) {
    failures.push(`${fileName}: generic 继续 is forbidden as an Admin modal confirmation label; name the action`);
  }
}

if (failures.length) {
  console.error(`Action grammar contract failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log("Blog microcopy/action grammar contract passed.");
