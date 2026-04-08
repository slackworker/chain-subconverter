# 3-pass 与最小完整流程基线：`3pass-ss2022-test-subscription`

## 用途

本用例固定一组最小但完整的 `subconverter` 3-pass 基线，并覆盖默认链式代理 happy path 的最小业务闭环：

- `landing-discovery pass`
- `transit-discovery pass`
- `full-base pass`
- `POST /api/stage1/convert`
- 默认 `stage2Snapshot`
- `POST /api/generate`
- 最终 `complete-config.chain.yaml`

## 两套目录的职责

同一个用例现在分成两套材料，各自职责单一：

- `review/cases/3pass-ss2022-test-subscription/`
  - 手动 Front-end Review 工作区
  - 只放可编辑输入以及运行后生成的 output
- `internal/review/testdata/3pass-ss2022-test-subscription/`
  - 自动化测试固定 fixture
  - 放稳定的输入与输出基线，供 `internal/review` 单元测试回放

## 手动 Review 工作区

目录：`review/cases/3pass-ss2022-test-subscription/`

- `stage1/input/`
  - 手动编辑的阶段 1 输入
- `stage1/output/`
  - 运行 Stage1 后生成的 URL、YAML、请求响应与 review 摘要
- `stage2/input/stage2-snapshot.json`
  - Stage1 刷新的默认 snapshot，供手动编辑
- `stage2/output/`
  - 运行 Stage2 后生成的请求响应、payload 与最终 YAML
- 手动执行顺序与 `transit.txt` 输入规则统一见 [frontend-review-workflow](frontend-review-workflow.md)

执行 Stage1 时只刷新 `stage1/output/` 与 `stage2/input/stage2-snapshot.json`，不会清理 `stage2/output/`；后者仅代表最近一次 Stage2 运行结果。

## 自动化测试 Fixture

目录：`internal/review/testdata/3pass-ss2022-test-subscription/`

该目录固定保存以下基线材料：

- `stage1/output/landing-discovery.*`
- `stage1/output/transit-discovery.*`
- `stage1/output/full-base.*`
- `stage1/output/stage1-convert.request.json`
- `stage1/output/stage1-convert.response.json`
- `stage2/input/stage2-snapshot.json`
- `stage2/output/generate.request.json`
- `stage2/output/generate.response.json`
- `stage2/output/long-url.payload.json`
- `stage2/output/complete-config.chain.yaml`

## 当前默认业务推导

基于当前 3-pass 基线与默认模板规则，这条最小 happy path 当前固定为：

- `landingNodeName = "🇺🇸 SS2022-Test-256-US"`
- 默认 `mode = chain`
- 默认 `targetName = "🇺🇸 美国节点"`

该默认行由后端区域识别规则自动推导，不是手工指定。

## 期望拼接规则

这是实现参考，可直接作为请求构造的回归检查口径；权威定义仍以 spec 为准。

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

- `review/cases/` 保存手动 review 输入与运行产物
- `.tmp/review/` 保存运行日志
- 若后续扩展高级设置、手动 override、端口转发或恢复冲突，应新增并列用例
