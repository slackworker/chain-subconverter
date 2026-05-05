# chain-subconverter 文档

## 仓库入口

如需了解对外产品说明与当前版本发布信息，优先查看：

- [../README.md](../README.md)
- [../RELEASES.md](../RELEASES.md)

## 阅读入口

本文档是项目文档的唯一导航入口。

1. 先读 [spec/00-governance](spec/00-governance.md) 与 [spec/01-overview](spec/01-overview.md)。
2. 按主题进入前端、API、业务规则、技术约束。
3. 只有在需要了解推进顺序、当前缺口或本地联调流程时，再读 [ROADMAP](ROADMAP.md)、[progress/STATUS](progress/STATUS.md) 与 `testing/` 文档。

## 目录约定

`docs/` 只保留当前开发直接需要的文档类型：

| 目录 | 用途 |
|------|------|
| `spec/` | 当前权威规格；规则冲突按 `spec/00-governance.md` 裁决 |
| `plan/` | 当前或紧邻下一阶段的执行计划；已完成阶段计划移出主导航 |
| `progress/` | 当前状态快照与阶段缺口 |
| `testing/` | 验收样例、工作流与回归说明 |
| `temp/` | 临时待删区；非权威、默认不纳入版本控制 |

## 权威文档

**[docs/spec/](spec/)** — 当前收口与微调阶段的核心规则目录（用于与实现对齐整理）。

| 文档 | 说明 |
|------|------|
| [spec/00-governance](spec/00-governance.md) | 治理与总则：核心规则、权威顺序、编写原则 |
| [spec/01-overview](spec/01-overview.md) | 项目概览：目标、数据流、术语与约束 |
| [spec/02-frontend-spec](spec/02-frontend-spec.md) | 前端 UI 规格 |
| [spec/03-backend-api](spec/03-backend-api.md) | 后端 API 契约 |
| [spec/04-business-rules](spec/04-business-rules.md) | 业务规则：转换并自动填充、阶段 2 初始化、阶段 2 配置操作 |
| [spec/05-tech-stack](spec/05-tech-stack.md) | 技术选型与项目结构 |

## 推进与验证

| 文档 | 说明 |
|------|------|
| [ROADMAP](ROADMAP.md) | 推进路线图：Phase 划分、依赖关系与推荐下一步 |
| [plan/phase-4-breakdown](plan/phase-4-breakdown.md) | Phase 4 细化计划：前端主线、非目标与建议推进顺序 |
| [plan/phase-4-dev-readiness](plan/phase-4-dev-readiness.md) | Phase 4 本地预览与联调就绪计划：ABC UI 开发前的运行、测试与 smoke 收口 |
| [progress/STATUS](progress/STATUS.md) | 当前状态快照：进度、已完成范围、已知缺口 |
| [testing/3pass-ss2022-test-subscription](testing/3pass-ss2022-test-subscription.md) | `3-pass` 与最小完整流程测试样例说明 |
| [testing/local-dev-smoke](testing/local-dev-smoke.md) | 本地 UI 启动与 smoke runbook：固定入口、最小检查项与常见排障 |
| [testing/alpha-release](testing/alpha-release.md) | 3.0 Alpha 发布与回归 runbook：当前内测口径、发布前检查、第三方设备回归与反馈记录模板 |

## 临时区规则

`docs/temp/` 用于放置以下材料：

- 已完成阶段的细化计划
- 待删除的 legacy、archive、迁移映射
- 短期整理过程中的临时说明

使用约束：

- `docs/temp/` 内文档不参与当前开发裁决。
- 主导航不再引用 `docs/temp/` 内历史材料。
- 若无明确保留理由，临时区内容应在后续整理中直接删除，而不是继续归档。
- 临时区规则见 [temp/README](temp/README.md)。
