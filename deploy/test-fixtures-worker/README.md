# 外网测试订阅源（Cloudflare Workers）

本文是 `deploy/test-fixtures-worker/` 的局部维护说明，不作为仓库主导航；项目整体状态与文档入口见 [../../docs/README.md](../../docs/README.md)。

将仓库内已跟踪的 canonical 固定基线同步为静态文件，部署到 Cloudflare Workers 后供 chain-subconverter **公网部署**阶段拉取（中转 / 落地 URL）。当前约定是：`Landing-*` 直接对应 `dual-landing-chain-port-forward.stage1.json` 的 `landingItems + manualSocks5Items.generatedURI`（当前共 `6 + 1` 条），`Airport-Subscription-1/2` 直接对应同一场景的两份 transit URI 语料，`Airport-Subscription` 则作为由这两份语料拼接而成的兼容聚合别名。

## 当前本地产物 / 下次部署后的入口

以下字节数对应当前仓库内 `public/` 产物；执行 `npx wrangler deploy` 后，会以同一路径上线到 `https://chain-subconverter-test-fixtures.slackworker.workers.dev`。当前推荐使用语义化路径 `/dual-landing/download/*`；旧的 `/7xK9pLm2Qr4vB6yN8sT3/download/*` 继续保留为兼容别名。

**Base**：`https://chain-subconverter-test-fixtures.slackworker.workers.dev`

| 用途 | URL | 格式 | 当前本地字节数 |
|------|-----|------|-------------------|
| 落地（默认） | [`…/download/Landing-Subscription`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Landing-Subscription) | Base64 | 1408 B |
| 落地 Clash | [`…/download/Landing-Subscription?target=ClashMeta`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Landing-Subscription?target=ClashMeta) | Clash YAML | 1606 B |
| 落地 URI | [`…/download/Landing-Subscription?target=URI`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Landing-Subscription?target=URI) | 明文 URI | 1055 B |
| 中转 A（默认） | [`…/download/Airport-Subscription-1`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-1) | Base64 | 1912 B |
| 中转 A Clash | [`…/download/Airport-Subscription-1?target=ClashMeta`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-1?target=ClashMeta) | Clash YAML | 2186 B |
| 中转 A URI | [`…/download/Airport-Subscription-1?target=URI`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-1?target=URI) | 明文 URI | 1435 B |
| 中转 B（默认） | [`…/download/Airport-Subscription-2`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-2) | Base64 | 1908 B |
| 中转 B Clash | [`…/download/Airport-Subscription-2?target=ClashMeta`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-2?target=ClashMeta) | Clash YAML | 2143 B |
| 中转 B URI | [`…/download/Airport-Subscription-2?target=URI`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-2?target=URI) | 明文 URI | 1431 B |
| 中转聚合（兼容） | [`…/download/Airport-Subscription`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription) | Base64 | 3820 B |
| 中转聚合 Clash | [`…/download/Airport-Subscription?target=ClashMeta`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription?target=ClashMeta) | Clash YAML | 4320 B |
| 中转聚合 URI | [`…/download/Airport-Subscription?target=URI`](https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription?target=URI) | 明文 URI | 2866 B |

公网 chain-subconverter 测试时，单中转订阅 smoke 优先使用 `Airport-Subscription-1` 或 `Airport-Subscription-2`；需要兼容既有单 URL 聚合输入时，可继续使用 `Airport-Subscription`。若要模拟双中转输入，则把 `Airport-Subscription-1` 与 `Airport-Subscription-2` 分两行填入同一个文本框即可。

## 目录与 URL 对应

部署后的 Worker 根路径下，公开 URL 与静态文件对应如下（以下以推荐的 `/dual-landing` 为例；旧的 `/7xK9pLm2Qr4vB6yN8sT3` 指向同一份内容）：

| 本地源 URL | 静态文件 |
|------------|----------|
| `…/download/Airport-Subscription-1` | `public/dual-landing/download/Airport-Subscription-1`（Base64 订阅） |
| `…/download/Airport-Subscription-1?target=ClashMeta` | 同上目录 `Airport-Subscription-1.clashmeta` |
| `…/download/Airport-Subscription-1?target=URI` | `Airport-Subscription-1.uri` |
| `…/download/Airport-Subscription-2` | `public/dual-landing/download/Airport-Subscription-2`（Base64 订阅） |
| `…/download/Airport-Subscription-2?target=ClashMeta` | 同上目录 `Airport-Subscription-2.clashmeta` |
| `…/download/Airport-Subscription-2?target=URI` | `Airport-Subscription-2.uri` |
| `…/download/Airport-Subscription` | `public/dual-landing/download/Airport-Subscription`（Base64 订阅） |
| `…/download/Airport-Subscription?target=ClashMeta` | 同上目录 `Airport-Subscription.clashmeta` |
| `…/download/Airport-Subscription?target=URI` | `Airport-Subscription.uri` |
| `…/download/Landing-Subscription` | `Landing-Subscription`（Base64） |
| `…/download/Landing-Subscription?target=ClashMeta` | `Landing-Subscription.clashmeta` |
| `…/download/Landing-Subscription?target=URI` | `Landing-Subscription.uri` |

