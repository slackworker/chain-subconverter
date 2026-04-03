# 当前状态

> 最近更新：2026-04-03

## 当前结论

项目当前实际推进到：

- 治理口径已切换为“spec 与开发并行推进”，以 [spec/00-governance](../spec/00-governance.md) 为准。

- `Phase 1` 已完成：`subconverter` 真实 `3-pass` 集成已落地
- `Phase 2` 已完成（最小范围）：固定测试数据与默认值下，服务层能产出 `stage2Init`、编码 `longUrl`、渲染最终 YAML，且已通过最小 HTTP 层对外暴露上述闭环（见下文「已完成」）
- `Phase 2.5` 仍在进行中：文档与根 README 已跟进实现对齐；分层职责已写在包注释与本文；`ROADMAP` / `STATUS` / `spec/05-tech-stack` 已标明「最小闭环 vs 目标栈」；后续工作继续推进
- `Phase 3` 尚未开始：完整 API 契约、恢复、短链、失败语义与配置化限制均已后移
- `Phase 4` 尚未开始：前端、SQLite 持久化与完整单入口部署继续后置

## Phase 进度

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 0 — 骨架 | 目录、Go module、旧代码归档 | ✅ 完成 |
| Phase 1 — subconverter 集成 | 真实 `3-pass` HTTP 管线 | ✅ 完成 |
| Phase 2 — 最小业务闭环 | 固定测试数据下的 `stage2Init`、`longUrl`、最终 YAML + 最小 HTTP | ✅ 完成 |
| Phase 2.5 — 阶段性整理 | 文档、结构与边界收口 | 🔄 进行中 |
| Phase 3 — 扩展业务与 API 收口 | 恢复、短链、失败语义、完整 API 契约 | ⛔ 未开始 |
| Phase 4 — 前端与部署 | React + TS UI、运行形态、Compose | ⛔ 未开始 |

## 分层职责边界

以下说明 **internal/service**、**internal/api** 与 **testdata**（及验收文档）的分工，便于区分 Phase 2 基线与后续 Phase 3 契约收口。

| 层 | 职责 | 不包含 |
|----|------|--------|
| **internal/service** | 业务规则：`stage2Init`、长链接逻辑载荷编解码、完整配置 YAML 渲染、3-pass 结果解析为 `ConversionFixtures`、与 spec 对齐的校验与错误类型（对调用方以错误值表达） | HTTP 状态码、路由、JSON 响应形状；不直接暴露 subconverter URL 拼接细节以外的集成策略（集成集中在 `internal/subconverter`） |
| **internal/api** | `net/http` 路由；请求体/query 解析；调用 `service` 的 `*FromSource`；将错误映射为 HTTP 状态与 `blockingErrors`；订阅 YAML 的 `Content-Type` / `Content-Disposition` | 业务推导与 YAML 生成逻辑 |
| **internal/subconverter** | 3-pass HTTP `Client`、超时与并发、不可用类错误映射 | 业务层链式/区域规则 |
| **testdata/…/3pass-ss2022-test-subscription/** | 机器可读的请求/响应/载荷/YAML golden，作为自动化测试真相源 | 手工 smoke 流程（见 `deploy/smoke/`） |
| **docs/testing/3pass-ss2022-test-subscription.md** | Phase 2 主验收基线的人类可读说明与默认参数 | 非 Phase 2 的短链、恢复冲突、完整错误模型（应另起用例或文档） |

**说明**：当前 `internal/api` 测试覆盖的是 **最小 happy path** 与 golden 对齐，**不代表** [03-backend-api](../spec/03-backend-api.md) 已全部实现；失败语义与额外端点属于 Phase 3。

## Phase 3 入口范围与非目标

Phase 3 的计划范围与非目标以 [ROADMAP](../ROADMAP.md) 为准；本节仅保留“当前尚未落地”的实现快照：

- `POST /api/resolve-url`、`POST /api/short-links`、`GET /subscription/<id>.yaml` 仍未实现
- `internal/store` 仍为占位，SQLite 短链索引与 LRU 未落地
- HTTP 层仍为标准库 `net/http`，尚未按目标栈收敛到 Gin

## 结构盘点（Phase 2.5）

- `internal/service/conversion_source.go` 中多个 `Build*FromSource` 各自调用 `LoadConversionFixtures`：为薄封装、意图清晰，**不**合并为单一泛型入口，避免增加 indirection。
- 未发现需在本轮删除的临时包名或死代码路径；HTTP 自标准库迁移至 Gin 时，以 `internal/api` 为主改造面，业务逻辑保持留在 `internal/service`。

## 已完成

当前已完成的里程碑维持不变（Phase 0-2 完成，Phase 2.5 进行中），此处仅保留摘要：

- 3-pass 集成、最小业务闭环、最小 HTTP 对外层已落地
- API-only Compose 与 smoke 验证路径已落地
- 文档边界收口已启动并持续推进中

详细任务项与阶段定义见 [ROADMAP](../ROADMAP.md)。

最小验收基线与固定样例见 [testing/3pass-ss2022-test-subscription.md](../testing/3pass-ss2022-test-subscription.md) 与 `testdata/subconverter/3pass-ss2022-test-subscription/`。

## 已知缺口

### Phase 2 与 spec 的差距（与 [ROADMAP](../ROADMAP.md) 中 Phase 2「明确不纳入」一致）

- 失败面仍以最小 happy path 为主：`messages[]` / `blockingErrors[]` 与 HTTP 状态码尚未按 [03-backend-api](../spec/03-backend-api.md) 全量收口
- 未实现：`POST /api/resolve-url`、`POST /api/short-links`、`GET /subscription/<id>.yaml` 等，留待 Phase 3
- 仍需保持「最小闭环」与「完整契约」的边界清晰，避免在文档或实现上把后续阶段能力提前混入 Phase 2 验收口径

### Phase 3

- `internal/api` 仅有上述最小端点；`POST /api/resolve-url`、`POST /api/short-links`、短链语义、`GET /subscription/<id>.yaml` 等仍属 Phase 3
- `internal/store` 仍只有包占位，未实现 SQLite 短链接索引与 LRU 淘汰
- 应用层配置尚未覆盖阶段 1 输入总大小、每字段 URL 数量、短链容量等（长链接长度上限已通过 `CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH` 部分可配置）

### 待定治理项（跟踪中）

- 安全口径归位（含 SSRF 相关历史策略）当前仅在 `ROADMAP/STATUS` 跟踪
- 进入对应实现阶段前，先完成“是否并入 `docs/spec/` 及归属章节”的治理决策

### Phase 4 与部署

- `web/` 仍未初始化前端工程
- 已具备 **API-only** 的最小 Compose 路径，但这不等同于完整 `Phase 4`
- 仍未实现：前端静态资源接入、SQLite 持久化、正式单入口 Web UI、完整部署运维收口

## 验证

- `go test ./...`：2026-04-02 全量通过
- `internal/subconverter`、`internal/service`、`internal/api` 的测试均包含在上述全量测试中
- `docker compose -f deploy/docker-compose.yml up --build -d`：2026-04-02 本地验证通过
- 真实容器 smoke：已跑通 `app + subconverter`，并通过本地静态文件服务托管中转订阅样例与模板完成 3 个现有 API 验证
