# 当前状态

> 最近更新：2026-05-25（准备发布 `v3.0.0-beta.2`）

## 当前结论

- 本页只维护当前阶段状态与缺口；用户入口见 [../../README.md](../../README.md)，版本历史见 [../../RELEASES.md](../../RELEASES.md)。
- `Phase 0` 到 `Phase 3` 已完成；`Phase 4` 已进入开发后期与发布整理阶段。
- **已发布** [`v3.0.0-beta.1`](../../RELEASES.md#v300-beta1)（2026-05-24）；**当前目标**：合并 `dev` → `beta`、打 tag `v3.0.0-beta.2` 并发布镜像（说明见 [RELEASES.md](../../RELEASES.md#v300-beta2)）。
- 当前默认入口固定为 `/`，`/ui/a`、`/ui/b`、`/ui/c` 继续保留为实验入口。
- 当前分支模型收口为 `dev / beta / main`：`dev` 用于日常开发与手动 `dev-latest`，`beta` 预留给 Beta 收口与 `beta-latest`，`main` 负责当前公开滚动镜像 `latest`。
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
- 四个写接口与 `/sub*` 订阅读取现已在 HTTP 层分别使用最简 per-IP token bucket；`CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE` 与 `CHAIN_SUBCONVERTER_READ_REQUESTS_PER_MINUTE` 默认都为 `60 req/min`，分别可调或设 `0` 关闭。
- 发布工作流与 CI 现已按 `dev / beta / main` 三线调整：`main -> latest`、`beta -> beta-latest`、`dev -> workflow_dispatch 手动 dev-latest 镜像（保留快路径）`。

## 当前缺口

- **发布 `v3.0.0-beta.2`**：`dev` 已含 4 个待发布 commit（Stage 2 列宽/状态、fixture 与 include-exclude E2E、文档）；待 `beta` 合并、tag、CI 镜像与（可选）第三方 digest 更新。
- `docs/temp/` 仅保留 `README.md` 入 Git；2026-05-22 已删除本地讨论稿（frontend workflow / blocking E2E），结论见 [test-system-review.md](../testing/test-system-review.md)。
- 进入 Beta 冻结并完成 W3 回归归档后，将 [plan/3.0-release-stabilization.md](../plan/3.0-release-stabilization.md) 剩余条目并入本页并删除该 plan 文件（见 [docs/README.md](../README.md) `plan/` 约定）。
- 第三方设备回归记录已于 **2026-05-23** 归档（内网 / 公网 / 双 Docker，见 [third-party-deployments.md](../testing/third-party-deployments.md)）；beta.2 发布后建议抽样复跑默认 `/` smoke 并更新 digest。
- 真实前端验收仍依赖外部模板、外部订阅源与运行镜像状态，可复现性仍待继续固化。
- 浏览器级 E2E：blocking 仍为两条 mocked smoke（default + port-forward happy path）；另增 `include-exclude-filter` 集成用例（非 blocking，发布前可选跑）。
- B/C 方案尚未把 workflow log 的视觉形态统一到与默认 `/` 同一产品口径；当前共享语义已统一，但方案层呈现仍待继续收口。
- 模板 URL 的最小 SSRF 拒绝名单、`USER_FACING_BASE_URL` 优先且缺省自动推断、以及读/写基础限速已落地；剩余安全缺口主要是更严格的出站控制、部署侧 egress 收敛与发布前验证记录。

## 测试基线补充

- 固定回归基线已扩展到两套并列 fixture：
	- `3pass-ss2022-test-subscription`：Smoke fixture，最小默认回放与 deployed smoke 默认输入
	- `dual-landing-chain-port-forward`：Comprehensive fixture，覆盖双落地、双中转订阅、双 relay、`stage1/convert` API 金样与长/短链接回放
- Go 测试现已为 `dual-landing-chain-port-forward` 补齐 `internal/api` handler happy path 回放：`stage1/convert`、`short-links`、`resolve-url`（long URL / short URL），并继续由 `internal/service` / `internal/review` 持有对应的语义与 artifact 回归。
- 前端已引入 Vitest，当前覆盖 `web/src/lib/stage1.ts`、`web/src/lib/stage2.ts`、`web/src/lib/state.ts`、`web/src/lib/notices.ts` 与 `web/src/hooks/useAppWorkflow.ts` 的纯业务逻辑单测。
- `web` 已新增两条 mocked Playwright smoke spec，默认通过 `playwright.config.ts` 复用 `./scripts/dev-up.sh default` 的固定端口运行时。
- CI（`ci.yml`）：`go test`、review/worker fixture freshness、`Web Unit Test`（Vitest）、`web-mock-e2e`（`test:e2e:mock`，blocking）、四 scheme build、`compose config`。详见 [testing/test-system-review.md](../testing/test-system-review.md)。

## 最近验证

> 更早命令记录见 Git 历史；本段只保留近两周摘要。

- `2026-05-25`: `dev` 相对 `v3.0.0-beta.1` 含 4 commit（Stage 2 列宽/状态、dual-landing fixture、include-exclude E2E、文档）；发布前按 [release-runbook.md](../testing/release-runbook.md) 跑自动化基线
- `2026-05-24`: 发布 `v3.0.0-beta.1`（`RELEASES.md` + README）
- `2026-05-23`: 第三方部署回归记录收口为内网 / 公网 / 双 Docker 三种形态（见 `third-party-deployments.md`）
- `2026-05-22`: Worker 公网 `Landing-Subscription?target=URI` 复核 **7** 行
- `2026-05-21`: dual-landing 全链路 — `testfixturegen`、`go test`（api / review / service）、`cd web && npm run test`、`npm run test:e2e`（default + port-forward happy path）
- `2026-05-18`: 容器化 Playwright against `./scripts/dev-up.sh default`；`npm test`；dual-landing review/service 回放
- `2026-05-17`: 本地 `beta` 分支；`go test ./...`；四 scheme build；`compose config`；`ci.yml` / `docker-publish.yml` 切到 `dev / beta / main`

## 相关文档

- 阶段顺序与整体路线：[`docs/ROADMAP.md`](../ROADMAP.md)
- 权威边界与契约：[`docs/spec/`](../spec/)
- 当前执行计划：[`docs/plan/3.0-release-stabilization.md`](../plan/3.0-release-stabilization.md)
- Beta 前置条件：[`docs/progress/beta-readiness.md`](beta-readiness.md)
- 本地 UI 启动与 smoke 入口：[`docs/testing/local-dev-smoke.md`](../testing/local-dev-smoke.md)
- 当前发布与回归 runbook：[`docs/testing/release-runbook.md`](../testing/release-runbook.md)
- 第三方设备 Compose 启动命令：[`deploy/README.md`](../../deploy/README.md)
