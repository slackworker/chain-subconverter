# 当前状态

> 最近更新：2026-04-13

## 摘要

- `Phase 1` 已完成：`subconverter` 真实 `3-pass` 集成已落地。
- `Phase 2` 已完成最小闭环：固定测试数据与默认值下，已打通 `stage2Init`、`longUrl` 与最终订阅 YAML。
- `Phase 2.5` 已完成：文档、命名与职责边界收口已固化，`Phase 4` 可以开始。
- `Phase 3` 已完成：3-A, 3-B, 3-C, 3-D, 3-E 已全部落地，后端扩展业务与 API 契约现已收口。
- `Phase 4` 已开始：共享主线代码已接通恢复、转换、生成与短链别名流程，当前正在继续收口共享业务边界；G1 共享层验收尚未完成。

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
- `web/` 已初始化 `Vite + React + TypeScript + Tailwind CSS` 前端工程，并已落地共享 domain types、基础输入组件与业务交互状态主线。
- 共享页面状态已接通 `POST /api/resolve-url`、`POST /api/stage1/convert`、`POST /api/generate` 与 `POST /api/short-links`。
- Stage 1 已补上完整高级菜单控件、条件显示的端口转发输入区、`forwardRelayItems` 结构化快照与手动 SOCKS5 追加入口。
- Stage 2 的 `chainTargets[]` 已具备按 `kind` 区分主路径与补充路径的业务语义，空策略组保留展示但禁止选择。
- 全局阻断错误承载区已收敛为单一入口；Stage 内仅保留消息日志与局部定位提示。
- 已从共享层移除 Navbar、stepper 与顶部介绍 header，避免提前冻结 A/B/C 页面结构与交互节奏。
- 已确认 StageCard、NoticeStack、StatusPill 不再保留共享层或参考实现地位，后续由方案层按需重写或直接删除。
- 已确认恢复入口归属 Stage 3 输出域，且不再要求共享层固定页面顶部 restore 区或固定 DOM 锚点。
- 前端入口已改为通过 `UIScheme` 装配方案层组件；当前默认方案与极简占位方案都可挂接到同一共享业务层。
- 后端已接入 SPA 静态资源托管包装器；非 API 路径现在可托管前端构建产物，同时保留现有 `/api/*`、`/subscription*`、`/healthz` 语义。
- Docker 镜像已接入前端构建流程，可将 `web/dist` 一并打包进最终 `app` 镜像。
- `Phase 4` 当前处于共享主线收口阶段；单一当前链接输入框、`forwardRelayItems` 结构化快照与单一全局阻断错误承载区已落地，当前剩余重点是 G1 共享业务层确认与真实前端验收场景固化。

详细任务项与阶段定义见 [ROADMAP](../ROADMAP.md)。

最小验收基线与固定样例见 [testing/3pass-ss2022-test-subscription.md](../testing/3pass-ss2022-test-subscription.md) 与 `internal/review/testdata/3pass-ss2022-test-subscription/`。

- 当前前端仍未完成 A/B/C 方案分支评审，真实前端验收场景与方案对比材料等仍待收口。
- 当前虽已完成单一当前链接输入框等共享交互收口，但共享前端入口与默认方案组件的解耦仍在继续收口，G1 明确签收仍未完成。
- 当前真实前端验收场景仍依赖外部模板与运行镜像状态，尚未完全固化为可复现签收路径。
- 当前 Compose 仍主要用于 API 与基础静态托管验证，不代表完整单入口部署验收已完成 (属于 Phase 4 后续预期)。
- SSRF 等安全口径仍只在 `ROADMAP/STATUS` 跟踪，尚未并入权威 spec。

## 验证

- `npm run build`：2026-04-16 通过（前端公共基线可完成生产构建，含 Stage 3 单一当前链接输入框与 `forwardRelayItems` 结构化快照迁移）
- `go test ./...`：2026-04-16 全量通过（含 `POST /api/short-links`、短链订阅、SPA 静态资源托管与 longUrl 载荷回归测试）
- `internal/subconverter`、`internal/service`、`internal/api` 的测试均包含在上述全量测试中
- `docker compose -f deploy/docker-compose.yml up --build -d`：2026-04-02 本地验证通过
- 真实容器 smoke：已跑通 `app + subconverter`，并通过本地静态文件服务托管中转订阅样例与模板完成 3 个现有 API 验证
