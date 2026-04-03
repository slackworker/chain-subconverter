# 文档迁移索引

> 本页只做迁移映射，不定义业务规则。
>
> 当前权威规格入口：[`docs/spec/`](spec/)。

## Legacy -> Current Spec

| 历史文档 | 当前归属 | 说明 |
|---|---|---|
| `legacy/01-overview.md` | `spec/01-overview.md` | 项目目标、术语与高层流程 |
| `legacy/02-generate-complete-config.md` | `spec/04-business-rules.md` | 转换与自动填充规则 |
| `legacy/03-modify-config.md` | `spec/04-business-rules.md` | 阶段 2 改写与校验规则 |
| `legacy/04-output-and-api.md` | `spec/03-backend-api.md` | 接口契约与输出语义 |
| `legacy/05-review.md` | `ROADMAP.md` + `progress/STATUS.md` | 历史 review 与推进跟踪 |

## Archive -> Current Context

| 历史文档 | 当前位置 | 处理方式 |
|---|---|---|
| `archive/Design-Review-Legacy.md` | `spec/05-tech-stack.md` + 代码现状 | 仅保留历史对比价值 |
| `archive/SSRF-Protection-Legacy.md` | `ROADMAP.md` + `progress/STATUS.md` | 当前作为待定治理项跟踪 |

## 使用约束

- 历史文档只用于追溯背景，不参与当前冲突裁决。
- 规则冲突时，按 `spec/00-governance.md` 的权威顺序处理。
