# 第三方设备部署回归 — 本地可复测细节

> 与同目录 [third-party-deployments.md](third-party-deployments.md) 配对；本文件 **gitignore**，不进仓库。
> 首次使用可复制本文件为 `third-party-deployments.local.md` 再填写。

按 [runbook.md](runbook.md) 反馈模板记录；部署命令以 [../../deploy/README.md](../../deploy/README.md) 为准。

外网测试订阅源：[deploy/test-fixtures-worker/README.md](../../deploy/test-fixtures-worker/README.md)。

---

## 3.0 回归覆盖（三种部署形态）

| 形态 | 设备 / 平台 | 入口 | 最近回归 | 结果 |
|------|-------------|------|----------|------|
| **内网一体化** | （如 vps-01） | `http://<lan-ip>:11200/` | YYYY-MM-DD | |
| **公网 HTTPS 一体化** | （如 vps-02） | `https://<your-domain>/` | YYYY-MM-DD | |
| **双 Docker 分离** | （如 Koyeb + vps-02） | 见各平台 URL | YYYY-MM-DD | |

---

### 内网一体化 — `<设备名>`

- **SSH**：
- **Compose 路径**：
- **镜像 tag**：
- **USER_FACING_BASE_URL** / **TRUSTED_PROXY_CIDRS**：
- **DEFAULT_TEMPLATE_URL**：（与 [deploy/docker-compose.yml](../../deploy/docker-compose.yml) 保持一致；旧设备可能仍指向 upstream `Aethersailor/...`，须手动同步）

#### 运维摘要

仅换镜像 tag：`docker compose pull && docker compose up -d`（**不**更新 compose 内 env）。

默认 env 有变（模板 URL、TRUSTED_PROXY_CIDRS 等）：对照 [deploy/README.md](../../deploy/README.md) heredoc 或 [deploy/docker-compose.yml](../../deploy/docker-compose.yml) 改 `docker-compose.yml`，再 `docker compose up -d --force-recreate app`。

#### 本地自动复验（WSL）

默认已对齐 [preview-inputs.md](preview-inputs.md)；可复制 [runbook.md#公网-e2e第三方部署](runbook.md#公网-e2e第三方部署) 中的完整命令。

```bash
CHAIN_SUBCONVERTER_E2E_BASE_URL="http://<lan-ip>:11200/" \
bash ./scripts/third-party-smoke.sh
```

---

### 公网 HTTPS 一体化 — `<设备名>`

（字段同上；`E2E_BASE_URL` 使用 HTTPS 公网入口。）

---

### 双 Docker 分离 — `<平台>`

| 角色 | 平台 | 入口 |
|------|------|------|
| chain-subconverter | | |
| subconverter | | |

（分别为各 app 入口执行 `third-party-smoke.sh`；独立 `curl` subconverter `/version`。）
