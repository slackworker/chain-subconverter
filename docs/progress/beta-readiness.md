# Beta 发布缺口评估

> 最近更新：2026-05-22

实时状态见 [STATUS.md](STATUS.md)；执行计划见 [plan/3.0-release-stabilization.md](../plan/3.0-release-stabilization.md)。

## 当前基线

- **阶段**：3.0 开发后期 / 发布整理；**未进入 Beta 冻结**。
- **分支与标签**：`dev / beta / main` → `dev-latest / beta-latest / latest`。
- **UI**：Beta 验收以默认 `/`（`default` scheme）为主；`/ui/a|b|c` 不阻塞。
- **自动化**：`ci.yml` 含 Go test、review/worker fixture freshness、Vitest、`web-mock-e2e`（mocked Playwright，blocking）、四 scheme build；本地/容器化完整 Playwright（见 [test-system-review.md](../testing/test-system-review.md)）。

## 距 Beta 仍缺

1. **`beta-latest` 实战**：至少一轮发布 + 第三方设备回归并归档（见 [release-runbook](../testing/release-runbook.md) 模板）。
2. **反馈闭环**：`.github/ISSUE_TEMPLATE/` 已补；持续用 Issue/回归记录归档，而非零散笔记。
3. **E2E 加深**：阻断路径、更广 scheme 矩阵；当前 blocking 基线只保留两条 mocked happy path。
4. **质量债（非硬阻塞）**：`subconverter` 浮动 tag 需在回归中注明；B/C workflow log 视觉与 default 未完全统一。

## Beta 硬门槛

- `beta` 分支与 `beta-latest` 发布路径稳定可用。
- 第三方设备按 [deploy/README.md](../../deploy/README.md) 完成默认 `/` 最小回归。
- 发布/部署/状态/runbook 分支标签口径一致；[SECURITY.md](../../SECURITY.md) 与部署变量可核对（`USER_FACING_BASE_URL`、SSRF 最小防护、写接口限速）。
- 无未关闭 P0；回归记录可持续查阅。

## 推荐顺序

1. 用 `beta` 跑通一次 `beta-latest` 发布与设备回归并记录。
2. 补 E2E 阻断路径；视需要接入 CI。
3. 条件满足后再引入 `vX.Y.Z-beta.N`。

## 相关文档

- [STATUS.md](STATUS.md) · [plan/3.0-release-stabilization.md](../plan/3.0-release-stabilization.md) · [release-runbook.md](../testing/release-runbook.md)
