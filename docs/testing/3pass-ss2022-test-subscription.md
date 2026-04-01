# 3-pass 与最小完整流程测试用例：`3pass-ss2022-test-subscription`

## 用途

本用例用于固定一组最小但完整的 `subconverter` 3-pass 基线，并在此基础上继续补齐“默认链式代理 happy path”的最小业务数据链条，覆盖：

- `landing-discovery pass`
- `transit-discovery pass`
- `full-base pass`
- `POST /api/stage1/convert` 的输入快照
- 默认 `stage2Snapshot`
- `POST /api/generate` 的输入快照
- 长链接编码前逻辑载荷

该用例可用于：

- 校验 `GET /sub` 请求构造是否符合当前 spec
- 校验 `full-base pass` 的 `url` 拼接是否为“落地 + `|` + 中转”
- 为后续阶段 1、生成前校验、恢复判定、订阅渲染提供一组可回放的基底样例
- 为服务层与 API 层测试提供一条“先全部使用默认设置”的最小 happy path

## 当前阶段定位

本用例当前同时承担 `Phase 2`“最小业务闭环”阶段的主要验收基线。

对应口径：

- 输入固定为本文档给出的落地节点信息、中转节点信息与默认参数
- 目标固定为“落地信息 + 中转信息 -> `stage2Init` -> `longUrl` -> 最终 YAML”的最小业务流程
- 主要验收产物固定为 `stage1-convert.response.json`、`generate.response.json`、`long-url.payload.json`、`complete-config.chain.yaml`
- 后续若进入短链接、恢复冲突、完整错误模型、前端或部署阶段，应新增并列用例或独立验收材料，不在本用例内继续扩张阶段目标

## 输入

- 落地节点：
  - `ss://MjAyMi1ibGFrZTMtYWVzLTI1Ni1nY206MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=@198.51.100.10:8888#SS2022-Test-256-US`
- 中转节点：
  - `http://198.51.100.20:3001/download/test-subscription`
- `subconverter` 基地址：
  - `http://localhost:25500/sub?`

其中中转订阅指向本地测试服务器上预置的固定测试数据，不依赖外部上游源。

## 默认参数

按当前 spec 默认值固定：

- `target=clash`
- `emoji=true`
- `udp=true`
- 不传 `skip_cert_verify`
- 不传 `include`
- 不传 `exclude`
- 不传 `config`；默认回落到集成 `subconverter` 的 `base/config/Aethersailor_Custom_Clash.ini`
- `expand=false`
- `classic=true`
- `forwardRelayRawText=""`
- `enablePortForward=false`

## 当前默认业务推导

基于当前 3-pass 基线与默认模板规则，这条最小 happy path 当前固定为：

- `landingNodeName = "🇺🇸 SS2022-Test-256-US"`
- 默认 `mode = chain`
- 默认 `targetName = "🇺🇸 美国节点"`

说明：

- 该默认行不是手工指定，而是按当前 spec 的区域自动识别规则，从落地节点名 `🇺🇸 SS2022-Test-256-US` 推导得到
- 若未来 spec 调整了默认模板区域规则，或测试数据中的落地节点名称发生变化，应重新评估该默认快照

## 期望拼接规则

这是实现参考，可直接作为请求构造的回归检查口径；但权威定义仍以 spec 为准。

- `landing-discovery pass`
  - `url = landingRawText`
  - `list=true`
- `transit-discovery pass`
  - `url = transitRawText`
  - `list=true`
- `full-base pass`
  - `url = landingRawText + "|" + transitRawText`
  - 不传 `list`

## 固定文件

目录：`testdata/subconverter/3pass-ss2022-test-subscription`

- `case.json`
  - 用例元信息、阶段 1 原始输入和拼接参考
- `landing-discovery.url.txt`
- `transit-discovery.url.txt`
- `full-base.url.txt`
- `landing-discovery.yaml`
- `transit-discovery.yaml`
- `full-base.yaml`
- `stage1-convert.request.json`
  - `POST /api/stage1/convert` 的固定请求体
- `stage1-convert.response.json`
  - `POST /api/stage1/convert` 的成功响应 golden
- `stage2-snapshot.default.json`
  - 当前默认链式代理 happy path 的固定阶段 2 快照
- `generate.request.json`
  - `POST /api/generate` 的固定请求体
- `generate.response.json`
  - `POST /api/generate` 的成功响应 golden；测试对外基址固定为 `http://localhost:11200`
- `long-url.payload.json`
  - 规范长链接在 gzip + base64url 编码前的逻辑载荷
- `complete-config.chain.yaml`
  - 按默认 `stage2Snapshot` 渲染出的最终订阅 YAML golden
