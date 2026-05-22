# Comprehensive fixture：`dual-landing-chain-port-forward`

本文说明当前 Comprehensive fixture，用于补齐 Smoke 尚未覆盖的多落地、多中转订阅、端口转发与长/短链接恢复路径。

## 用途

对外文档层将这组数据定义为 `Comprehensive` 分层；底层 fixture ID 仍保持 `dual-landing-chain-port-forward`，避免影响目录名、命令参数与现有测试代码。

当前默认约定是：

- 当新功能主要影响双落地 / 双中转 / template / port-forward / 长短链接恢复这类复杂组合时，优先补到 Comprehensive
- 若该功能同时也会影响默认主线或部署 smoke，则仍应补一条 Smoke 断言，避免只在复杂样例里兜底

该样例固定覆盖一组更接近日常使用的场景：

- 2 套落地配置，每套对应 1 台落地服务器
- 每套落地服务器拆成 3 条落地节点：
  - 1 条 SS 落地，用于和中转订阅导出的地域策略组做链式代理
  - 1 条 Reality 落地，用于端口转发
  - 1 条 Reality 落地，保留为直连备用
- 另固定跟踪 `1` 条“手动添加 SOCKS5”样例，用于前端手填 / 转换与长短链接恢复
- 总计 `6 + 1` 条 landing 输入、`2` 条 transit 订阅、`2` 条 forward relay

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
- `stage1/input/landing.txt` 现直接派生 canonical 的 `landingItems + manualSocks5Items.generatedURI`，即仓库跟踪的 review Stage 1 输入默认就是 `6 + 1` 行
- 浏览器自动化若需要验证 “+ 添加 SOCKS5” 表单填写 / `socks5://` 解析 / `tg://socks` 追加，应直接从 canonical 的 `landingItems` 这 `6` 条起步，再在 UI 中手动追加同一条 SOCKS5 样例，而不是复用 review `landing.txt`
- 当前 tracked `stage1/output/landing-discovery.*`、`transit-discovery.*`、`full-base.*` 与 `stage1-convert.*` 已对齐到 `6 + 1` 条 landing 输入；手动 SOCKS5 样例会以 `type: socks5` 的第 `7` 个 landing 代理出现，并保留在 Stage 2 snapshot 中作为默认 `chain -> 🇭🇰 香港节点`
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

- `stage1/convert` 自动填充当前固定为：
  - 2 条 SS 落地自动识别到对应地域组，默认 `mode = chain`
  - 4 条 Reality 落地同样会按地域 matcher 默认推到对应地域组，默认 `mode = chain`；同时保留协议/端口层面的 `chain` 警告
- 1 条手动 SOCKS5 落地同样会默认自动填充到 `🇭🇰 香港节点`，默认 `mode = chain`
- `stage2-snapshot` 再把其中 2 条 Reality 落地显式切到 `port_forward`，并分别指向两条不同 relay；另 2 条 Reality 落地显式切回 `none`，作为直连备用；手动 SOCKS5 保持默认 `chain`
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
- 当前仍与 `3pass-ss2022-test-subscription` 这个 Smoke fixture 并存；这属于分层与快速故障定界考虑，不代表 Comprehensive 过大而不能复用到 Smoke
- 浏览器级 happy path 与阻断错误 E2E 仍属于后续工作，不由本基线替代
