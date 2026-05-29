# 测试体系 Review

本文只说明当前推荐保留的轻量测试结构、各层职责与维护边界。

状态与 backlog 见 [../STATUS.md](../STATUS.md)；本文只写测试分层与 fixture 流水线。

文中 `Smoke / Comprehensive` 指测试分层；`3pass-ss2022-test-subscription` 与 `dual-landing-chain-port-forward` 仍是底层 fixture ID，不在本轮文档收口中重命名。

## 目标

- 个人项目优先保留低维护成本、可快速定位问题的测试层次。
- 自动化优先覆盖纯业务逻辑、固定 fixture 回放和少量稳定的浏览器 happy path。
- 真实部署 smoke 保留为发布前 / 第三方设备回归步骤，不进日常 blocking baseline。

## 当前结构

1. Go 测试：主回归网。
   - 入口：`go test ./...`
   - 职责：服务逻辑、API handler 固定 fixture 回放、长/短链接恢复、review artifact 构建。
   - 固定场景：`3pass-ss2022-test-subscription` 与 `dual-landing-chain-port-forward`。
2. Web unit：纯逻辑补位。
   - 入口：`cd web && npm run test`
   - 当前重点：`stage1.ts`、`stage2.ts`、`state.ts`、`notices.ts`、`hooks/useAppWorkflow.ts`。
   - 职责：输入归一化、payload / restore 语义、relay 互斥与 target 选择等不值得放进浏览器层的规则。
3. Mocked Playwright：稳定的浏览器级 smoke。
   - 入口：`cd web && npm run test:e2e -- default-happy-path.spec.ts port-forward-happy-path.spec.ts`
   - 职责：验证默认 `/` 的主线 happy path，以及 port-forward 的关键交互与恢复路径。
   - 约束：只测 deterministic mocked API，不扩成大规模矩阵。
4. Real deployed smoke：手动发布前检查。
   - 入口：`cd web && CHAIN_SUBCONVERTER_E2E_BASE_URL=<url> CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 npm run test:e2e -- deployed-smoke.spec.ts`
   - 职责：确认真实部署的 healthz、convert、generate、short-link、resolve 与 `/sub` 下载链路仍可用。

## CI 门禁（当前）

权威来源：`.github/workflows/ci.yml`、`.github/workflows/docker-publish.yml`。

### `ci.yml`（PR + 推送到 `dev` / `beta` / `main`）

并行 job：

| Job | 命令 / 动作 |
|-----|-------------|
| Go Test | `go test ./...` |
| Fixture Freshness | `go run ./cmd/testfixturegen -repo-root .`，再 `git diff --exit-code -- internal/review/testdata` |
| Worker Fixture Freshness | `deploy/test-fixtures-worker` 内 `npm run check`（校验 canonical → Worker 公网快照未漂移） |
| Web Unit Test | `cd web && npm run test`（Vitest） |
| Web Build (release baseline) | **blocking**：`build:default`、`build:a`（发布默认与对照基线，见 [spec 02 §方案分级](../spec/02-frontend-spec.md)） |
| Web Build (exploratory) | **非 blocking**（`continue-on-error`）：`build:b1` / `build:b2` / `build:c1` / `build:c2`；失败不挡 `beta` / `main` / tag 发布 |
| Web Mock E2E | `cd web && npm run test:e2e:mock`（job `web-mock-e2e`，**blocking**） |
| Compose Config | `docker compose -f deploy/docker-compose.yml config` |

**刻意不作为 blocking 门禁**：`go test -race`、覆盖率门槛 / 报告、`golangci-lint` 或前端 lint、带真实 `subconverter` 的 Compose 集成 job、deployed smoke（见下文「当前缺口」）。Mocked Playwright 仅保留两条稳定 happy path，并已纳入 blocking CI。

### `docker-publish.yml`（推 `beta` / `main` 或 tag 时发镜像）

`validate` job 在 **push** 与绝大多数 `workflow_dispatch` 手动发布时都不重复跑测试命令，而是轮询等待同 commit SHA 的 `ci.yml` workflow run **成功**（超时约 30 分钟）。因此 `beta` / `main` / tag 发布，以及非 `dev-latest` 的手动发布，都会间接要求 `ci.yml` 的 blocking job 全绿，含 Go test、fixture freshness、Vitest、mock E2E、`default`/`a` 双 scheme build、`compose config` 等；探索性 `b1`/`b2`/`c1`/`c2` build 在独立 job 中跑但不挡门禁。

**刻意保留的例外**：`workflow_dispatch` 中仅 `image_tag=dev-latest` 的开发线手动发布会跳过 `validate`，用于保留开发阶段的快速构建路径；其它手动发布与 push 发布继续共用同一条 CI 门禁。

推 `beta` / `main` 时通常与 `ci.yml` **同时触发**（独立 workflow）；除 `dev-latest` 手动快路径外，镜像构建以 `ci.yml` 成功为门禁。

## 当前结论

