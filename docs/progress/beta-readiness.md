# Beta 发布缺口评估

> 最近更新：2026-05-25

实时状态见 [STATUS.md](STATUS.md)；执行计划见 [plan/3.0-release-stabilization.md](../plan/3.0-release-stabilization.md)。

## 当前基线

- **阶段**：3.0 Beta 线已启动；**`v3.0.0-beta.1` 已发布**（2026-05-24）；**准备发布 `v3.0.0-beta.2`**（`dev` 待合并 `beta` + 打 tag）。
- **分支与标签**：`dev / beta / main` → `dev-latest / beta-latest / latest`；版本 tag 见 [RELEASES.md](../../RELEASES.md)。
- **UI**：Beta 验收以默认 `/`（`default` scheme）为主；`/ui/a|b|c` 不阻塞。
- **自动化**：`ci.yml` 含 Go test、review/worker fixture freshness、Vitest、`web-mock-e2e`（mocked Playwright，blocking）、四 scheme build；本地/容器化完整 Playwright（见 [test-system-review.md](../testing/test-system-review.md)）。

## 已完成（Beta 硬门槛相关）

- **`beta-latest` 实战**（**2026-05-23**）：vps-01 / vps-02 内网与公网一体化、`beta-latest` + `deployed-smoke` **通过**；Railway + Koyeb 双 Docker 分离形态 **通过**（见 [third-party-deployments.md](../testing/third-party-deployments.md)）。

## 距下一版 Beta（beta.2）仍缺

1. **发布动作**：`dev` → `beta` 合并；打 `v3.0.0-beta.2`；等 `ci.yml` + `docker-publish` 产出镜像；记录 digest（可选更新 [third-party-deployments.md](../testing/third-party-deployments.md)）。
2. **发布前检查**：按 [release-runbook.md](../testing/release-runbook.md) 跑 `go test`、`npm run test`、`test:e2e:mock`、四 scheme build、`compose config`；可选加跑 `include-exclude-filter.spec.ts`。
3. **反馈闭环**：`.github/ISSUE_TEMPLATE/` 已补；持续用 Issue/回归记录归档。
4. **E2E 加深（非 beta.2 硬阻塞）**：阻断路径、更广 scheme 矩阵；blocking 仍为两条 mocked happy path。
5. **质量债**：`subconverter` 浮动 tag 需在回归中注明；B/C workflow log 视觉与 default 未完全统一；plan 文件待 beta 线稳定后并入 STATUS。

## Beta 硬门槛

- `beta` 分支与 `beta-latest` 发布路径稳定可用。
- 第三方设备按 [deploy/README.md](../../deploy/README.md) 完成默认 `/` 最小回归。
- 发布/部署/状态/runbook 分支标签口径一致；[SECURITY.md](../../SECURITY.md) 与部署变量可核对（`USER_FACING_BASE_URL`、SSRF 最小防护、读/写接口限速）。
- 无未关闭 P0；回归记录可持续查阅。

## 推荐顺序

1. 本地/CI 跑通 [release-runbook](../testing/release-runbook.md) 发布前检查。
2. `dev` 合并到 `beta`，打 tag `v3.0.0-beta.2`，等 GHCR 镜像就绪。
3. 抽样第三方设备 smoke + 更新 digest / 回归记录；视需要刷新在线预览（Koyeb）。
4. 后续 beta.N：补 E2E 阻断路径；plan 并入 STATUS 并删除 plan 文件。

## 相关文档

- [STATUS.md](STATUS.md) · [plan/3.0-release-stabilization.md](../plan/3.0-release-stabilization.md) · [release-runbook.md](../testing/release-runbook.md)
