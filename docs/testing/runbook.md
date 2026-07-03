# 测试操作手册

状态见 [../STATUS.md](../STATUS.md)；测试分层见 [README.md](README.md)。本文集中维护**可执行命令**与发版检查清单。环境：`VS Code + WSL + Docker Desktop`。

## 本地开发

### 推荐入口

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

浏览器只看脚本输出的 `SCHEME_URL`：

```text
http://localhost:<frontend-port>/            （scheme = default 时）
http://localhost:<frontend-port>/ui/<scheme> （scheme = b1|b2|c1|c2 时）
```

除本次启动写入 `runtime.env` 的端口（或你显式设置的 offset 端口组）外，若只能通过其他端口访问，优先判断为旧开发实例残留，不视为正常行为。

### 最小 smoke 顺序

#### 1. 自动化基线（日常）

```bash
go test ./...
cd web && npm run test
cd web && npm run build && npm run build:b1 && npm run build:b2 && npm run build:c1 && npm run build:c2
```

#### 2. 启动本地 UI

```bash
./scripts/dev-up.sh default
```

#### 3. 手动检查

- Stage 1 可完成落地 / 中转识别与“转换并自动填充”
- Stage 2 可编辑 `mode` 与 `targetName`
- 修改 Stage 1 后，Stage 2 进入 stale，且“生成链接”按钮禁用
- Stage 3 可执行打开、复制、下载、`resolve-url`、`short-links`
- `resolve-url` / `short-links` 输入非法 URL 时，错误回到 Stage 3，而不是误落到全局

本地 smoke：`./scripts/dev-up.sh default` — 确认 `healthz`、`stage1/convert`、Stage 3、workflow log。

### Compose 预览

正式单入口预览使用：

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d --force-recreate
curl http://localhost:11200/healthz
```

Compose 用于预览与集成验证，不替代日常 frontend HMR 调试；未发布到 GHCR 的本地源码构建请走 `dev-up`。

## 发版检查

发版 / beta.N 前**检查清单**。分支与镜像口径见 [../STATUS.md](../STATUS.md)；部署见 [deploy/README.md](../../deploy/README.md)；设备结论**覆盖**写入 [third-party-deployments.md](third-party-deployments.md)（不滚历史）。

### 发布前冻结项

- `APP_IMAGE`、`SUBCONVERTER_IMAGE`、对外端口、`USER_FACING_BASE_URL`（若需要）
- 反代时 `TRUSTED_PROXY_CIDRS`；本轮 UI scheme（默认 `default`）
- 滚动标签须记录分支、提交与发布时间

### 发布前检查

- [ ] 自动化：`go test`、web 单测、E2E（`mock-smoke`、`mock-full`）、`build:default`（探索性 `b1`/`b2`/`c1`/`c2` 非发布门禁）、`docker compose config` — 见下文「发布前完整检查」与 [README.md](README.md) CI 门禁
- [ ] fixture 策略见 [fixtures.md](fixtures.md) 与 [README.md](README.md)
- [ ] E2E / Playwright 环境见下文
- [ ] 本地 smoke：`./scripts/dev-up.sh default` — 确认 `healthz`、`stage1/convert`、Stage 3、workflow log

### 发布前完整检查

在仓库根执行：

```bash
go test ./...
cd web && npm run test
cd web && npm run test:e2e:mock:smoke
cd web && npm run test:e2e:mock:full
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
	npm run test:e2e:mock:all
```

### 第三方设备

按 [deploy/README.md](../../deploy/README.md) 部署并记录访问入口。公网 E2E 与 Worker 订阅 URL 见下文「公网 E2E」与 [preview-inputs.md](preview-inputs.md)。

记录字段见 [third-party-deployments.md](third-party-deployments.md)。

**Compose 环境变量同步**：`docker compose pull && up`（[deploy/README.md §仅更新镜像](../../deploy/README.md)）**只换镜像**，不会改写设备上已有的 `docker-compose.yml` 环境变量。仓库默认 env（如 `DEFAULT_TEMPLATE_URL`、`TRUSTED_PROXY_CIDRS`）有变更时，须对照 [deploy/docker-compose.yml](../../deploy/docker-compose.yml) 或 README heredoc **合并/重生成 compose**，再 `docker compose up -d --force-recreate app`；勿假设 pull 会自动带上最新默认配置。

### 发布后最小回归

`healthz`、默认 `/` 主流程、`GET /sub` 或 `/sub/<id>` 至少一条；双 Docker 时确认 subconverter 模板 URL；短链重启可恢复。

### 失败升级条件

`healthz` 不稳、主流程不可用、第三方只能依赖开发机部署、或无法区分代码回归与外部漂移 → 停止对外分发当前滚动镜像。

发版后：**覆盖** [third-party-deployments.md](third-party-deployments.md) 已测形态节与覆盖表；[STATUS.md](../STATUS.md) 更新页眉与 §最近验证「第三方部署」一行（digest 不重复抄写，见 [MAINTENANCE.md](../MAINTENANCE.md)）。

## 公网 E2E（第三方部署）

订阅 URL 以 [preview-inputs.md](preview-inputs.md) 为准（勿复制到多处）。在仓库根执行；公网 app 入口勿写入 Git，见 `third-party-deployments.local.md`（同目录，gitignore）：

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
cd web && CHAIN_SUBCONVERTER_E2E_BASE_URL=<url> CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 npm run test:e2e:real:smoke
cd web && CHAIN_SUBCONVERTER_E2E_BASE_URL=<url> CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 npm run test:e2e:real:full
```

## 高频排障

- `subconverter` 启动失败：先检查 Docker Desktop、镜像拉取与 `GET /version`
- backend 启动失败：先看 `.tmp/dev-up/backend.log`
- 报 `backend-from-subconverter did not become ready`：优先确认 backend 以 IPv4 暴露，且 `SUBCONVERTER_FACING_BASE_URL` 仍是 `http://host.docker.internal:<backend-port>`
- 固定端口冲突：同一 worktree 内脚本会尝试复用或停止本工作区残留 dev 进程；无法处理时直接报错。不同 worktree 并行预览须自行设置 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET`（或 `auto`），避免与默认 `25500/11200/5173` 抢端口
- 默认方案主流程输入失败但固定测试通过：优先判断为外部模板、外部订阅源或运行镜像漂移
- 若出现 `SUBCONVERTER_UNAVAILABLE` 且提示 `missing recognized region proxy-group`：先检查当前 frontend 代理到哪一份 backend，以及该 backend 是否向容器注入了可回连的模板地址

## 第三方本地记录模板

复制为本目录下的 `third-party-deployments.local.md`（已 gitignore，勿提交）。模板见 [third-party-deployments.local.example.md](third-party-deployments.local.example.md)。

公开结论写在同目录 [third-party-deployments.md](third-party-deployments.md)（每种形态只保留最新一轮，覆盖写）。

---

### 3.0 回归覆盖（三种部署形态）

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

`E2E_*` 订阅 URL 取值见 [preview-inputs.md](preview-inputs.md)；可复制上文「公网 E2E」中的完整命令。

```bash
CHAIN_SUBCONVERTER_E2E_BASE_URL="http://<lan-ip>:11200/" \
CHAIN_SUBCONVERTER_E2E_LANDING_INPUT="https://<fixtures-worker>/dual-landing/download/Landing-Subscription" \
CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT="https://<fixtures-worker>/dual-landing/download/Airport-Subscription-1" \
CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT_2="https://<fixtures-worker>/dual-landing/download/Airport-Subscription-2" \
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
