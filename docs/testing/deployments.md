# 第三方设备部署回归记录（公开结论）

> **当前正式 Beta 线**：[`v3.2.0-beta.1`](../../RELEASES.md#v320-beta1) @ `beta-latest`（`a339f86`；镜像已发布，**第三方设备待拉取复验**）。上一轮 3.1 记录保留至覆盖写入。

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
| **双 Docker 分离** | Koyeb + vps-02（demo preview） | 2026-06-26 | **通过**（`beta-latest`） |

外网测试订阅源（Worker fixture）的同步与 deploy 见 [deploy/test-fixtures-worker/README.md](../../deploy/test-fixtures-worker/README.md)，不记入本表。

---

## 内网一体化 — vps-01（2026-06-26，`beta-latest`）

- **镜像 tag**：`ghcr.io/slackworker/chain-subconverter:beta-latest`（digest `sha256:73230aa37f761750a0d0cc8099d3e8fc3ef408af958cc92c8f7140c64b336dd6`，tag `v3.1.0-beta.1` / `beta` @ `6a8f93a`）；`subconverter:integration-chain-subconverter`（`/version` = `v0.9.2-c7b26b5-...`，本轮未换 digest）
- **设备**：内网 LAN Compose，`HOST_PORT=11200`（compose 已切 `beta-latest`）
- **USER_FACING_BASE_URL** / **TRUSTED_PROXY_CIDRS**：均未设置
- **DEFAULT_TEMPLATE_URL**：slackworker fork（见 [deploy/docker-compose.yml](../../deploy/docker-compose.yml)）
- **回归**：`docker compose pull && up -d --force-recreate app`；WSL `test:e2e:real:smoke` + `test:e2e:real:full`
- **结果**：**通过**
- **关键发现**：`v3.1.0-beta.1` 正式 tag 后一体化形态复验通过；此前 `dev-latest` @ `cf820c2` 预演已覆盖三形态
- **细节**：SSH、入口 URL、smoke 命令见本地文件

---

## 公网 HTTPS 一体化 — vps-02（2026-06-26，`beta-latest`）

- **镜像 tag**：与 vps-01 同 digest（`beta-latest`，tag `v3.1.0-beta.1`）；`subconverter:integration-chain-subconverter` 同 vps-01
- **设备**：公网 VPS（OpenResty → `127.0.0.1:11200`）
- **USER_FACING_BASE_URL**：未设置
- **TRUSTED_PROXY_CIDRS**：`172.16.0.0/12`
- **DEFAULT_TEMPLATE_URL**：同 vps-01
- **回归**：公网 HTTPS；`docker compose pull && up -d --force-recreate app`；WSL `test:e2e:real:smoke` + `test:e2e:real:full`
- **结果**：**通过**
- **关键发现**：与 vps-01 同轮 `beta-latest` 复验；HTTPS 入口与 resolve 回放均正常
- **细节**：SSH、域名、smoke 命令见本地文件

---

## 双 Docker 分离 — Koyeb + vps-02（2026-06-26，`beta-latest`）

- **部署形态**：`app`（Koyeb）与 `subconverter`（vps-02 独立 Compose）分属两套 Docker；`UPSTREAM` / `FACING` 跨公网互访
- **chain-subconverter 入口**（**demo preview**）：Koyeb `https://chain-subconverter.koyeb.app/`
- **subconverter 入口**：vps-02 独立 Compose（`GET /version` → `subconverter v0.9.2-c7b26b5-mihomo-integration-chain-subconverter backend`）
- **镜像 tag**：Koyeb app `beta-latest`（digest 同 vps-01/02，`v3.1.0-beta.1` @ `6a8f93a`）；subconverter `integration-chain-subconverter`
- **回归**：Koyeb `koyeb service update … --docker …:beta-latest`；WSL `test:e2e:real:smoke` + `test:e2e:real:full`；subconverter `/version`
- **结果**：**通过**
- **关键发现**：demo preview 已与 vps 一体化同轮切 `beta-latest` 并复验通过
- **细节**：subconverter 地址、Compose 路径、smoke 命令见本地文件

---

## 复测入口（无敏感信息）

```bash
# 必须显式指定目标；落地/中转订阅 URL 见 preview-inputs.md
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" ./scripts/third-party-smoke.sh
```

完整 `E2E_*` 与 SSH/运维示例：`deployments.local.md`。
