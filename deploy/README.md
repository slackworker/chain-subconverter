# deploy

本目录只承载部署相关内容。

如果你的目标是编辑样例输入、运行 task、查看 stage1/stage2 review 产物，请改走 [docs/testing/frontend-review-workflow](../docs/testing/frontend-review-workflow.md)。

## 当前范围

- 已提供 `docker-compose.yml`，用于编排 `app + subconverter`
- 当前部署形态仍是 **API-only** 最小链路
- 当前不包含前端、SQLite、短链、反向代理与正式单入口 UI

## 启动

在仓库根目录执行：

```bash
docker compose -f deploy/docker-compose.yml up --build -d
```

检查状态：

```bash
docker compose -f deploy/docker-compose.yml ps
curl http://localhost:11200/healthz
```

## 环境变量

`docker-compose.yml` 当前涉及两类配置：

- 传给 `app` 的运行时环境变量
  - `CHAIN_SUBCONVERTER_HTTP_ADDRESS=:11200`
  - `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL=http://localhost:11200`
  - `CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL=http://subconverter:25500/sub?`
- 仅由 Compose 解析 `image:` 时使用的镜像变量
  - `CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE=ghcr.io/slackworker/subconverter:integration-chain-subconverter`

如需切换镜像标签，可在启动前覆盖 `CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE`。

## 边界

- `review/cases/` 提供 frontend-review 的手动输入样例与运行产物
- 稳定自动化 fixture 位于 `internal/review/testdata/`
- 当前部署 README 聚焦 Compose 启动与 API-only 运行路径

当前 Compose 的目标是验证“现有 API + 真实 `subconverter`”的可运行路径；正式的前端接入、SQLite 持久化与完整部署形态仍以后续 `Phase 4` 为准。
