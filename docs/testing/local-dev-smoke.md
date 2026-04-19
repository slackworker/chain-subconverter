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
2. 清理当前工作区遗留的旧 frontend / backend 开发实例，以及旧的额外 `subconverter` 容器
3. 固定在 `25500` 复用或启动 `subconverter`
4. 固定在 `11200` 复用或启动本地 backend
5. 固定在 `5173` 复用或启动 frontend dev server
6. 把本次运行结果写入 `.tmp/dev-up/runtime.env`

约束：

- 已运行且健康的 `subconverter` 会在固定端口 `25500` 被直接复用，不强制重建
- 已运行且健康的 backend 只有在固定端口 `11200` 上满足 `dev-up.sh` 约定的 env 契约、且 `subconverter` 容器能回连其托管模板地址时才会被复用；不兼容的旧 backend 会被停止并在同一端口重启
- frontend dev server 在固定端口 `5173` 上若已属于当前工作区，会被直接复用；不再自动回退到 `5174` 之类相邻端口
- 固定端口若被非当前工作区或非 `dev-up.sh` 管理的进程占用，脚本会直接报错并要求手工处理冲突，而不是悄悄切换到其它端口
- 若当前任务终端关闭，脚本本次拉起的本地 frontend / backend 会一起退出
- `subconverter` 容器默认保留，便于下一次开发直接复用
- 本地 backend 运行路径固定使用 IPv4 listener，并把 `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 指向 `http://host.docker.internal:<backend-port>`，供 Docker 内的 `subconverter` 回取托管模板

## 为什么不单独提供 stop 脚本

当前默认策略是不额外引入 stop 脚本。

原因：

- frontend dev server 与本地 backend 都由 `dev-up.sh` 托管
- 停止 VS Code task 或关闭对应终端，就会触发脚本清理这两个本地子进程
- `subconverter` 刻意保留为可复用容器，避免每次重新拉镜像或重建
- VS Code `dev: up` 任务已限制为单实例，避免同一任务被重复启动后继续制造新的调试端口

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

在 `WSL + Docker Desktop + Windows 浏览器` 下，日常只应打开 `http://localhost:5173/ui/<scheme>`。Windows 浏览器访问这个 `localhost` 时会经由 WSL 的端口转发进入当前固定 dev server；若某次只能靠 `5174` 或 `5175` 打开，通常说明旧开发实例还活着，而不是当前启动结果发生了“正常漂移”。

### 3. Live 输入

当前单机 smoke 输入：

- `Landing-Subscription`: `http://192.168.100.1:3001/7xK9pLm2Qr4vB6yN8sT3/download/Landing-Subscription`
- `Airport-Subscription`: `http://192.168.100.1:3001/7xK9pLm2Qr4vB6yN8sT3/download/Airport-Subscription`

这些输入只作为当前开发机 live smoke，不替代固定 fixture。

若要把这两条 live 输入导出为可 review 的中间产物目录，执行：

```bash
go run ./cmd/frontend-review \
	-case-dir .tmp/review/manual
```

运行前先把 live URL 写入：

- `.tmp/review/manual/stage1/input/landing.txt`
- `.tmp/review/manual/stage1/input/transit.txt`

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
- frontend / backend 固定端口冲突：先按报错里给出的 `pid/cmd/cwd` 检查占用进程；若是旧的当前工作区实例，停止对应 VS Code task 或结束该进程后重试；若是其它项目占用，先释放 `5173` 或 `11200`
- Windows 浏览器能打开相邻端口但固定端口打不开：优先判断为旧 Vite 实例仍在监听，不把它视为当前 `dev-up.sh` 的正常行为
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