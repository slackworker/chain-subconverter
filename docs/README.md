# chain-subconverter 文档

## Spec 入口

**[docs/spec/](spec/)** — 当前 spec-driven 重构的权威目录。

| 文档 | 说明 |
|------|------|
| [spec/00-governance](spec/00-governance.md) | 治理与总则：核心规则、权威顺序、编写原则 |
| [spec/01-overview](spec/01-overview.md) | 项目概览：目标、数据流、术语与约束 |
| [spec/02-frontend-spec](spec/02-frontend-spec.md) | 前端 UI 规格 |
| [spec/03-backend-api](spec/03-backend-api.md) | 后端 API 契约 |
| [spec/04-business-rules](spec/04-business-rules.md) | 业务规则：转换并自动填充、阶段 2 初始化、阶段 2 配置操作 |
| [spec/05-tech-stack](spec/05-tech-stack.md) | 技术选型与项目结构 |

## 推进与测试

当前实现推进状态、阶段性结论与测试样例说明：

| 文档 | 说明 |
|------|------|
| [vibe-coding-plan](vibe-coding-plan.md) | 当前推进状态、阶段划分、已完成范围与主要缺口 |
| [progress/2026-04-01-status](progress/2026-04-01-status.md) | 本轮 review 结论、提交边界、风险与建议 |
| [testing/3pass-ss2022-test-subscription](testing/3pass-ss2022-test-subscription.md) | `3-pass` 与最小完整流程测试样例说明 |


## 旧 Spec（Legacy Spec）

**[docs/legacy/](legacy/)** — 之前的 spec-driven 重构构想（历史参考）。

| 文档 | 说明 |
|------|------|
| [legacy/01-overview](legacy/01-overview.md) | 项目目标、范围 |
| [legacy/02-generate-complete-config](legacy/02-generate-complete-config.md) | 生成完整配置：通用配置、模板、subconverter、检测与分流 |
| [legacy/03-modify-config](legacy/03-modify-config.md) | 修改完整配置：链式代理 / 端口转发 |
| [legacy/04-output-and-api](legacy/04-output-and-api.md) | 输出与 API 契约 |
| [legacy/05-review](legacy/05-review.md) | Review 结论 |

## 最老相关文档（Archive）

基于最旧版本代码的评审与说明（存档）：

| 文档 | 说明 |
|------|------|
| [archive/Design-Review-Legacy](archive/Design-Review-Legacy.md) | 旧版架构与设计评审（最老版本） |
| [archive/SSRF-Protection-Legacy](archive/SSRF-Protection-Legacy.md) | 旧版 SSRF 防护说明（最老版本；策略可参考） |
