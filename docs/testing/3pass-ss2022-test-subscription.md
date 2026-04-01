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
  - 它们适合作为本地固定测试数据的 golden baseline，以及手工比对基底。
  - 正常情况下 3 份 YAML 都应保持稳定，不应因为外部上游变化而漂移。
- 建议保留拼接实现参考。
  - 它适合约束后续实现不要把 `full-base pass` 错拼成两次请求、错加 `list=true`，或把 `|` 编码/拼接位置处理错。
  - 但它不应替代 `docs/spec/04-business-rules.md` 的权威规则。

## 注意事项

- 这组 YAML 不是业务规范，而是本地测试服务器固定测试数据在当前实现下产出的回放基线。
- 该用例通常不受外部上游变化影响；若内容发生变化，应视为本地测试数据或测试部署被有意调整。
- 若后续需要更新此用例，应保留同一组输入与默认参数不变，并同步更新 3 份 pass 结果与相关说明。
- 若未来 spec 调整了 `subconverter` 默认参数或 `url` 拼接规则，应先更新 spec，再更新本用例。
