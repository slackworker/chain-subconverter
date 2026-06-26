# 本地 UI 启动与 Smoke

状态见 [../STATUS.md](../STATUS.md)；契约见 spec；本文只写本地联调步骤。环境：`VS Code + WSL + Docker Desktop`。

## 推荐入口

优先使用仓库根目录脚本：

```bash
./scripts/dev-up.sh default
```

或运行 VS Code 任务：`dev: up`

支持的 `scheme`：`default`、`b1`、`b2`、`c1`、`c2`

固定端口：

- `subconverter`: `25500`
- `backend`: `11200`
- `frontend`: 脚本默认 `5173`；VS Code `dev: up` 固定为 scheme `default` → `5173`（其他 scheme 请用 `./scripts/dev-up.sh <scheme>` 或 `dev-up-vscode-task.sh`）
- 默认端口组固定为 offset `0`；多 worktree 并行预览请设置 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET=<n>` 或 `auto`（按 `git worktree list` 稳定顺序分配 `0,10,20,...`）
- VS Code `dev: up` 默认启用 `CHAIN_SUBCONVERTER_DEV_UP_FORCE_RESTART=1`：重跑任务会先清理当前工作区可识别的旧实例（frontend/backend/subconverter）再重启；可手动设为 `0` 关闭
- 新切出的 worktree 若还没有自己的 `web/node_modules`，`dev: up` 会先自动执行一次 `npm ci`（`web/` 仅支持 npm，见 [spec 05 §5](../spec/05-tech-stack.md#5-前端实现约束)）

运行结果写入：`.tmp/dev-up/runtime.env`

## 发布前完整检查

发版 / beta 前按 [release-runbook](release-runbook.md) 冻结项确认后，在仓库根执行：

```bash
go test ./...
cd web && npm run test
cd web && npm run test:e2e:mock
cd web && npm run build:default && npm run build:b1 && npm run build:b2 && npm run build:c1 && npm run build:c2
docker compose -f deploy/docker-compose.yml config
```

E2E 需先 `./scripts/dev-up.sh default`。WSL 若缺少 Playwright 浏览器系统库：先 `./scripts/dev-up.sh default`，再在仓库根用容器连本机 Vite（端口以 `runtime.env` 为准，下例为默认 `5173`）：

```bash
docker run --rm --ipc=host --add-host=host.docker.internal:host-gateway \
	--user "$(id -u):$(id -g)" -e HOME=/tmp \
	-e CHAIN_SUBCONVERTER_E2E_BASE_URL=http://host.docker.internal:5173 \
	-e CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 \
	-v "$PWD":/work -w /work/web \
	mcr.microsoft.com/playwright:v1.60.0-noble \
	npm run test:e2e:mock
```

本地 smoke：`./scripts/dev-up.sh default` — 确认 `healthz`、`stage1/convert`、Stage 3、workflow log。

## 最小 smoke 顺序

### 1. 自动化基线（日常）

```bash
go test ./...
cd web && npm run test
cd web && npm run build && npm run build:b1 && npm run build:b2 && npm run build:c1 && npm run build:c2
```

### 2. 启动本地 UI

```bash
./scripts/dev-up.sh default
```

浏览器只看脚本输出的 `SCHEME_URL`：

```text
http://localhost:<frontend-port>/            （scheme = default 时）
http://localhost:<frontend-port>/ui/<scheme> （scheme = b1|b2|c1|c2 时）
```

除本次启动写入 `runtime.env` 的端口（或你显式设置的 offset 端口组）外，若只能通过其他端口访问，优先判断为旧开发实例残留，不视为正常行为。

### 3. 手动检查

- Stage 1 可完成落地 / 中转识别与“转换并自动填充”
- Stage 2 可编辑 `mode` 与 `targetName`
- 修改 Stage 1 后，Stage 2 进入 stale，且“生成链接”按钮禁用
- Stage 3 可执行打开、复制、下载、`resolve-url`、`short-links`
- `resolve-url` / `short-links` 输入非法 URL 时，错误回到 Stage 3，而不是误落到全局

## 公网 E2E（第三方部署）

订阅 URL 以 [dual-landing-manual-reference.md](dual-landing-manual-reference.md) 为准（勿复制到多处）。在仓库根执行；公网 app 入口勿写入 Git，见 [third-party-deployments.local.md](third-party-deployments.local.md)：

```bash
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" \
CHAIN_SUBCONVERTER_E2E_LANDING_INPUT="https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Landing-Subscription" \
CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT="https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-1" \
CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT_2="https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-2" \
./scripts/third-party-smoke.sh
```

Worker 同步与 deploy 见 [deploy/test-fixtures-worker/README.md](../../deploy/test-fixtures-worker/README.md)。

发布前非阻断真实部署 E2E（需公网入口）：

```bash
cd web && CHAIN_SUBCONVERTER_E2E_BASE_URL=<url> CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 npm run test:e2e:real:release
```

## 高频排障

- `subconverter` 启动失败：先检查 Docker Desktop、镜像拉取与 `GET /version`
- backend 启动失败：先看 `.tmp/dev-up/backend.log`
- 报 `backend-from-subconverter did not become ready`：优先确认 backend 以 IPv4 暴露，且 `SUBCONVERTER_FACING_BASE_URL` 仍是 `http://host.docker.internal:<backend-port>`
- 固定端口冲突：同一 worktree 内脚本会尝试复用或停止本工作区残留 dev 进程；无法处理时直接报错。不同 worktree 并行预览须自行设置 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET`（或 `auto`），避免与默认 `25500/11200/5173` 抢端口
- 默认方案主流程输入失败但固定测试通过：优先判断为外部模板、外部订阅源或运行镜像漂移
- 若出现 `SUBCONVERTER_UNAVAILABLE` 且提示 `missing recognized region proxy-group`：先检查当前 frontend 代理到哪一份 backend，以及该 backend 是否向容器注入了可回连的模板地址

## Compose 预览

正式单入口预览使用：

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d --force-recreate
curl http://localhost:11200/healthz
```

Compose 用于预览与集成验证，不替代日常 frontend HMR 调试；未发布到 GHCR 的本地源码构建请走 `dev-up`。
