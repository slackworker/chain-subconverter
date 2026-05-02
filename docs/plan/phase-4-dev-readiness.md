# Phase 4 本地预览与联调就绪计划

本文定义在 A/B/C UI 分支开发前，必须先收口的本地运行、联通性检测、测试与人工验收任务。

实时状态统一维护在 [progress/STATUS](../progress/STATUS.md)。

## 目标

- 面向单人本机开发环境：`VS Code + WSL + Docker Desktop`
- 面向第三方局域网 / 家庭设备：`Docker Compose` 冷启动部署
- 让前端开发者能独立拉起 `frontend + backend + subconverter`
- 让浏览器可直接访问 A/B/C 任一 `scheme` 并跑完整主线
- 让自动化基线、UI-A 主流程 smoke、人工签收与第三方设备部署职责分层清晰

## 当前已验证基线

- `go test ./...`：2026-04-18 通过
- `npm run build`：2026-04-18 通过
- `npm run build:b`：2026-04-18 通过
- `docker compose -f deploy/docker-compose.yml config`：2026-04-18 通过
- `deploy/docker-compose.yml` 已对 `subconverter` 与 `app` 配置健康检查
- `.vscode/tasks.json` 已提供 `dev: up` 正式任务入口
- `deploy/README.md` 已提供第三方设备部署所需的单段复制命令
- `web/` 已具备 `/ui/a`、`/ui/b`、`/ui/c` 方案入口骨架

## 当前缺口

- Compose 可做最终预览 / 集成验证，但不适合作为前端日常 HMR 主路径
- 本地 Go 后端运行路径与 Compose 第三方设备路径仍缺少一套统一的冷启动验收记录
- 现有自动化测试未明确分层为 stable unit / contract 与 UI-A 主流程 smoke；用户手动确认路径未形成固定清单
- 模板调用、参数传递、接口功能的“真实跑通 + 人工签收”还没有固定成统一矩阵
- Alpha（内测）发布已具备第三方设备 Compose 冷启动入口，但仍缺少持续回归记录与反馈闭环模板

## 方向选择

采用“双路径收口”：

1. 正式预览 / 部署路径：按 `deploy/README.md` 复制单段命令，生成本地 `docker-compose.yml` 后执行 `docker compose up -d`
2. 日常 UI 开发路径：VS Code task 或等价脚本启动 `subconverter`、本地 Go backend、Vite dev server

约束：

- Compose 仍是对外主路径，符合 [spec/05-tech-stack](../spec/05-tech-stack.md)
- 本地 dev path 只解决热更新和调试效率，不替代最终部署验收
- 两条路径共用同一组连通性检查、样例输入与 smoke 口径
- 第三方设备部署默认允许省略 `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL`，由服务端按请求来源自动推断发布地址；仅在多入口、反代或需要固定对外地址时再显式填写
- `subconverter` 默认以 `ghcr.io/slackworker/subconverter:integration-chain-subconverter` 作为运行来源；工作区内 [subconverter/](../../subconverter/) 仅作为可选源码参考与后续本地构建来源

## 工作包

### P4-R0：基线复核与运行参数冻结

目标：

- 冻结本地开发默认端口、`scheme` 入口和环境变量
- 固定“默认该怎么跑、出问题先查哪里”的最小约定

任务：

- 固定本地默认端口：backend `11200`、frontend dev `5173`、compose app `11200`、compose subconverter `25500`
- 固定本地 `scheme` 访问方式：`/ui/a`、`/ui/b`、`/ui/c`
- 固定 `VITE_CHAIN_SUBCONVERTER_API_PROXY_TARGET=http://localhost:11200`
- 固定 backend env 最小集合：`CHAIN_SUBCONVERTER_HTTP_ADDRESS`、`CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL`、`CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL`、`CHAIN_SUBCONVERTER_FRONTEND_DIST_DIR`、`CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH`；`CHAIN_SUBCONVERTER_PUBLIC_BASE_URL` 改为可选覆盖项
- 本地 dev path 中，`CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 必须使用 `subconverter` 容器可回连的地址；当前 `WSL + Docker Desktop` 基线固定为 `http://host.docker.internal:<backend-port>`，不得直接复用对浏览器公开的 `localhost` URL
- 把上述约定写入开发文档与任务配置

完成口径：

- 任何人不查历史命令，也能知道默认访问地址和 env contract

### P4-R1：本地预览与联调机制

目标：

- 提供至少一套正式可复现的本地启动方法
- 启动时自动给出后端和 `subconverter` 连通性结果

任务：

- 在 `.vscode/tasks.json` 或正式脚本中提供最少 4 类任务：
- 启动或复用 `subconverter`
- 启动本地 Go backend
- 启动 Vite dev server
- 启动 Compose preview
- 加入 readiness checks：`subconverter` 用 `GET /version`，`app` 用 `GET /healthz`
- 视需要增加 `managed-templates` 拉取 smoke，避免只检查进程存活
- 本地 Go backend 在 WSL 开发路径必须显式使用 IPv4 listener，避免 Docker Desktop 只能看到 `*:port` 时无法从容器回连托管模板 URL
- 启动结果需打印可直接打开的 URL：frontend dev `http://localhost:5173/ui/<scheme>`，compose preview `http://localhost:11200/ui/<scheme>`
- 明确 `subconverter` 允许直接复用已运行容器，不强制每次重建

完成口径：

