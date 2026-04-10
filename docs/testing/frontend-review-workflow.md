# 文件驱动的前端业务 Review 工作流

本文只说明 review 工作流与产物目录。

## 目标

本工作流用于在 **无前端工程、无 app API 依赖** 的情况下，按手动 review 的真实顺序回放前端业务。

当前只保留两个动作：

1. `Frontend Review: Stage1 Convert`
2. `Frontend Review: Stage2 Generate`

两者都通过 `review/frontend-review.sh` 触发，并自动完成以下准备：

- 启动或复用本地 `subconverter`

## 手动 Review 流程

默认 case 目录：`review/cases/3pass-ss2022-test-subscription/`

推荐按以下顺序进行：

1. 手动编辑 `stage1/input/landing.txt`、`stage1/input/transit.txt`、`stage1/input/forward-relays.txt`、`stage1/input/advanced-options.yaml`
2. 运行 `Frontend Review: Stage1 Convert`
3. 检查 `stage1/output/` 产物，并按需编辑 `stage2/input/stage2-snapshot.json`
4. 运行 `Frontend Review: Stage2 Generate`
5. 检查 `stage2/output/` 产物，完成本轮 review

## Case 结构

- `stage1/input/`
  - 阶段 1 原始输入
- `stage1/output/`
  - Stage1 生成的 3-pass URL / YAML、`stage1-convert.*`、review summary 等产物
- `stage2/input/`
  - Stage1 刷新的 `stage2-snapshot.json`，供手动修改后再跑 Stage2
- `stage2/output/`
  - Stage2 生成的 `generate.*`、`long-url.payload.json`、`complete-config.chain.yaml`（最终订阅 YAML）

## 运行时产物位置

- 业务产物直接写回 case 目录中的 `stage1/output/`、`stage2/input/`、`stage2/output/`

## 依赖与环境变量

本工作流依赖 `subconverter`，但不依赖 `app` HTTP API。

- `subconverter` 本地暴露端口默认 `25511`
- `subconverter` 客户端超时默认 `60s`

可通过以下环境变量覆盖：

- `CHAIN_SUBCONVERTER_FRONTEND_REVIEW_SUBCONVERTER_TIMEOUT`
- `CHAIN_SUBCONVERTER_FRONTEND_REVIEW_PUBLIC_BASE_URL`

说明：

- `transit.txt` 始终是唯一的中转输入文本；支持订阅 URL、节点 URI、`data:text/plain,<base64文本>`；具体权威口径见 `docs/spec/04-business-rules.md`
- `advanced-options.yaml` 中的 `config` 字段业务语义始终是模板 URL；留空表示使用默认模板 URL
- `advanced-options.yaml` 推荐保留完整骨架：复选框写显式 `true` 或 `false`，留空值表示不向上游传该参数；文本框写非空字符串表示透传，留空值表示不传
- 建议骨架形态为：`emoji: true`、`udp: true`、`skipCertVerify:`、`config:`、`include:`、`exclude:`、`enablePortForward: false`
- 若文本框当前为空，允许写成 `config: ""`、`include: ""`、`exclude: ""`；系统会在入站归一化为 `null`，后续不向 `subconverter` 传对应 query 参数
- 运行 `Frontend Review: Stage1 Convert` 只会刷新 `stage1/output/` 和 `stage2/input/stage2-snapshot.json`，不会清理 `stage2/output/`；`stage2/output/` 始终只代表最近一次 Stage2 运行结果

## 边界

- `review/cases/` 承载手动 review 工作区
- 稳定自动化 fixture 统一放在 `internal/review/testdata/`
- 当前工作流包含 `Frontend Review: Stage1 Convert` 与 `Frontend Review: Stage2 Generate` 两个动作
- 当前仍未覆盖手工阶段 2 override、短链、恢复冲突等更高阶段能力