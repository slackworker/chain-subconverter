# 本地 UI 开发与 Smoke

本文定义单机开发环境下的本地 UI 启动、端口复用、live smoke 与排障入口。

适用环境：`VS Code + WSL + Docker Desktop`

## 推荐入口

优先使用仓库根目录的单脚本入口：

```bash
./scripts/dev-up.sh a
```

或直接运行 VS Code 任务：`dev: up`

当前支持的 `scheme`：

- `a`
- `b`
- `c`

## 脚本行为

`dev-up.sh` 会依次处理：

1. 检查 `go`、`node`、`npm`、`docker`、`curl`、`ss` 是否可用
2. 在端口池 `25500-25503` 内复用或启动 `subconverter`
3. 在端口池 `11200-11203` 内复用或启动本地 backend
4. 在端口池 `5173-5176` 内选择 frontend dev server 端口
5. 把本次运行结果写入 `.tmp/dev-up/runtime.env`

约束：

- 已运行且健康的 `subconverter` 会被直接复用，不强制重建
- 已运行且健康的 backend 只有在 `dev-up.sh` 约定的 env 契约匹配、且 `subconverter` 容器能回连其托管模板地址时才会被复用；不兼容的旧 backend 会被跳过
- frontend dev server 默认不复用旧进程，而是寻找当前端口池内的可用端口
- 若当前任务终端关闭，脚本本次拉起的本地 frontend / backend 会一起退出
- `subconverter` 容器默认保留，便于下一次开发直接复用
- 本地 backend 运行路径固定使用 IPv4 listener，并把 `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 指向 `http://host.docker.internal:<backend-port>`，供 Docker 内的 `subconverter` 回取托管模板

## 为什么不单独提供 stop 脚本

当前默认策略是不额外引入 stop 脚本。

原因：

- frontend dev server 与本地 backend 都由 `dev-up.sh` 托管
- 停止 VS Code task 或关闭对应终端，就会触发脚本清理这两个本地子进程
- `subconverter` 刻意保留为可复用容器，避免每次重新拉镜像或重建

如果确实需要手工处理 `subconverter`，再单独使用 `docker ps` / `docker stop` 即可；这不是前端开发的日常路径。

## 运行结果位置

脚本会输出并写入：

- `BACKEND_URL`
- `MANAGED_TEMPLATE_BASE_URL`
- `FRONTEND_URL`
- `SCHEME_URL`
- `SUBCONVERTER_BASE_URL`
- `BACKEND_LOG`

运行时文件：`.tmp/dev-up/runtime.env`

## 建议 smoke 顺序

### 1. 自动化基线

在仓库根目录执行：

```bash
go test ./...
cd web && npm run build && npm run build:b && npm run build:c
```

### 2. 本地 UI 联调

启动：

```bash
./scripts/dev-up.sh a
```

浏览器打开脚本输出的 `SCHEME_URL`。

### 3. Live 输入

当前单机 smoke 输入：

- `Landing-Subscription`: `http://192.168.100.1:3001/7xK9pLm2Qr4vB6yN8sT3/download/Landing-Subscription`
- `Airport-Subscription`: `http://192.168.100.1:3001/7xK9pLm2Qr4vB6yN8sT3/download/Airport-Subscription`

这些输入只作为当前开发机 live smoke，不替代固定 fixture。

若要把这两条 live 输入导出为可 review 的中间产物目录，执行：

```bash
go run ./cmd/frontend-review \
	-name live-review \
	-landing-url http://192.168.100.1:3001/7xK9pLm2Qr4vB6yN8sT3/download/Landing-Subscription \
	-transit-url http://192.168.100.1:3001/7xK9pLm2Qr4vB6yN8sT3/download/Airport-Subscription
```

详细审查顺序见 [live-review-artifacts](live-review-artifacts.md)。

### 4. 手动确认项

- Stage 1 可完成落地 / 中转识别
- Stage 2 可选择 `mode` 与 `targetName`
- Stage 3 可围绕单一当前链接输入框执行打开 / 复制 / 下载
- `resolve-url` 可恢复页面状态
- `short-links` 可创建短链接并回放订阅

## 失败定位

- `subconverter` 检查失败：先看 Docker Desktop、镜像拉取与 `GET /version`
- backend 检查失败：先看 `.tmp/dev-up/backend.log`
- `dev-up.sh` 报 `backend-from-subconverter did not become ready`：优先确认 backend 当前是否以 IPv4 暴露，并确认 `.tmp/dev-up/runtime.env` 中的 `MANAGED_TEMPLATE_BASE_URL` 是否仍为 `http://host.docker.internal:<backend-port>`
- frontend 端口池耗尽：关闭旧的 Vite 终端，或清理 `5173-5176` 内的占用进程
- live 输入失败但固定测试通过：优先判断为外部模板、外部订阅源或运行镜像漂移，不直接判定为共享层回退
- 浏览器调试路径若出现 `SUBCONVERTER_UNAVAILABLE` 且正文包含 `missing recognized region proxy-group`：先不要只看前端；优先确认当前 Vite 正在代理哪一份 backend，以及该 backend 是否真的把托管模板 URL 注入成了容器可回连的地址，而不是回落到 `localhost`
- 若 live review 产物里 `template-managed.url.txt` 使用 `host.docker.internal` 但 `template-server-access.log` 为 `(no requests)`：优先确认当前代码已包含 `frontend-review` 临时模板服务的 IPv4 监听修复；这通常不是 Docker Desktop 的 `2375` 或 `*.docker.internal` 选项未开启导致

## Compose 预览

若要验证正式单入口预览路径，执行：

```bash
docker compose -f deploy/docker-compose.yml up --build -d
curl http://localhost:11200/healthz
```

Compose 路径用于正式预览与集成验证，不替代日常 frontend HMR 开发。