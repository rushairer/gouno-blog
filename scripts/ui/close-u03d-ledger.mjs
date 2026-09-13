import { readFile, writeFile } from "node:fs/promises";

const migrationPath = "docs/ui-redesign/MIGRATION.md";
const ledgerPath = "docs/ui-redesign/migration.json";

async function replaceExact(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const [from, to] of replacements) {
    if (!source.includes(from)) {
      throw new Error(`${path}: expected reconciliation source text not found: ${from}`);
    }
    source = source.replace(from, to);
  }
  await writeFile(path, source);
}

await replaceExact(migrationPath, [
  [
    "- Current `gouno-blog/main`: `6f722dcdd34f3495a293d7a77dff4baf35e1120a`. Current Blog vendored `@gouno/ui` provenance and `rushairer/gouno-ui/main` are both `cb946376e32bcc0db18d13fb09d89d71b5780dca`; the earlier consumer/upstream SHA drift is closed.",
    "- PR #209 reconciliation baseline: the branch was cut from `gouno-blog/main` at `3a21a24ad192ebbcf69aaa5f004b3cd98fc07d10`; `blog-frontend` consumes registry `@gouno/ui@0.3.5` and no longer carries a product-local/vendored UI implementation.",
  ],
  [
    "- U03c is `verified`: support-page implementation and current automated quality gates are in main. U03d remains `review-pending` because an independent full rendered/browser pass has not been repeated in the current reconciliation session.",
    "- U03c and U03d are `verified`. U03d combines the existing real authenticated U03a/U03b browser evidence with PR #209's independent support-page Chromium pass: 59/59 Playwright tests passed across Categories/Tags/Comments/Notifications/Media/Settings/Users at 1440/1024/768/390 in light/dark, including Media checkbox selection, Settings error→retry and Users Modal presentation. Browser artifact ID `10316928262`, digest `sha256:3499b5d1bd40de075afdd2a3ca52c5cfede66df04d9625c09069d68c7da1ff14`.",
  ],
]);

await replaceExact(ledgerPath, [
  [
    '        "browser": "final independent rendered review belongs to U03d"',
    '        "browser": "U03d final independent rendered review completed; see U03d evidence"',
  ],
  [
    '      "U03d": {\n        "status": "review-pending",\n        "reason": "independent full-route/rendered responsive/theme/interaction review has not been repeated in the current reconciliation session"\n      },',
    '      "U03d": {\n        "status": "verified",\n        "evidence": "U03a/U03b real authenticated browser evidence plus PR #209 support-page Playwright acceptance; run 34756247735 passed 59/59 tests across Categories/Tags/Comments/Notifications/Media/Settings/Users at 1440/1024/768/390 in light/dark, including Media checkbox, Settings retry and Users modal interactions",\n        "browserArtifact": "10316928262 sha256:3499b5d1bd40de075afdd2a3ca52c5cfede66df04d9625c09069d68c7da1ff14",\n        "unverified": ["fresh real Gosso login was not repeated by the fixture-based support-page pass", "destructive member/site mutations were not submitted", "all alternate-role, real MFA/Passkey Step-Up and production-domain flows remain final-QA scope"]\n      },',
  ],
]);

JSON.parse(await readFile(ledgerPath, "utf8"));
console.log("U03d migration ledgers reconciled");
