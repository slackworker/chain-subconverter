# 文档导航

唯一索引。纪律 [MAINTENANCE.md](MAINTENANCE.md)；治理 [spec/00-governance.md](spec/00-governance.md)。

## 用户（部署与使用）

| 文档 | 用途 |
|------|------|
| [../README.md](../README.md) | 产品、在线预览、快速开始 |
| [../deploy/README.md](../deploy/README.md) | Compose、环境变量、第三方设备 |
| [../deploy/FAQ.md](../deploy/FAQ.md) | 部署排障 |
| [../SECURITY.md](../SECURITY.md) | 安全模型 |
| [../RELEASES.md](../RELEASES.md) | 版本（2.x 见 [_legacy/RELEASES.md](../_legacy/RELEASES.md)） |
| [testing/dual-landing-manual-reference.md](testing/dual-landing-manual-reference.md) | 在线预览假数据（勿手改正文） |

## 维护者（状态与发版）

| 文档 | 用途 |
|------|------|
| [STATUS.md](STATUS.md) | 状态、backlog、最近验证 |
| [ROADMAP.md](ROADMAP.md) | 阶段结论、维护期非目标 |
| [MAINTENANCE.md](MAINTENANCE.md) | 何时改哪份文档 |
| [testing/release-runbook.md](testing/release-runbook.md) | 发布前检查清单（命令见 local-dev-smoke） |
| [testing/third-party-deployments.md](testing/third-party-deployments.md) | 设备回归结论 |

## 开发者与 AI Agent

1. [spec/00-governance.md](spec/00-governance.md) → [spec/01-overview.md](spec/01-overview.md)
2. 按改动面：`spec/02`–`05`
3. 测试/fixture：[testing/test-system-review.md](testing/test-system-review.md)
4. 本地联调：[testing/local-dev-smoke.md](testing/local-dev-smoke.md)
5. 固定 fixture：[3pass-ss2022-test-subscription](testing/3pass-ss2022-test-subscription.md)、[dual-landing-chain-port-forward](testing/dual-landing-chain-port-forward.md)
6. 已落地提案：[stage2-node-management-derived-nodes](proposals/stage2-node-management-derived-nodes.md)（规格见 spec/04）

其余 `spec/`、`testing/` 文件按任务打开。

## 临时区

`docs/temp/` 本地草稿（gitignore）；规则 [temp/README.md](temp/README.md)。不参与裁决。
