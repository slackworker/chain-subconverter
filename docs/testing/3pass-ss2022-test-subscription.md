# 3-pass 与最小完整流程基线：`3pass-ss2022-test-subscription`

本文只说明测试基线与目录职责。

## 用途

本用例固定一组最小但完整的 `subconverter` 3-pass 基线，并覆盖默认链式代理 happy path 的最小业务闭环：

- `landing-discovery pass`
- `transit-discovery pass`
- `full-base pass`
- `POST /api/stage1/convert`
- 默认 `stage2Snapshot`
- `POST /api/generate`
- 最终 `complete-config.chain.yaml`

## 自动化测试 Fixture

目录：`internal/review/testdata/3pass-ss2022-test-subscription/`

该目录是当前唯一保留的固定基线目录，供 `internal/review`、`internal/service` 与 `internal/api` 相关自动化测试回放。

该目录固定保存以下基线材料：

- `stage1/input/landing.txt`
- `stage1/input/transit.txt`
- `stage1/input/forward-relays.txt`
- `stage1/input/advanced-options.yaml`
- `stage1/output/landing-discovery.*`
- `stage1/output/transit-discovery.*`
- `stage1/output/full-base.*`
- `stage1/output/stage1-convert.request.json`
- `stage1/output/stage1-convert.response.json`
- `stage2/input/stage2-snapshot.json`
- `stage2/output/generate.request.json`
- `stage2/output/generate.response.json`
- `stage2/output/long-url.payload.json`
- `stage2/output/complete-config.chain.yaml`（最终订阅 YAML）

## 当前默认业务推导

基于当前 3-pass 基线与默认模板规则，这条最小 happy path 当前固定为：

- `landingNodeName = "🇺🇸 SS2022-Test-256-US"`
- 默认 `mode = chain`
- 默认 `targetName = "🇺🇸 美国节点"`

该默认行由后端区域识别规则自动推导，不是手工指定。

## 期望拼接规则

这是实现与文档对齐的回归检查口径；若与当前实现或已确认文档不一致，应先澄清后统一修订。

- `landing-discovery pass`
  - `url = landingRawText`
  - `list=true`
- `transit-discovery pass`
  - `url = transitRawText`
  - `list=true`
- `full-base pass`
  - `url = landingRawText + "|" + transitRawText`
  - 不传 `list`

## 边界

- 仓库内不再保留文件驱动的手动前端回放工作区
- 若后续扩展高级设置、手动 override、端口转发或恢复冲突，应在 `internal/review/testdata/` 下新增并列 fixture
- 真实人工验证统一走实际前端服务、`/api/*` 与订阅路径，不复用旧的文本输入回放链
