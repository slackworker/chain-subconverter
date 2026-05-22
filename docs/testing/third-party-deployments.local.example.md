# 第三方设备部署回归 — 本地可复测细节（模板）

复制为本目录下的 `third-party-deployments.local.md`（已 gitignore，勿提交）。

公开结论写在同目录 [third-party-deployments.md](third-party-deployments.md)。

---

## YYYY-MM-DD — 简短标题

- **镜像 tag**：
- **部署设备**：（SSH、inventory 路径）
- **访问入口**：（公网 / LAN URL）
- **USER_FACING_BASE_URL**：
- **TRUSTED_PROXY_CIDRS**：
- **回归范围**：
- **结果**：

### 本地自动复验

```bash
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-host>/" \
CHAIN_SUBCONVERTER_E2E_LANDING_INPUT="https://<fixtures-worker>/…/download/Landing-Subscription" \
CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT="https://<fixtures-worker>/…/download/Airport-Subscription-1" \
./scripts/third-party-smoke.sh
```
