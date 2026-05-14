# 2026-05-14 Alpha 收口交接

> 本文是整轮对话工作的状态快照，供接手同事继续推进。
> 实时阶段缺口仍以 [STATUS.md](STATUS.md) 和 [beta-readiness.md](beta-readiness.md) 为准。

## 当前分支与提交

- **当前分支**：`dev`
- **最新提交**：`26f9762 feat(security): add REQUIRE_PUBLIC_BASE_URL configuration and validation for public base URL requirement`
- **所有本轮提交**（从老到新）：

| 提交 | 说明 |
|------|------|
| `9df18f3` | CI 守门 + 发布工作流切 `release/3.0` |
| `85a9d25` | JSON body 上限（256 KiB）+ HTTP 服务超时 |
| `3d72cf2` | 模板 URL 默认拒绝私网/loopback 地址 |
| `26f9762` | `RequirePublicBaseURL` 启动闸门 |

- **工作区状态**：有未提交改动（四 API per-IP rate limiting + 文档同步）。

## 本轮已完成

### 1. 发布线与文档口径统一（W0–W1）

- 所有主入口文档已从 `alpha` 长期分支改为 `release/3.0` + tag 驱动模型。
- 默认入口统一为 `/`（`default` scheme），`/ui/a|b|c` 降级为实验入口。
- 受影响文件：`README.md`、`RELEASES.md`、`deploy/README.md`、`docs/README.md`、`docs/ROADMAP.md`、`web/README.md`、`docs/plan/3.0-alpha-cutover.md`、`docs/progress/STATUS.md`、`docs/testing/alpha-release.md`。

### 2. CI 与构建闸门（W2）

- 新增 `.github/workflows/ci.yml`：PR/push 触发 `go test ./...`、四 scheme 前端构建（`default/a/b/c`）、`docker compose config`。
- `.github/workflows/docker-publish.yml` 的 Alpha job 已从 `alpha` 分支切到 `release/3.0`。
- `web/package.json` 新增 `build:default` 与 `dev:default`。

### 3. 安全 hardening — 已完成（W3）

以下五项代码已落地、测试已通过、部署文档已同步：

| 项 | 文件 | 说明 |
|----|------|------|
| JSON body 上限 | `internal/api/server.go` | `decodeJSONBody` 统一限制 256 KiB |
| HTTP 服务超时 | `cmd/server/main.go` | `ReadTimeout 15s / WriteTimeout 30s / IdleTimeout 60s` |
| 模板 URL 私网拦截 | `internal/service/managed_conversion_source.go` | 默认拒绝 loopback/link-local/RFC1918/ULA/multicast/unspecified；`CHAIN_SUBCONVERTER_TEMPLATE_ALLOW_PRIVATE_NETWORKS=true` 显式放行 |
| PUBLIC_BASE_URL 启动闸门 | `internal/config/server.go` | `CHAIN_SUBCONVERTER_REQUIRE_PUBLIC_BASE_URL=true` 时，未设 PUBLIC_BASE_URL 则启动失败 |
| 四 API 基础限速 | `internal/api/rate_limit.go`、`internal/config/server.go` | `POST /api/stage1/convert`、`/api/generate`、`/api/short-links`、`/api/resolve-url` 共享 per-IP token bucket；默认 `60 req/min`，`CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE=0` 可关闭 |

### 4. 安全文档化

- 新建 `SECURITY.md`：威胁模型、部署假设、已知边界、运维建议、报告方式。
- `deploy/README.md` 已写明所有新增安全开关的用途与使用场景。

### 5. Compose 部署拓扑补全

