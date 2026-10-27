# AI Settings / Skill Tool Bindings — JSON 编辑与提交契约增量审查

Status: **verified** — 2026-10-28 增量人工优先复核。此结论仅覆盖本次受影响 Skill 编辑器状态；不是 AI 家族所有页面的重新认证，也不是项目级 A+ 放行。

## 基线与范围

- Blog base main: `00d6be81aa1fd1615139aac8f40424d769485670` (#388 security hotfix); 源码候选：`3cae8d44af173537ec5bcb050090b6f178ff3cfe`。该版本相对上次已通过的 `b775854` 仅新增浏览器测试与截图附件，不修改 Product 源码。
- Canonical Gouno UI main: `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`; npm `@gouno/ui` 仍为 `0.4.9`，无 Canonical 改动。
- Product-owned 修改限于 `ToolBindingsEditor.tsx` 的 JSON 草稿约束、模式切换与 `SkillForm.tsx` 的提交阻断；没有变更 JSX 层级、CSS、布局、Typography、表单布局组件、API/权限/审批、BFF 或 Connector。
- Browser plugin 不可用；实际页面验证使用项目 GitHub Actions 上的 Playwright Chromium + AI Settings 真实页面和拦截的 fixture API，并直接核查了其下载的截图和结果。

## 失败根因和修复语义

之前的“valid JSON updates”测试实际上只切换模式、读取初始内容。非法 JSON 在 ToolBindingsEditor 的输入框中报错，但父级 SkillForm 保留旧的 `tool_bindings`，允许操作员点击保存，导致界面显示错误草稿、提交却是旧配置。原解析还把嵌套 `null`、数组和标量断言成对象绑定。

现在只有顶层 JSON 对象、且每个 Tool binding 都是非空类型的 JSON 对象才更新已接受配置；无效编辑不触发 `onChange`，并在父表单中同时阻断提交与禁用保存按钮。切回 Visual Form 明确丢弃未应用的非法草稿，展示最后一次合法值，恢复保存资格。合法 JSON 编辑会同步到可视化控件；仅验证格式，不冒充后端授权或完整字段 Schema 校验。

## 独立证据与运行门禁

全部为候选 `3cae8d44af173537ec5bcb050090b6f178ff3cfe` 对应的独立 Actions 运行：

| 门禁 | Workflow | 验收结果 |
| --- | --- | --- |
| CI | 40543680478 | 67 个文件、376 项前端单元测试；npm audit 0 漏洞；67 条现存 lint 警告、0 错误；Backend/Seed/coverage/race/vet 及数据库门禁成功 |
| Images | 40543680468 | 三张镜像构建成功，Trivy/Grype 共六项扫描成功 |
| UI Browser Acceptance | 40543680564 | 实际 Chromium 357 项全部通过；新增 desktop/mobile JSON 输入/恢复测试，无失败、无跳过、无 flaky |
| Blog Showcase Parity | 40543680502 | 86 项真实 Product/Showcase 成对测试全部通过，无跳过、失败或重试后通过 |

已下载并**独立计算 SHA-256**，与 GitHub Actions 工件 digest 一致：

| Artifact | ID | SHA-256 |
| --- | --- | --- |
| PostgreSQL `database-integration` | 12751019539 | `f46289cc040c40aba9f7f85b10104a2f0f8a7f1326be2b4f43d7cce3f1700ff6` |
| `blog-browser-acceptance-40543680564` | 12752197962 | `f5eea57caf774755a9c1f9d1da4c89c1e3cbfd31cc5413dc82c7d94d530174f2` |
| `blog-showcase-parity-40543680502` | 12751959067 | `3be763ac0c60d7aa12635b882d30d1175db9c257f06750b44c68fcf1d7eb84ab` |

PostgreSQL 工件内 `summary.json`：21 个包、115 项 required、462 条成功测试/子测试事件、失败/跳过/缺失均为 0，cleanup exit code=0。构建、注册表镜像发布、生产部署并不是同一事件；此次证明 PR 镜像构建与扫描，不宣称已部署生产。

## 手工视觉审查：先核对结构，再评估动态状态

从最终候选独立下载并逐一打开以下 **4 张新的真实 Product 浏览器截图**：

- `skill-json-invalid-desktop.png` / `skill-json-invalid-mobile.png`：Tool Bindings 的 JSON 文本为嵌套 `null`，输入框边框和字段下方给出红色错误提示 `Each Tool binding must be a JSON object`；Save Skill DOM 被禁用，表单仍保留当前 Skill、工具授权、输入契约及治理限制。移动端没有文档级横向溢出、悬浮按钮遮挡或截断的错误反馈。
- `skill-json-recovered-desktop.png` / `skill-json-recovered-mobile.png`：非法草稿被显式丢弃后，新的有效 JSON 中 `analytics.list_low_engagement_posts.min_views=321` 与可视化 `Minimum Views Cutoff=321` 精确一致，保存恢复可用。标题、Tabs、响应式单列、区块间距、操作区均未漂移；测试验证切回 JSON 后接受值一致。

重新下载最终候选配对产物，并手工查看：

- `ai-settings-skills-dedicated-editor-product.png`
- `ai-settings-skills-dedicated-editor-showcase.png`

二者保留相同的 Dedicated Editor 结构：Page Lead、Skills Tab、返回列表、H2 编辑器标题、能力定义、Tool 授权、输入契约、执行发布边界、默认治理限制、底部操作区。候选和之前已审查的对应两张截图 **字节一致**，非“凭绿色 CI 猜测页面没变”。

**状态差异为有意且业务合理**：Product 当前编辑 `Editorial Operations`，Showcase fixture 展示创建 Skill；Product 选择了可配置 Tool，因此出现 Tool Bindings 子面板及错误/恢复态，而 Showcase 默认创建 fixture 没有这一配置。这是业务数据与状态差别，不是另造 Primitive/重排 canonical composition。未发现本次新增的视觉漂移，故不修改 Gouno UI、样式、布局或设计系统。

## 保留限制

- 当前 Skill 编写的 JSON 验证只阻断语法、根类型和逐 Tool 绑定对象类型；配置内部字段限制仍属于实际后端 Schema 和 Tool 授权边界，不将前端校验作为鉴权凭据。
- 页面运行在测试 API fixture 与真实 Chromium 中，不等于在生产环境执行真实后端 Skill 保存、AAL2 或 Provider 调用。
- 此次仅 `blog-admin-ai` 受影响的 Skill 表单路径完成增量复核；其他 AI Settings / AI Operations 状态沿用已有历史证据，没有虚构新一轮完整全页视觉对比。
- 整体 A+ 的 #359 和审批/Provider/Media 恢复演练 #338 仍开放；最终合并仍须对**认证文档提交的最终 PR head**重新运行全部适用门禁。
