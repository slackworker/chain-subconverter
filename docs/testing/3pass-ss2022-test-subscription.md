# 3-pass 正式测试用例：`3pass-ss2022-test-subscription`

## 用途

本用例用于固定一组最小但完整的 `subconverter` 3-pass 基线，覆盖：

- `landing-discovery pass`
- `transit-discovery pass`
- `full-base pass`

该用例可用于：

- 校验 `GET /sub` 请求构造是否符合当前 spec
- 校验 `full-base pass` 的 `url` 拼接是否为“落地 + `|` + 中转”
- 为后续阶段 1、生成前校验、恢复判定、订阅渲染提供一组可回放的基底样例

## 输入

- 落地节点：
  - `ss://MjAyMi1ibGFrZTMtYWVzLTI1Ni1nY206MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=@198.51.100.10:8888#SS2022-Test-256-US`
- 中转节点：
  - `http://198.51.100.20:3001/download/test-subscription`
- `subconverter` 基地址：
  - `http://localhost:25500/sub?`

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
  - 用例元信息、输入和拼接参考
- `landing-discovery.url.txt`
- `transit-discovery.url.txt`
- `full-base.url.txt`
- `landing-discovery.yaml`
- `transit-discovery.yaml`
- `full-base.yaml`

## 使用建议

- 建议保留 3 份 pass 结果 YAML。
  - 它们适合做“当前上游行为快照”或手工比对基底。
  - 其中 `landing-discovery.yaml` 最稳定，`transit-discovery.yaml` 与 `full-base.yaml` 更容易受上游订阅变更影响。
- 建议保留拼接实现参考。
  - 它适合约束后续实现不要把 `full-base pass` 错拼成两次请求、错加 `list=true`，或把 `|` 编码/拼接位置处理错。
  - 但它不应替代 `docs/spec/04-business-rules.md` 的权威规则。

## 注意事项

- 这组 YAML 快照不是业务规范，只是当前时点的外部依赖返回结果。
- 若后续上游订阅内容变化，`transit-discovery.yaml` 与 `full-base.yaml` 可更新；更新时应保留同一组输入与默认参数不变。
- 若未来 spec 调整了 `subconverter` 默认参数或 `url` 拼接规则，应先更新 spec，再更新本用例。
