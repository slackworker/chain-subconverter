# 当前状态

> 最近更新：2026-04-02

## 当前结论

项目当前实际推进到：

- `Phase 1` 已完成：`subconverter` 真实 `3-pass` 集成已落地
- `Phase 2` 已完成（最小范围）：固定测试数据与默认值下，服务层能产出 `stage2Init`、编码 `longUrl`、渲染最终 YAML，且已通过最小 HTTP 层对外暴露上述闭环（见下文「已完成」）
- `Phase 2.5` 尚未开始：文档、职责边界与非目标范围的阶段性整理仍待进行
- `Phase 3` 尚未开始：完整 API 契约、恢复、短链、失败语义与配置化限制均已后移
- `Phase 4` 尚未开始：前端与部署继续后置

## Phase 进度

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 0 — 骨架 | 目录、Go module、旧代码归档 | ✅ 完成 |
| Phase 1 — subconverter 集成 | 真实 `3-pass` HTTP 管线 | ✅ 完成 |
| Phase 2 — 最小业务闭环 | 固定测试数据下的 `stage2Init`、`longUrl`、最终 YAML + 最小 HTTP | ✅ 完成 |
| Phase 2.5 — 阶段性整理 | 文档、结构与边界收口 | ⛔ 未开始 |
| Phase 3 — 扩展业务与 API 收口 | 恢复、短链、失败语义、完整 API 契约 | ⛔ 未开始 |
| Phase 4 — 前端与部署 | React + TS UI、运行形态、Compose | ⛔ 未开始 |

## 已完成

### 基础工程

- Go module 与目录骨架已建立
- `internal/api`、`internal/config`、`internal/store`、`internal/subconverter`、`internal/service` 包路径已固定
- 旧实现已归档至 `_legacy/`

### Phase 1：subconverter 集成

- `internal/config` 已提供最小运行时配置：`baseURL`、`timeout`、`maxInFlight`，并支持环境变量覆盖
- `internal/subconverter` 已实现真实 `3-pass` HTTP `Client`，包含 URL 构造、参数透传与统一调用入口
- 已落实超时与并发上限控制，达到上限立即失败，不排队
- 超时、连接失败、非成功 HTTP、不可解析结果等已统一映射到不可用类错误
- `internal/service/conversion_source.go` 已能把真实 `3-pass` 结果适配为服务层消费的 `ConversionFixtures`

### Phase 2：最小业务闭环

- 已能从固定 `3-pass` 结果推导 `stage2Init`
- 已实现链式候选与端口转发候选收集
- 已实现 `vless-reality` 的 `restrictedModes.chain`
- 已实现生成前快照校验、规范长链接编码/解码、最终 YAML 渲染
- 已实现“落地节点出默认 6 个区域策略组”的后处理
- 区域识别已改为读取仓库内置 `internal/service/default_region_config.ini` 中的完整正则，而不是代码内置关键词规则
- 当前最小业务闭环的默认输入与默认输出，已由测试样例固定

### Phase 2：最小 HTTP 对外层（与 ROADMAP「Phase 2 明确不纳入」之外的最小增量）

- `internal/api` 已实现最小路由：`POST /api/stage1/convert`、`POST /api/generate`、`GET /subscription?data=...`，薄封装 `internal/service` 中基于 `ConversionSource` 的 `*FromSource` 入口
- `internal/config/server.go` 提供服务器侧配置：`CHAIN_SUBCONVERTER_HTTP_ADDRESS`、`CHAIN_SUBCONVERTER_PUBLIC_BASE_URL`、`CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH`（及默认值）
- `cmd/server/main.go` 加载 subconverter 与 server 配置、创建 `subconverter.Client`、装配 `api.Handler` 并 `ListenAndServe` 启动 HTTP 服务
- `internal/api/server_test.go` 基于 `testdata/subconverter/3pass-ss2022-test-subscription` 的 golden 测试，覆盖上述三端点的 happy path 与订阅响应头

### 测试基线

- `testdata/subconverter/3pass-ss2022-test-subscription/` 已扩展为最小完整流程样例
- 已固定 `stage1-convert` / `generate` 请求与成功响应 golden
- 已固定规范长链接编码前载荷与最终订阅 YAML golden
- `internal/subconverter`、`internal/service` 与 `internal/api` 的相关测试包含在 `go test ./...` 中
- `docs/testing/3pass-ss2022-test-subscription.md` 现作为 `Phase 2` 的主要验收基线说明

## 已知缺口

### Phase 2 与 spec 的差距（与 [ROADMAP](../ROADMAP.md) 中 Phase 2「明确不纳入」一致）

- 失败面仍以最小 happy path 为主：`messages[]` / `blockingErrors[]` 与 HTTP 状态码尚未按 [03-backend-api](../spec/03-backend-api.md) 全量收口
- 未实现：`POST /api/resolve-url`、`POST /api/short-links`、`GET /subscription/<id>.yaml` 等，留待 Phase 3
- 仍需保持「最小闭环」与「完整契约」的边界清晰，避免在文档或实现上把后续阶段能力提前混入 Phase 2 验收口径

### Phase 2.5 / Phase 3

- `Phase 2.5` 的整理工作尚未开始，包括文档收口、职责边界复核与临时结构清理
- `internal/api` 仅有上述最小端点；`POST /api/resolve-url`、`POST /api/short-links`、短链语义、`GET /subscription/<id>.yaml` 等仍属 Phase 3
- `internal/store` 仍只有包占位，未实现 SQLite 短链接索引与 LRU 淘汰
- 应用层配置尚未覆盖阶段 1 输入总大小、每字段 URL 数量、短链容量等（长链接长度上限已通过 `CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH` 部分可配置）

### Phase 4 与部署

- `web/` 仍未初始化前端工程
- `deploy/` 目录当前只有说明文档，尚未提交实际 `docker-compose.yml`

## 验证

- `go test ./...`：2026-04-02 全量通过
- `internal/subconverter`、`internal/service`、`internal/api` 的测试均包含在上述全量测试中
