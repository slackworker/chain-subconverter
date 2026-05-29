# 第三方设备部署回归记录（公开结论）

按 [release-runbook.md](release-runbook.md) 字段记录**结论**；部署步骤见 [../../deploy/README.md](../../deploy/README.md)。

**分工**

| 位置 | 内容 |
|------|------|
| 本文件（进仓库） | 日期、镜像 tag、设备角色、回归范围、通过/失败、关键发现与后续动作 |
| [third-party-deployments.local.md](third-party-deployments.local.md)（同目录，gitignore） | 主机名、IP、SSH、公网域名、完整 `CHAIN_SUBCONVERTER_E2E_*` smoke 命令 |

首次克隆：复制 [third-party-deployments.local.example.md](third-party-deployments.local.example.md) → `third-party-deployments.local.md`。新增一轮：先在本文件写结论，细节补到 `.local.md`。

---

## 3.0 回归覆盖（三种部署形态）

| 形态 | 设备 / 平台 | 最近回归 | 结果 |
|------|-------------|----------|------|
| **内网一体化** | vps-01（LAN Compose） | 2026-05-29 | **通过** |
| **公网 HTTPS 一体化** | vps-02（反代 + Compose） | 2026-05-29 | **通过** |
| **双 Docker 分离** | Railway + Koyeb（demo preview） | 2026-05-23 | **通过** |

外网测试订阅源（Worker fixture）的同步与 deploy 见 [deploy/test-fixtures-worker/README.md](../../deploy/test-fixtures-worker/README.md)，不记入本表。

---

## 内网一体化 — vps-01（2026-05-29，`beta-latest` 滚动构建第 2 轮）

- **镜像 tag**：`ghcr.io/slackworker/chain-subconverter:beta-latest`（digest `sha256:36a8eb9fa16a618a08b9bd974479bb103e264993906227e29287ff273bf1265b`，与 vps-02 一致；`beta` @ `86922c3`；发版口径 **`v3.0.0-beta.3`**，滚动构建尚未单独打 tag）；`subconverter:integration-chain-subconverter`（digest `sha256:c7073588b711b3abec59096cc6706255841623fa64b6b2116bc6efbdbbbd3775`，`/version` = `v0.9.2-c7b26b5-...`）
- **设备**：内网 LAN Compose，`HOST_PORT=11200`
- **USER_FACING_BASE_URL** / **TRUSTED_PROXY_CIDRS**：均未设置
- **回归**：`healthz`、`/api/runtime-config`、WSL `deployed-smoke`（Worker dual-transit）
- **结果**：**通过**
- **细节**：SSH、入口 URL、smoke 命令见本地文件

---

## 公网 HTTPS 一体化 — vps-02（2026-05-29，`beta-latest` 滚动构建第 2 轮）

- **镜像 tag**：与 vps-01 同 digest（`beta-latest` 滚动，`beta` @ `86922c3`；发版口径 **`v3.0.0-beta.3`**）；`subconverter:integration-chain-subconverter` 同 digest（`sha256:c7073588...`，`/version` = `v0.9.2-c7b26b5-...`）
- **设备**：公网 VPS（OpenResty → `127.0.0.1:11200`）
- **USER_FACING_BASE_URL**：未设置
- **TRUSTED_PROXY_CIDRS**：`172.16.0.0/12`（缺省会导致生成链接为 `http://`）
- **回归**：公网 HTTPS、`deployed-smoke`（origin 须与 `E2E_BASE_URL` 一致）、generate / short-links / 订阅读取
- **结果**：**通过**
- **细节**：SSH、域名、smoke 命令见本地文件

---

## 历史 — `beta-latest` / `v3.0.0-beta.2`（2026-05-25）

vps-01 / vps-02 以 digest `sha256:afa71279f0513f51bdda0f503c2629164f4a5c46a70747a54f28f959df438546`（Git tag `v3.0.0-beta.2`）完成内网与公网一体化回归，`deployed-smoke` 均为 **通过**。

---

## 历史 — `beta-latest` beta.1（2026-05-23）

vps-01 / vps-02 以 digest `sha256:a1bd2238386485ae4225993b673ad77b3e04234030f91b38b0c7cc23c7966a65`（`v3.0.0-beta.1` 同期 `beta-latest`）完成内网与公网一体化回归，`deployed-smoke` 均为 **通过**。

---

## 历史 — `dev-latest`（2026-05-22）

vps-01 / vps-02 在 **2026-05-22** 以 `dev-latest`（digest `sha256:5170df8c9c3844be31e1ac3612c4679c8d966afbbb176926c491c0eb80ddeeca`）完成同等形态回归，结论均为 **通过**。

---

## 双 Docker 分离 — Railway + Koyeb（2026-05-23）

- **部署形态**：`app` 与 `subconverter` 分属独立 Docker 项目；`UPSTREAM` / `FACING` 跨公网互访
- **chain-subconverter 入口**（可作项目 **demo preview**）：
  - Railway：`https://chain-subconverter-production.up.railway.app/`
  - Koyeb：`https://fantastic-loise-slackers-134ea8cc.koyeb.app/`
- **subconverter 入口**：Railway `https://sparkling-luck-production.up.railway.app/`（`GET /version` → `subconverter v0.9.1-70ad654-mihomo backend`）
- **镜像 tag**：本轮未从响应头确认；subconverter 版本见 `/version`
- **回归**：`healthz`、`/api/runtime-config`、`/` UI；WSL `deployed-smoke`（Worker dual-transit）；subconverter `/version`
- **结果**：**通过**
- **关键发现**：双 Docker 分离下 stage1 → generate → 订阅读取 → short-link round-trip 均正常；生成链接 origin 与各自 HTTPS 入口一致
- **后续**：可作为对外 demo preview；复验命令见本地文件

---

## 复测入口（无敏感信息）

```bash
# 必须显式指定目标；落地/中转订阅 URL 见 dual-landing-manual-reference.md
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" ./scripts/third-party-smoke.sh
```

完整 `E2E_*` 与 SSH/运维示例：[third-party-deployments.local.md](third-party-deployments.local.md)。