- 不引入组件测试框架，不引入覆盖率门槛，不把真实部署 E2E 放进 blocking CI。
- fixture 分层口径统一为：
   - `Smoke` = `3pass-ss2022-test-subscription`，用于最小默认回放、快速故障定界与 deployed smoke 默认输入
   - `Comprehensive` = `dual-landing-chain-port-forward`，用于双落地 / 双中转 / template / port-forward / Worker 相关复杂覆盖
   - 新功能默认先看是否能落在 `Smoke`；只有明显依赖复杂拓扑时才只补 `Comprehensive`
- `Comprehensive` 当前已补齐 dual-landing 的 `stage1/convert` API golden，以及 `internal/api` 对 `stage1/convert`、`short-links`、`resolve-url`（long URL / short URL）的 handler-level happy path 回放。
- 浏览器层只保留少量 mocked smoke：
  - `default-happy-path.spec.ts`：默认最小 happy path
  - `port-forward-happy-path.spec.ts`：port-forward 开关、relay 标签、互斥选择、generate / restore
- `testdata/canonical-scenarios/` 继续作为 Stage 1 场景源头：
   - `3pass-ss2022-test-subscription`：Smoke fixture
   - `dual-landing-chain-port-forward`：Comprehensive fixture
- `cmd/testfixturegen` 与 worker fixture sync 继续保留为派生链路；**派生漂移**由 `ci.yml` 的 `fixture-freshness` / `worker-fixture-freshness` 守门（`testfixturegen` 后 diff、`npm run check`）。
- 对仓库内 tracked 的 `internal/review/testdata/<scenario>/`，`review.LoadCase` / `LoadStage1Case` 现在会优先从对应的 `testdata/canonical-scenarios/<scenario>.stage1.json` 构造 `service.Stage1Input`。
- `internal/review/testdata/*/stage1/input/*` 继续保留为生成的审计材料、人工 review 入口与 CI freshness 目标；原有文件解析只作为临时目录、ad hoc fixture 或缺失 canonical 文件时的兼容回退。

## Fixture 维护单条流水线（新人只记这一条）

| 触发条件 | 只改哪里 | 固定命令（按顺序） | 结果判定 |
|-----|------|------|------|
| 改场景语义（默认） | `testdata/canonical-scenarios/*.stage1.json` | `go run ./cmd/testfixturegen -repo-root .`<br>`cd deploy/test-fixtures-worker && npm run sync && npm run check`<br>`go test ./...` | 三步全绿，即 canonical 与三类派生（review / worker / manual-doc）一致 |
| 编排/转换语义变化（可选重录） | 在上行基础上，重录 review frozen | 见下节「Frozen 重录（runbook）」二选一 | frozen 与当前语义一致，review 回放不再误报 |

维护心智模型统一为：`1 个编辑点（canonical） + 3 种派生（review / worker / manual-doc） + 1 类可选重录（frozen）`。

- `manual-doc`：`docs/testing/dual-landing-manual-reference.md`，由 `deploy/test-fixtures-worker` 的 `npm run sync` / `npm run check` 从 canonical + review frozen 生成，供 README 在线体验链出；勿手改正文。

## Frozen 重录（runbook，二选一）

前置：先完成上一节的固定流水线，再判断是否需要重录 frozen。

### A. 有本地 live `subconverter`（推荐）

适用：本机可访问 `subconverter`（例如 `http://127.0.0.1:25500/sub?`）。

1. 按场景执行：

   ```bash
   go run ./cmd/testfixturegen -scenario <scenario-id> -stage1-live-base-url http://127.0.0.1:25500/sub?
   ```

2. 执行 `go test ./...` 确认回放通过。

说明：`cmd/testfixturegen` 已支持 `-stage1-live-base-url`，用于重录 review 的 Stage 1 frozen outputs；当前会写回 tracked 的 `stage1/output/{landing,transit,full-base}.*` 与 `stage1-convert.{request,response}.json`，但不会覆盖 curated 的 `stage2/input/stage2-snapshot.json`。

### B. 无 live `subconverter`（兜底）

适用：当前环境无法连到 live subconverter。

1. 手工更新对应场景下 `stage1/output`、`stage2/output` 的 JSON/YAML frozen 文件。
2. 用差异对比确认改动仅覆盖预期语义（可用现有 diff 脚本或逐文件比对）。
3. 执行 `go test ./...` 确认回放通过。

## 当前缺口

- `dev-latest` 手动发布仍保留跳过 `validate` 的快路径；这是当前刻意接受的开发效率换风险边界，不应复用于 `beta-latest` / `latest`。
- `stage2-snapshot` 等 frozen 金样是否需重录不由 CI 判定（设计边界）；见上文 Frozen 重录 runbook。
- deployed smoke 仍依赖手动运行与真实环境，不追求 PR 级自动化。
- 更广 scheme 矩阵、阻断错误路径与视觉一致性检查继续保持非阻塞项。
- 阻断路径 E2E（非 blocking）：沿用 mocked API，在 `default` scheme 补 3～5 条「接线原型」spec（如 `stage1_field` convert 失败、`stage3_action` short-links 失败、`global` 503）；业务语义仍以 Go + Vitest 为主，勿扩成 code × scheme 矩阵。实现后更新 `package.json` 的 `test:e2e:mock` 文件列表。