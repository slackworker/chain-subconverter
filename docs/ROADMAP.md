# 推进路线图

本文只记录阶段目标、非目标、依赖与推荐顺序。已完成阶段的任务拆解见 Git 历史；当前状态以 [progress/STATUS.md](progress/STATUS.md) 为准。

## Phase 依赖

```mermaid
flowchart LR
    P1["Phase 1\nsubconverter 集成"] --> P2["Phase 2\n最小业务闭环"]
    P2 --> P25["Phase 2.5\n阶段性整理"]
    P25 --> P3["Phase 3\n扩展业务与 API 收口"]
    P3 --> P4["Phase 4\n前端与部署"]
```

## Phase 1：subconverter 集成层收口（已完成）

**目标**：`internal/subconverter/` 从占位变为可用。

**结论**：`Client`、超时与并发、错误映射与 golden 测试已落地。详见 [STATUS.md](progress/STATUS.md)。

## Phase 2：最小业务闭环（已完成）

**目标**：固定测试数据下打通「落地 + 中转 → `stage2Init` → `longUrl` → 订阅 YAML」。

**结论**：3-pass happy path、默认 `stage2Init`、`longUrl` 与 YAML 回放已固化到 [3pass-ss2022-test-subscription.md](testing/3pass-ss2022-test-subscription.md) 与 `internal/service` / `internal/api` 测试。

**本阶段未纳入**：短链、完整 `resolve-url` / `blockingErrors`、端口转发全量、前端与部署（见 Phase 3–4）。

## Phase 2.5：阶段性整理（已完成）

**目标**：文档、包边界与下一阶段起点收口。

**结论**：已写入 [STATUS.md](progress/STATUS.md) 与 fixture 文档。安全口径（含 SSRF）仍在 ROADMAP/STATUS 跟踪，待对应实现阶段再决定是否并入 spec。

## Phase 3：扩展业务与 API 收口（已完成）

**目标**：补齐完整后端业务面与对外契约。

**结论**：`stage1/convert`、`generate`、`resolve-url`、`short-links`、订阅读取、失败语义、短链存储与配置限制已落地。细节见 [spec/03-backend-api.md](spec/03-backend-api.md) 与 [STATUS.md](progress/STATUS.md)。

## Phase 4：前端、部署与发布整理（进行中）

**目标**：在后端扩展业务稳定后，完成前端默认入口、部署路径、分支/标签策略与文档收口。

当前执行入口见 [plan/3.0-release-stabilization](plan/3.0-release-stabilization.md)（Beta 冻结后并入 STATUS 并删除该 plan）。

| 任务 | 说明 |
|------|------|
| 默认 UI 固定 | 默认入口 `/` + `default` scheme；A/B/C 为实验入口 |
| 发布模型收口 | `dev / beta / main` → `dev-latest / beta-latest / latest` |
| 用户文档整理 | README、RELEASES、deploy 只保留对外必要说明 |
| 内部状态整理 | STATUS、计划、路线图、runbook 与实现同步 |
| 固定回归基线 | `3pass-ss2022` + `dual-landing-chain-port-forward`；补 E2E 阻断路径（非 blocking） |

> 具体状态与缺口见 [progress/STATUS.md](progress/STATUS.md)。

## 推荐下一步

按最小增量推进：

1. ~~发布 `v3.0.0-beta.2`~~（2026-05-25 已发布；vps-01/02 实战回归已归档）。后续 beta.N 按 [release-runbook](testing/release-runbook.md)；plan 在 Beta 线稳定后并入 STATUS 并删除 plan 文件。
2. 补 Playwright 阻断路径；mock smoke 已在 CI（`web-mock-e2e`，非 blocking），升级 blocking 视需要。
3. 持续精简 `docs/temp/` 与状态页，避免文档膨胀。
