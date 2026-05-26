# 00 - 治理与总则

## 原则

- 歧义、冲突或文档与实现不一致：先向用户澄清，确认后再改并写回 spec。
- 文档轻量：关键事实单处定义、他处引用；导航见 [docs/README.md](../README.md)。
- 架构、代码与历史决策均可质疑与替换。

## 确认后的权威顺序

1. 本文档
2. `docs/spec/01–05`
3. 现有代码、旧文档与历史决策

## 文档分层

- 用户向：根目录与 `deploy/`（`README`、`deploy/`、`SECURITY`、`RELEASES`、FAQ）。
- 内部：仅 [docs/README.md](../README.md)；`AGENTS.md` 只做极简跳转。
- 契约在 `docs/spec/`；状态在 `progress/STATUS.md`；路线在 `ROADMAP.md`（不写实时进度）；runbook 在 `docs/testing/`。
- 不得跨层复制 spec 事实；子目录 README 仅局部细节，不作主导航。

## 维护

见 [docs/README.md](../README.md)「维护约定」。
