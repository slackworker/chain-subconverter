# 发布与回归 Runbook

发版 / beta.N 前**检查清单**。分支与镜像口径见 [../STATUS.md](../STATUS.md)；部署见 [deploy/README.md](../../deploy/README.md)；结论归档 [third-party-deployments.md](third-party-deployments.md)。

## 发布前冻结项

- `APP_IMAGE`、`SUBCONVERTER_IMAGE`、对外端口、`USER_FACING_BASE_URL`（若需要）
- 反代时 `TRUSTED_PROXY_CIDRS`；本轮 UI scheme（默认 `default`）
- 滚动标签须记录分支、提交与发布时间

## 发布前检查

```bash
go test ./...
cd web && npm run test
cd web && npm run test:e2e -- default-happy-path.spec.ts port-forward-happy-path.spec.ts
cd web && npm run build:default && npm run build:a && npm run build:b && npm run build:c
docker compose -f deploy/docker-compose.yml config
```

- fixture 策略见 [test-system-review.md](test-system-review.md)
- E2E / Playwright 环境见 [local-dev-smoke.md](local-dev-smoke.md)

本地 smoke：`./scripts/dev-up.sh default` — 确认 `healthz`、`stage1/convert`、Stage 3、workflow log。

## 第三方设备

按 [deploy/README.md](../../deploy/README.md) 部署并记录访问入口。可选：

```bash
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" ./scripts/third-party-smoke.sh
```

记录字段见 [third-party-deployments.md](third-party-deployments.md)。

## 发布后最小回归

`healthz`、默认 `/` 主流程、`GET /sub` 或 `/sub/<id>` 至少一条；双 Docker 时确认 subconverter 模板 URL；短链重启可恢复。

## 失败升级条件

`healthz` 不稳、主流程不可用、第三方只能依赖开发机部署、或无法区分代码回归与外部漂移 → 停止对外分发当前滚动镜像。

发版后更新 [STATUS.md](../STATUS.md) 最近验证与 third-party-deployments。
