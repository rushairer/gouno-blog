# OpenAI 文本流式协商复查：2026-10-15

## 结论与边界

本次从远端 main `1bcae8ba9942eaf6412bb716c308e760e2ec2888` 开始，复查重复出现的 `Stream must be set to true`。PR #333 确实已合并为 `127c989e44f64e64ff3e0a33511cb2b33c4ce850`，当前 `http.go` 仍包含该原文识别分支，不能解释为忘记合并。

确认存在的第二层缺陷是：流式协商之后的真实错误被第一次非流式错误覆盖。已用当前代码和可控 HTTP 服务复现。尚未读取生产 Provider 配置、运行中容器 digest 或新的生产 Run，因此不能断言本次线上失败的第二个响应一定是超时、鉴权或某个具体状态码，也不能把发布镜像等同于已部署。

## 根因

`openAIResponses` 和 `openAIChatCompletions` 原来仅在第二次 `p.do` 成功时返回新结果。第二次失败则丢弃 `streamErr`，最终返回第一次的 `err`。因此即使第二次确实发送了 `stream:true`，随后发生 401、429、500、超时等错误，外部仍看到第一次的 400 / `Stream must be set to true`，错误链中的 request evidence 也指向第一次请求。

外层 `openAIGenerate` 在自动协议模式下无条件切换 Responses 到 Chat Completions；第二协议失败时又返回第一协议错误。这会掩盖最终失败原因，并在不适合协议探测的错误上增加请求。

上次回归测试覆盖了“精确文案触发协商，第二次成功”的路径，但没有覆盖第二次失败及自动协议外层组合，这是原修复不完整的原因。

## 反向复现证据

先只加入测试，不修改实现。测试提交 `2500f9f55612b61ddf75c8c9aee826eede5fa2df` 的 CI run `38722515611` / Backend job `116380284008` 在 Go 1.27.2 上运行 `go test -coverprofile=coverage.out ./...`，确认失败于新增的协商测试，而不是编译或环境配置。

- 两个显式协议和两个自动协议值，分别模拟流式第二请求返回 400/401/403/404/405/429/500/502。旧代码全部错误返回第一次 required-stream 400 和 `nonstream-request` evidence。
- 自动协议模式在流式失败后多发 Chat 请求：实际 3 次 HTTP 请求，而测试要求停止于该端点的 2 次协商请求。
- 当两个端点持续拒绝时，旧代码发送 4 次请求，仍返回第一次错误。
- 流式传输取消、超时和 EOF 的 cause 丢失；404/405 协议探测后 Chat 的鉴权错误被原 Responses 错误覆盖。
- `never` 原来没有显式序列化 false，也没有指出与上游要求冲突；`always` 的失败没有说明 true 已经发送。

这些测试通过可控服务验证客户端行为，不冒充生产网关实测。

## 修复

将两个文本端点的重复请求协商收敛到 `openAITextRequest`。保持 auto 第一次请求的既有非流式行为，只在既有 typed 400/422 required-stream 判定后，用同一端点、同一业务载荷发送一次 `stream:true`，流式请求同时声明 `Accept: text/event-stream`。

错误包装仅保留最后一次请求的 cause，固定描述包含 API 路径和实际 stream 状态，不加入配置 URL、prompt 或凭据。保留 `errors.Is` / `errors.As` 与最后一次 request evidence。明确 `stream_mode=never` 冲突，不偷偷修改配置。对已发送 true 仍被拒绝的情况，报告实际阶段，不循环重放。

自动文本协议探测只保留初始 HTTP 404/405 的兼容路径；明确要求 streaming 后发生的任何失败，不再自动切换端点。指定协议的配置不变。此规则不是所有上游 HTTP 404 均无计费的证明；已知网关应使用明确的协议配置。

本次不改动 SSE 文本/工具调用解码器、图片生成的单端点无重放约束、Connector 产品行为、Confidential BFF/OIDC、UI、依赖版本、生产 immutable digest 或本地 443/80。

## 验证与部署核对

PR #369 保留先红后绿的执行记录。完成修复后必须在最终提交上通过 Backend test/coverage、race、vet、go mod verify、govulncheck，数据库集成、Seed/Frontend/Compose，以及多架构镜像和 Trivy/Grype 门禁；最终执行编号记录在 PR 验收评论，避免为回写每个编号循环触发 CI。

发布之后，运维应独立核对运行中 backend 的 OCI revision 与 image digest，并创建一个新的 Run。历史失败 Run 是持久化记录，不会因为代码升级自动变成成功。不要发送 API Key、Cookie、token 或完整带凭据的请求日志。

如新错误包含 `streaming fallback (stream=true) failed`，以其最后一个 HTTP/transport 错误定位；如明确为 `stream_mode=never` 冲突，需要人工选择 auto/always；如请求已声明 true 而上游仍拒绝，应核对实际网关、协议与请求转发行为，不能再假设客户端没有设置 stream。
