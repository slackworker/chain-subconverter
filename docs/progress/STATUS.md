# 当前状态

> 最近更新：2026-04-18

## 摘要

- `Phase 1` 已完成：`subconverter` 真实 `3-pass` 集成已落地。
- `Phase 2` 已完成最小闭环：固定测试数据与默认值下，已打通 `stage2Init`、`longUrl` 与最终订阅 YAML。
- `Phase 2.5` 已完成：文档、命名与职责边界收口已固化，`Phase 4` 可以开始。
- `Phase 3` 已完成：3-A, 3-B, 3-C, 3-D, 3-E 已全部落地，后端扩展业务与 API 契约现已收口。
- `Phase 4` 已完成 G1 共享业务层签收：共享主线代码已接通恢复、转换、生成与短链别名流程。
- 2026-04-18 已复核 `go test ./...`、`npm run build`、`npm run build:b` 与 `docker compose -f deploy/docker-compose.yml config`；但正式本地预览 / 联调 / smoke 收口尚未完成，新增执行计划见 [plan/phase-4-dev-readiness](../plan/phase-4-dev-readiness.md)。

## Phase 进度

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 0 — 骨架 | 目录、Go module、旧代码归档 | ✅ 完成 |
| Phase 1 — subconverter 集成 | 真实 `3-pass` HTTP 管线 | ✅ 完成 |
| Phase 2 — 最小业务闭环 | 固定测试数据下的 `stage2Init`、`longUrl`、最终订阅 YAML + 最小 HTTP | ✅ 完成 |
| Phase 2.5 — 阶段性整理 | 文档、结构与边界收口 | ✅ 完成 |
| Phase 3 — 扩展业务与 API 收口 | 恢复、短链、失败语义、完整 API 契约 | ✅ 完成 |
| Phase 4 — 前端与部署 | React + TS UI、运行形态、Compose | 🚧 进行中 |

## 已完成

- 3-pass 集成、最小业务闭环、最小 HTTP 对外层已落地。
- API-only Compose 与 smoke 验证路径已落地。
- `internal/store` 的 SQLite 短链索引已落地 (基于 `go-sqlite3` 实现并加满约束级并发保护)，并已接入服务运行时配置。
- `docs/README`、`ROADMAP`、`testing` 等文档已对齐。
- `internal/api`、`internal/service` 职责边界已固化。
- `Phase 3` 已完成失败语义收口 (3-A)、输入应用层配置化 (3-B)、`POST /api/resolve-url` (3-C)、短链索引落地 (3-D) 与短链对外端点 (3-E)。
- 已落地 `POST /api/short-links`、`GET /subscription/<id>.yaml`，并由同一短链索引支持 `resolve-url` 短链接恢复与短链订阅读取。
- 订阅路由已按 `publicBaseURL` 的路径前缀注册，长链接与短链接在带 base path 的部署形态下都可直接回放。
- 文档主导航已收敛到 `spec/`、`plan/`、`progress/`、`testing/`；已完成阶段计划与历史材料已移入 `docs/temp/` 待删区。
- `web/` 已初始化 `Vite + React + TypeScript + Tailwind CSS` 前端工程，并已落地共享 domain types、共享 workflow 状态主线与可替换方案装配入口。
- 共享页面状态已接通 `POST /api/resolve-url`、`POST /api/stage1/convert`、`POST /api/generate` 与 `POST /api/short-links`。
- Stage 1 已补上完整高级菜单控件、条件显示的端口转发输入区、`forwardRelayItems` 结构化快照与手动 SOCKS5 追加入口。
- Stage 2 的 `chainTargets[]` 已具备按 `kind` 区分主路径与补充路径的业务语义，空策略组保留展示但禁止选择；`port_forward` 目标已在共享 workflow 中收口为“同一 relay 不可被多个落地节点重复选择”。
- Stage 1 高级选项中的 `include`、`exclude` 已统一收口为有序字符串数组语义，并已贯通前端类型、后端接口、longUrl 编解码与 `subconverter` query 构造。
- 全局阻断错误承载区已收敛为单一入口；Stage 内仅保留消息日志与局部定位提示。
- 已从共享层移除 Navbar、stepper 与顶部介绍 header，避免提前冻结 A/B/C 页面结构与交互节奏。
- 已确认 StageCard、NoticeStack、StatusPill 不再保留共享层或参考实现地位，后续由方案层按需重写或直接删除。
- 已确认恢复入口归属 Stage 3 输出域，且不再要求共享层固定页面顶部 restore 区或固定 DOM 锚点。
- 前端入口已改为通过 `UIScheme` 装配方案层组件；路由按 `/ui/<scheme>` 隔离，当前仅保留 `a`、`b`、`c` 三套方案入口，并只继续共享 workflow 与业务契约。
- 后端已接入 SPA 静态资源托管包装器；非 API 路径现在可托管前端构建产物，同时保留现有 `/api/*`、`/subscription*`、`/healthz` 语义。
- Docker 镜像已接入前端构建流程，可将 `web/dist` 一并打包进最终 `app` 镜像。
- 2026-04-17 已完成 G1 共享业务层签收：`npm run build`、`npm run build:b`、`go test ./...` 全部通过，允许进入 A/B/C 并行方案开发。
- 2026-04-18 已再次确认 `go test ./...`、`npm run build`、`npm run build:b` 与 Compose 配置解析均通过，可作为 Phase 4 后续收口的自动化基线。
- 2026-04-18 已落地本地 UI 联调启动入口：`scripts/dev-up.sh` 与 VS Code `dev: up` 任务现可复用 `subconverter` / backend、自动处理 frontend 端口占用，并把运行结果写入 `.tmp/dev-up/runtime.env`。
- 2026-04-18 已修复本地 UI 调试链路中的托管模板回取问题：`cmd/server` 现显式使用 IPv4 listener，`scripts/dev-up.sh` 只复用 env 契约匹配且容器可回连的 backend，并把本地 `MANAGED_TEMPLATE_BASE_URL` 固定为 `http://host.docker.internal:<backend-port>`。
- 2026-04-18 已落地 live review 入口：`go run ./cmd/frontend-review` 与 VS Code `review: live subscriptions` 任务可针对真实订阅 URL 生成 `stage1/stage2` 中间产物目录，便于人工核对模板调用、参数传递与最终 YAML。

