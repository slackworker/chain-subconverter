# 第三方设备部署回归 — 本地可复测细节（模板）

复制为本目录下的 `third-party-deployments.local.md`（已 gitignore，勿提交）。

公开结论写在同目录 [third-party-deployments.md](third-party-deployments.md)。

---

## 3.0 回归覆盖（三种部署形态）

| 形态 | 设备 / 平台 | 入口 | 最近回归 | 结果 |
|------|-------------|------|----------|------|
| **内网一体化** | （如 vps-01） | `http://<lan-ip>:11200/` | YYYY-MM-DD | |
| **公网 HTTPS 一体化** | （如 vps-02） | `https://<your-domain>/` | YYYY-MM-DD | |
| **双 Docker 分离** | （如 Railway + Koyeb） | 见各平台 URL | YYYY-MM-DD | |

---

## 内网一体化 — `<设备名>`

- **SSH**：
- **Compose 路径**：
- **镜像 tag**：
- **USER_FACING_BASE_URL** / **TRUSTED_PROXY_CIDRS**：

### 本地自动复验（WSL）

`E2E_*` 订阅 URL 取值见 [dual-landing-manual-reference.md](dual-landing-manual-reference.md)；可复制 [local-dev-smoke.md](local-dev-smoke.md)「公网 E2E」中的完整命令。

```bash
CHAIN_SUBCONVERTER_E2E_BASE_URL="http://<lan-ip>:11200/" \
CHAIN_SUBCONVERTER_E2E_LANDING_INPUT="https://<fixtures-worker>/dual-landing/download/Landing-Subscription" \
CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT="https://<fixtures-worker>/dual-landing/download/Airport-Subscription-1" \
CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT_2="https://<fixtures-worker>/dual-landing/download/Airport-Subscription-2" \
bash ./scripts/third-party-smoke.sh
```

---

## 公网 HTTPS 一体化 — `<设备名>`

（字段同上；`E2E_BASE_URL` 使用 HTTPS 公网入口。）

---

## 双 Docker 分离 — `<平台>`

| 角色 | 平台 | 入口 |
|------|------|------|
| chain-subconverter | | |
| subconverter | | |

（分别为各 app 入口执行 `third-party-smoke.sh`；独立 `curl` subconverter `/version`。）
