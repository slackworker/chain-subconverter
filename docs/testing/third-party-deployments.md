# 第三方设备部署回归记录（公开结论）

按 [release-runbook.md](release-runbook.md) 字段记录**结论**；部署步骤见 [../../deploy/README.md](../../deploy/README.md)。

**分工**

| 位置 | 内容 |
|------|------|
| 本文件（进仓库） | 日期、镜像 tag、设备角色、回归范围、通过/失败、关键发现与后续动作 |
| [third-party-deployments.local.md](third-party-deployments.local.md)（同目录，gitignore） | 主机名、IP、SSH、公网域名、完整 `CHAIN_SUBCONVERTER_E2E_*` smoke 命令 |

首次克隆：复制 [third-party-deployments.local.example.md](third-party-deployments.local.example.md) → `third-party-deployments.local.md`。新增一轮：先在本文件写结论，细节补到 `.local.md`。

---

## 2026-05-20 — Worker fixture 对齐 dual-landing（公网已部署）

- **镜像 / 产物**：`deploy/test-fixtures-worker`；源语义见 [dual-landing-chain-port-forward.md](dual-landing-chain-port-forward.md)
- **设备**：Cloudflare Workers 公网测试订阅源（`chain-subconverter-test-fixtures.slackworker.workers.dev`）
- **本地校验**：`npm test`、`sync-canonical-fixtures`（含 `--check`）、本地 `Landing-Subscription?target=URI` 非空行数 **7** — 均通过
- **公网复核**（2026-05-22）：`…/dual-landing/download/Landing-Subscription?target=URI` 非空行 **7**，与 canonical `6 + 1` landing 一致
- **结果**：**通过**（仓库与公网对齐；后续语料变更仍按 worker README 执行 `sync` + `wrangler deploy`）
- **产物字节数（本地 `public/`，供 deploy 前后对照）**

| 端点 | 字节数 |
|------|--------|
| `Landing-Subscription` / `?target=ClashMeta` / `?target=URI` | 1408 / 1606 / 1055 |
| `Airport-Subscription-1` 三变体 | 1912 / 2186 / 1435 |
| `Airport-Subscription-2` 三变体 | 1908 / 2143 / 1431 |
| `Airport-Subscription` 聚合三变体 | 3820 / 4320 / 2866 |

- **用法**：单中转优先 `-1`/`-2`；兼容旧脚本用聚合 `Airport-Subscription`；双中转 Playwright 用 `CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT` + `_2`（见 deploy README / 本地文件中的完整 URL）

---

## 2026-05-19 — Cloudflare Workers 外网测试订阅源（初版 6 端点）

- **设备**：Workers 静态 fixture（`deploy/test-fixtures-worker`）
- **语料**：仓库 `testdata/canonical-scenarios/` → `npm run sync`；不再依赖内网私有订阅源
- **结果**：**通过** — 6 个 `GET` 均为 **200**，`text/plain; charset=utf-8`
- **特征（初版，deploy 前）**：`Landing-*` 为最小 3pass 落地；`Airport-Subscription` 为单份 3pass transit 语料（后续已拆为 dual-landing + A/B）

---

## 2026-05-19 — 公网 VPS（HTTPS 反代，trusted-proxy 修正后）

- **镜像 tag**：`ghcr.io/slackworker/chain-subconverter:beta-latest`
- **设备**：公网 VPS（OpenResty → 本机 `127.0.0.1:11200`）
- **USER_FACING_BASE_URL**：未设置
- **TRUSTED_PROXY_CIDRS**：live compose 已补 `172.16.0.0/12`
- **回归**：公网 HTTPS、`deployed-smoke`（origin 须与 `E2E_BASE_URL` 一致）、Worker 订阅源、generate / short-links / 订阅读取
- **结果**：**通过**
- **关键发现**：此前 live compose 缺 `TRUSTED_PROXY_CIDRS`，公网入口生成的链接基址被推断为 `http://`；补全并 recreate 后 smoke 与 API 均正常
- **stage1**：Worker `Landing-Subscription` + `Airport-Subscription` → **200**，`stage2Init.rows` = **7**（6 自动落地 + 1 手动 SOCKS5）

---

## 2026-05-18 — 公网 VPS（beta-latest，初轮）

- **镜像 tag**：`beta-latest` + `subconverter:integration-chain-subconverter`
- **设备**：公网 VPS（同上前身配置）
- **变更**：自 `dev-latest` 升级；端口改为 `127.0.0.1:11200`（配合反代）
- **TRUSTED_PROXY_CIDRS**：默认（本轮后于 05-19 修正）
- **结果**：**通过** — healthz、API、订阅/短链、隧道 smoke；UI 全矩阵未测
- **非阻塞**：Playwright 曾未等 `runtime-config`；已在 spec 中修复

---

## 2026-05-18 — 内网 LAN 设备（beta-latest）

- **镜像 tag**：`beta-latest`（与公网 VPS 同 digest）
- **设备**：内网 LAN 侧 Compose，`HOST_PORT=11200`
- **USER_FACING_BASE_URL** / **TRUSTED_PROXY_CIDRS**：均未改
- **回归**：Compose pull/up、API、订阅/短链、重启恢复、WSL Playwright `deployed-smoke`
- **结果**：**通过**（~5s）；空中转 stage1 **503** 为预期
- **输入**：两条内联 SS（TEST-NET 落地 + 设备示例中转节点）；inventory 细节见本地文件

---

## 复测入口（无敏感信息）

```bash
# 必须显式指定目标；可选覆盖落地/中转订阅 URL（见 deploy/test-fixtures-worker/README）
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" ./scripts/third-party-smoke.sh
```

完整 `E2E_*` 与 SSH/隧道示例：[third-party-deployments.local.md](third-party-deployments.local.md)。
