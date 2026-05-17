# chain-subconverter 文档

## 仓库入口

如需了解对外产品说明、当前镜像口径与部署方式，优先查看：

- [../README.md](../README.md)
- [../RELEASES.md](../RELEASES.md)
- [../deploy/README.md](../deploy/README.md)

## 阅读入口

本文档是当前仓库文档的唯一导航入口。

1. 先读 [spec/00-governance](spec/00-governance.md) 与 [spec/01-overview](spec/01-overview.md)。
2. 需要看当前执行重点、分支/标签策略或阶段缺口时，读 [plan/3.0-release-stabilization](plan/3.0-release-stabilization.md)、[progress/STATUS](progress/STATUS.md) 与 [progress/beta-readiness](progress/beta-readiness.md)。
3. 需要看详细契约与业务规则时，按主题进入 `spec/02-05`。
4. 需要看固定回归基线、本地 smoke 或发布回归流程时，进入 `testing/`。

## 目录约定

`docs/` 只保留当前开发直接需要的文档类型：

| 目录 | 用途 |
|------|------|
| `spec/` | 当前权威规格；规则冲突按 `spec/00-governance.md` 裁决 |
| `plan/` | 当前执行计划；只保留仍在推进的计划 |
| `progress/` | 当前状态快照、Beta 缺口与阶段记录 |
| `testing/` | 固定验收样例、本地 smoke 与发布回归说明 |
| `temp/` | 临时待删区；非权威、默认不纳入版本控制 |

## 当前核心文档

| 文档 | 说明 |
|------|------|
| [spec/00-governance](spec/00-governance.md) | 治理与总则：轻量流程、权威顺序、文档同步原则 |
| [spec/01-overview](spec/01-overview.md) | 项目概览：目标、数据流、术语与约束 |
| [spec/02-frontend-spec](spec/02-frontend-spec.md) | 前端 UI 规格 |
| [spec/03-backend-api](spec/03-backend-api.md) | 后端 API 契约 |
| [spec/04-business-rules](spec/04-business-rules.md) | 业务规则：转换并自动填充、阶段 2 初始化、阶段 2 配置操作 |
| [spec/05-tech-stack](spec/05-tech-stack.md) | 技术选型与项目结构 |
| [plan/3.0-release-stabilization](plan/3.0-release-stabilization.md) | 当前发布整理计划 |
| [progress/STATUS](progress/STATUS.md) | 当前状态快照：已稳定范围、当前缺口与最近验证 |
| [progress/beta-readiness](progress/beta-readiness.md) | Beta 前置条件、剩余缺口与进入 Beta 的推荐顺序 |
| [ROADMAP](ROADMAP.md) | 阶段路线图与当前推荐下一步 |
| [testing/3pass-ss2022-test-subscription](testing/3pass-ss2022-test-subscription.md) | 当前唯一稳定固定 fixture 说明 |
| [testing/local-dev-smoke](testing/local-dev-smoke.md) | 本地开发与 smoke runbook |
| [testing/release-runbook](testing/release-runbook.md) | 当前发布与回归 runbook |

## 临时区规则

`docs/temp/` 只用于放置以下材料：

- 已完成阶段的细化计划
- 待删除的 legacy、archive、迁移映射
- 短期整理过程中的临时说明

使用约束：

- `docs/temp/` 内文档不参与当前开发裁决。
- 主导航不再引用 `docs/temp/` 内历史材料。
- 若无明确保留理由，临时区内容应在后续整理中直接删除，而不是继续归档。
- 临时区规则见 [temp/README](temp/README.md)。
