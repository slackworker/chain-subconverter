# 当前状态

> 最近更新：2026-04-01

## 当前结论

项目当前实际推进到：

- `Phase 1` 已完成：`subconverter` 真实 `3-pass` 集成已落地
- `Phase 2` 已进入“最小业务闭环”阶段：固定测试数据与默认值下，服务层已能产出 `stage2Init`、编码 `longUrl` 并渲染最终 YAML；当前主要任务是把该最小 happy path 明确收口为阶段目标与验收基线
- `Phase 2.5` 尚未开始：阶段性整理将放在最小闭环完成之后
- `Phase 3` 尚未开始：完整 API 契约、恢复、短链、失败语义与配置化限制均已后移
- `Phase 4` 尚未开始：前端与部署继续后置

## Phase 进度

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 0 — 骨架 | 目录、Go module、旧代码归档 | ✅ 完成 |
| Phase 1 — subconverter 集成 | 真实 `3-pass` HTTP 管线 | ✅ 完成 |
| Phase 2 — 最小业务闭环 | 固定测试数据下的 `stage2Init`、`longUrl`、最终 YAML | ⚠️ 进行中 |
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

### 测试基线

- `testdata/subconverter/3pass-ss2022-test-subscription/` 已扩展为最小完整流程样例
- 已固定 `stage1-convert` / `generate` 请求与成功响应 golden
- 已固定规范长链接编码前载荷与最终订阅 YAML golden
- `internal/subconverter` 与 `internal/service` 已有针对核心 happy-path 的单测
- `docs/testing/3pass-ss2022-test-subscription.md` 现作为 `Phase 2` 的主要验收基线说明

## 已知缺口

### Phase 2

- 还需把“最小业务闭环”的阶段边界与验收标准持续保持清晰，避免重新混入短链、恢复、完整错误模型等后续工作
- 当前对外 HTTP 端点仍未正式实装；若要把最小闭环提升为真实 API 路径，还需补 `stage1/convert`、`generate` 与订阅读取入口
- 失败面覆盖仍以 happy path 为主，尚未进入完整阻断错误码与 HTTP 语义收口

### Phase 2.5 / Phase 3

- `Phase 2.5` 的整理工作尚未开始，包括文档收口、职责边界复核与临时结构清理
- `internal/api` 仍只有包占位，未实现 `POST /api/stage1/convert`、`POST /api/generate`、`POST /api/resolve-url`、`POST /api/short-links`、`GET /subscription...`
- `internal/store` 仍只有包占位，未实现 SQLite 短链接索引与 LRU 淘汰
- 应用层配置仍未覆盖阶段 1 输入大小、URL 数量、长链接长度、短链容量等可配置限制
- `cmd/server/main.go` 目前仅完成最小配置加载与 client 装配，尚未启动真实 HTTP 服务

### Phase 4 与部署

- `web/` 仍未初始化前端工程
- `deploy/` 目录当前只有说明文档，尚未提交实际 `docker-compose.yml`

## 验证

- `go test ./...`：2026-04-01 本次检查通过
- `internal/subconverter`、`internal/service` 的相关测试包含在上述全量测试中
