# 文档维护约定

**事实单处定义、他处只链接**；歧义先澄清再改；结论写回 spec 或下表路径。读者入口见 [docs/README.md](README.md)。

## 何时更新什么

| 事件 | 更新 |
|------|------|
| 发版 / 镜像 tag | [RELEASES.md](../RELEASES.md)、[STATUS.md](STATUS.md) 最近验证、必要时 [third-party-deployments.md](testing/third-party-deployments.md) |
| 行为或 API 变更 | `docs/spec/02–05`；[STATUS.md](STATUS.md) 仅一句指向 spec |
| 场景 / 金样变更 | `testdata/canonical-scenarios/*.stage1.json` → [test-system-review.md](testing/test-system-review.md) |
| 新 backlog | [STATUS.md](STATUS.md) backlog 表 |
| 用户可见能力或部署 | [README.md](../README.md)、[deploy/README.md](../deploy/README.md) |

不要为已完成任务单独留 plan 文件；结论并入 STATUS 或 testing 后删草稿。

## 禁止

- 不在多处复制同一命令块、digest、Phase 表
- `docs/temp/` 只放当次草稿；落盘后删除
- 用户向 README 不写 API 字段；手工测试数据只用 [dual-landing-manual-reference.md](testing/dual-landing-manual-reference.md)（自动生成）

## Agent 改文档前自检

1. 行为是否已在 spec 定义？→ 改 spec，STATUS 只改状态句
2. 是否重复 deploy/runbook 命令？→ 保留一处
3. 用户能否在 README/deploy 独立完成部署？
