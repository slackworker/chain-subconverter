# 00 - 治理与总则

## 原则

- 迭代与维护期：每次收到问题或需求，先同时核对 spec 与实现。
- 若 spec、实现与需求不一致，先向用户确认：按 spec 修实现，或按需求改实现并回补 spec。
- 文档轻量：关键事实单处定义、他处引用；导航见 [docs/README.md](../README.md)。
- 架构、代码与历史决策均可质疑与替换。

## 确认后的权威顺序

1. 本文档
2. 用户对本次问题的确认结论
3. 与该结论一致的 `docs/spec/01–06`（Stage2 模型以 `06` 为唯一事实源）
4. 与该结论一致的现有代码、旧文档与历史决策

## 文档分层

- 用户向：根目录与 `deploy/`（`README`、`deploy/`、`SECURITY`、`RELEASES`、FAQ）。
- 内部：仅 [docs/README.md](../README.md)；`AGENTS.md` 只做极简跳转。
- 契约在 `docs/spec/`；状态在 [STATUS.md](../STATUS.md)；路线在 [ROADMAP.md](../ROADMAP.md)（不写实时进度）；runbook 在 `docs/testing/`。
- 不得跨层复制 spec 事实；子目录 README 仅局部细节，不作主导航。

## 维护

见 [MAINTENANCE.md](../MAINTENANCE.md)。
