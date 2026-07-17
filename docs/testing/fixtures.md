# 测试场景与金样

本文说明 Smoke 与 Full 两套固定基线的用途、目录职责与维护方式。测试入口命名见 [README.md](README.md)；可执行命令见 [runbook.md](runbook.md)。

## Smoke 场景

### 用途

本场景固定一组最小但完整的 `subconverter` 3-pass 基线，并覆盖默认链式代理 happy path 的最小业务闭环。

对外归入 `smoke` 用例入口（`mock-smoke` / `real-smoke`）。

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

### 自动化测试材料

该目录供 `internal/review`、`internal/service` 与 `internal/api` 相关自动化测试回放。

其中 `stage1/input/*` 当前已改由仓库根目录的 canonical 场景文件派生。

当前 `internal/review` 对这组 tracked fixture 的 Stage 1 加载也会优先直接读取这份 canonical JSON，并构造 review 语义下的 `service.Stage1Input`；目录里的 `stage1/input/*` 继续保留为生成物、审计材料与 `fixture-freshness` 的 drift 检查目标，而不是 tracked 场景的回源输入。

当前该 canonical 场景继续固定 `smoke` 入口真正消费的规范化 Stage 1 输入，不额外引入 Full 场景里那种更丰富的 transit/template 附属材料。它现在的职责主要是：作为最小内部回放基线，以及 `web/e2e/real-deployed-core-flow.spec.ts` 的默认 fallback 输入来源；Cloudflare Worker 公网 fixture 已转向 Full 场景这套更完整的数据。

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

### 当前默认业务推导

基于当前 3-pass 基线与默认模板规则，这条最小 happy path 当前固定为：

- `proxyName = "🇺🇸 SS2022-Test-256-US"`
- 默认 `mode = chain`
- 默认 `targetName = "🇺🇸 美国节点"`

该默认行由后端区域识别规则自动推导，不是手工指定。

### 期望拼接规则

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

### Smoke 边界

