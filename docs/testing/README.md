# 测试体系

状态与 backlog 见 [../STATUS.md](../STATUS.md)。本文定义统一测试术语、四象限入口与 CI 门禁映射。

## 我想…

| 我想… | 只读 |
|------|------|
| 了解测试分层与 CI 门禁 | 本文 |
| 本地开发 / 发版前跑命令 | [runbook.md](runbook.md) |
| 改金样 / 理解 Smoke 与 Full 场景 | [fixtures.md](fixtures.md) |
| 查第三方设备回归结论 | [third-party-deployments.md](third-party-deployments.md) |
| 在线预览粘贴假数据 | [preview-inputs.md](preview-inputs.md) |

## 统一术语

测试仅使用二维命名：`mock/real × smoke/full`。

| 实例 | 入口命令 | 用途 | 阻塞性 |
|---|---|---|---|
| `mock-smoke` | `cd web && npm run test:e2e:mock:smoke` | mocked API 最小主链路回归（默认主线 + 端口转发主线） | blocking |
| `mock-full` | `cd web && npm run test:e2e:mock:full` | mocked API 复杂编排语义回归（副本、聚合组、fallback 顺序） | blocking |
| `real-smoke` | `cd web && CHAIN_SUBCONVERTER_E2E_BASE_URL=<url> CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 npm run test:e2e:real:smoke` | 真实部署最小链路；默认 Stage1 与 [preview-inputs.md](preview-inputs.md) 一致 | non-blocking |
| `real-full` | `cd web && CHAIN_SUBCONVERTER_E2E_BASE_URL=<url> CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 npm run test:e2e:real:full` | 真实部署按 preview-inputs 手工路径跑 Stage2 金样，并核对 short ID / long URL payload | non-blocking |

聚合入口：

- `cd web && npm run test:e2e:mock:all`
- `cd web && npm run test:e2e:real:all`

日常最小示例：`cd web && npm run test:e2e:mock:smoke`（完整命令见 [runbook.md](runbook.md)）。

## 分层职责

1. Go 测试：`go test ./...`（核心业务语义与回放主回归网）。
2. Web unit（Vitest）：`cd web && npm run test`（前端状态与语义细节）。
3. Web E2E（四象限）：按上表执行。

## CI 门禁映射

权威文件：`.github/workflows/ci.yml`、`.github/workflows/docker-publish.yml`。

### `ci.yml`（PR + push 到 `dev` / `beta` / `main`；不在 tag push 上重复执行）

blocking job：

- `Go Test` → `go test ./...`
- `Fixture Freshness` → `go run ./cmd/testfixturegen -repo-root .` + `git diff --exit-code -- internal/review/testdata`
- `Worker Fixture Freshness` → `deploy/test-fixtures-worker` 内 `npm run check`
- `Web Unit Test` → `cd web && npm run test`
- `Web E2E Mock Smoke` → `cd web && npm run test:e2e:mock:smoke`
- `Web E2E Mock Full` → `cd web && npm run test:e2e:mock:full`
- `Web Build (release baseline)` → `cd web && npm run build:default`
- `Compose Config` → `docker compose -f deploy/docker-compose.yml config`

non-blocking job：

- `Web Build (exploratory, non-blocking)` → `build:b1` / `build:b2` / `build:c1` / `build:c2`

### `docker-publish.yml`

- 触发来源：`main` 上 `CI` 成功后 `workflow_run`、push tag `v*`、以及手动 `workflow_dispatch`。
- `main` → `latest`：`CI` 在 `main` 上成功后自动触发镜像构建，不再轮询等待。
- tag / 手动发布（非 `dev-latest`）：`Publish Validation` 一次性校验同 SHA 的 `ci.yml` 已成功。
- 保留 `dev-latest` 手动发布快路径（跳过 validation）；其它发布路径继续复用同一 CI 门禁。
- 通过移除 `beta` 分支上的自动构建，避免“同一 SHA 在 merge `beta` 与打 `v*` tag 时重复构建镜像”。

## `mock-full` / `real-full` 约束

- `mock-full` 必须断言：
  - 副本创建后 `stage2Snapshot.rows` 行语义正确；
  - 聚合组写入 `stage2Snapshot.serverAggregationGroups`；
  - fallback 顺序重排后 `memberRowIds` 顺序与 UI 配置一致。
- `real-full` 一比一还原 [preview-inputs.md](preview-inputs.md)（不接受 Stage1 env 覆盖；覆盖时 skip）：
  - Stage1：落地 URI + SOCKS5 + Worker 中转 URL（含 Sub-2 `?target=ClashMeta`）+ 端口转发；
  - Stage2：按文档操作要点配置副本 / 模式 / 入组（按金样 fallback 顺序勾选入组，避免脆弱拖拽）/ 切换优化；
  - 断言 generate / resolve 的 snapshot 与 short ID、long URL payload 金样一致（见 `real-dual-landing-full-flow.spec.ts`）。
- **E2E spec 变更后**：须重跑第三方 `real-smoke` + `real-full` 再更新 [third-party-deployments.md](third-party-deployments.md) 结论；勿在旧镜像结论上直接标记通过。

## fixture 维护流水线

只改 canonical：

1. 修改 `testdata/canonical-scenarios/`（`*.stage1.json` 与/或 transit `*.uri.txt` 等语料）
2. `go run ./cmd/testfixturegen -repo-root .`
3. `cd deploy/test-fixtures-worker && npm run sync && npm run check`（同步 worker 静态资产与 [preview-inputs.md](preview-inputs.md)；**勿漏**。CI `Worker Fixture Freshness` 跑同一 `check`，正文过期会失败）
4. `go test ./...`

场景细则见 [fixtures.md](fixtures.md)；在线预览粘贴数据由 worker `sync/check` 生成 [preview-inputs.md](preview-inputs.md)（勿手改正文；正文可能因本次改动面不变而无 diff，仍须跑 sync/check）。
