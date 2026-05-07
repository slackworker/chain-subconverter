# 当前状态

> 最近更新：2026-05-05

## 当前结论

- 本页只维护内部阶段状态与缺口；对外版本发布说明统一见 [../../RELEASES.md](../../RELEASES.md)。
- `Phase 0` 到 `Phase 3` 已完成。
- `Phase 4` 进行中，当前已进入 Alpha（内测）发布与反馈收口阶段。
- 当前对外内测版本口径统一按 `3.0 Alpha` 描述。
- `G1` 前端共享业务层已签收；共享边界以 [spec/02-frontend-spec](../spec/02-frontend-spec.md) 为准，不再单独维护一份 G1 验收说明。
- 当前长期分支已收口为 `main`、`dev`、`alpha`：共享改动先回 `main`，A/B/C 并行实现集中在 `dev`（原 `ui-lab`），对外 Alpha 发布由 `alpha` 承担。
- Alpha 对外口径已统一为 `alpha` 分支 + `ghcr.io/slackworker/chain-subconverter:alpha-latest` + 默认入口 `/` + Compose 单段部署命令。

## Phase 进度

| Phase | 状态 |
|------|------|
| Phase 0 — 骨架 | ✅ 完成 |
| Phase 1 — `subconverter` 集成 | ✅ 完成 |
| Phase 2 — 最小业务闭环 | ✅ 完成 |
| Phase 2.5 — 文档与边界收口 | ✅ 完成 |
| Phase 3 — 扩展业务与 API 收口 | ✅ 完成 |
| Phase 4 — 前端与部署 | 🚧 进行中 |

## 已稳定范围

- 后端主线已具备 `stage1/convert`、`generate`、`resolve-url`、`short-links`、`GET /sub`、`GET /sub/<id>` 的完整契约与实现。
- 前端共享业务层已接通恢复、转换、生成、短链切换等主流程；入口按 `/ui/<scheme>` 装配，A/B/C 方案继续在共享契约之上演进。
- 前端共享层已把日志语义从“当前请求 messages 槽”收口为 append-only workflow log；默认 `/` 已改为页面底部折叠日志区，保留当前会话内的动作与消息历史。
- 本地开发主入口已固定为 `./scripts/dev-up.sh <scheme>`，默认端口为 `25500 / 11200 / 5173`。
- VS Code `dev: up` 与 `./scripts/dev-up.sh` 默认共用固定端口；多 worktree 并行需显式设置 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET`（或任务包装脚本的第二参数 / `auto`），冲突时由 `dev-up.sh` 复用、清理本工作区残留实例或报错退出。
- Docker 镜像已接入前端构建，后端也已具备 SPA 静态资源托管能力。
- `deploy/README.md` 已将第三方设备部署改为单段可复制命令，由用户修改顶部变量后生成并启动本地 `docker-compose.yml`。
- Alpha（内测）发布默认镜像标签与部署入口已固定，可直接用于第三方设备冷启动。

## 当前缺口

- A/B/C 方案评审尚未完成；当前 Alpha 默认入口固定为 `/`，但仍不把任一方案视为最终 UI。
- B/C 方案尚未把新的 workflow log 视觉形态统一到与默认 `/` 同一产品口径；当前共享语义已统一，但方案层呈现仍待继续收口。
- 正式本地预览 / Compose 单入口验收仍需持续回归，尚未形成稳定的版本化发布节奏。
- Alpha（内测）反馈项尚未完成集中收口，尚未进入 Beta 候选冻结。
- 真实前端验收仍依赖外部模板、外部订阅源与运行镜像状态，可复现性仍待继续固化。
- Alpha 发布、最小回归顺序与反馈记录入口已固定到 [testing/alpha-release](../testing/alpha-release.md)，后续回归记录应按该文档执行。
- 后续收口计划见 [plan/phase-4-dev-readiness](../plan/phase-4-dev-readiness.md)。

## 最近验证

- `2026-05-05`: `cd web && npm run build:a`
- `2026-05-05`: `cd web && npm run build:b && npm run build:c`
- `2026-05-01`: `cd web && npm run build:b`
- `2026-04-28`: `docker compose -f deploy/docker-compose.yml config`
- `2026-04-28`: 单段部署命令生成的 `docker-compose.yml` 通过 `docker compose -f - config`
- `2026-04-21`: `go test ./internal/service ./internal/api`
- `2026-04-21`: `npm run build:a`、`npm run build:b`、`npm run build:c`
- `2026-04-19`: `./scripts/dev-up.sh a`
- `2026-04-19`: 通过前端代理调用 `POST /api/stage1/convert`
- `2026-04-18`: `go test ./...`
- `2026-04-18`: `npm run build`、`npm run build:b`
- `2026-04-18`: `docker compose -f deploy/docker-compose.yml config`

## 相关文档

- 阶段顺序与整体路线：[`docs/ROADMAP.md`](../ROADMAP.md)
- 权威边界与契约：[`docs/spec/`](../spec/)
- 本地 UI 启动与 smoke 入口：[`docs/testing/local-dev-smoke.md`](../testing/local-dev-smoke.md)
- Alpha 发布与反馈闭环：[`docs/testing/alpha-release.md`](../testing/alpha-release.md)
- 第三方设备 Compose 启动命令：[`deploy/README.md`](../../deploy/README.md)
