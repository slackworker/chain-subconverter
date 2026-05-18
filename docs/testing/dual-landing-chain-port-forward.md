# 双落地链式 + 端口转发固定基线：`dual-landing-chain-port-forward`

本文说明当前新增的完整固定回放基线，用于覆盖 smoke 样例之外的多落地、多中转订阅、端口转发与长/短链接恢复路径。

## 用途

该样例固定覆盖一组更接近日常使用的场景：

- 2 套落地配置，每套对应 1 台落地服务器
- 每套落地服务器拆成 3 条落地节点：
  - 1 条 SS 落地，用于和中转订阅导出的地域策略组做链式代理
  - 1 条 Reality 落地，用于端口转发
  - 1 条 Reality 落地，保留为直连备用
- 总计 `6` 条 landing 节点、`2` 条 transit 订阅、`2` 条 forward relay

目录：`internal/review/testdata/dual-landing-chain-port-forward/`

## 当前固定材料

- `stage1/input/landing.txt`
- `stage1/input/transit.txt`
- `stage1/input/forward-relays.txt`
- `stage1/input/advanced-options.yaml`
- `stage1/output/landing-discovery.*`
- `stage1/output/transit-discovery.*`
- `stage1/output/full-base.*`
- `stage2/input/stage2-snapshot.json`

## 当前语义边界

- `stage1/convert` 自动填充当前固定为：
  - 2 条 SS 落地自动识别到对应地域组，默认 `mode = chain`
  - 4 条 Reality 落地保留 `mode = none`
- `stage2-snapshot` 再把其中 2 条 Reality 落地显式切到 `port_forward`，并分别指向两条不同 relay
- `generate` / `resolve-url` / `short-links` 使用该固定快照验证长链接与短链接的可回放性

也就是说，本基线同时覆盖自动识别、Stage 2 手动切换到 `port_forward`，以及长/短链接恢复。

## 自动化覆盖

当前至少由以下测试直接消费：

- `internal/review` 的 artifact 回放测试
- `internal/service` 的 `BuildStage2Init` 语义测试
- `internal/service` 的 `resolve-url` replayable / short-link roundtrip 测试

## 边界

- 本样例仍是固定、脱敏、仓库跟踪的数据集，不依赖真实外部订阅源
- 浏览器级 happy path 与阻断错误 E2E 仍属于后续工作，不由本基线替代