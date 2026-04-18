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
- `default`
- `plain`

## 脚本行为

`dev-up.sh` 会依次处理：

1. 检查 `go`、`node`、`npm`、`docker`、`curl`、`ss` 是否可用
2. 在端口池 `25500-25503` 内复用或启动 `subconverter`
3. 在端口池 `11200-11203` 内复用或启动本地 backend
4. 在端口池 `5173-5176` 内选择 frontend dev server 端口
5. 把本次运行结果写入 `.tmp/dev-up/runtime.env`

约束：

- 已运行且健康的 `subconverter` 会被直接复用，不强制重建
- 已运行且健康的 backend 会被直接复用，不重复拉起第二份
- frontend dev server 默认不复用旧进程，而是寻找当前端口池内的可用端口
- 若当前任务终端关闭，脚本本次拉起的本地 frontend / backend 会一起退出
- `subconverter` 容器默认保留，便于下一次开发直接复用

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
cd web && npm run build && npm run build:plain
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

### 4. 手动确认项

- Stage 1 可完成落地 / 中转识别
- Stage 2 可选择 `mode` 与 `targetName`
- Stage 3 可围绕单一当前链接输入框执行打开 / 复制 / 下载
- `resolve-url` 可恢复页面状态
- `short-links` 可创建短链接并回放订阅

## 失败定位

- `subconverter` 检查失败：先看 Docker Desktop、镜像拉取与 `GET /version`
- backend 检查失败：先看 `.tmp/dev-up/backend.log`
- frontend 端口池耗尽：关闭旧的 Vite 终端，或清理 `5173-5176` 内的占用进程
- live 输入失败但固定测试通过：优先判断为外部模板、外部订阅源或运行镜像漂移，不直接判定为共享层回退

## Compose 预览

若要验证正式单入口预览路径，执行：

```bash
docker compose -f deploy/docker-compose.yml up --build -d
curl http://localhost:11200/healthz
```

Compose 路径用于正式预览与集成验证，不替代日常 frontend HMR 开发。