- `deploy/docker-compose.yml` 已为 `app` 与 `subconverter` 引入独立共享网络 `subconverter-backend`，默认继续优先使用一体化 Compose 内部部署。
- `deploy/README.md` 已补充“双 Docker 分离部署（可选）”口径：允许独立 Docker 化 `subconverter`，但要求显式保证 `CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL` 与 `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 的双向可达性。
- `docs/spec/05-tech-stack.md`、`docs/testing/alpha-release.md`、`docs/progress/STATUS.md` 已同步更新为“默认一体化 Compose，允许双 Docker 分离部署”的一致口径。

### 6. 四 API 最小 rate limiting

- `internal/api/rate_limit.go` 已落地最简 per-IP token bucket，覆盖 `POST /api/stage1/convert`、`/api/generate`、`/api/short-links`、`/api/resolve-url`。
- `internal/config/server.go` 新增 `CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE`；默认 `60`，设为 `0` 可关闭。
- `docs/spec/03-backend-api.md`、`deploy/README.md`、`SECURITY.md`、`docs/progress/STATUS.md` 已同步更新 `429 RATE_LIMITED` 与部署变量口径。

### 7. 旧文档清理（phase-4 迁移）

- `docs/plan/phase-4-breakdown.md` 与 `docs/plan/phase-4-dev-readiness.md` 已迁移至 `docs/temp/completed-phases/`。
- `docs/README.md` 主导航已移除 `phase-4-*` 历史计划入口。
- `docs/plan/3.0-alpha-cutover.md`、`docs/progress/beta-readiness.md` 已改为新路径引用。

## 本轮未完成（接手后优先推进）

### 紧邻最高优先

1. **旧文档清理**：`_legacy/` 应迁出仓库（打 tag 后删除）；`docs/temp/` 内已 gitignore 的临时文件需清理。

### 中优先

4. **W4 第三方设备发布演练**：在干净设备上按 `deploy/README.md` 冷启动，使用不可变 tag（如 `v3.0.0-alpha.1`），跑完整的 default + A/B/C 回归并记录到 STATUS。
5. **W5 反馈 SOP**：创建 `.github/ISSUE_TEMPLATE/alpha-feedback.md`，在 `docs/testing/alpha-release.md` 末尾补 Alpha → Beta 退出口径。
6. **Beta 镜像策略**：`docker-publish.yml` 目前只有 `alpha-latest` job；需补 `beta-latest` 或等价策略。

### 低优先 / 跟踪项

6. `docs/temp/completed-phases/phase-4-dev-readiness.md` 仍有 `alpha` 分支旧口径，虽已降级为历史参考但建议直接修正或移走。
7. `deploy/docker-compose.yml` 中 `subconverter:integration-chain-subconverter` 是浮动 tag，建议在 runbook 记录已验证版本与回滚方式（不强制 digest 锁定）。
8. 前端无单元/E2E 测试框架；当前仅靠 TypeScript 编译校验。

## 关键文件速查

| 用途 | 文件 |
|------|------|
| 当前执行计划 | `docs/plan/3.0-alpha-cutover.md` |
| 内部状态快照 | `docs/progress/STATUS.md` |
| Beta 缺口评估 | `docs/progress/beta-readiness.md` |
| 文档导航入口 | `docs/README.md` |
| 用户入口 | `README.md` |
| 发布说明 | `RELEASES.md` |
| 第三方部署入口 | `deploy/README.md` |
| Alpha 回归 runbook | `docs/testing/alpha-release.md` |
| 安全边界说明 | `SECURITY.md` |
| CI 守门 | `.github/workflows/ci.yml` |
| 镜像发布 | `.github/workflows/docker-publish.yml` |
| 前端构建脚本 | `web/package.json`（`build:default/a/b/c`） |
| SSRF 拦截实现 | `internal/service/managed_conversion_source.go` |
| 安全配置解析 | `internal/config/server.go` |
| 服务启动 | `cmd/server/main.go` |
| API 请求体限制 | `internal/api/server.go`（`maxJSONBodyBytes`） |
| API 限速实现 | `internal/api/rate_limit.go` |

## 验证命令

```bash
# 全量 Go 测试
go test ./...

# 本轮限速相关最小验证
go test ./internal/api -run TestStage1ConvertHandler_RateLimitsByClientIP
go test ./internal/api ./internal/config ./cmd/server

# 四 scheme 前端构建
cd web && npm run build:default && npm run build:a && npm run build:b && npm run build:c

# Compose 配置校验
docker compose -f deploy/docker-compose.yml config

# 本地开发 smoke（default scheme）
./scripts/dev-up.sh default
```
