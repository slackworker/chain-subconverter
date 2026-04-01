# Chain-Subconverter 推进状态与路线图

## 当前结论

项目已从“纯骨架阶段”推进到“测试资产 + 服务层 happy path 原型”阶段。

当前工作区最有价值的新增内容不是 API 或前端，而是两块基础资产：

- `3pass-ss2022-test-subscription` 已从单纯的 `subconverter` 3-pass 基线，扩展为可回放的最小完整流程样例
- `internal/service` 已有可运行的原型测试，能覆盖默认链式代理 happy path 的 `stage2Init` 推导、长链接编码/解码和订阅渲染

这说明项目已经开始验证 spec，而不再只是停留在目录与文档层。

## 阶段状态

| Phase | 目标 | 当前状态 | 说明 |
|------|------|------|------|
| Phase 0 | 项目骨架、旧代码归档、Go 工程初始化 | ✅ 已完成 | 目录结构、`go.mod`、骨架包和旧实现归档已落地 |
| Phase 1 | `subconverter` 集成层与 3-pass 管线 | ⚠️ 部分完成 | 3-pass 测试夹具与 golden 已固定，但 `internal/subconverter` 仍只有包说明，尚未实现真实运行时集成 |
| Phase 2 | 业务服务层 | ⚠️ 部分完成 | 已有默认 happy path 原型与测试，但仍未完整覆盖 spec 中的限制、错误模型与候选规则 |
| Phase 3 | API 层、配置层、长短链接存储、启动装配 | ⛔ 未开始 | `internal/api`、`internal/store`、`internal/config` 与 `cmd/server` 仍是骨架或占位 |
| Phase 4 | 前端 | ⛔ 未开始 | 仅保留目录与规划，尚无可运行 UI |

## 当前已完成范围

### 测试资产

- 已固定 `landing-discovery`、`transit-discovery`、`full-base` 三个 pass 的 URL/YAML golden
- 已补齐 `stage1-convert.request/response`、`stage2-snapshot.default`、`generate.request/response`、`long-url.payload`、`complete-config.chain.yaml`
- 已增加 `minimal-flow.manifest.json`，把这条最小 happy path 的产物边界显式化

### 服务层原型

- 已实现 `BuildStage2Init()`，可从固定夹具推导 `availableModes`、`chainTargets`、`forwardRelays` 与默认 `rows`
- 已实现 `BuildStage1ConvertResponse()`、`BuildGenerateResponse()`、`EncodeLongURL()`、`DecodeLongURLPayload()`、`RenderCompleteConfig()`
- 已通过 `go test ./internal/service/...` 与 `go test ./...`

## 主要缺口

以下内容仍不应被表述为“已完成”，提交时也建议在说明里主动声明：

### Phase 1 缺口

- 尚未实现真实的 `subconverter` HTTP 客户端
- 尚未实现超时、并发上限、运行时错误映射等 `04-business-rules` 中的集成边界
- 当前 3-pass 仍依赖静态测试夹具，不是运行时真实转换管线

### Phase 2 缺口

- 区域自动识别目前使用代码内置正则，尚未按 spec 改为“基于实际生效配置文件中的 6 条规则”
- 端口转发输入目前只做最小切分与重复判断，尚未完成 `server:port` 规范化、大小写归一和严格校验
- `restrictedModes`、`messages[]`、`blockingErrors[]` 仅具 happy path 骨架，尚未形成完整错误语义
- 当前测试主要覆盖 happy path，尚未覆盖 `vless-reality` 限制、冲突检测、恢复冲突、rowset mismatch 等关键失败场景

### Phase 3 缺口

- 未实现 HTTP handler
- 未实现短链接 SQLite 索引
- 未实现配置化的长度限制、超时和服务基址
- `cmd/server/main.go` 仍是占位输出

## 推荐提交口径

本轮更适合按以下口径准备提交，而不是宣称“服务层完成”：

- `docs/testing`: 固化 `3-pass` 到最小完整业务流程的测试资产
- `internal/service`: 增加默认链式代理 happy path 原型与 golden test
- `docs`: 补齐当前推进状态、风险和提交边界说明

建议避免使用下列表述：

- “完成 backend API”
- “完成 Phase 2”
- “已按 spec 实现 stage1/generate”

## 下一提交建议

若按最小增量继续推进，建议优先做以下顺序：

1. 补 `internal/subconverter` 真实 3-pass 集成与错误映射
2. 收口 `internal/service` 的 spec 差距，先补端口转发校验、区域识别来源、`restrictedModes`
3. 再落 `internal/api`，把当前 happy path 原型接成真实 `POST /api/stage1/convert` 与 `POST /api/generate`

## 当前验证

当前工作区已确认：

- `go test ./internal/service/...`
- `go test ./...`
