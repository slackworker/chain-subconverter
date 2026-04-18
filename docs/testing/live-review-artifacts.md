# Live 订阅中间产物审查

本文定义如何针对真实订阅 URL 生成 `stage1/stage2` 中间产物，并按业务意图逐项 review。

## 生成方式

推荐两种入口：

1. VS Code 任务：`review: live subscriptions`
2. 命令行：

```bash
go run ./cmd/frontend-review \
  -name live-review \
  -landing-url http://192.168.100.1:3001/7xK9pLm2Qr4vB6yN8sT3/download/Landing-Subscription \
  -transit-url http://192.168.100.1:3001/7xK9pLm2Qr4vB6yN8sT3/download/Airport-Subscription
```

默认输出目录位于：`.tmp/review/live/<case-name>/`

若同名目录已存在，CLI 会自动追加数字后缀，避免覆盖旧 review 结果。

## 目录结构

产物目录会尽量复用固定 fixture 的结构：

- `stage1/input/landing.txt`
- `stage1/input/transit.txt`
- `stage1/input/forward-relays.txt`
- `stage1/input/advanced-options.yaml`
- `stage1/output/landing-discovery.url.txt`
- `stage1/output/landing-discovery.url.raw.txt`
- `stage1/output/landing-discovery.yaml`
- `stage1/output/transit-discovery.url.txt`
- `stage1/output/transit-discovery.url.raw.txt`
- `stage1/output/transit-discovery.yaml`
- `stage1/output/full-base.url.txt`
- `stage1/output/full-base.url.raw.txt`
- `stage1/output/full-base.yaml`
- `stage1/output/template-source.url.txt`
- `stage1/output/template-managed.url.txt`
- `stage1/output/template-config.ini`
- `stage1/output/template-diagnostics.json`
- `stage1/output/stage1-convert.request.json`
- `stage1/output/stage1-convert.error.txt`（仅当 Stage 1 自动填充失败时出现）
- `stage1/output/stage1-convert.response.json`
- `stage1/output/review-summary.md`
- `stage1/output/autofill-pairs.txt`
- `stage1/output/chain-targets.txt`
- `stage1/output/forward-relays.txt`
- `stage2/input/stage2-snapshot.json`
- `stage2/output/generate.request.json`
- `stage2/output/generate.response.json`
- `stage2/output/long-url.payload.json`
- `stage2/output/complete-config.chain.yaml`

## 审查顺序

### 1. 先看输入是否符合预期

先检查：

- [stage1/input/landing.txt](stage1/input/landing.txt)
- [stage1/input/transit.txt](stage1/input/transit.txt)
- [stage1/input/advanced-options.yaml](stage1/input/advanced-options.yaml)

要确认：

- landing 和 transit 没有输反
- 是否使用了预期模板 URL
- `include` / `exclude` / 端口转发开关是否符合本次意图

### 2. 看 `subconverter` 三次请求是否按规则构造

重点看：

- `stage1/output/landing-discovery.url.txt`
- `stage1/output/landing-discovery.url.raw.txt`
- `stage1/output/transit-discovery.url.txt`
- `stage1/output/transit-discovery.url.raw.txt`
- `stage1/output/full-base.url.txt`
- `stage1/output/full-base.url.raw.txt`

要确认：

- `landing-discovery` 只带 landing URL，并带 `list=true`
- `transit-discovery` 只带 transit URL，并带 `list=true`
- `full-base` 使用 `landing|transit` 拼接，且不带 `list=true`
- `config`、`include`、`exclude` 等 query 参数与输入意图一致
- `*.url.txt` 是脱敏后的稳定审查文件；若要排查真实传给 subconverter 的 API，查看 `*.url.raw.txt`

### 3. 看 discovery 与 full-base YAML 是否包含正确节点

重点看：

- `stage1/output/landing-discovery.yaml`
- `stage1/output/transit-discovery.yaml`
- `stage1/output/full-base.yaml`

要确认：

- landing discovery 里确实出现预期落地节点
- transit discovery 里确实出现预期中转节点
- full-base 里同时出现两侧节点和目标 `proxy-groups`

### 4. 看 Stage 1 自动填充是否符合业务预期

重点看：

- `stage1/output/review-summary.md`
- `stage1/output/autofill-pairs.txt`
- `stage1/output/chain-targets.txt`
- `stage1/output/stage1-convert.response.json`

若 Stage 1 自动填充失败：

- 改看 `stage1/output/stage1-convert.error.txt`
- 再看 `stage1/output/template-source.url.txt`、`stage1/output/template-managed.url.txt`、`stage1/output/template-config.ini`、`stage1/output/template-diagnostics.json`
- 同时结合 `stage1/output/full-base.yaml` 和 `stage1/output/full-base.url.txt` 判断失败是模板目标组缺失、节点命名不匹配，还是 `subconverter` 输出异常

要确认：

- 每个落地节点被自动归到了预期 `mode`
- 默认 `targetName` 是否合理
- `chainTargets` 列表是否包含预期目标组
- 若某些目标组缺失，是模板问题还是解析问题
- `template-diagnostics.json` 中的 `recognizedRegionGroups` / `missingRecognizedGroups` 可直接判断地域组识别流程是否已运行，以及 full-base 缺少哪些已识别组

### 5. 看默认 Stage 2 快照和 generate 请求

重点看：

- `stage2/input/stage2-snapshot.json`
- `stage2/output/generate.request.json`

要确认：

- 默认快照是否就是你期望的“未人工干预”状态
- `rows[].mode`、`rows[].targetName` 与 Stage 1 自动填充一致

### 6. 看生成结果与最终 YAML

重点看：

- `stage2/output/generate.response.json`
- `stage2/output/long-url.payload.json`
- `stage2/output/complete-config.chain.yaml`

要确认：

- `generate.response.json` 是否产出预期 `longUrl`
- `long-url.payload.json` 是否正确编码了 `stage1Input + stage2Snapshot`
- `complete-config.chain.yaml` 中 `dialer-proxy`、链式组和转发关系是否按意图落地

## 最常看的几个文件

若只想快速判断“业务是不是按意图执行”，优先看这 6 个文件：

- `stage1/output/landing-discovery.url.txt`
- `stage1/output/full-base.url.txt`
- `stage1/output/review-summary.md`
- `stage1/output/stage1-convert.response.json`
- `stage2/output/generate.response.json`
- `stage2/output/complete-config.chain.yaml`

若 live case 尚未进入 Stage 2，则把 `stage2/output/*` 替换成：

- `stage1/output/stage1-convert.error.txt`
- `stage1/output/full-base.yaml`

## 结论记录建议

每次 live review 建议至少记录：

- 使用的 landing / transit URL
- 产物目录路径
- 是否符合预期
- 若不符合，是哪一层出问题：输入、模板、`subconverter`、Stage 1 自动填充、Stage 2 生成、最终 YAML