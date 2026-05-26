# chain-subconverter 内部文档索引

> 面向开发者与 AI Agent。最终用户请先看 [../README.md](../README.md)、[../deploy/README.md](../deploy/README.md)、[../deploy/FAQ.md](../deploy/FAQ.md)、[../SECURITY.md](../SECURITY.md) 与 [../RELEASES.md](../RELEASES.md)。

本文档是当前仓库的唯一内部导航入口；只负责分流，不重复维护事实。

## 先看什么

1. 刚进入仓库：先读 [spec/00-governance](spec/00-governance.md) 与 [spec/01-overview](spec/01-overview.md)。
2. 需要知道现在做到哪里：先看 [progress/STATUS](progress/STATUS.md)。
3. 需要权威契约：按主题进入 [spec/02-frontend-spec](spec/02-frontend-spec.md)、[spec/03-backend-api](spec/03-backend-api.md)、[spec/04-business-rules](spec/04-business-rules.md)、[spec/05-tech-stack](spec/05-tech-stack.md)。
4. 需要运行或回归步骤：进入 [testing/local-dev-smoke](testing/local-dev-smoke.md)、[testing/release-runbook](testing/release-runbook.md) 与 [testing/test-system-review](testing/test-system-review.md)。
5. 需要局部子系统细节：只在维护对应子系统时再读 [../web/README.md](../web/README.md) 或 [../deploy/test-fixtures-worker/README.md](../deploy/test-fixtures-worker/README.md)。

## 文档分层

| 路径 | 角色 |
|------|------|
| 根目录 `README` / `deploy` / `SECURITY` / `RELEASES` | 用户向入口；不承载内部执行状态 |
| `docs/spec/` | 权威规格；冲突先问用户，见 [spec/00-governance](spec/00-governance.md) |
| `docs/progress/STATUS.md` | 当前状态单点入口 |
| `docs/plan/` | 临时执行计划；只保留仍在推进、且写明退出条件的计划 |
| `docs/progress/` 其他文件 | 阶段性补充状态；应尽量并入 `STATUS` 后删除 |
| `docs/testing/` | runbook、固定回归基线、测试体系说明 |
| 子目录 README | 局部维护说明；不作为仓库主导航 |
| `docs/temp/` | 临时待删区；不参与裁决，规则见 [temp/README](temp/README.md) |

## 当前常用入口

- 治理与总览： [spec/00-governance](spec/00-governance.md)、[spec/01-overview](spec/01-overview.md)
- 当前状态： [progress/STATUS](progress/STATUS.md)
- 路线与阶段顺序： [ROADMAP](ROADMAP.md)
- 本地开发： [testing/local-dev-smoke](testing/local-dev-smoke.md)
- 发布回归： [testing/release-runbook](testing/release-runbook.md)、[testing/third-party-deployments](testing/third-party-deployments.md)
- 测试体系： [testing/test-system-review](testing/test-system-review.md)
- 固定 fixture： [testing/3pass-ss2022-test-subscription](testing/3pass-ss2022-test-subscription.md)、[testing/dual-landing-chain-port-forward](testing/dual-landing-chain-port-forward.md)

## 维护约定

- 同一事实只维护一处；本页只索引，不复制权威内容。
- 状态写 [progress/STATUS](progress/STATUS.md)，勿重复进 `ROADMAP`、根 `README` 或 runbook。
- `plan/` 须可删、写清退出条件；结束后并入 `STATUS` 再删。
- FAQ 不抄 spec/runbook；文档越层扩写时拆回 spec、`STATUS` 或用户向根文档。
- `docs/temp/` 不参与裁决，规则见 [temp/README](temp/README.md)。
