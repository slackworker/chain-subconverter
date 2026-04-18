# G1 前端共享业务层验收

本文定义 `Phase 4 / G1` 前端共享业务层的最小验收路径，只用于判断“共享业务层边界是否已稳定、是否允许进入 A/B/C 并行方案探索”。

## 用途

本验收只回答以下问题：

- 共享前端入口是否仍然中立
- 至少两套 `scheme` 是否可消费同一共享业务层
- 当前失败是共享边界问题，还是外部模板/运行镜像漂移问题

本验收**不**负责：

- 选出最终 UI 方案
- 评价视觉质量或交互优劣
- 代替最终 Compose 单入口部署验收

## 当前共享稳定面

以下内容属于 G1 需要稳定的共享业务层：

- `web/src/types/api.ts` 的 domain types 与 API contracts
- `web/src/lib/api.ts` 的 API client
- `web/src/lib/state.ts` 的页面状态模型
- `web/src/hooks/useAppWorkflow.ts` 的恢复/转换/生成/短链流程编排
- `web/src/lib/chainTargets.ts` 的节点目标业务抽象
- `web/src/lib/notices.ts` 的局部错误筛选语义
- `web/src/lib/composition.ts` 与 `web/src/lib/scheme-context.ts` 的方案层装配接缝

以下内容属于方案层，可替换：

- `web/src/scheme/a/*`
- `web/src/scheme/b/*`
- `web/src/scheme/c/*`

## 最小验收命令

在 `web/` 目录执行：

```bash
npm run build
npm run build:b
```

通过口径：

- `build` 通过，表示当前默认入口仍能消费共享业务层
- `build:b` 通过，表示另一套方案入口也能消费同一共享业务层
- 两者都通过时，才能说明“共享入口不直接依赖单一方案实现”已具备可执行证据

## 真实前端验收与外部依赖

真实前端主线验收仍需要以下外部条件：

- 可用的 `subconverter` 运行镜像
- 当前默认模板 URL 可正常拉取
- 当前默认模板内仍包含共享业务层预期的 proxy-group 结构

因此以下错误**不能直接判定为共享边界失败**：

- `SUBCONVERTER_UNAVAILABLE`
- 默认模板拉取失败
- 默认模板更新导致既有 proxy-group（例如 `🇭🇰 香港节点`）缺失

上述问题应先判定为“外部依赖漂移或运行环境问题”，而不是 G1 共享业务层架构回退。

## G1 前端签收检查表

1. `web/src/App.tsx` 不再直接 import 默认方案组件，而是消费 `UIScheme`
2. 至少两套方案入口都能通过构建
3. Stage 1 / 2 / 3 的业务边界仍由共享层状态与流程约束，而不是由某一套具体 UI 容器决定
4. 单一当前链接输入框、`forwardRelayItems` 结构化快照、单一全局阻断错误承载区语义保持不变
5. 真实前端验收失败时，能先区分“共享边界回退”与“外部模板/镜像漂移”

## 与其他文档的关系

- 共享边界权威定义见 `docs/spec/02-frontend-spec.md`
- `Phase 4 / G1` 推进顺序见 `docs/plan/phase-4-breakdown.md`
- 当前状态与未完成项见 `docs/progress/STATUS.md`