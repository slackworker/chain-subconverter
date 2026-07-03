# 项目状态

> 最近更新：2026-07-03 · **3.2 Beta 线** 最新 tag [`v3.2.0-beta.2`](../RELEASES.md#v320-beta2) 已发布 · **dev 线** 三台设备已切 `dev-latest` @ `78a4477` · **3.1 线** 止于 [`v3.1.0-beta.1`](../RELEASES.md#v310-beta1) · **3.0 线** 止于 [`v3.0.0-beta.4`](../RELEASES.md#v300-beta4)（`main` 尚未同步稳定线）

**唯一**状态快照：维护期结论、backlog、最近验证。阶段见 [ROADMAP.md](ROADMAP.md)；发版检查见 [testing/runbook.md](testing/runbook.md)。

## 当前结论

- **3.2 Beta 线最新 tag**：[`v3.2.0-beta.2`](../RELEASES.md#v320-beta2)（Stage 2 行身份硬切；`rowId` / `proxyName` / `sourceLandingNodeName` 成为唯一快照口径）；本地发版门禁与三种第三方部署形态（vps-01 / vps-02 / Koyeb）均已完成回归
- **3.1 Beta 线**：[`v3.1.0-beta.1`](../RELEASES.md#v310-beta1)（止于 beta.1）
- **3.0 Beta 线**：[`v3.0.0-beta.1`](../RELEASES.md#v300-beta1) … [`v3.0.0-beta.4`](../RELEASES.md#v300-beta4)（止于 beta.4）
- **Phase 0–4 已完成**；维护期以 3.2 Beta 发版收口、回归与测试/文档债为主
- 默认 **`/`**（`default`）；`/ui/b1`、`/ui/b2`、`/ui/c1`、`/ui/c2` 为四路探索性方案（见 [spec 02 §方案分级](spec/02-frontend-spec.md)）
- 分支：`dev`（`dev-latest` 手动）· `beta`（`beta-latest`）· `main`（`latest`）
- 契约与实现边界： [spec/02–05](spec/)（含 Pipeline hard-break、长链 v4、恢复冲突、snapshot-first 三 pass、stage2 复制/改名/行序、server 聚合，见 [04 §1.1.3 / §2.1.2 / §2.7 / §3.2.1](spec/04-business-rules.md)）

## 分支与提交流程

| 分支 | 用途 | 镜像 |
|------|------|------|
| `main` | 共享层、后端、脚本、部署、文档等**非单一 scheme** 改动 | `latest`（CI） |
| `dev` | `web/src/scheme/b1|b2|c1|c2` 方案演进 | `dev-latest`（手动） |
| `beta` | 预发布回归与 Beta tag 收口 | `beta-latest` |

- **纯公共改动**：提交 `main`，再将 `dev` rebase 到最新 `main`。
- **纯方案改动**：提交 `dev`。
- **同轮两类改动**：公共部分先上 `main` 并同步 `dev`，方案部分再上 `dev`；勿混在一个提交里。
- **`beta`**：不作日常开发分支；仅在选定已回归快照后更新，用于 `beta-latest` / Beta tag。

同一分支可同时预览 `/ui/b1`、`/ui/b2`、`/ui/c1`、`/ui/c2`；多 worktree 并行须设 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET`（见 [runbook.md](testing/runbook.md)）。

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
| 反馈 | Issue；部署失败或未解问题写在 [deployments.md](testing/deployments.md) 对应节 |

## 测试基线

测试口径统一为 `mock/real × smoke/full`；fixture 维护与 CI 分层见 [testing/README.md](testing/README.md)。金样只改 `testdata/canonical-scenarios/*.stage1.json`，再跑 `testfixturegen` + worker `sync/check`。

## 最近验证

> 例行部署结论以 [deployments.md](testing/deployments.md) 为准（覆盖写，不滚历史）；更早记录见 Git 历史。正式 tag 见 [RELEASES.md](../RELEASES.md)。

| 类别 | 摘要 |
|------|------|
| **第三方部署** | 2026-07-03：vps-01/02 + Koyeb 已切 **`dev-latest`** @ `78a4477`（`dev` 分支）；`real-smoke` + `real-full` **通过** — 见 [deployments.md](testing/deployments.md) |
| **本地自动化基线** | 2026-07-02：`go test ./...`、`npm run test`、`test:e2e:mock:all`、全 scheme build、`docker compose -f deploy/docker-compose.yml config` **通过**；见 [runbook.md](testing/runbook.md) |
