# 本地 UI 启动与 Smoke

本文只保留本地联调的运行入口、最小 smoke 顺序与高频排障提示。

适用环境：`VS Code + WSL + Docker Desktop`

## 用途边界

- 本文是运行 runbook，不定义业务规则。
- 前端边界与交互语义以 [../spec/02-frontend-spec.md](../spec/02-frontend-spec.md) 为准。
- API 错误契约与字段语义以 [../spec/03-backend-api.md](../spec/03-backend-api.md) 为准。

## 推荐入口

优先使用仓库根目录脚本：

```bash
./scripts/dev-up.sh a
```

或运行 VS Code 任务：`dev: up`

支持的 `scheme`：`a`、`b`、`c`

固定端口：

- `subconverter`: `25500`
- `backend`: `11200`
- `frontend`: `5173`

运行结果写入：`.tmp/dev-up/runtime.env`

## 最小 smoke 顺序

### 1. 自动化基线

```bash
go test ./...
cd web && npm run build && npm run build:b && npm run build:c
```

### 2. 启动本地 UI

```bash
./scripts/dev-up.sh a
```

浏览器只看脚本输出的 `SCHEME_URL`，日常应为：

```text
http://localhost:5173/ui/<scheme>
```

若实际只能通过 `5174`、`5175` 等相邻端口访问，优先判断为旧开发实例残留，不视为正常行为。

### 3. 手动检查

- Stage 1 可完成落地 / 中转识别与“转换并自动填充”
- Stage 2 可编辑 `mode` 与 `targetName`
- 修改 Stage 1 后，Stage 2 进入 stale，且“生成链接”按钮禁用
- Stage 3 可执行打开、复制、下载、`resolve-url`、`short-links`
- `resolve-url` / `short-links` 输入非法 URL 时，错误回到 Stage 3，而不是误落到全局

### 4. Live review（按需）

当前 live 输入仍只用于单机 smoke，不替代固定 fixture。

若要导出可审查的中间产物目录：

```bash
go run ./cmd/frontend-review -case-dir .tmp/review/manual
```

运行前先写入：

- `.tmp/review/manual/stage1/input/landing.txt`
- `.tmp/review/manual/stage1/input/transit.txt`

详细审查顺序见 [live-review-artifacts](live-review-artifacts.md)。

## 高频排障

- `subconverter` 启动失败：先检查 Docker Desktop、镜像拉取与 `GET /version`
- backend 启动失败：先看 `.tmp/dev-up/backend.log`
- 报 `backend-from-subconverter did not become ready`：优先确认 backend 以 IPv4 暴露，且 `MANAGED_TEMPLATE_BASE_URL` 仍是 `http://host.docker.internal:<backend-port>`
- 固定端口冲突：先释放 `5173` 或 `11200`，不要改用相邻端口继续调试
- live 输入失败但固定测试通过：优先判断为外部模板、外部订阅源或运行镜像漂移
- 若出现 `SUBCONVERTER_UNAVAILABLE` 且提示 `missing recognized region proxy-group`：先检查当前 frontend 代理到哪一份 backend，以及该 backend 是否向容器注入了可回连的模板地址

## Compose 预览

正式单入口预览使用：

```bash
docker compose -f deploy/docker-compose.yml up --build -d
curl http://localhost:11200/healthz
```

Compose 用于预览与集成验证，不替代日常 frontend HMR 调试。