- 新前端分支开发时，能在 5 分钟内从空终端拉起浏览器可访问页面
- 用户可明确判断失败是 Docker、`subconverter`、backend 还是 frontend 侧问题

### P4-R1.5：第三方设备 Compose 冷启动

目标：

- 让非当前开发机的局域网 / 家庭设备仅凭发布镜像与一段可复制命令完成部署
- 把“本机预览可跑”提升为“内测设备可分发部署”

任务：

- 复制 `deploy/README.md` 中的单段命令，按需填写固定 `PUBLIC_BASE_URL`，并设置镜像标签与宿主机端口
- 优先使用已发布的 `APP_IMAGE` 与 `SUBCONVERTER_IMAGE`，不依赖设备本地源码构建
- 在非当前开发机上执行单段命令，完成 Compose 文件创建与 `docker compose up -d`
- 从另一台终端访问 `http://<device-ip>:<host-port>/ui/<scheme>` 并完成 `GET /healthz` 验证
- 验证短链卷在容器重启后仍可保留数据

完成口径：

- 第三方设备可冷启动部署并对局域网内其他终端提供页面、API 与订阅访问
- Alpha 内测不再只依赖当前 WSL 开发环境成立

当前状态（Alpha 同步）：

- 部署入口与默认镜像标签已在 [deploy/README.md](../../deploy/README.md) 固定
- Alpha 发布基线已固定为 `UI-A`，默认回归入口为 `/ui/a`
- 后续重点从“能否首轮冷启动”转为“内测期间持续回归与反馈收口”

### P4-R2：测试收口

目标：

- 先把公共层、服务层、API 层现有测试重新分层，并清掉阻碍 UI 开发的未定项
- 自动化与人工签收边界清晰

任务：

- 维持稳定自动化基线：`go test ./...`、`npm run build`、`npm run build:b`
- 增加或整理 UI-A 主流程 smoke 分层：`CHAIN_SUBCONVERTER_SMOKE=1 go test ./internal/subconverter/...` 与基于真实 `subconverter` + 模板服务的端到端 smoke
- 针对以下主题逐项跑通并补用例：模板调用与托管模板回取、Stage 1 参数传递到 `subconverter` query、`stage1/convert` / `generate` / `resolve-url` / `short-links` 行为、`subscription` 下载链路
- 记录每一类失败属于：共享业务层回退、外部模板漂移、`subconverter` 镜像漂移、本地网络或 Docker 问题

完成口径：

- ABC UI 开发不再被“到底是 UI 坏了还是服务链路坏了”阻塞
- 自动化失败和真实链路失败能分开定位

### P4-R3：人工签收矩阵

目标：

- 让你可以按固定顺序手动一项项确认
- 以 UI-A 当前主流程作为人工 smoke 入口

约束：

- 人工输入只作为当前单机环境下的 UI-A 主流程 smoke，不纳入 stable fixture 裁决
- 自动化 fixture 仍以 [testing/3pass-ss2022-test-subscription](../testing/3pass-ss2022-test-subscription.md) 为准

任务：

- 手动验证 `stage1/convert` 可完成落地 / 中转识别
- 手动验证 Stage 2 默认 `target` 与 `mode` 可生成 `longUrl`
- 手动验证 Stage 3 打开、复制、下载围绕单一当前链接输入框工作正常
- 手动验证 `resolve-url` 恢复与 `short-links` 生成 / 回放
- 手动验证长链接订阅读取与 `/sub/<id>` 结果

完成口径：

- 每次 smoke 至少记录输入、访问入口、期望结果、是否通过
- 人工验收结果能直接反馈给后续 A/B/C 方案实现

### P4-R4：ABC 分支开发交接

目标：

- 在 UI 方案开发开始前，把“如何跑起来”和“如何判断不是 UI 问题”都说明白

任务：

- 为前端开发者提供一页入口文档，说明快速启动、访问地址、常用任务、smoke 顺序、常见故障定位
- 明确 A/B/C 方案开发只允许改动 `web/src/scheme/*` 与方案层相关资源；共享业务层变更需单独收口
- 在 [progress/STATUS](../progress/STATUS.md) 中把“共享层签收完成”和“本地预览 / 联调就绪完成”分开记录

完成口径：

- 前端开发者完成 UI 后，不需要重新发明启动流程，即可在浏览器里调完整流程

## 推荐产物

- `.vscode/tasks.json`：正式 dev / preview / verify 任务
- `docs/testing/` 下新增本地 smoke 文档
- [deploy/README.md](../../deploy/README.md)：补上 compose preview 验证顺序
- [web/README.md](../../web/README.md)：补上 Vite dev 与 `scheme` 访问说明
- 必要时补正式部署命令说明

## 执行顺序

1. 先完成 P4-R0，冻结端口与 env contract
2. 再完成 P4-R1，形成正式启动机制
3. 持续执行 P4-R1.5 的内测回归与反馈收口（首轮冷启动入口已具备）
4. 再完成 P4-R2，清理自动化与 UI-A 主流程 smoke 缺口
5. 最后完成 P4-R3 与 P4-R4，再把 A/B/C 分支开发视为真正解阻

## 解阻定义

- Compose preview path 可启动并完成健康检查
- 本地 dev path 可启动并完成健康检查
- 第三方设备 Compose path 可冷启动并完成健康检查
- 稳定自动化基线持续通过
- UI-A 主流程 smoke 与人工签收矩阵有固定入口并可复用
- 前端开发者可直接按文档在浏览器中跑完整主线