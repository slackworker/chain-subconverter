# 路线图

Phase 0–4 已完成，进入**维护期**。backlog 与最近验证见 [STATUS.md](STATUS.md)。

| Phase | 状态 | 要点 |
|-------|------|------|
| 0 — 骨架 | ✅ | 仓库与分层起点 |
| 1 — subconverter 集成 | ✅ | Client、golden |
| 2 — 最小业务闭环 | ✅ | 3-pass；Smoke fixture |
| 2.5 — 文档与边界 | ✅ | 包边界、fixture 文档化 |
| 3 — 扩展业务与 API | ✅ | [spec/03-backend-api.md](spec/03-backend-api.md) |
| 4 — 前端、部署、Beta | ✅ | 默认 `/`；`v3.0.0-beta.1/2/3/4` |

**3.1 Beta 线**（维护期新里程碑）：`v3.1.0-beta.1` 准备中 — 进度见 [STATUS.md](STATUS.md)，不发实时细节于此。

开放项与发版节奏见 [STATUS.md](STATUS.md) backlog；发布检查见 [release-runbook](testing/release-runbook.md)。

## 非目标（维护期）

- 新大功能未经 spec 澄清即开发
- 强制语义化版本体系 overhaul
- 在 CI 引入真实 deployed E2E 为 blocking
