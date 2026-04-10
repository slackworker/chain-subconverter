# 当前状态

> 最近更新：2026-04-10

## 摘要

- `Phase 1` 已完成：`subconverter` 真实 `3-pass` 集成已落地。
- `Phase 2` 已完成最小闭环：固定测试数据与默认值下，已打通 `stage2Init`、`longUrl` 与最终订阅 YAML。
- `Phase 2.5` 正在收口：文档、命名与职责边界继续压实，为 `Phase 3` 做准备。
- `Phase 3`、`Phase 4` 尚未开始。

## Phase 进度

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 0 — 骨架 | 目录、Go module、旧代码归档 | ✅ 完成 |
| Phase 1 — subconverter 集成 | 真实 `3-pass` HTTP 管线 | ✅ 完成 |
| Phase 2 — 最小业务闭环 | 固定测试数据下的 `stage2Init`、`longUrl`、最终订阅 YAML + 最小 HTTP | ✅ 完成 |
| Phase 2.5 — 阶段性整理 | 文档、结构与边界收口 | 🔄 进行中 |
| Phase 3 — 扩展业务与 API 收口 | 恢复、短链、失败语义、完整 API 契约 | ⛔ 未开始 |
| Phase 4 — 前端与部署 | React + TS UI、运行形态、Compose | ⛔ 未开始 |

## 已完成

- 3-pass 集成、最小业务闭环、最小 HTTP 对外层已落地。
- API-only Compose 与 smoke 验证路径已落地。
- 文档边界收口已启动并持续推进。

详细任务项与阶段定义见 [ROADMAP](../ROADMAP.md)。

最小验收基线与固定样例见 [testing/3pass-ss2022-test-subscription.md](../testing/3pass-ss2022-test-subscription.md) 与 `review/cases/3pass-ss2022-test-subscription/`。

## Phase 3 前缺口

- `messages[]`、`blockingErrors[]` 与 HTTP 状态码仍只覆盖最小 happy path，尚未按 [03-backend-api](../spec/03-backend-api.md) 全量收口。
- `POST /api/resolve-url`、`POST /api/short-links`、`GET /subscription/<id>.yaml` 等完整端点仍未实现。
- `internal/store` 仍只有包占位，SQLite 短链接索引与 LRU 淘汰尚未落地。
- 应用层限制仍未完整配置化：阶段 1 输入总大小、每字段 URL 数量、短链容量等仍待实现。
- `web/` 尚未初始化；当前 API-only Compose 仅用于本地验证，不代表完整部署形态已完成。
- SSRF 等安全口径仍只在 `ROADMAP/STATUS` 跟踪，尚未并入权威 spec。

## 验证

- `go test ./...`：2026-04-02 全量通过
- `internal/subconverter`、`internal/service`、`internal/api` 的测试均包含在上述全量测试中
- `docker compose -f deploy/docker-compose.yml up --build -d`：2026-04-02 本地验证通过
- 真实容器 smoke：已跑通 `app + subconverter`，并通过本地静态文件服务托管中转订阅样例与模板完成 3 个现有 API 验证