- 仓库内不再保留文件驱动的手动前端回放工作区
- 更完整的复杂场景见 [Full 场景](#full-场景)
- 若后续继续扩展高级设置、手动 override、端口转发或恢复冲突，应在 `internal/review/testdata/` 下新增并列 fixture
- 真实人工验证统一走实际前端服务、`/api/*` 与订阅路径，不复用旧的文本输入回放链

### 维护者备注（Smoke）

```
fixture ID:        3pass-ss2022-test-subscription
canonical:         testdata/canonical-scenarios/3pass-ss2022-test-subscription.stage1.json
tracked testdata:  internal/review/testdata/3pass-ss2022-test-subscription/
刷新 Stage 1:      go run ./cmd/testfixturegen -scenario 3pass-ss2022-test-subscription
```

`stage2/output/*` 继续保留为历史固定基线，不跟随 canonical 自动重录。

---

## Full 场景

### 用途

本场景用于补齐 `full` 入口中的多落地、多中转订阅、端口转发与长/短链接恢复路径。

对外归入 `full` 入口（`mock-full` / `real-full`）。

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

其中 `stage1/input/*` 现由仓库根目录的 canonical 场景文件派生。

当前 `internal/review` 对这组 tracked fixture 的 Stage 1 加载也会优先直接读取这份 canonical JSON，并按 review 语义把 `landingItems + manualSocks5Items.generatedURI` 合成为 `service.Stage1Input.landingRawText`；目录里的 `stage1/input/*` 继续保留为生成物、审计材料与 CI freshness 检查目标，而不是 tracked 场景的回源输入。

该 canonical 场景除 `stage1/input/*` 所需的落地 / 中转 URL / 端口转发 / 高级选项外，还显式跟踪：

- 1 条前端“手动添加 SOCKS5”用的固定表单样例与其生成后的 `tg://socks?...` URI
- 2 条 transit 订阅 URL 对应的固定明文 URI 内容文件（位于 canonical 目录下的 `transit-*.uri.txt`）
- 当前 `advancedOptions.config` 对应的固定模板内容文件（`template-config.ini`）以及推荐默认模板 URL

这些附加材料当前主要用于统一数据源与后续派生：

- 当前模板 URL 已固定为 Aethersailor 默认模板 URL；`template-config.ini` 只保存当前 Full 回放实际消费的 region matcher 快照，而不是整套上游模板。这样可以把 pinned 内容收敛在“会影响 Stage 1 自动识别 / Stage 2 默认填充”的最小语义面，避免把大量与本回放无关的规则、策略组和上游格式漂移一并引入 fixture 噪音
- 两份 transit 内容文件当前各自固定 `10` 条节点；合计覆盖 `8` 类协议与 `6` 个地域（HK / JP / US / SG / TW / KR），且不混入手动 SOCKS5 的 `tg://socks` 入口语义
- `stage1/input/landing.txt` 现直接派生 canonical 的 `landingItems + manualSocks5Items.generatedURI`，即仓库跟踪的 review Stage 1 输入默认就是 `4 + 1` 行
- 浏览器自动化若需要验证 “+ 添加 SOCKS5” 表单填写 / `socks5://` 解析 / `tg://socks` 追加，应直接从 canonical 的 `landingItems` 这 `4` 条起步，再在 UI 中手动追加同一条 SOCKS5 样例，而不是复用 review `landing.txt`
- 当前 tracked `stage1/output/landing-discovery.*`、`transit-discovery.*`、`full-base.*` 与 `stage1-convert.*` 已对齐到 `4 + 1` 条 landing 输入；手动 SOCKS5 样例会以 `type: socks5` 的第 `5` 个 landing 代理出现，并保留在 Stage 2 snapshot 中作为默认 `chain -> 🇭🇰 香港节点`
- 这组 Stage 1 frozen outputs 现在可以通过 live `subconverter` 直接重录；写回 Git 的 `*.url.txt` 仍仅来自 canonical 里已跟踪的 Mock 输入，无需额外处理；live 转换只把 transit 改成仓库内已跟踪的 `transit-*.uri.txt` 明文内容，避免再依赖外部测试 URL 或临时本地 HTTP 源

### 当前固定材料

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

### 当前语义边界

- `stage1/convert` 仅跑 Pass 1+2（不产 full-base）；自动填充当前固定为：
  - `Alpha-SS-SG` 默认 `chain -> 🇸🇬 新加坡节点`
  - `Alpha-Reality-SG` 默认 `chain -> 🇸🇬 新加坡节点`（并保留协议层 `chain` warning）
  - `Beta-SS-JP` 默认 `chain -> 🇯🇵 日本节点`
  - `Beta-Reality-JP` 默认 `chain -> 🇯🇵 日本节点`（并保留协议层 `chain` warning）
  - 手动 SOCKS5 默认 `chain -> 🇭🇰 香港节点`
- `stage2-snapshot` 在上述基础上固定为 `8` 行（含 3 条副本）：
  - `Alpha-SS-SG` 追加 1 条副本：分别指向 `🇭🇰 香港节点` 与 `🇸🇬 新加坡节点`
  - `Alpha-Reality-SG` 保留默认实例 `none`，并追加 2 条副本分别指向两条 `port_forward` relay
  - `Beta-SS-JP` 保持 `chain -> 🇯🇵 日本节点`
  - `Beta-Reality-JP` 固定为 `none`
  - 手动 SOCKS5 保持 `chain -> 🇭🇰 香港节点`
  - 启用 `serverAggregationGroups`（`198.51.100.10`，`fallback`）与 `chainProxyTargetGroupSwitchOptimizationEnabled = true`
- `generate` / `resolve-url` / `short-links` 使用该固定快照验证长链接与短链接的可回放性

也就是说，本基线同时覆盖自动识别、Stage 2 从默认 `chain` 手动切换到 `port_forward` / `none`，以及长/短链接恢复。

### 自动化覆盖

当前至少由以下测试直接消费：

- `internal/review` 的 artifact 回放测试
- `internal/service` 的 `BuildStage2Init` 语义测试
- `internal/service` 的 `resolve-url` replayable / short-link roundtrip 测试
- `internal/api` 的 `stage1/convert`、`short-links`、`resolve-url`（long URL / short URL）handler happy path 回放测试
- Web E2E `real-full`：按 [preview-inputs.md](preview-inputs.md) 手工路径操作并核对 Stage2 / short ID / long URL payload 金样（依赖已部署 app + 已同步 Worker）

### Full 边界 {#full-边界}

- 本样例仍是固定、Mock、仓库跟踪的数据集；`real-full` 经 Worker 拉取同一批语料，不依赖真实外部机场订阅
- **中转节点数基线为 10+10=20**：两条 transit 各 10 条节点（含 Shadowrocket 风格 `vmess://`）。canonical URI 的 Base64 载荷**不带**末尾 `=` 填充，以便上游 subconverter URI 解析保留 VMess；URI 路径与 Sub-2 `?target=ClashMeta` 混用路径节点数一致。
- 当前仍与 Smoke 场景的基础 fixture 并存；这属于分层与快速故障定界考虑，不代表复杂场景 fixture 过大而不能复用到 `smoke`
- 阻断错误类浏览器 E2E 仍属于后续工作，不由本基线替代

在线预览粘贴数据见 [preview-inputs.md](preview-inputs.md)（由 worker `sync` 自动生成）。

### 维护者备注（Full）

```
fixture ID:        dual-landing-chain-port-forward
canonical:         testdata/canonical-scenarios/dual-landing-chain-port-forward.stage1.json
tracked testdata:  internal/review/testdata/dual-landing-chain-port-forward/
刷新 Stage 1+2:    go run ./cmd/testfixturegen -scenario dual-landing-chain-port-forward
live Stage 1 重录: go run ./cmd/testfixturegen -scenario dual-landing-chain-port-forward -stage1-live-base-url http://127.0.0.1:25500/sub?
Worker 同步:       cd deploy/test-fixtures-worker && npm run sync && npm run check
```

`testfixturegen` 会同时刷新 `stage1/input/*` 与 `stage2/output/*`（generate、short-links、long-url、complete-config）。额外 live Stage 1 重录时刷新 `stage1/output/*` 与 `stage1-convert.*`，不覆盖 `stage2/input/stage2-snapshot.json`。

`complete-config.chain.yaml` 按托管 Pass 3 语义离线合成（`SynthesizeManagedPass3FullBaseYAML`）：以 stage1 `full-base` 为骨架，拼入托管 landing/transit，并将策略组中的 discovery 落地名展开为 snapshot `proxyName`（含副本），再走出组与 §3.3.3 注入。
