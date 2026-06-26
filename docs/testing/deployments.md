# 第三方设备部署回归记录（公开结论）

> **下一轮回归目标**：`v3.1.0-beta.1` @ `beta-latest`（待发 tag；打 tag 并部署后覆盖本节 digest，勿提前伪造）。

按 [runbook.md](runbook.md) 字段记录**当前一轮**结论；部署步骤见 [../../deploy/README.md](../../deploy/README.md)。E2E 命令见 [runbook.md#公网-e2e第三方部署](runbook.md#公网-e2e第三方部署)。

**维护**：单线开发下每种部署形态**只保留最新一轮**——覆盖对应节与下表日期/结果，**不追加**「历史」段；更早 digest 见 Git 历史该文件 diff。正式 Beta tag 里程碑见 [RELEASES.md](../../RELEASES.md)。

**分工**

| 位置 | 内容 |
|------|------|
| 本文件（进仓库） | 日期、镜像 tag、设备角色、回归范围、通过/失败、关键发现与后续动作 |
| `deployments.local.md`（同目录，gitignore） | 主机名、IP、SSH、公网域名、完整 `CHAIN_SUBCONVERTER_E2E_*` smoke 命令 |

首次克隆：复制 [runbook.md#第三方本地记录模板](runbook.md#第三方本地记录模板) 内容 → `deployments.local.md`。完成回归后：**覆盖**本文件对应节，细节同步 `deployments.local.md`。

---

## 3.0 回归覆盖（三种部署形态）

| 形态 | 设备 / 平台 | 最近回归 | 结果 |
|------|-------------|----------|------|
| **内网一体化** | vps-01（LAN Compose） | 2026-06-26 | **通过** |
| **公网 HTTPS 一体化** | vps-02（反代 + Compose） | 2026-06-26 | **通过** |
| **双 Docker 分离** | Railway + Koyeb（demo preview） | 2026-05-23 | **通过** |

外网测试订阅源（Worker fixture）的同步与 deploy 见 [deploy/test-fixtures-worker/README.md](../../deploy/test-fixtures-worker/README.md)，不记入本表。

---

## 内网一体化 — vps-01（2026-06-26，`dev-latest`）

- **镜像 tag**：`ghcr.io/slackworker/chain-subconverter:dev-latest`（digest `sha256:b7df699ee1a0025c310d47a586d91459d52a94c086c717426572adf6833a90ac`，`dev` @ `ac821587`）；`subconverter:integration-chain-subconverter`（`/version` = `v0.9.2-c7b26b5-...`，本轮未换 digest）
- **设备**：内网 LAN Compose，`HOST_PORT=11200`
- **USER_FACING_BASE_URL** / **TRUSTED_PROXY_CIDRS**：均未设置
- **DEFAULT_TEMPLATE_URL**：已同步为 slackworker fork（见 [deploy/docker-compose.yml](../../deploy/docker-compose.yml)；旧 compose 曾残留 upstream `Aethersailor/...`）
- **回归**：`healthz`、`/api/runtime-status`；`docker compose pull && up -d --force-recreate app`；WSL `test:e2e:real:smoke` + `test:e2e:real:full`（Worker dual-transit；full 含复制行 + 聚合模式 + resolve 回放）
- **结果**：**通过**
- **关键发现**：`fcd80d6` 扩展 `real-full` 后，`4f3dc004` 镜像在 resolve 回放因空 `serverAggregationGroups` 未序列化而失败；`ac821587`（`NormalizeStage2Snapshot`）修复后复验通过。`pull && up` 不会自动更新 compose env，须对照仓库默认 env 合并后再 `up --force-recreate app`
- **细节**：SSH、入口 URL、smoke 命令见本地文件

---

## 公网 HTTPS 一体化 — vps-02（2026-06-26，`dev-latest`）

- **镜像 tag**：与 vps-01 同 digest（`dev-latest`，`dev` @ `ac821587`）；`subconverter:integration-chain-subconverter` 同 vps-01（`/version` = `v0.9.2-c7b26b5-...`）
- **设备**：公网 VPS（OpenResty → `127.0.0.1:11200`）
- **USER_FACING_BASE_URL**：未设置
- **TRUSTED_PROXY_CIDRS**：`172.16.0.0/12`
- **DEFAULT_TEMPLATE_URL**：同 vps-01（slackworker fork，已从旧 upstream 同步）
- **回归**：公网 HTTPS；`docker compose pull && up -d --force-recreate app`；WSL `test:e2e:real:smoke` + `test:e2e:real:full`（origin 与 `E2E_BASE_URL` 一致；generate / short-links / resolve / Stage2 编排回放）
- **结果**：**通过**
- **关键发现**：与 vps-01 同轮复验；HTTPS 入口与 resolve 回放均正常
- **细节**：SSH、域名、smoke 命令见本地文件

---

## 双 Docker 分离 — Railway + Koyeb（2026-05-23）

- **部署形态**：`app` 与 `subconverter` 分属独立 Docker 项目；`UPSTREAM` / `FACING` 跨公网互访
- **chain-subconverter 入口**（可作项目 **demo preview**）：
  - Railway：`https://chain-subconverter-production.up.railway.app/`
  - Koyeb：`https://fantastic-loise-slackers-134ea8cc.koyeb.app/`
- **subconverter 入口**：Railway `https://sparkling-luck-production.up.railway.app/`（`GET /version` → `subconverter v0.9.1-70ad654-mihomo backend`）
- **镜像 tag**：本轮未从响应头确认；subconverter 版本见 `/version`
- **回归**：`healthz`、`/api/runtime-config`、`/` UI；WSL `test:e2e:real:smoke` + `test:e2e:real:full`（Worker dual-transit）；subconverter `/version`
- **结果**：**通过**
- **关键发现**：双 Docker 分离下 stage1 → generate → 订阅读取 → short-link round-trip 均正常；生成链接 origin 与各自 HTTPS 入口一致
- **后续**：可作为对外 demo preview；复验时覆盖本节与上表日期；命令见本地文件

---

## 复测入口（无敏感信息）

```bash
# 必须显式指定目标；落地/中转订阅 URL 见 preview-inputs.md
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" ./scripts/third-party-smoke.sh
```

完整 `E2E_*` 与 SSH/运维示例：`deployments.local.md`。
