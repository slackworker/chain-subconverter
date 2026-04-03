# 当前状态

> 最近更新：2026-04-03

## 当前结论

项目当前实际推进到：

- 治理口径已切换为“spec 与开发并行推进”，以 [spec/00-governance](../spec/00-governance.md) 为准。

- `Phase 1` 已完成：`subconverter` 真实 `3-pass` 集成已落地
- `Phase 2` 已完成（最小范围）：固定测试数据与默认值下，服务层能产出 `stage2Init`、编码 `longUrl`、渲染最终 YAML，且已通过最小 HTTP 层对外暴露上述闭环（见下文「已完成」）
- `Phase 2.5` 已完成本轮收口：文档与根 README 已与实现对齐；分层职责已写在包注释与本文；`ROADMAP` / `STATUS` / `spec/05-tech-stack` 已标明「最小闭环 vs 目标栈」；Phase 3 入口范围见下文「Phase 3 入口范围与非目标」
- `Phase 3` 尚未开始：完整 API 契约、恢复、短链、失败语义与配置化限制均已后移
- `Phase 4` 尚未开始：前端、SQLite 持久化与完整单入口部署继续后置

## Phase 进度

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 0 — 骨架 | 目录、Go module、旧代码归档 | ✅ 完成 |
| Phase 1 — subconverter 集成 | 真实 `3-pass` HTTP 管线 | ✅ 完成 |
| Phase 2 — 最小业务闭环 | 固定测试数据下的 `stage2Init`、`longUrl`、最终 YAML + 最小 HTTP | ✅ 完成 |
| Phase 2.5 — 阶段性整理 | 文档、结构与边界收口 | ✅ 完成（本轮） |
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

**计划纳入 Phase 3（与 [ROADMAP](../ROADMAP.md) 一致）**

- `POST /api/resolve-url`、恢复可重放与 `restoreStatus` 冲突语义
- `POST /api/short-links`、`GET /subscription/<id>.yaml`（或等价短链订阅形态，以 spec 为准）
- `internal/store`：SQLite 短链索引（幂等 + LRU）
- 失败语义与 HTTP 收口：`messages[]`、`blockingErrors[]`、字段级错误与状态码对齐 [03-backend-api](../spec/03-backend-api.md)
- `internal/config` 扩展：阶段 1 输入总大小、每字段 URL 数量、短链容量等限制项
- HTTP 层按 [spec/05-tech-stack](../spec/05-tech-stack.md) 收敛到 Gin（与上述契约同一阶段推进，避免重复迁移）

**明确非 Phase 3 目标（避免越阶段扩张）**

- 前端 UI、三阶段页面状态与静态资源由后端同端口提供（**Phase 4**）
- 完整 Compose 单入口、前端构建物接入、运维形态（**Phase 4**）
- 将 Phase 2 golden 用例扩展为覆盖所有错误码与边界组合（可在 Phase 3 新增并列用例，而非强行并入单条 golden）

## 结构盘点（Phase 2.5）

- `internal/service/conversion_source.go` 中多个 `Build*FromSource` 各自调用 `LoadConversionFixtures`：为薄封装、意图清晰，**不**合并为单一泛型入口，避免增加 indirection。
- 未发现需在本轮删除的临时包名或死代码路径；HTTP 自标准库迁移至 Gin 时，以 `internal/api` 为主改造面，业务逻辑保持留在 `internal/service`。

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
- `internal/api` 已新增 `GET /healthz`，供 Compose 与本地 smoke 验证使用
- `internal/config/server.go` 提供服务器侧配置：`CHAIN_SUBCONVERTER_HTTP_ADDRESS`、`CHAIN_SUBCONVERTER_PUBLIC_BASE_URL`、`CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH`（及默认值）
- `cmd/server/main.go` 加载 subconverter 与 server 配置、创建 `subconverter.Client`、装配 `api.Handler` 并 `ListenAndServe` 启动 HTTP 服务
- `internal/api/server_test.go` 基于 `testdata/subconverter/3pass-ss2022-test-subscription` 的 golden 测试，覆盖上述三端点的 happy path 与订阅响应头

### Phase 2.5：API-only Compose 最小部署里程碑

- 已新增仓库根 `Dockerfile`，用于构建当前 Go 服务镜像
- 已新增 `deploy/docker-compose.yml`，编排 `app + subconverter` 最小运行栈
- Compose 当前只暴露 `app:11200`；`subconverter` 保持内部可达
- `deploy/smoke/3pass-ss2022-test-subscription/` 提供本地 smoke 验证用的中转订阅样例、原文文件与同步脚本
- 已在本地通过真实容器链路验证：`POST /api/stage1/convert`、`POST /api/generate`、`GET /subscription?data=...`
- 真实 smoke 验证当前仍可显式依赖本地托管的 `_legacy/templates/default/Custom_Clash.ini`，但该路径已被明确标记为兼容性 workaround，而非默认基线

### Phase 2.5：文档与结构收口（本轮）

- 根 `README.md` 与 `docs/ROADMAP.md` 已与「标准库 HTTP、store/web 占位、Phase 划分」对齐
- `docs/spec/05-tech-stack.md` 已增加「实现现状与 spec 目标」小节
- `internal/api`、`internal/service`、`internal/store` 包注释已写明职责边界

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

### Phase 3

- `internal/api` 仅有上述最小端点；`POST /api/resolve-url`、`POST /api/short-links`、短链语义、`GET /subscription/<id>.yaml` 等仍属 Phase 3
- `internal/store` 仍只有包占位，未实现 SQLite 短链接索引与 LRU 淘汰
- 应用层配置尚未覆盖阶段 1 输入总大小、每字段 URL 数量、短链容量等（长链接长度上限已通过 `CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH` 部分可配置）

### Phase 4 与部署

- `web/` 仍未初始化前端工程
- 已具备 **API-only** 的最小 Compose 路径，但这不等同于完整 `Phase 4`
- 仍未实现：前端静态资源接入、SQLite 持久化、正式单入口 Web UI、完整部署运维收口

## 验证

- `go test ./...`：2026-04-02 全量通过
- `internal/subconverter`、`internal/service`、`internal/api` 的测试均包含在上述全量测试中
- `docker compose -f deploy/docker-compose.yml up --build -d`：2026-04-02 本地验证通过
- 真实容器 smoke：已跑通 `app + subconverter`，并通过本地静态文件服务托管中转订阅样例与模板完成 3 个现有 API 验证
