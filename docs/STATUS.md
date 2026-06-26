# 项目状态

> 最近更新：2026-06-26 · **3.0 线** 正式 Beta tag [`v3.0.0-beta.4`](../RELEASES.md#v300-beta4) 已发布 · **3.1 Beta 线** [`v3.1.0-beta.1`](../RELEASES.md#v310-beta1草稿) **准备中**（dev HEAD，尚未打 tag）

**唯一**状态快照：维护期结论、backlog、最近验证。阶段见 [ROADMAP.md](ROADMAP.md)；发版检查见 [testing/release-runbook.md](testing/release-runbook.md)。

## 当前结论

- **3.0 Beta 线已发布**：[`v3.0.0-beta.1`](../RELEASES.md#v300-beta1) … [`v3.0.0-beta.4`](../RELEASES.md#v300-beta4)（止于 beta.4；`main` 尚未同步 3.0 稳定线）
- **3.1 Beta 准备中**：下一目标 [`v3.1.0-beta.1`](../RELEASES.md#v310-beta1草稿)（聚合组、切换优化、emoji 预处理、长链 v3、default UI）；**本轮发版仅更新 `beta` / `beta-latest`，不同步 `main`**
- **Phase 0–4 已完成**；维护期以 3.1 Beta 收口、回归与测试/文档债为主
- 默认 **`/`**（`default`）；`/ui/b1`、`/ui/b2`、`/ui/c1`、`/ui/c2` 为四路探索性方案（见 [spec 02 §方案分级](spec/02-frontend-spec.md)）
- 分支：`dev`（`dev-latest` 手动）· `beta`（`beta-latest`）· `main`（`latest`）
- 契约与实现边界： [spec/02–05](spec/)（含 snapshot-first 三 pass、stage2 复制/改名、server 聚合，见 [04 §1.1.3 / §2.1.2 / §2.7](spec/04-business-rules.md)）

## 分支与提交流程

| 分支 | 用途 | 镜像 |
|------|------|------|
| `main` | 共享层、后端、脚本、部署、文档等**非单一 scheme** 改动 | `latest`（CI） |
| `dev` | `web/src/scheme/b1|b2|c1|c2` 方案演进 | `dev-latest`（手动） |
| `beta` | 预发布回归与 Beta tag 收口 | `beta-latest` |

- **纯公共改动**：提交 `main`，再将 `dev` rebase 到最新 `main`。
- **纯方案改动**：提交 `dev`。
- **同轮两类改动**：公共部分先上 `main` 并同步 `dev`，方案部分再上 `dev`；勿混在一个提交里。
- **`beta`**：不作日常开发分支；仅在选定已回归快照后更新，用于 `beta-latest` / Beta tag。**v3.1.0-beta.1 发版轮次只合并 `dev→beta`，不推进 `main`。**

同一分支可同时预览 `/ui/b1`、`/ui/b2`、`/ui/c1`、`/ui/c2`；多 worktree 并行须设 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET`（见 [local-dev-smoke.md](testing/local-dev-smoke.md)）。

## 已稳定范围

端到端主流程（转换 → 生成 → 订阅读取/短链）与默认 `/` UI 已落地；本地 `dev-up`、含前端的 Docker 镜像、第三方 Compose 部署可用。细节见 [spec/](spec/)、[deploy/README.md](../deploy/README.md)。

## 维护 backlog（非 P0）

| 项 | 说明 |
|----|------|
| E2E 加深 | blocking 仍为两条 mocked happy path；`include-exclude-filter` 未进 blocking |
| UI 探索方案 B/C | 定位为 `exploratory`（见 [spec 02 §方案分级](spec/02-frontend-spec.md)）；不要求与 default 壳层一致，以业务能力验收为准 |
| 日志 UI 去重 | 探索性 scheme（b2 等）Notice 与 LogPanel 对同一 `messages[]` 仍可能重复展示；维护期择机收敛 |
| 可配置 LOG_LEVEL | 运维 stderr 尚无 `LOG_LEVEL` 与可选文件输出；当前为结构化 slog 固定 INFO |
| 安全 | 基础 SSRF/限速已落地；更严格出站与 egress 待评估 |
| 可复现性 | 验收依赖外部模板/订阅；`subconverter` 浮动 tag 须在回归记录中注明 |
| 反馈 | Issue；部署失败或未解问题写在 [third-party-deployments.md](testing/third-party-deployments.md) 对应节 |

## 测试基线

Smoke / Comprehensive 两套 fixture 与 CI 分层见 [testing/test-system-review.md](testing/test-system-review.md)。金样只改 `testdata/canonical-scenarios/*.stage1.json`，再跑 `testfixturegen` + worker `sync/check`。

## 最近验证

> 例行部署结论以 [third-party-deployments.md](testing/third-party-deployments.md) 为准（覆盖写，不滚历史）；更早记录见 Git 历史。正式 tag 见 [RELEASES.md](../RELEASES.md)。**下一轮第三方回归目标：`v3.1.0-beta.1` @ `beta-latest`（待发 tag，勿伪造 digest）。**

| 类别 | 摘要 |
|------|------|
| **第三方部署** | 2026-06-26 vps-01/02 **`dev-latest`** `test:e2e:real:release` **通过**（见 [third-party-deployments.md](testing/third-party-deployments.md)）；正式 **beta** 线待发 tag 后复验 |
| **本地自动化基线** | 2026-06-25 release-runbook：`go test ./...`、Vitest 134、`test:e2e:mock` 4、`build:default`–`c2`、`docker compose config` **通过** |
