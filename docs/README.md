# chain-subconverter 文档

## 规格说明 (Spec-driven)

**[docs/spec/](spec/)** — 业务逻辑规格，**重构版本**的实现须依此进行；旧版代码仅供参考。

| 文档 | 说明 |
|------|------|
| [spec/01-overview](spec/01-overview.md) | 项目目标、范围 |
| [spec/02-generate-complete-config](spec/02-generate-complete-config.md) | 生成完整配置：通用配置、模板、subconverter、检测与分流 |
| [spec/03-modify-config](spec/03-modify-config.md) | 修改完整配置：链式代理 / 端口转发 |
| [spec/04-output-and-api](spec/04-output-and-api.md) | 输出与 API 契约 |
| [spec/05-review](spec/05-review.md) | Review 结论 |

## 旧版相关文档（历史参考）

基于旧版本代码的评审与说明，当前实现以 spec 及代码为准：

| 文档 | 说明 |
|------|------|
| [legacy/Design-Review-Legacy](legacy/Design-Review-Legacy.md) | 旧版架构与设计评审 |
| [legacy/SSRF-Protection-Legacy](legacy/SSRF-Protection-Legacy.md) | 旧版 SSRF 防护说明（策略可参考） |
