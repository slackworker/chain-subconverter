# 第三方设备部署回归记录（公开结论）

> **当前设备镜像**：`dev-latest` @ `78a4477`（`dev` 分支；三台设备已切 `dev-latest`，**smoke + real-full 通过**）。正式 Beta 里程碑见 [`v3.2.0-beta.2`](../../RELEASES.md#v320-beta2) @ `beta-latest`（`c87d9a4`）。

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
| **内网一体化** | vps-01（LAN Compose） | 2026-07-03 | **smoke + full 通过** |
| **公网 HTTPS 一体化** | vps-02（反代 + Compose） | 2026-07-03 | **smoke + full 通过** |
| **双 Docker 分离** | Koyeb + vps-02（demo preview） | 2026-07-03 | **smoke + full 通过** |

外网测试订阅源（Worker fixture）的同步与 deploy 见 [deploy/test-fixtures-worker/README.md](../../deploy/test-fixtures-worker/README.md)，不记入本表。

---

## 内网一体化 — vps-01（2026-07-03，`dev-latest`）

- **镜像 tag**：`ghcr.io/slackworker/chain-subconverter:dev-latest`（`dev` @ `78a4477`；运行时 `app.version = dev-latest`）；`subconverter:integration-chain-subconverter`（`/version` = `v0.9.2-c7b26b5-...`，本轮未换 tag）
- **设备**：内网 LAN Compose，`HOST_PORT=11200`（compose 已切 `dev-latest`）
- **USER_FACING_BASE_URL** / **TRUSTED_PROXY_CIDRS**：均未设置
- **DEFAULT_TEMPLATE_URL**：slackworker fork（见 [deploy/docker-compose.yml](../../deploy/docker-compose.yml)）
- **回归**：SSH 到 `~/chain-subconverter` 执行 `docker compose pull app && docker compose up -d app`；WSL `third-party-smoke.sh`（`real-smoke` + `real-full`）**通过**
- **结果**：**smoke + full 通过**
- **关键发现**：本轮已从 `beta-latest`（`v3.2.0-beta.2`）升至 `dev-latest`；LAN 入口 `http://192.168.100.1:11200/` 的 `real-smoke` 与 `real-full` 均通过（约 5.2s / 3.3s）
- **细节**：SSH、入口 URL、smoke 命令见本地文件

---

## 公网 HTTPS 一体化 — vps-02（2026-07-03，`dev-latest`）

- **镜像 tag**：与 vps-01 同 tag（`dev-latest`，`dev` @ `78a4477`；运行时 `app.version = dev-latest`）；`subconverter:integration-chain-subconverter` 同 vps-01
- **设备**：公网 VPS（OpenResty → `127.0.0.1:11200`）
- **USER_FACING_BASE_URL**：未设置
- **TRUSTED_PROXY_CIDRS**：`172.16.0.0/12`
- **DEFAULT_TEMPLATE_URL**：同 vps-01
- **回归**：公网 HTTPS；SSH 到 `/opt/1panel/docker/compose/chain-subconverter` 执行 `docker compose pull app && docker compose up -d app`；WSL `third-party-smoke.sh` **通过**
- **结果**：**smoke + full 通过**
- **关键发现**：本轮已从 `beta-latest` 升至 `dev-latest`；HTTPS 公网入口的 `real-smoke` 与 `real-full` 均通过（约 10.3s / 6.1s）
- **细节**：SSH、域名、smoke 命令见本地文件

---

## 双 Docker 分离 — Koyeb + vps-02（2026-07-03，`dev-latest`）

- **部署形态**：`app`（Koyeb）与 `subconverter`（vps-02 独立 Compose）分属两套 Docker；`UPSTREAM` / `FACING` 跨公网互访
- **chain-subconverter 入口**（**demo preview**）：Koyeb `https://chain-subconverter.koyeb.app/`
- **subconverter 入口**：vps-02 独立 Compose（`GET /version` → `subconverter v0.9.2-c7b26b5-mihomo-integration-chain-subconverter backend`）
- **镜像 tag**：Koyeb app `dev-latest`（运行时 `version = dev-latest`，revision `78a4477`）；subconverter `integration-chain-subconverter`
- **回归**：Koyeb 公网入口 `https://chain-subconverter.koyeb.app/`；WSL `third-party-smoke.sh` **通过**；subconverter `/version` 正常
- **结果**：**smoke + full 通过**
- **关键发现**：Koyeb 已从 `beta-latest` 切至 `dev-latest`（runtime-status 可见 `revision = 78a4477`）；跨网 subconverter 健康；`real-smoke` 与 `real-full` 通过（约 16.0s / 8.5s）
- **细节**：subconverter 地址、Compose 路径、smoke 命令见本地文件

---

## 复测入口（无敏感信息）

```bash
# 必须显式指定目标；落地/中转订阅 URL 见 preview-inputs.md
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" ./scripts/third-party-smoke.sh
```

完整 `E2E_*` 与 SSH/运维示例：`deployments.local.md`。