- `minimal-flow.manifest.json`
  - 本用例中已固定产物清单

## 目录分层建议

这组测试数据建议按两层理解：

- `subconverter pass baseline`
  - `landing-discovery.*`
  - `transit-discovery.*`
  - `full-base.*`
- `minimal business flow baseline`
  - `stage1-convert.request.json`
  - `stage1-convert.response.json`
  - `stage2-snapshot.default.json`
  - `generate.request.json`
  - `generate.response.json`
  - `long-url.payload.json`
  - `complete-config.chain.yaml`
  - `minimal-flow.manifest.json`

这样做的目的：

- 固定一条从 3-pass 基线到对外响应、长链接编码、最终订阅渲染都可回放的最小 happy path
- 避免把 `longUrl` 对外基址、`stage2Init.chainTargets[]` 和订阅渲染结果留在口头约定里

## 当前已固化的最终产物

本用例现已补齐以下文件：

- `stage1-convert.response.json`
  - 基于真实 `stage2Init` 推导结果固化，包含完整 `chainTargets[]`
- `generate.response.json`
  - `longUrl` 的测试对外基址固定为 `http://localhost:11200`
- `complete-config.chain.yaml`
  - 基于 `full-base.yaml` 先做“落地节点出组”后处理，再应用默认 `stage2Snapshot` 的链式改写

## 最小完整流程建议

当前推荐先用本用例驱动如下 happy path：

1. 读取 `stage1-convert.request.json`
2. 复用同一条 3-pass 管线，并用现有 3 份 pass URL/YAML 校验底层转换契约
3. 断言服务层能得到 `stage2-snapshot.default.json` 对应的默认行
4. 读取 `generate.request.json`
5. 断言编码前逻辑载荷等于 `long-url.payload.json`
6. 断言成功响应等于 `stage1-convert.response.json` 与 `generate.response.json`
7. 断言订阅渲染结果等于 `complete-config.chain.yaml`

## 推进状态（当前工作区）

按当前改动可归纳为：

- 已完成：测试数据层
  - 3-pass 基线输入、URL 与 YAML golden 已固定
  - `stage1-convert.request.json`、`stage1-convert.response.json`、`stage2-snapshot.default.json`、`generate.request.json`、`generate.response.json`、`long-url.payload.json`、`complete-config.chain.yaml`、`minimal-flow.manifest.json` 已落盘
- 已完成：服务层最小推导能力
  - 已新增 `internal/service/stage1_convert.go`，可从 3-pass 结果推导 `stage2Init` 所需的 `availableModes`、`chainTargets`、`forwardRelays` 与默认 `rows`
  - 默认链式目标可按落地节点名区域规则自动匹配（本例落到 `🇺🇸 美国节点`）
- 已完成：最小闭环回放能力
  - 已新增 `internal/service/artifacts.go` 与对应测试，覆盖 `stage1` 成功响应、`longUrl` 编码/解码以及订阅渲染
  - `complete-config.chain.yaml` 已按 spec 修正为“出组后再链式改写”的结果

## 当前未覆盖范围

这组用例当前只证明“默认链式代理 happy path”已具备可回放基线，不代表以下 spec 项目已经完成：

- 真实 `subconverter` HTTP 集成、超时、并发与错误映射
- 端口转发输入的严格校验、规范化与重复判定
- 基于实际生效配置文件规则的区域识别
- `restrictedModes`、恢复冲突、失败错误码与 API handler 的完整对外语义

## 使用建议

- 建议保留 3 份 pass 结果 YAML。
  - 它们适合作为本地固定测试数据的 golden baseline，以及手工比对基底。
  - 正常情况下 3 份 YAML 都应保持稳定，不应因为外部上游变化而漂移。
- 建议保留拼接实现参考。
  - 它适合约束后续实现不要把 `full-base pass` 错拼成两次请求、错加 `list=true`，或把 `|` 编码/拼接位置处理错。
  - 但它不应替代 `docs/spec/04-business-rules.md` 的权威规则。
- 建议把这组用例作为默认 happy path 的唯一脱敏回放样例。
  - 后续若扩展高级设置、手动改配、端口转发或恢复冲突，应新增并列用例，不要把多种场景都堆进当前目录。

## 注意事项

- 这组 YAML 不是业务规范，而是本地测试服务器固定测试数据在当前实现下产出的回放基线。
- 该用例通常不受外部上游变化影响；若内容发生变化，应视为本地测试数据或测试部署被有意调整。
- 若后续需要更新此用例，应保留同一组输入与默认参数不变，并同步更新 3 份 pass 结果、业务快照与相关说明。
- 若未来 spec 调整了 `subconverter` 默认参数或 `url` 拼接规则，应先更新 spec，再更新本用例。
