# 基础 fixture：`3pass-ss2022-test-subscription`

本文只说明当前基础 fixture 与目录职责。

## 用途

本用例固定一组最小但完整的 `subconverter` 3-pass 基线，并覆盖默认链式代理 happy path 的最小业务闭环。

对外文档层将这组数据归入 `smoke` 用例入口（`mock-smoke` / `real-smoke`）；底层 fixture ID 仍保持 `3pass-ss2022-test-subscription`，避免影响目录名、命令参数与现有测试代码。

当前默认约定是：

- 新功能若没有明显依赖双落地 / 双中转 / template / port-forward 这类复杂拓扑，优先先补到 `smoke`
- `web/e2e/real-deployed-core-flow.spec.ts` 的默认 fallback 输入继续跟随这组基础数据

固定覆盖范围包括：

- `landing-discovery pass`
- `transit-discovery pass`
- `full-base pass`
- `POST /api/stage1/convert`（discovery 两 pass；full-base 在 generate/订阅路径）
- 默认 `stage2Snapshot`
- `POST /api/generate`
- 最终 `complete-config.chain.yaml`

## 自动化测试 Fixture

目录：`internal/review/testdata/3pass-ss2022-test-subscription/`

该目录是当前保留的基础 fixture 目录，供 `internal/review`、`internal/service` 与 `internal/api` 相关自动化测试回放。

其中 `stage1/input/*` 当前已改由仓库根目录的 canonical 场景文件派生：`testdata/canonical-scenarios/3pass-ss2022-test-subscription.stage1.json`。

当前 `internal/review` 对这组 tracked fixture 的 Stage 1 加载也会优先直接读取这份 canonical JSON，并构造 review 语义下的 `service.Stage1Input`；目录里的 `stage1/input/*` 继续保留为生成物、审计材料与 `fixture-freshness` 的 drift 检查目标，而不是 tracked 场景的回源输入。

刷新这组基础 fixture 的 Stage 1 输入时，使用：

```bash
go run ./cmd/testfixturegen -scenario 3pass-ss2022-test-subscription
```

当前该命令对这组基础 fixture 只负责刷新 `stage1/input/*`。`stage2/output/*` 继续保留为历史固定基线，不跟随 canonical 自动重录。

当前这个 canonical 场景继续固定 `smoke` 入口真正消费的规范化 Stage 1 输入，不额外引入双落地场景里那种更丰富的 transit/template 附属材料。它现在的职责主要是：作为最小内部回放基线，以及 `web/e2e/real-deployed-core-flow.spec.ts` 的默认 fallback 输入来源；Cloudflare Worker 公网 fixture 已转向 `dual-landing-chain-port-forward` 这套更完整的 `full` 数据。

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
  - 不传 `list`
- `full-base pass`（generate/订阅路径）
  - `url = <托管 landing 短链> + "|" + transitRawText`
  - 不传 `list`

## 边界

- 仓库内不再保留文件驱动的手动前端回放工作区
- 更完整的复杂场景 fixture 见 [dual-landing-chain-port-forward](dual-landing-chain-port-forward.md)
- 若后续继续扩展高级设置、手动 override、端口转发或恢复冲突，应在 `internal/review/testdata/` 下新增并列 fixture
- 真实人工验证统一走实际前端服务、`/api/*` 与订阅路径，不复用旧的文本输入回放链
