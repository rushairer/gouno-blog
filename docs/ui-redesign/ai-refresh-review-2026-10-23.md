# AI Operations 整页刷新：人工优先增量审查

## 当前状态：待新候选版本验收

Product 基线 `87127fb8171be45f57481e2a81c978c22e0f88c2`，Canonical `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`。本批修复工作区读取归属；受影响认证仅 `blog-admin-ai`，其他认证保持不变。

## 修改前实际审查

先读取 Product `AIOperations.tsx` 的请求和呈现实现，以及 Canonical `showcase/demos/products/blog-admin/ai/operations/index.tsx`。确认并发 API 读取归属是 Product 数据绑定责任，不需要改变 Canonical 页面结构。

打开并并排检查 #382 最终成对产物 **12468130078** 中桌面运行中心和手机 Agent 详情的 Product/Showcase PNG。核对标题与 Tabs 层级、运行类型切换、列表/详情结构、移动端单窗格和返回列表。既有数据条数、长输出和业务删除动作差异沿用原认证；长页面裁切只用于首屏对比，不声称整张长图已重新逐像素审查。这些是修改前基线，不是 #383 的新验收证据。

## 预计影响与检查要求

本批保留 JSX、CSS、Typography、间距、反馈载体及响应式组合。仅改变哪些异步批次有权更新数据、错误提示和初始化 loading。应在当前请求成功后看到最新列表，过期批次不能改变列表；当前失败仍可见且可由用户显式重试。写后读取失败不能自动再次执行写操作。

需要本批成功的完整 Product 浏览器与成对 Showcase 产物，核对对应提交与哈希，再打开桌面浅色/手机深色的刷新接管、逆序响应截图及相关成对截图，完成增量认证。自动通过本身不等于人工审查；不复用历史截图伪造新验收，不将未改动 AI 页面的历史状态覆盖冒充本次全量人工重审。

最终 run、artifact、hash 和人工观察在实际完成后记录；在此之前 ledger 保持 needs-manual-recertification。
