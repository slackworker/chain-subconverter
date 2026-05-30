# 第三方设备部署回归记录（公开结论）

按 [release-runbook.md](release-runbook.md) 字段记录**当前一轮**结论；部署步骤见 [../../deploy/README.md](../../deploy/README.md)。

**维护**：单线开发下每种部署形态**只保留最新一轮**——覆盖对应节与下表日期/结果，**不追加**「历史」段；更早 digest 见 Git 历史该文件 diff。正式 Beta tag 里程碑见 [RELEASES.md](../../RELEASES.md)。

**分工**

| 位置 | 内容 |
|------|------|
| 本文件（进仓库） | 日期、镜像 tag、设备角色、回归范围、通过/失败、关键发现与后续动作 |
| [third-party-deployments.local.md](third-party-deployments.local.md)（同目录，gitignore） | 主机名、IP、SSH、公网域名、完整 `CHAIN_SUBCONVERTER_E2E_*` smoke 命令 |

首次克隆：复制 [third-party-deployments.local.example.md](third-party-deployments.local.example.md) → `third-party-deployments.local.md`。完成回归后：**覆盖**本文件对应节，细节同步 `.local.md`。

---

## 3.0 回归覆盖（三种部署形态）

| 形态 | 设备 / 平台 | 最近回归 | 结果 |
|------|-------------|----------|------|
| **内网一体化** | vps-01（LAN Compose） | 2026-05-30 | **通过** |
| **公网 HTTPS 一体化** | vps-02（反代 + Compose） | 2026-05-30 | **通过** |
| **双 Docker 分离** | Railway + Koyeb（demo preview） | 2026-05-23 | **通过** |

外网测试订阅源（Worker fixture）的同步与 deploy 见 [deploy/test-fixtures-worker/README.md](../../deploy/test-fixtures-worker/README.md)，不记入本表。

---

## 内网一体化 — vps-01（2026-05-30，`dev-latest`）

- **镜像 tag**：`ghcr.io/slackworker/chain-subconverter:dev-latest`（digest `sha256:eeff0ea63c5d5f23e3605e69486922af7b75fe02ce3ae3abe7af906605ed3c24`，与 vps-02 一致；`dev` @ `65e4f01`）；`subconverter:integration-chain-subconverter`（digest `sha256:c7073588b711b3abec59096cc6706255841623fa64b6b2116bc6efbdbbbd3775`，`/version` = `v0.9.2-c7b26b5-...`）
- **设备**：内网 LAN Compose，`HOST_PORT=11200`
- **USER_FACING_BASE_URL** / **TRUSTED_PROXY_CIDRS**：均未设置
- **回归**：`healthz`、`/api/runtime-config`、WSL `deployed-smoke`（Worker dual-transit）
- **结果**：**通过**
- **细节**：SSH、入口 URL、smoke 命令见本地文件

---

## 公网 HTTPS 一体化 — vps-02（2026-05-30，`dev-latest`）

- **镜像 tag**：与 vps-01 同 digest（`dev-latest`，`dev` @ `65e4f01`）；`subconverter:integration-chain-subconverter` 同 digest（`sha256:c7073588...`，`/version` = `v0.9.2-c7b26b5-...`）
- **设备**：公网 VPS（OpenResty → `127.0.0.1:11200`）
- **USER_FACING_BASE_URL**：未设置
- **TRUSTED_PROXY_CIDRS**：`172.16.0.0/12`（缺省会导致生成链接为 `http://`）
- **回归**：公网 HTTPS、`deployed-smoke`（origin 须与 `E2E_BASE_URL` 一致）、generate / short-links / 订阅读取
- **结果**：**通过**
- **细节**：SSH、域名、smoke 命令见本地文件

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
- **后续**：可作为对外 demo preview；复验时覆盖本节与上表日期；命令见本地文件

---

## 复测入口（无敏感信息）

```bash
# 必须显式指定目标；落地/中转订阅 URL 见 dual-landing-manual-reference.md
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" ./scripts/third-party-smoke.sh
```

完整 `E2E_*` 与 SSH/运维示例：[third-party-deployments.local.md](third-party-deployments.local.md)。
