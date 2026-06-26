# 复杂场景 fixture：`dual-landing-chain-port-forward`

本文说明当前复杂场景 fixture，用于补齐 `full` 入口中的多落地、多中转订阅、端口转发与长/短链接恢复路径。

## 用途

对外文档层将这组数据归入 `full` 入口（`mock-full` / `real-full`）；底层 fixture ID 仍保持 `dual-landing-chain-port-forward`，避免影响目录名、命令参数与现有测试代码。

当前默认约定是：

- 当新功能主要影响双落地 / 双中转 / template / port-forward / 长短链接恢复这类复杂组合时，优先补到 `full`
- 若该功能同时也会影响默认主线或部署 `smoke`，则仍应补一条 `smoke` 断言，避免只在复杂样例里兜底

该样例固定覆盖一组更接近日常使用的场景：

- 2 套落地配置（SG / JP），每套对应 1 台落地服务器
- 基线落地节点收敛为 4 条：
  - `Alpha-SS-SG`
  - `Alpha-Reality-SG`
  - `Beta-SS-JP`
  - `Beta-Reality-JP`
- 另固定跟踪 `1` 条“手动添加 SOCKS5”样例，用于前端手填 / 转换与长短链接恢复
- 总计 `4 + 1` 条 landing 输入、`2` 条 transit 订阅、`2` 条 forward relay

目录：`internal/review/testdata/dual-landing-chain-port-forward/`

其中 `stage1/input/*` 现由仓库根目录的 canonical 场景文件派生：`testdata/canonical-scenarios/dual-landing-chain-port-forward.stage1.json`。

当前 `internal/review` 对这组 tracked fixture 的 Stage 1 加载也会优先直接读取这份 canonical JSON，并按 review 语义把 `landingItems + manualSocks5Items.generatedURI` 合成为 `service.Stage1Input.landingRawText`；目录里的 `stage1/input/*` 继续保留为生成物、审计材料与 CI freshness 检查目标，而不是 tracked 场景的回源输入。

该 canonical 场景除 `stage1/input/*` 所需的落地 / 中转 URL / 端口转发 / 高级选项外，还显式跟踪：

- 1 条前端“手动添加 SOCKS5”用的固定表单样例与其生成后的 `tg://socks?...` URI
- 2 条 transit 订阅 URL 对应的固定明文 URI 内容文件（当前位于 `testdata/canonical-scenarios/dual-landing-chain-port-forward/transit-*.uri.txt`）
- 当前 `advancedOptions.config` 对应的固定模板内容文件（`testdata/canonical-scenarios/dual-landing-chain-port-forward/template-config.ini`）以及推荐默认模板 URL

这些附加材料当前主要用于统一数据源与后续派生：

- 当前模板 URL 已固定为 Aethersailor 默认模板 URL；`template-config.ini` 只保存当前双落地回放实际消费的 region matcher 快照，而不是整套上游模板。这样可以把 pinned 内容收敛在“会影响 Stage 1 自动识别 / Stage 2 默认填充”的最小语义面，避免把大量与本回放无关的规则、策略组和上游格式漂移一并引入 fixture 噪音
- 两份 transit 内容文件当前各自固定 `10` 条节点；合计覆盖 `8` 类协议与 `6` 个地域（HK / JP / US / SG / TW / KR），且不混入手动 SOCKS5 的 `tg://socks` 入口语义
- `stage1/input/landing.txt` 现直接派生 canonical 的 `landingItems + manualSocks5Items.generatedURI`，即仓库跟踪的 review Stage 1 输入默认就是 `4 + 1` 行
- 浏览器自动化若需要验证 “+ 添加 SOCKS5” 表单填写 / `socks5://` 解析 / `tg://socks` 追加，应直接从 canonical 的 `landingItems` 这 `4` 条起步，再在 UI 中手动追加同一条 SOCKS5 样例，而不是复用 review `landing.txt`
- 当前 tracked `stage1/output/landing-discovery.*`、`transit-discovery.*`、`full-base.*` 与 `stage1-convert.*` 已对齐到 `4 + 1` 条 landing 输入；手动 SOCKS5 样例会以 `type: socks5` 的第 `5` 个 landing 代理出现，并保留在 Stage 2 snapshot 中作为默认 `chain -> 🇭🇰 香港节点`
- 这组 Stage 1 frozen outputs 现在可以通过 live `subconverter` 直接重录；写回 Git 的 `*.url.txt` 仍仅来自 canonical 里已跟踪的 Mock 输入，无需额外处理；live 转换只把 transit 改成仓库内已跟踪的 `transit-*.uri.txt` 明文内容，避免再依赖外部测试 URL 或临时本地 HTTP 源

刷新该样例的 tracked Stage 1 输入与 Stage 2 frozen output 时，使用：

```bash
go run ./cmd/testfixturegen -scenario dual-landing-chain-port-forward
```

