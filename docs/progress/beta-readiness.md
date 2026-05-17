# Beta 发布缺口评估

> 最近更新：2026-05-17

本文记录 3.0 距 Beta 发布仍缺的条件与推荐推进顺序。实时阶段状态仍以 [STATUS.md](STATUS.md) 为准；当前执行计划见 [plan/3.0-alpha-cutover.md](../plan/3.0-alpha-cutover.md)。

## 当前基线

- **阶段**：项目仍处于 3.0 开发后期与发布整理阶段；**尚未进入 Beta 冻结**。
- **分支与标签**：当前模型是 `dev / beta / main`；滚动标签是 `dev-latest / beta-latest / latest`。
- **对外 UI**：默认 `/` → `default` scheme；`/ui/a|b|c` 为实验入口。Beta 验收仍以 default 为主，A/B/C 不阻塞。
- **已较稳定**：后端主线 API、共享业务层主流程、Compose 单段部署、SPA 托管、CI 基线、部分 HTTP 加固。

## 距 Beta 仍须完成的工作

### 1. 分支与发布整理收尾

- `beta` 分支应正式创建并进入可用状态。
- `beta-latest` 的自动发布与回归记录应实际跑通，而不是只停留在工作流定义层。
- 当前文档中残留的 `release/3.0` / `alpha-latest` / Alpha tag 口径应继续清理出主叙事。

### 2. 发布回归与反馈闭环

- 第三方设备回归应形成持续记录，而不是零散经验。
- `.github/ISSUE_TEMPLATE/` 与反馈模板应落地，便于按统一字段归档。
- runbook 中的 Beta 前置条件应从概念描述变成可执行检查清单。

### 3. 固定回归基线扩展

- 当前稳定 fixture 仍只有最小的 `3pass-ss2022-test-subscription`。
- 进入 Beta 前，建议至少补齐长链接、短链接、恢复与端口转发相关的固定回归流程。

### 4. 工程与质量债

- 无前端单测 / E2E；当前主要依赖构建、smoke 与固定 fixture。
- `subconverter` 仍使用浮动 tag，回归记录需明确当前验证来源。
- B/C 的 workflow log 呈现仍与 default 不一致，但这不是 Beta 硬阻塞项。

## Beta 硬门槛

- `beta` 分支可用，且 `beta-latest` 发布路径稳定。
- 第三方设备可按 [deploy/README.md](../../deploy/README.md) 完成默认 `/` 最小回归。
- 当前发布与回归记录已持续归档，无未关闭 P0。
- 发布文档、部署文档、状态页与 runbook 对同一套分支/标签口径保持一致。
- 安全边界已在代码与部署文档中可核对，尤其是 `PUBLIC_BASE_URL`、SSRF 最小防护与写接口限速。

## 推荐推进顺序

1. 继续清理当前文档与历史材料中的旧发布口径。
2. 创建并使用 `beta` 分支完成一次真实的 `beta-latest` 发布演练。
3. 补齐第三方设备回归记录与反馈模板。
4. 扩展固定回归基线，为 Beta 前的稳定验收提供共享数据。
5. 只有在上述条件成立后，再决定是否引入 `vX.Y.Z-beta.N`。

## 相关文档

- 当前状态快照：[STATUS.md](STATUS.md)
- 当前执行计划：[plan/3.0-alpha-cutover.md](../plan/3.0-alpha-cutover.md)
- 当前发布与回归：[testing/alpha-release.md](../testing/alpha-release.md)