`Landing-*` 当前直接来自 `testdata/canonical-scenarios/dual-landing-chain-port-forward.stage1.json` 的 `landingItems` 与 `manualSocks5Items.generatedURI`，并由同步脚本稳定派生出 Base64 / ClashMeta 变体；`Airport-Subscription-1/2` 直接来自同一场景的 `transit-a.uri.txt` 与 `transit-b.uri.txt`；`Airport-Subscription` 则是由这两份 transit 语料拼接得到的兼容聚合别名。均为 Mock 测试数据，可安全用于公网回归。

当前这条 URI 基线的派生逻辑已统一收敛到 `scripts/lib/subscription-artifacts.mjs`：`General` / `URI` 都等于原始 URI 行集合，Base64 等于该明文订阅的 Base64 编码，`mihomo` / `ClashMeta` 则由同一批 URI 先解析为统一代理对象后再输出。canonical 将落地拆为 `landingItems`（`6` 条自动 URI）与 `manualSocks5Items`（`1` 条手填 SOCKS5 样例）；**review `stage1/input/landing.txt` 与 Worker `Landing-*` 均派生为 `6 + 1`**，等价于前端已“手动添加 SOCKS5”后的完整输入。仅浏览器 E2E 在验证 SOCKS5 表单流程时，才从 `landingItems` 的 `6` 条起步并在 UI 中追加该条样例（详见 [dual-landing-chain-port-forward.md](../../docs/testing/dual-landing-chain-port-forward.md)）。

`Landing-Subscription.clashmeta` 与其他 `*.clashmeta` 现在都由这条共享派生路径直接从 URI 逐条解析后输出 inline proxy map；不会再把完整 `ss://method:password@host:port` 漂移成摘要型 `type: ss` 条目，也不会为了迎合下游默认配置而额外显式补出 `skip-cert-verify:false`、`udp:false`、`encryption:"none"` 这类字段。worker 的权威落地输入仍是无查询参数的订阅 URL 或 `?target=URI` 明文形式。

带 `?target=` 的地址由 `src/index.js` 路由到对应后缀文件；无查询参数时直接返回无后缀文件。

## 从 canonical 基线同步快照

```bash
cd deploy/test-fixtures-worker
npm run sync
npm run check
```

`npm run sync` 从仓库内 canonical 基线生成静态快照，不从外部私有订阅服务拉取。当前会生成 12 个静态文件：3 个 landing 变体、3 个 transit A 变体、3 个 transit B 变体，以及 3 个聚合兼容别名变体。

若你在这次 landing 修正之前已经执行过一次 `npx wrangler deploy`，需要再 deploy 一次，公网 `Landing-Subscription*` 才会从旧的单行 3pass 落地切换到当前 `6 + 1` dual-landing 版本。

## 部署到 Cloudflare

> **不要拖整个 `test-fixtures-worker` 文件夹。** 里面的 `node_modules/` 有一千多个文件，会触发控制台「超过 1000 个文件」报错。真正要部署的只有 `public/`、`src/`、`wrangler.toml`（约十几个文件）。

### 方式 A：Wrangler CLI（推荐）

本地上传时不会带上 `node_modules`，支持全部 12 个 URL（含 `?target=`）：

```bash
cd deploy/test-fixtures-worker
npm install          # 仅本机用，不会上传到 Cloudflare
npx wrangler deploy
```

当前已部署为 `https://chain-subconverter-test-fixtures.slackworker.workers.dev`（`wrangler deploy` 后若子域不同，请改上表 Base）。

### 方式 B：控制台拖放

先生成**仅含部署文件**的目录（不含 `node_modules`）：

```bash
cd deploy/test-fixtures-worker
./scripts/prepare-dashboard-upload.sh
# 输出目录：dist/dashboard-upload/  （约十几个文件）
```

在 Cloudflare 控制台里**只拖 `dist/dashboard-upload` 这个文件夹**，不要拖上级 `test-fixtures-worker`。

若控制台只接受纯静态、无法附带 Worker 脚本，则只能访问**无** `?target=` 的默认订阅；需要 `ClashMeta` / `URI` 时请改用方式 A。

## 本地验证

```bash
cd deploy/test-fixtures-worker
npx wrangler dev
curl -sS "http://127.0.0.1:8787/7xK9pLm2Qr4vB6yN8sT3/download/Landing-Subscription?target=URI" | head -2

# 推荐主路径
curl -sS "http://127.0.0.1:8787/dual-landing/download/Landing-Subscription?target=URI" | head -2
```

## 在公网 smoke 中使用

`CHAIN_SUBCONVERTER_E2E_*_INPUT` 传给 `deployed-smoke.spec.ts` 的应是“订阅源 URL”，不是 `?target=URI` 这种“展开后的明文内容”。`deployed-smoke.spec.ts` 现在支持 `CHAIN_SUBCONVERTER_E2E_LANDING_INPUT_2/_3...` 与 `CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT_2/_3...` 追加多行输入，所以双中转 smoke 不需要手写换行转义。

```bash
# 在仓库根目录执行；公网 app 入口勿写入 Git，见 docs/testing/third-party-deployments.local.md
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" \
CHAIN_SUBCONVERTER_E2E_LANDING_INPUT="https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Landing-Subscription" \
CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT="https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-1" \
CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT_2="https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-2" \
./scripts/third-party-smoke.sh
```

若已有外部脚本或历史记录仍使用 `/7xK9pLm2Qr4vB6yN8sT3/download/*`，当前无需立即切换；同步脚本会继续产出该兼容目录。

若只想兼容旧的单 URL smoke，则继续传 `Airport-Subscription` 即可。

若是手工在页面文本框里粘贴“明文 URI 内容”，才使用 `?target=URI`。