若要额外重录 Stage 1 frozen outputs（需要本地 `subconverter` 可达，例如 `http://127.0.0.1:25500/sub?`），使用：

```bash
go run ./cmd/testfixturegen -scenario dual-landing-chain-port-forward -stage1-live-base-url http://127.0.0.1:25500/sub?
```

当前该命令会同时刷新：

- `stage1/input/*`
- `stage2/output/generate.request.json`
- `stage2/output/generate.response.json`
- `stage2/output/short-links.request.json`
- `stage2/output/short-links.response.json`
- `stage2/output/long-url.payload.json`
- `stage2/output/complete-config.chain.yaml`

额外执行 live Stage 1 重录命令时，当前会刷新：

- `stage1/output/landing-discovery.*`
- `stage1/output/transit-discovery.*`
- `stage1/output/full-base.*`
- `stage1/output/stage1-convert.request.json`
- `stage1/output/stage1-convert.response.json`

补充约束：live Stage 1 重录现已复用 review 的 Stage 1 artifact 生成逻辑，但只写回上述 tracked Stage 1 outputs；不会覆盖当前人工编排的 `stage2/input/stage2-snapshot.json`。

## 当前固定材料

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
- `stage2/output/short-links.request.json`
- `stage2/output/short-links.response.json`
- `stage2/output/long-url.payload.json`
- `stage2/output/complete-config.chain.yaml`

## 当前语义边界

- `stage1/convert` 仅跑 Pass 1+2（不产 full-base）；自动填充当前固定为：
  - `Alpha-SS-SG` 默认 `chain -> 🇸🇬 新加坡节点`
  - `Alpha-Reality-SG` 默认 `chain -> 🇸🇬 新加坡节点`（并保留协议层 `chain` warning）
  - `Beta-SS-JP` 默认 `chain -> 🇯🇵 日本节点`
  - `Beta-Reality-JP` 默认 `chain -> 🇯🇵 日本节点`（并保留协议层 `chain` warning）
  - 手动 SOCKS5 默认 `chain -> 🇭🇰 香港节点`
- `stage2-snapshot` 在上述基础上固定为 `8` 行（含 3 条副本）：
  - `Alpha-SS-SG` 追加 1 条副本：分别指向 `🇭🇰 香港节点` 与 `🇸🇬 新加坡节点`
  - `Alpha-Reality-SG` 保留源行 `none`，并追加 2 条副本分别指向两条 `port_forward` relay
  - `Beta-SS-JP` 保持 `chain -> 🇯🇵 日本节点`
  - `Beta-Reality-JP` 固定为 `none`
  - 手动 SOCKS5 保持 `chain -> 🇭🇰 香港节点`
  - 启用 `serverAggregationGroups`（`198.51.100.10`，`fallback`）与 `chainProxyTargetGroupSwitchOptimizationEnabled = true`
- `generate` / `resolve-url` / `short-links` 使用该固定快照验证长链接与短链接的可回放性

也就是说，本基线同时覆盖自动识别、Stage 2 从默认 `chain` 手动切换到 `port_forward` / `none`，以及长/短链接恢复。

## 自动化覆盖

当前至少由以下测试直接消费：

- `internal/review` 的 artifact 回放测试
- `internal/service` 的 `BuildStage2Init` 语义测试
- `internal/service` 的 `resolve-url` replayable / short-link roundtrip 测试
- `internal/api` 的 `stage1/convert`、`short-links`、`resolve-url`（long URL / short URL）dual-landing handler happy path 回放测试

## 边界

- 本样例仍是固定、Mock、仓库跟踪的数据集，不依赖真实外部订阅源
- **Golden 为何是 18 不是 19**：review golden 与 `testfixturegen -stage1-live-base-url` 重录时，两条 transit 都只用 canonical 的 `transit-a.uri.txt` / `transit-b.uri.txt`（明文 URI 行，经 subconverter 当订阅拉取），**两条都不走 `?target=ClashMeta`**。上游 subconverter 解析 Shadowrocket 风格 `vmess://` 时，识别正则不接受 Base64 载荷末尾 **`=` 填充**，每条 URI 各静默丢 1 条 VMess → **9+9=18**。
- **手工联调为何常见 19**：[dual-landing-manual-reference.md](dual-landing-manual-reference.md) 里 Sub-2 推荐 `?target=ClashMeta`（YAML 不经上述 URI 解析，VMess 保留），与 Sub-1 默认 Base64 URI 混用时为 **9+10=19**。属输入格式与 golden 不一致，不是 chain-subconverter 单独过滤；**暂不修**（与 `4+1` 落地基线无直接耦合）。
- 当前仍与 `3pass-ss2022-test-subscription` 这个基础 fixture 并存；这属于分层与快速故障定界考虑，不代表复杂场景 fixture 过大而不能复用到 `smoke`
- 浏览器级 happy path 与阻断错误 E2E 仍属于后续工作，不由本基线替代
