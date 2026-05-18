# 当前状态

> 最近更新：2026-05-18

## 当前结论

- 本页只维护当前阶段状态与缺口；对外发布口径统一见 [../../RELEASES.md](../../RELEASES.md)。
- `Phase 0` 到 `Phase 3` 已完成；`Phase 4` 已进入开发后期与发布整理阶段。
- 当前默认入口固定为 `/`，`/ui/a`、`/ui/b`、`/ui/c` 继续保留为实验入口。
- 当前分支模型收口为 `dev / beta / main`：`dev` 用于日常开发与手动 `dev-latest`，`beta` 预留给 Beta 收口与 `beta-latest`，`main` 负责当前公开滚动镜像 `latest`。
- 版本号标签延后到 Beta / 正式版；当前阶段先把滚动标签、发布流程、文档与回归基线整理干净。
- `G1` 前端共享业务层已签收；共享边界以 [spec/02-frontend-spec](../spec/02-frontend-spec.md) 为准，不再单独维护一份 G1 验收说明。

## Phase 进度

| Phase | 状态 |
|------|------|
| Phase 0 — 骨架 | ✅ 完成 |
| Phase 1 — `subconverter` 集成 | ✅ 完成 |
| Phase 2 — 最小业务闭环 | ✅ 完成 |
| Phase 2.5 — 文档与边界收口 | ✅ 完成 |
| Phase 3 — 扩展业务与 API 收口 | ✅ 完成 |
| Phase 4 — 前端与部署 | 🚧 开发后期 / 发布整理 |

## 已稳定范围

- 后端主线已具备 `stage1/convert`、`generate`、`resolve-url`、`short-links`、`GET /sub`、`GET /sub/<id>` 的完整契约与实现。
- 前端共享业务层已接通恢复、转换、生成、短链切换等主流程；默认入口固定为 `/`，A/B/C 方案继续通过 `/ui/<scheme>` 在共享契约之上演进。
- 默认 `/` 已使用页面底部折叠 workflow log，保留当前会话内的动作与消息历史。
- 本地开发主入口已固定为 `./scripts/dev-up.sh <scheme>`，默认端口为 `25500 / 11200 / 5173`。
- VS Code `dev: up` 与 `./scripts/dev-up.sh` 默认共用固定端口；多 worktree 并行需显式设置 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET`。
- Docker 镜像已接入前端构建，后端已具备 SPA 静态资源托管能力。
- `GET /api/runtime-config` 现已同时下发默认模板 URL 与公开 longUrl 预算；前端生成流程已接入 `>8192` 自动短链与禁止回落展示超预算 longUrl。
- 第三方设备部署已收口为单段 Compose 命令；默认优先走一体化 Compose，也允许按文档切换为双 Docker 分离部署。
- 四个写接口现已在 HTTP 层共享最简 per-IP token bucket，默认 `60 req/min`，可通过 `CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE` 调整或设 `0` 关闭。
- 发布工作流与 CI 现已按 `dev / beta / main` 三线调整：`main -> latest`、`beta -> beta-latest`、`dev -> workflow_dispatch 手动镜像`。

## 当前缺口

- `docs/temp/` 与历史材料中可能仍有旧发布口径，需按需清理，避免误入主导航。
- `beta` 分支与 Beta 回归节奏已纳入当前模型，但正式进入 Beta 冻结前仍需补齐回归记录、反馈闭环与发布说明。
- 真实前端验收仍依赖外部模板、外部订阅源与运行镜像状态，可复现性仍待继续固化。
- 浏览器级 E2E 已补上默认 `/` 的最小 Playwright happy path，覆盖“转换并自动填充 -> 生成长链接 -> 切短链 -> 反向解析恢复”；阻断路径与更广方案矩阵仍待补齐。
- B/C 方案尚未把 workflow log 的视觉形态统一到与默认 `/` 同一产品口径；当前共享语义已统一，但方案层呈现仍待继续收口。
- 模板 URL 的最小 SSRF 拒绝名单、`RequireUserFacingBaseURL` 与基础限速已落地；剩余安全缺口主要是更严格的出站控制、部署侧 egress 收敛与发布前验证记录。

## 测试基线补充

- 固定回归基线已扩展到两套并列 fixture：
	- `3pass-ss2022-test-subscription`：最小 smoke
	- `dual-landing-chain-port-forward`：双落地、双中转订阅、双 relay、长/短链接回放
- 前端已引入 Vitest，当前覆盖 `web/src/lib/stage1.ts`、`web/src/lib/state.ts`、`web/src/lib/notices.ts` 的纯业务逻辑单测。
- `web` 已新增 Playwright 最小 happy path spec，默认通过 `playwright.config.ts` 复用 `./scripts/dev-up.sh default` 的固定端口运行时。
- CI 已新增 `Web Unit Test` job，单独执行 `cd web && npm run test`。

## 最近验证

- `2026-05-18`: 容器化 Playwright（v1.60.0）against host `./scripts/dev-up.sh default`：`cd web && npm run test:e2e -- default-happy-path.spec.ts`
- `2026-05-18`: `cd web && npm test`
- `2026-05-18`: `go test ./internal/review -run TestBuildDualLandingChainPortForwardArtifacts_HappyPath -v`
- `2026-05-18`: `go test ./internal/service -run 'TestBuildStage2Init_DualLandingChainPortForwardFixture|TestResolveURLFromSource_DualLandingChainPortForwardFixtureReplayable|TestResolveURLFromSource_DualLandingChainPortForwardFixtureShortURL' -v`
- `2026-05-17`: 已创建本地 `beta` 分支，当前仓库分支模型与工作流口径一致
- `2026-05-17`: `go test ./...`
- `2026-05-17`: `cd web && npm run build:default && npm run build:a && npm run build:b && npm run build:c`
- `2026-05-17`: `docker compose -f deploy/docker-compose.yml config`
- `2026-05-17`: `.github/workflows/docker-publish.yml` 与 `.github/workflows/ci.yml` 已切换到 `dev / beta / main` 分支模型，编辑器诊断通过
- `2026-05-15`: `go test ./cmd/server ./internal/config ./internal/api`
- `2026-05-15`: `go test ./internal/service ./internal/subconverter ./internal/config ./internal/api`
- `2026-05-15`: `cd web && npm run build`
- `2026-05-14`: `go test ./internal/api ./internal/config ./cmd/server`
- `2026-05-14`: `go test ./internal/service ./internal/config ./internal/api ./cmd/server`
- `2026-05-14`: `go test ./internal/api -run TestStage1ConvertHandler_RateLimitsByClientIP`
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
- 当前执行计划：[`docs/plan/3.0-release-stabilization.md`](../plan/3.0-release-stabilization.md)
- Beta 前置条件：[`docs/progress/beta-readiness.md`](beta-readiness.md)
- 本地 UI 启动与 smoke 入口：[`docs/testing/local-dev-smoke.md`](../testing/local-dev-smoke.md)
- 当前发布与回归 runbook：[`docs/testing/release-runbook.md`](../testing/release-runbook.md)
- 第三方设备 Compose 启动命令：[`deploy/README.md`](../../deploy/README.md)
