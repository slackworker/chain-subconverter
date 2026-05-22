# 临时文档区

本目录只用于暂存待删除或短期过渡中的文档材料，不属于当前开发主导航。

## 放入条件

- 已完成阶段的细化计划
- 旧版 legacy、archive、迁移映射
- 正在整理、尚未决定是否保留的临时说明

## 使用约束

- 本目录内文档不参与当前开发、评审与实现裁决。
- 若某份文档已经失去直接开发价值，应优先移入本目录，而不是继续扩展 archive 层级。
- 本目录默认不纳入版本控制（见根 `.gitignore`）；**仅** `README.md` 纳入 Git，其余本地暂存后应删除，勿长期堆积。
- 已完成的评审/计划应把结论写入 `docs/testing/`、`docs/spec/`、`docs/progress/` 等权威路径后，删除对应 temp 副本，避免与权威文档（如 [test-system-review.md](../testing/test-system-review.md)）口径冲突。

## 2026-05-22 清理说明

已删除本地 temp 中的过时材料，包括但不限于：

- 测试执行计划（已全部 `[x]`，结论已在 `third-party-deployments.md` 与 worker README）
- 测试梳理评审（含「CI 无 fixture check」等已过时表述；CI 以 `test-system-review.md` 为准）
- `history/`、`completed-phases/` 旧阶段拆解与 legacy 映射
- UI / Docker 构建一次性评审稿（改动已落地或无需进主导航）

若需同类信息，请查 [docs/README.md](../README.md) 索引，勿在 temp 中重建长期副本。