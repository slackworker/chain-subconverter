# 当前状态

> 最近更新：2026-04-13

## 摘要

- `Phase 1` 已完成：`subconverter` 真实 `3-pass` 集成已落地。
- `Phase 2` 已完成最小闭环：固定测试数据与默认值下，已打通 `stage2Init`、`longUrl` 与最终订阅 YAML。
- `Phase 2.5` 已完成：文档、命名与职责边界收口已固化，`Phase 4` 可以开始。
- `Phase 3` 已完成：3-A, 3-B, 3-C, 3-D, 3-E 已全部落地，后端扩展业务与 API 契约现已收口。
- `Phase 4` 尚未开始。

## Phase 进度

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 0 — 骨架 | 目录、Go module、旧代码归档 | ✅ 完成 |
| Phase 1 — subconverter 集成 | 真实 `3-pass` HTTP 管线 | ✅ 完成 |
| Phase 2 — 最小业务闭环 | 固定测试数据下的 `stage2Init`、`longUrl`、最终订阅 YAML + 最小 HTTP | ✅ 完成 |
| Phase 2.5 — 阶段性整理 | 文档、结构与边界收口 | ✅ 完成 |
| Phase 3 — 扩展业务与 API 收口 | 恢复、短链、失败语义、完整 API 契约 | ✅ 完成 |
| Phase 4 — 前端与部署 | React + TS UI、运行形态、Compose | ⛔ 未开始 |

## 已完成

- 3-pass 集成、最小业务闭环、最小 HTTP 对外层已落地。
- API-only Compose 与 smoke 验证路径已落地。
- `internal/store` 的 SQLite 短链索引已落地 (基于 `go-sqlite3` 实现并加满约束级并发保护)，并已接入服务运行时配置。
- `docs/README`、`ROADMAP`、`testing` 等文档已对齐。
- `internal/api`、`internal/service` 职责边界已固化。
- `Phase 3` 已完成失败语义收口 (3-A)、输入应用层配置化 (3-B)、`POST /api/resolve-url` (3-C)、短链索引落地 (3-D) 与短链对外端点 (3-E)。
- 已落地 `POST /api/short-links`、`GET /subscription/<id>.yaml`，并由同一短链索引支持 `resolve-url` 短链接恢复与短链订阅读取。
- 订阅路由已按 `publicBaseURL` 的路径前缀注册，长链接与短链接在带 base path 的部署形态下都可直接回放。
- 文档主导航已收敛到 `spec/`、`plan/`、`progress/`、`testing/`；已完成阶段计划与历史材料已移入 `docs/temp/` 待删区。

详细任务项与阶段定义见 [ROADMAP](../ROADMAP.md)。

最小验收基线与固定样例见 [testing/3pass-ss2022-test-subscription.md](../testing/3pass-ss2022-test-subscription.md) 与 `review/cases/3pass-ss2022-test-subscription/`。

- `web/` 尚未初始化；当前 API-only Compose 仅用于本地验证，不代表完整部署形态已完成 (属于 Phase 4 预期)。
- SSRF 等安全口径仍只在 `ROADMAP/STATUS` 跟踪，尚未并入权威 spec。

## 验证

- `go test ./...`：2026-04-11 全量通过（含 `POST /api/short-links`、短链订阅与相关回归测试）
- `internal/subconverter`、`internal/service`、`internal/api` 的测试均包含在上述全量测试中
- `docker compose -f deploy/docker-compose.yml up --build -d`：2026-04-02 本地验证通过
- 真实容器 smoke：已跑通 `app + subconverter`，并通过本地静态文件服务托管中转订阅样例与模板完成 3 个现有 API 验证
