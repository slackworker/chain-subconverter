# 测试体系

状态与 backlog 见 [../STATUS.md](../STATUS.md)。本文定义统一测试术语、四象限入口与 CI 门禁映射。

## 我想…

| 我想… | 只读 |
|------|------|
| 了解测试分层与 CI 门禁 | 本文 |
| 本地开发 / 发版前跑命令 | [runbook.md](runbook.md) |
| 改金样 / 理解 Smoke 与 Full 场景 | [fixtures.md](fixtures.md) |
| 查第三方设备回归结论 | [deployments.md](deployments.md) |
| 在线预览粘贴假数据 | [preview-inputs.md](preview-inputs.md) |

## 统一术语

测试仅使用二维命名：`mock/real × smoke/full`。

| 实例 | 入口命令 | 用途 | 阻塞性 |
|---|---|---|---|
| `mock-smoke` | `cd web && npm run test:e2e:mock:smoke` | mocked API 最小主链路回归（默认主线 + 端口转发主线） | blocking |
| `mock-full` | `cd web && npm run test:e2e:mock:full` | mocked API 复杂编排语义回归（副本、聚合组、fallback 顺序） | blocking |
| `real-smoke` | `cd web && CHAIN_SUBCONVERTER_E2E_BASE_URL=<url> CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 npm run test:e2e:real:smoke` | 真实部署最小链路验证 | non-blocking |
| `real-full` | `cd web && CHAIN_SUBCONVERTER_E2E_BASE_URL=<url> CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 npm run test:e2e:real:full` | 真实部署复杂流程轻量验证（聚合配置可接受、可生成、可回放） | non-blocking |

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

### `ci.yml`（PR + push 到 `dev` / `beta` / `main`）

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

- `Publish Validation` 默认等待同 SHA 的 `ci.yml` 成功后再构建镜像。
- 保留 `dev-latest` 手动发布快路径（跳过 validation）；其它发布路径继续复用同一 CI 门禁。

## `mock-full` / `real-full` 约束

- `mock-full` 必须断言：
  - 副本创建后 `stage2Snapshot.rows` 行语义正确；
  - 聚合组写入 `stage2Snapshot.serverAggregationGroups`；
  - fallback 顺序重排后 `memberRowIds` 顺序与 UI 配置一致。
- `real-full` 保持轻量：
  - 不做脆弱拖拽手势断言；
  - 至少校验聚合配置已被接受，并在 generate / resolve 回放链路中保持一致。

## fixture 维护流水线

只改 canonical：

1. 修改 `testdata/canonical-scenarios/*.stage1.json`
2. `go run ./cmd/testfixturegen -repo-root .`
3. `cd deploy/test-fixtures-worker && npm run sync && npm run check`
4. `go test ./...`

场景细则见 [fixtures.md](fixtures.md)；在线预览粘贴数据由 worker `sync/check` 生成 [preview-inputs.md](preview-inputs.md)（勿手改正文）。