详细任务项与阶段定义见 [ROADMAP](../ROADMAP.md)。

最小验收基线与固定样例见 [testing/3pass-ss2022-test-subscription.md](../testing/3pass-ss2022-test-subscription.md) 与 `internal/review/testdata/3pass-ss2022-test-subscription/`。

- 当前前端仍未完成 A/B/C 方案评审，且在 [plan/phase-4-dev-readiness](../plan/phase-4-dev-readiness.md) 收口前，不把 ABC 分支开发视为已完全解阻。
- 当前已完成单一当前链接输入框等共享交互收口，且 shared contract 已收口到 `include/exclude` 数组语义与 `port_forward` 互斥选择，G1 已于 2026-04-17 完成签收。
- 当前已补齐最小本地 dev 任务编排与单脚本启动文档，但 live smoke 的人工签收矩阵和 Compose 单入口最终验收仍待继续收口。
- 当前 live `subconverter` / 模板 / API 全流程 smoke 已具备中间产物导出入口，但人工签收矩阵与结果沉淀仍待继续收口。
- 当前真实前端验收场景仍依赖外部模板与运行镜像状态，尚未完全固化为可复现签收路径。
- 当前 Compose 仍主要用于 API 与基础静态托管验证，不代表完整单入口部署验收已完成 (属于 Phase 4 后续预期)。
- SSRF 等安全口径仍只在 `ROADMAP/STATUS` 跟踪，尚未并入权威 spec。

## 验证

- `npm run build`：2026-04-17 通过（前端公共基线可完成生产构建，含 Stage 3 单一当前链接输入框、`forwardRelayItems` 结构化快照，以及共享 contract 收口后的 0 UI 基线）
- `npm run build:b`：2026-04-17 通过（用于确认另一套方案入口仍可单独消费同一共享业务层）
- `go test ./...`：2026-04-17 全量通过（含 `include/exclude` 数组 contract、短链订阅、SPA 静态资源托管与 longUrl 载荷回归测试）
- `internal/subconverter`、`internal/service`、`internal/api` 的测试均包含在上述全量测试中
- `docker compose -f deploy/docker-compose.yml config`：2026-04-18 通过（Compose 配置可解析；不代表本次已重新完成容器级 smoke）
- `./scripts/dev-up.sh a`：2026-04-18 通过（复用 `subconverter` 与修复后的 `11203` backend；在已有旧前端占用下自动回退到 `5175`，`.tmp/dev-up/runtime.env` 指向 `http://localhost:5175/ui/a`）
- `./scripts/dev-up.sh b`：2026-04-18 通过（跳过不兼容旧 backend，在 `11203` 启动可被容器回连的 IPv4 backend，前端监听 `5174`，`.tmp/dev-up/runtime.env` 写入 `MANAGED_TEMPLATE_BASE_URL=http://host.docker.internal:11203`）
- `curl -X POST http://127.0.0.1:11203/api/stage1/convert ...Landing-Subscription ...Airport-Subscription`：2026-04-18 通过（返回 `blockingErrors = []`，首行默认目标为 `🇭🇰 香港节点`）
- `curl -X POST http://127.0.0.1:5174/api/stage1/convert ...Landing-Subscription ...Airport-Subscription`：2026-04-18 通过（Vite 代理路径与 backend 直连返回一致，不再出现 `SUBCONVERTER_UNAVAILABLE`）
- `go run ./cmd/frontend-review -h`：2026-04-18 通过（live review CLI 可用）
- `go run ./cmd/frontend-review -name live-review-check -landing-url ...Landing-Subscription -transit-url ...Airport-Subscription`：2026-04-18 已验证可导出 `stage1` 原始产物与错误文件；当前 live case 在 Stage 1 自动填充阶段失败，原因是 full-base 缺少已识别目标组 `🇭🇰 香港节点`
- `docker compose -f deploy/docker-compose.yml up --build -d`：2026-04-02 本地验证通过
- 真实容器 smoke：已跑通 `app + subconverter`，并通过本地静态文件服务托管中转订阅样例与模板完成 3 个现有 API 验证
