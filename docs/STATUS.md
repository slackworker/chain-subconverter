# 项目状态

> 最近更新：2026-07-17 · **3.2 Beta 线** 最新 tag [`v3.2.0-beta.3`](../RELEASES.md#v320-beta3) · **dev** 日常集成 · **beta** 预发布收口 · **main** 止于 [`v3.0.0-beta.4`](../RELEASES.md#v300-beta4)（**尚无 v3.0 正式版 / GA**）

**唯一**状态快照：维护期结论、backlog、最近验证。阶段见 [ROADMAP.md](ROADMAP.md)；发版检查见 [testing/runbook.md](testing/runbook.md)。

## 当前结论

- **3.2 Beta 线最新 tag**：[`v3.2.0-beta.3`](../RELEASES.md#v320-beta3)（beta 线重整：v3.1 聚合 + v3.2 行身份 + 聚合组注入 + Docker CI；Beta 发版不同步 `main`）
- **3.1 Beta 线**：[`v3.1.0-beta.1`](../RELEASES.md#v310-beta1)（止于 beta.1）
- **3.0 Beta 线**：[`v3.0.0-beta.1`](../RELEASES.md#v300-beta1) … [`v3.0.0-beta.4`](../RELEASES.md#v300-beta4)（止于 beta.4）
- **Phase 0–4 已完成**；维护期以 3.2 Beta 发版收口、回归与测试/文档债为主
- 默认 **`/`**（`default`）；`/ui/b1`、`/ui/b2`、`/ui/c1`、`/ui/c2` 为四路探索性方案（见 [spec 02 §方案分级](spec/02-frontend-spec.md)）
- 分支：`dev`（日常集成 · `dev-latest` 手动）· `beta`（预发布 · `beta-latest`）· `main`（稳定线 · `latest`；当前止于 v3.0.0-beta.4，**无 v3.0 GA**）
- 契约与实现边界： [spec/02–05](spec/)（含 Pipeline hard-break、长链 v5、恢复冲突、snapshot-first 三 pass、stage2 复制/改名/行序、server 聚合；§3.3.3 仅向直接包含该聚合全部成员的 select 注入，见 [04 §1.1.3 / §1.3 / §2.1.2 / §2.7 / §3.2.1 / §3.3.3](spec/04-business-rules.md)；`resolve-url` 旧版 Stage1 尽力还原见 [06 §7](spec/06-stage2-model.md)）

## 分支与提交流程

日常开发走 **dev → beta →（择机）main**。Beta 维护期内**不要求**按路径拆分「公共上 main、方案留 dev」。

| 分支 | 用途 | 镜像 | 日常开发 |
|------|------|------|----------|
| `dev` | 全产品集成：后端、共享前端、`default`、探索方案 `b1`–`c2` | `dev-latest`（手动） | **是** |
| `beta` | 选定 `dev` 快照后的预发布回归与 Beta tag | `beta-latest` | 否 |
| `main` | 稳定线；`latest` 镜像；Beta 晋级前刻意落后 | `latest`（CI） | 否 |

### 提交约定

- **日常改动**：直接提交 `dev`。后端、共享层、`default`、探索方案可在同一 commit 内集成验证。
- **推 `dev`**：触发 CI；需要预览镜像时手动发布 `dev-latest`。
- **`beta` 收口**：回归通过后，将已验证 `dev` 快照合入 `beta` 并打 Beta tag（见 [runbook.md](testing/runbook.md)）。Beta 发版**不同步** `main`（见 [RELEASES.md](../RELEASES.md)）。
- **同步 `main`**：单独里程碑（如 v3.0 GA 或整条 Beta 线晋级稳定线）。当前 `main` 止于 [`v3.0.0-beta.4`](../RELEASES.md#v300-beta4)，仓库**从未发布 v3.0 正式版**；届时整包快进或 merge，而非日常按目录拆分提交。
- **可选工具**：需把部分已 stage 改动单独落到 `main` 时，可用 `scripts/commit-current-changes-to-main.sh` 或 VS Code 任务 `git: commit staged changes to main`；非日常流程。

同一 `dev` 分支可同时预览 `/`、`/ui/b1`、`/ui/b2`、`/ui/c1`、`/ui/c2`；多 worktree 并行须设 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET`（见 [runbook.md](testing/runbook.md)）。

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

测试口径统一为 `mock/real × smoke/full`；fixture 维护与 CI 分层见 [testing/README.md](testing/README.md)。金样只改 `testdata/canonical-scenarios/*.stage1.json`，再跑 `testfixturegen` + worker `sync/check`。

## 最近验证

> 例行部署结论以 [third-party-deployments.md](testing/third-party-deployments.md) 为准（覆盖写，不滚历史）；更早记录见 Git 历史。正式 tag 见 [RELEASES.md](../RELEASES.md)。

| 类别 | 摘要 |
|------|------|
| **第三方部署** | 2026-07-17：三种形态（vps-01 内网 / vps-02 公网 HTTPS / Koyeb 双 Docker）`dev-latest` @ `1cc49df` **real-smoke + real-full 通过** — 见 [third-party-deployments.md](testing/third-party-deployments.md) |
| **本地自动化基线** | 2026-07-17：`go test ./...`、`npm run test`、`test:e2e:mock:all`、全 scheme build、`docker compose -f deploy/docker-compose.yml config` **通过**；见 [runbook.md](testing/runbook.md) |
