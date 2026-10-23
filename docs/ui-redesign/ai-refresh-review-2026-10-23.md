# AI Operations 整页刷新：人工优先增量审查

Status: **verified** — manual-first delta review of the source candidate recorded below; final-head acceptance remains required.

## 结论与引用

**受影响刷新行为完成增量审查；不是整个 AI 家族的全量人工重审。** Product 基线 `87127fb8171be45f57481e2a81c978c22e0f88c2`；已审查候选 `32ff09fd13bcbb973d7bac3d5f4d238314bade72`，实际测试合并引用 `b1f292c8681c1b039cddfb02832aa92ca9020caf`。Canonical 主分支重新读回为 `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`，包版本仍为 0.4.9。

本批只改变 `AIOperations.tsx` 中整页读取归属；不改 JSX、CSS、Typography、间距、反馈载体或响应式组合。仅 `blog-admin-ai` 从临时 needs-manual-recertification 恢复；其他认证条目不变。未改动 AI 页面和状态的历史覆盖仍为历史覆盖，不能冒充本次重新逐页审查。

## 修改前审查

先读取 Product `AIOperations.tsx` 与 Canonical `showcase/demos/products/blog-admin/ai/operations/index.tsx`，确认并发 API 请求结果归属是 Product 数据绑定责任，不需要改变 Canonical。

打开 #382 最终成对产物 12468130078 中桌面运行中心和手机 Agent 详情的 Product/Showcase PNG，核对标题与 Tabs 层级、运行类型切换、列表/详情、移动单窗格和返回列表。原有数据条数、长输出、业务删除动作差异沿用原认证。长页面首屏裁切仅用于首屏对比，不声称所有长图已逐像素重审；旧截图也不作为本批新验收。

## 新候选证据

候选 `32ff09f` 的 CI **39934393284**、Images **39934393326**、Product Browser **39934393273**、Showcase Parity **39934393266** 全部成功。

| 下载产物 | ID | 独立校验 SHA-256 |
| --- | --- | --- |
| Product Browser，355 项 | 12493447089 | `29839da0748702bd2bcef99405cde37d9c8f8ccfad6f29b9c7e424f9fdc88eaa` |
| Paired Showcase，86 项 | 12494241073 | `ec3e1a0e348aebd4ca21251074fd7549e3f4b634ec30f66eba3dc8f338711430` |

两份报告均核对测试引用，均无 unexpected、flaky 或 skipped。前一版 Browser 39933003204 的 4 个新增用例因 StrictMode 请求数量假设错误而失败，明确排除在已接受证据之外；修正测试后才取得本表结果。

## 实际人工观察

打开了本候选桌面/手机的 Product 与 Showcase 配对图，并逐一打开 6 张新的刷新场景截图：`refresh-initial-superseded-{desktop,mobile}`、`refresh-initial-current-{desktop,mobile}`、`refresh-latest-collection-{desktop,mobile}`。

- 新刷新完成时，即使两个初始化读取尚未结束，也已展示 Run 202 且不再显示 skeleton；随后旧初始化返回 Run 101 和 Run 901，不能改写当前列表。点击后详情与输出均属于 Run 202。
- 手动刷新逆序完成后，桌面列表保留最新批次中的 Run 101 / 303，Run 202 不出现；选中后的标题、正文均为 Run 303。手机仍从列表进入单个详情窗格，并保留返回入口。对应测试同时检查未知 API、意外写入、控制台问题和文档横向溢出。
- 标题、Tabs、PanelLead、主从结构、按钮及间距未因刷新修复发生变更。32ff09f 与前一源代码相同的 161c4f 配对产物比较：全部 8 张 AI Operations PNG 字节一致；这不替代上述人工观察，也不意味着其他 AI Settings 截图全部一致。
- 当前错误可见、显式重试、旧失败忽略、StrictMode 清理以及卸载后的延迟写完成不再派发读取，由实际页面/API 的 8 项回归验证；没有把静态样式比较当作异步行为证明。

## Fixture 修正及最终提交要求

新截图中成功记录显示“Still running / waiting”，溯源为新增最小 fixture 漏填 `finished_at`，不是本次 Product 更改引入的状态逻辑。记录提交同时补齐 `2026-10-23T00:00:02Z`，不改生产组件、不改断言。最终 head 仍须取得自己的全部四项成功门禁、报告/哈希及补正后的实际截图复核；该提交的最终证据写入 #383 验收评论，不能直接沿用本表宣称完成。

这是读侧数据归属的有界修复，不证明真实 Provider、MFA 或授权操作员恢复演练，也不保证所有写后导航、跨组件选择协调都已完成。#359 / #338 与整体 A+ 放行继续保持开放。
