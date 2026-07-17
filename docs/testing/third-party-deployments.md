# 第三方设备部署回归记录（公开结论）

> **当前验证镜像**：`ghcr.io/slackworker/chain-subconverter:beta-latest`（digest `sha256:5c14d6c7e677a84f26895581eafd8e1f6135c38393549ef2c42be44c3b076962`，tag `v3.3.0-beta.1` @ `77b6d19`；固定版本镜像 tag 为 `3.3.0-beta.1`）。正式里程碑见 [`v3.3.0-beta.1`](../../RELEASES.md#v330-beta1)。

按 [runbook.md](runbook.md) 字段记录**当前一轮**结论；部署步骤见 [../../deploy/README.md](../../deploy/README.md)。E2E 命令见 [runbook.md#公网-e2e第三方部署](runbook.md#公网-e2e第三方部署)。

**维护**：单线开发下每种部署形态**只保留最新一轮**——覆盖对应节与下表日期/结果，**不追加**「历史」段；更早 digest 见 Git 历史该文件 diff。正式 Beta tag 里程碑见 [RELEASES.md](../../RELEASES.md)。

**分工**

| 位置 | 内容 |
|------|------|
| 本文件（进仓库） | 日期、镜像 tag、设备角色、回归范围、通过/失败、关键发现与后续动作 |
| [third-party-deployments.local.md](third-party-deployments.local.md)（同目录，gitignore） | 主机名、IP、SSH、公网域名、完整 `CHAIN_SUBCONVERTER_E2E_*` smoke 命令 |

首次克隆：复制 [third-party-deployments.local.example.md](third-party-deployments.local.example.md) → `third-party-deployments.local.md`。完成回归后：**覆盖**本文件对应节，细节同步 `third-party-deployments.local.md`。

---

## 3.0 回归覆盖（三种部署形态）

| 形态 | 设备 / 平台 | 最近回归 | 结果 |
|------|-------------|----------|------|
| **内网一体化** | vps-01（LAN Compose） | 2026-07-17 | **smoke + full 通过** |
| **公网 HTTPS 一体化** | vps-02（反代 + Compose） | 2026-07-17 | **smoke + full 通过** |
| **双 Docker 分离** | Koyeb + vps-02（demo preview） | 2026-07-17 | **smoke + full 通过** |

外网测试订阅源（Worker fixture）的同步与 deploy 见 [deploy/test-fixtures-worker/README.md](../../deploy/test-fixtures-worker/README.md)，不记入本表。

---

## 内网一体化 — vps-01（2026-07-17）

- **镜像 tag**：`ghcr.io/slackworker/chain-subconverter:beta-latest`（digest `sha256:5c14d6c7…`，`v3.3.0-beta.1` @ `77b6d19`）；`subconverter:integration-chain-subconverter`
- **设备**：内网 LAN Compose，`HOST_PORT=11200`
- **USER_FACING_BASE_URL** / **TRUSTED_PROXY_CIDRS**：均未设置
- **DEFAULT_TEMPLATE_URL**：slackworker fork（见 [deploy/docker-compose.yml](../../deploy/docker-compose.yml)）
- **回归**：切至 `beta-latest` 后 `docker compose pull && up`；WSL `third-party-smoke.sh`（`real-smoke` + `real-full`）
- **结果**：**smoke + full 通过**
- **关键发现**：LAN 内网入口无反代时无需 `TRUSTED_PROXY_CIDRS`；`runtime-status` 报告 `v3.3.0-beta.1` / `77b6d19`
- **细节**：SSH、入口 URL、smoke 命令见 [third-party-deployments.local.md](third-party-deployments.local.md)

---

## 公网 HTTPS 一体化 — vps-02（2026-07-17）

- **镜像 tag**：与 vps-01 同 tag（`beta-latest`，`v3.3.0-beta.1` @ `77b6d19`）；`subconverter:integration-chain-subconverter` 同 vps-01
- **设备**：公网 VPS（OpenResty → `127.0.0.1:11200`）
- **USER_FACING_BASE_URL**：未设置
- **TRUSTED_PROXY_CIDRS**：`172.16.0.0/12`（缺省会导致 `longUrl` 为 `http://`）
- **DEFAULT_TEMPLATE_URL**：同 vps-01
- **回归**：公网 HTTPS 入口；切至 `beta-latest` 后 `docker compose pull && up`；WSL `third-party-smoke.sh`
- **结果**：**smoke + full 通过**
- **关键发现**：HTTPS 公网入口须配置 `TRUSTED_PROXY_CIDRS`；`real-smoke` 与 `real-full` 均通过
- **细节**：SSH、域名、smoke 命令见 [third-party-deployments.local.md](third-party-deployments.local.md)

---

## 双 Docker 分离 — Koyeb + vps-02（2026-07-17）

- **部署形态**：`app`（Koyeb）与 `subconverter`（vps-02 独立 Compose）分属两套 Docker；`UPSTREAM` / `FACING` 跨公网互访
- **chain-subconverter**：Koyeb（**demo preview**）
- **subconverter**：vps-02 独立 Compose（`GET /version` 正常）
- **镜像 tag**：Koyeb app `beta-latest`（`v3.3.0-beta.1` @ `77b6d19`）；subconverter `integration-chain-subconverter`
- **回归**：Koyeb 公网入口 WSL `third-party-smoke.sh`；subconverter `/version` 正常
- **结果**：**smoke + full 通过**
- **关键发现**：跨平台双 Docker 形态下 `real-smoke` 与 `real-full` 均通过
- **细节**：各平台入口、Compose 路径、smoke 命令见 [third-party-deployments.local.md](third-party-deployments.local.md)

---

## 复测入口（无敏感信息）

```bash
# 必须显式指定目标；落地/中转订阅 URL 见 preview-inputs.md
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" ./scripts/third-party-smoke.sh
```

完整 `E2E_*` 与 SSH/运维示例：[third-party-deployments.local.md](third-party-deployments.local.md)。
