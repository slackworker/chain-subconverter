# 项目状态

> 最近更新：2026-05-29 · 正式 Beta tag **`v3.0.0-beta.3`**；滚动镜像 **`beta-latest`**（digest `sha256:36a8eb9f…`，`beta` @ `86922c3`）

**唯一**状态快照：维护期结论、backlog、最近验证。阶段见 [ROADMAP.md](ROADMAP.md)；发版检查见 [testing/release-runbook.md](testing/release-runbook.md)。

## 当前结论

- **3.0 Beta 线已发布**：[`v3.0.0-beta.1`](../RELEASES.md#v300-beta1)、[`v3.0.0-beta.2`](../RELEASES.md#v300-beta2)、[`v3.0.0-beta.3`](../RELEASES.md#v300-beta3)
- **Phase 0–4 已完成**；维护期以回归与测试/文档债为主
- 默认 **`/`**（`default`）；`/ui/a` 为对照方案；`/ui/b1`、`/ui/b2`、`/ui/c1`、`/ui/c2` 为四路探索性方案（见 [spec 02 §方案分级](spec/02-frontend-spec.md)）
- 分支：`dev`（`dev-latest` 手动）· `beta`（`beta-latest`）· `main`（`latest`）
- 契约与实现边界： [spec/02–05](spec/)（含 snapshot-first 三 pass 与 stage2 复制/改名，见 [04 §1.1.3 / §2.1.2](spec/04-business-rules.md)）

## 分支与提交流程

| 分支 | 用途 | 镜像 |
|------|------|------|
| `main` | 共享层、后端、脚本、部署、文档等**非单一 scheme** 改动 | `latest`（CI） |
| `dev` | `web/src/scheme/a|b1|b2|c1|c2` 方案演进与对照 | `dev-latest`（手动） |
| `beta` | 预发布回归与 Beta tag 收口 | `beta-latest` |

- **纯公共改动**：提交 `main`，再将 `dev` rebase 到最新 `main`。
- **纯方案改动**：提交 `dev`。
- **同轮两类改动**：公共部分先上 `main` 并同步 `dev`，方案部分再上 `dev`；勿混在一个提交里。
- **`beta`**：不作日常开发分支；仅在选定已回归快照后更新，用于 `beta-latest` / Beta tag。

同一分支可同时预览 `/ui/a`、`/ui/b1`、`/ui/b2`、`/ui/c1`、`/ui/c2`；多 worktree 并行须设 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET`（见 [local-dev-smoke.md](testing/local-dev-smoke.md)）。

## 已稳定范围

端到端主流程（转换 → 生成 → 订阅读取/短链）与默认 `/` UI 已落地；本地 `dev-up`、含前端的 Docker 镜像、第三方 Compose 部署可用。细节见 [spec/](spec/)、[deploy/README.md](../deploy/README.md)。

## 维护 backlog（非 P0）

| 项 | 说明 |
|----|------|
| E2E 加深 | blocking 仍为两条 mocked happy path；`include-exclude-filter` 未进 blocking |
| UI 探索方案 B/C | 定位为 `exploratory`（见 [spec 02 §方案分级](spec/02-frontend-spec.md)）；不要求与 default 壳层一致，以业务能力验收为准 |
| 安全 | 基础 SSRF/限速已落地；更严格出站与 egress 待评估 |
| 可复现性 | 验收依赖外部模板/订阅；`subconverter` 浮动 tag 须在回归记录中注明 |
| 反馈 | Issue + [third-party-deployments.md](testing/third-party-deployments.md) 归档 |

## 测试基线

Smoke / Comprehensive 两套 fixture 与 CI 分层见 [testing/test-system-review.md](testing/test-system-review.md)。金样只改 `testdata/canonical-scenarios/*.stage1.json`，再跑 `testfixturegen` + worker `sync/check`。

## 最近验证

> 更早记录见 Git 历史。

| 日期 | 摘要 |
|------|------|
| 2026-05-29 | 文档/发版口径 **`v3.0.0-beta.3`**（落地副本 + Stage 2 行复制/`rowId`）；vps-01/02 滚动 `beta-latest` + `deployed-smoke` **通过**（digest `sha256:36a8eb9f…`；subconverter 维持 `sha256:c7073588…` / `v0.9.2`） |
| 2026-05-27 | snapshot-first + stage2 `rowId`/复制行：spec 对齐；`go test ./...`、`npm test`、`test:e2e:mock` **通过** |
| 2026-05-25 | `v3.0.0-beta.2`；vps-01/02 `beta-latest` + `deployed-smoke` **通过**（digest `sha256:afa71279…`） |
| 2026-05-24 | `v3.0.0-beta.1` |
| 2026-05-23 | 第三方回归：内网 / 公网 / 双 Docker |
| 2026-05-22 | Worker 公网 `Landing-Subscription?target=URI` 复核 7 行 |
| 2026-05-21 | dual-landing 全链路自动化通过 |
