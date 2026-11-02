# A+ 阶段收尾：证据矩阵与生产操作员验收（2026-11-02）

> **状态：正式 A+ GO/NO-GO = NO-GO（尚未签核）。** 本文是风险与证据交接，不是发布许可、生产恢复授权或“恰好一次”保证。维护模式可以有条件启动，但 Issue [#359](https://github.com/rushairer/gouno-blog/issues/359) 与 [#338](https://github.com/rushairer/gouno-blog/issues/338) 必须保持 OPEN，直至逐项验收。

## 1. 冻结边界、基线与本批范围

- 本批修改前、已接受的 \`main\` 基线：\`63eee8391f8053576d965151d001aeda958d8a38\`（PR #400，2026-10-30）。
- 本批候选：集中审阅 Dependabot #401–#406 的 **9 个独立文件、精确 Git Blob**，只更新 Node/Go patch 依赖、三类运行时镜像摘要和已 pin SHA 的 GHCR 登录 Action；不触碰业务行为、登录认证、数据库迁移、Gouno UI 或 Connector。
- 各 Dependabot PR 的独立测试成功 **不替代合并候选的完整 CI、实际 PostgreSQL、Trivy/Grype 和浏览器/Showcase 验收**；禁止因更新只是 minor/patch 就跳过扫描，或以“无 PR”代替质量合格。
- 本批还提供本验收表；没有新版本标签、生产部署、更改生产 secrets 或外部 Provider 调用。构建/测试证据必须关联最终候选 SHA 和合并后的 \`main\` SHA。
- **不因 61 条历史 React Lint 警告做未经批准的 Product 视觉大改；Connector Module Hold 保持原样。**

## 2. 已有、可复核的自动门禁证据（仅限注明的 SHA）

| 项目 | 精确基线证据 | 解释及剩余边界 |
| --- | --- | --- |
| 主分支 CI | [41044609541](https://github.com/rushairer/gouno-blog/actions/runs/41044609541) | Backend/Seed/Frontend 与实际 PostgreSQL 21 packages / 115 required；Go race、vet、govulncheck、Oxlint 61/61 warning ratchet，0 errors；不是生产签核 |
| 主分支镜像供应链 | [41044609537](https://github.com/rushairer/gouno-blog/actions/runs/41044609537) | 三张镜像构建/推送，6 次 Trivy+Grype，**实际 Cosign sign 3/3 与 verify 3/3**，各自 SPDX/CycloneDX；验证的是 main workflow 的真实签名，不是 tag/线上镜像 |
| Showcase 结构/渲染 | [41044609555](https://github.com/rushairer/gouno-blog/actions/runs/41044609555) | 86/86 paired parity；自动证据不取代人工设计认证 |
| Chromium 产品回归 | [41042011058](https://github.com/rushairer/gouno-blog/actions/runs/41042011058) | 363/363，仅适用于此前经过验证的产品源代码版本；PR #400 基础设施变更没有再触发浏览器回归，不可虚构一次 |
| 关键 BFF 包覆盖率 | [#359](https://github.com/rushairer/gouno-blog/issues/359) | 已建立 80% fail-closed 底线、测得 83%；覆盖率不是安全性的形式证明 |

上述“通过”仅证明相应流水线在相应提交执行完成。升级到新 \`main\` 后，应重新读取工作流、提交、附件摘要；不能将这组证据自动移植到新 commit。

## 3. #338：操作员恢复验收（必须有人、隔离环境、保留审计）

**前置条件**：在可回滚的隔离环境/授权测试账号演练；确认新迁移已应用、所有旧版 worker 已停止；记录环境、构建 digest、审核员身份/权限、AAL2 最近 MFA 和工单编号。不要在真实付费 Provider 或生产对象存储上模拟故障；不得上传密钥、客户数据和敏感完整 URL 到 GitHub。

参照 [Agent approval 事故手册](agent-approval-in-doubt-recovery.md) 与 [Media 手工恢复手册](media-generation-manual-recovery.md)，逐场景**只对本次场景创建隔离 fixture**，由独立审核员检查：

| 场景 | 必须验证的观察（只读对账优先） | 禁止的捷径 |
| --- | --- | --- |
| PostgreSQL effect 已提交但 COMMIT ACK 丢失 | 同一 \`source_approval_id\` 仅一个业务结果；批准状态与业务结果一致或隔离，保存查询及审计链 | 直接 SQL 改 \`approved\` 为 \`pending\`、重放原 approval |
| Provider 请求后超时/可能扣费 | 通过确切 attempt、dispatch、Provider/账单和工单证明人工已检查；不确定时继续隔离 | 认为超时=未执行、自动重试或依据请求 ID 推断幂等 |
| 对象存在但 DB/候选关联结果不确定 | 核对对象与 Media DB、存储名和精确 generation audit；确保未误删可能被引用的对象 | 单凭“孤儿”标签自动清理/重挂 |
| 旧尝试延迟完成或重复审核 | generation_attempt CAS 拒绝旧完成；仅一条 append-only 恢复决策；新尝试需另一独立人类操作 | 释放旧租约后由后台自动再次生成 |
| 不合规恢复调用 | 无 ManageAI 或 ManageSite、无近期强 MFA、旧 attempt 或重复决定必须拒绝；保留不可变审计 | 仅凭“已过期”绕过权限/对账 |

验收单（**下面空格必须由实际操作者填写，AI 不得代签**）：

- 环境 / 工单 / 日期 / 当前镜像 digest：**未填**
- 双人审核人、最近 MFA 的受控验证证据、授权记录：**未填**
- 上面每个场景的结果、数据库/对象/Provider 核验链接（仅非敏感引用）：**未填**
- 未重放、未误删、无额外未授权 Provider 请求的客观证据：**未填**
- 未知结果的隔离状态和明确决策（保留 quarantine 或人工认可的下一步）：**未填**

**无真实 operator dry-run 记录则 #338 仍未验收。** 本地事务幂等与 CI fault-injection 不等于 Provider 的 exactly-once 或扣费保证。

## 4. #359：独立发布签核与回滚演练

必须为实际拟发布的 \`vMAJOR.MINOR.PATCH\` **tag** 及生产使用的 backend、frontend、seed 镜像分别登记：

1. 对照 CHANGELOG、兼容矩阵、GitHub Release、tag workflow 及 release 附件；核对每个 OCI **image@sha256 digest**（不可用下载附件 ZIP 的 sha256 替代 OCI digest）。
2. **独立**执行对 release-tag 身份的 \`cosign verify\`，要求 exact \`https://github.com/rushairer/gouno-blog/.github/workflows/publish-images.yml@refs/tags/vX.Y.Z\` 和 \`https://token.actions.githubusercontent.com\`，并核对三张已部署镜像的 digest、SPDX/CycloneDX、provenance 与镜像扫描结论。仅通过 \`main\` identity 的签名不可充当 release-tag 证据。
3. 对照生产 Compose 的 immutable \`version@sha256:digest\`、实际运行容器镜像 digest、凭证文件权限和回调/CIDR/OIDC 约束。检查秘密文件仅存在于预期位置；记录**检查结论**而非任何秘密值。
4. 在批准的环境演练升级及回滚，记录迁移前备份、升级/回滚可逆性、停机与恢复验证。**含不可逆数据库迁移时不能假装可以直接降版本**，需提供单独恢复方案与验收。
5. 捕获线上真实用户 RUM/Core Web Vitals（按流量与样本量标注）和关键登录/授权/文章/AI 流程的人工冒烟记录；自动 Playwright 和 500kB chunk budget 不能代替线上性能/UX 结论。

需要记录的生产证据：\`release_tag\`、\`release_commit\`、部署环境、三张 OCI digest、三次 Cosign release-tag 验证结果、实际运行 digest 核验、回滚记录、操作员/复核员、日期与安全风险接受记录。**当前均未提供，不得标成通过。**

## 5. 明确保留的技术债、治理与退出条件

- 前端当前 **61 warning / 0 error**：继续维持严格不可上调的 ratchet。后续按 Hook/render impurity/回调依赖/纯工具警告等分类；只有证明真实逻辑缺陷并具备浏览器/人工认证证据，才改动已认证 Product 源码。
- **16 个**非 Connector capability controller 的 direct/first-order 错误边界有 AST 防护，但间接错误传播和其余 middleware 不等于已穷举；需要风险化检查，不得宣布全站已证明安全。
- Connector 已发现的 raw decoder 错误返回路径继续登记为未验收风险；保持产品冻结，直到用户明确下达 Connector 变更需求或由具名负责人批准临时补偿与期限。**未批准不得私自改动，也不得在风险记录里伪称已修复。**
- Provider 上游执行/计费的不确定结果、保留的对象证据和人工恢复必须实际验收。可控集成测试不能替代生产账单确认。
- 批量更新依赖后，仅当新候选与合并后 CI 都通过、差异在可审范围、影响路径复核完成，才关闭被精确内容覆盖的 Dependabot PR。关闭≠合并，需逐个注明对应的已采纳 SHA。

**验收决策**：在上述操作员记录、部署签名/回滚实证、未解决 P0/P1 风险处置（具名 owner、补偿措施和失效日期）签核之前，整体 A+ **NO-GO**。允许“停止主动重构、转稳定维护”的工程节奏决策，但不能将它写成 A+ 认证或生产发布许可。