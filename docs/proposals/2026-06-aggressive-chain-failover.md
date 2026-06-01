# 激进链式故障转移双方案提案

## 背景

当前项目的 `chain` 语义固定为：阶段 2 某行在 `mode = chain` 时，把 `targetName` 写入该落地代理的 `dialer-proxy`。这已经允许目标是单个中转 `proxy`，也允许目标是模板识别出的地域 `proxy-groups`；权威契约见 `docs/spec/04-business-rules.md` §2.3、§3.1、§3.3。

但当前产品层仍缺一件事：当用户希望把 Mihomo 的 `fallback` / `url-test` 用作“激进故障转移”时，`chain-subconverter` 还没有为这类策略组提供一套受控的建模、渲染与恢复方案。

本提案先定义两条可并行推进的实现路线，供后续切两个 worktree 并行开发：

- 方案一：继续选择原有模板地域策略组，但允许在最终生成的 YAML 上覆盖该组的故障转移参数
- 方案二：副本仍由用户在阶段 2 显式创建和配置；系统只额外派生一个新的策略组，把这些用户已配置好的同源落地副本打包进去

本提案是设计与分工文档，不直接改 spec；若任一方案落地并确认对外契约，需要再把裁决写回 `docs/spec/03` / `04`。

## 目标

- 在不破坏现有三阶段模型的前提下，为链式代理引入“下一次请求尽快切走”的激进故障转移能力
- 保持 `generate`、`resolve-url`、短链接与订阅渲染的可恢复性与可重放性
- 尽量复用现有 `stage2Snapshot` 行模型、复制语义与 `dialer-proxy` 写回路径
- 明确两条开发路线的共享基础、差异点、验收口径与 worktree 拆分边界

## 非目标

- 不承诺实现 Mihomo 单次请求内自动重试到下一个节点
- 不在本轮提案中改动前端视觉方案分级或默认页面结构
- 不把任意 Mihomo 全量策略组选项直接暴露给用户；本轮仅围绕 `fallback` / `url-test` 的激进故障转移子集建模

## 现有约束

### 契约边界

- `chainTargets[]` 当前只暴露 `name`、`kind`、`isEmpty`，其中 `kind` 只允许 `proxy-groups` 或 `proxies`；见 `docs/spec/03-backend-api.md` §3 与 `docs/spec/04-business-rules.md` §2.3
- `mode = chain` 的最终渲染语义固定为写入 `dialer-proxy: <targetName>`；见 `docs/spec/04-business-rules.md` §3.1、§3.3
- `stage2Snapshot` 已支持复制行：多行可共享同一 `sourceLandingNodeName`，但 `rowId`、`proxyName` 必须全表唯一；见 `docs/spec/04-business-rules.md` §2.1.2
- 恢复可重放性当前以 `targetName` 是否仍能在候选集合中解析为准；若新增“受管策略组”概念，必须给出稳定命名与重放规则；见 `docs/spec/04-business-rules.md` §3.2.1

### 实现锚点

- `internal/service/stage1_convert.go`：当前 `chainTargets` 构建、默认自动填充与行初始化
- `internal/service/artifacts_render.go` 与 `internal/service/managed_pass3_render.go`：当前 `dialer-proxy` / `server:port` 写回路径
- `internal/service/artifacts_snapshot_validation.go`：当前阶段 2 校验与 `chainTargets` / `forwardRelays` 引用校验
- `internal/service/artifacts_render_test.go`：已覆盖复制行从同一 `sourceLandingNodeName` 派生不同渲染结果

## 共用设计原则

两条方案无论采用哪条路线，都建议遵守以下共用原则：

1. 新能力应建模为“受管输出”，而不是让用户直接手写任意 Mihomo YAML 片段。
2. 激进故障转移仅暴露两类组策略：`fallback` 与 `url-test`。
3. “激进”应先收敛为一个明确 profile，而不是暴露过多自由参数。建议首版固定：
   - `lazy: false`
   - 较短 `interval`
   - 较小健康检查 `timeout`
   - `max-failed-times: 1`
4. 长链接与短链接要记录“用户选择了哪种策略/profile”，而不是记录最终渲染后的完整策略组 YAML。
5. 只有真正新增到最终 YAML 的受管对象才需要稳定、可推导、避免重名冲突的命名规则；若只是覆盖已有策略组参数，则不引入新名字。

## 方案一：沿用原模板地域策略组，仅覆盖最终 YAML 里的组参数

### 核心思路

保持当前 `mode = chain` 与 `targetName` 语义不变：用户仍然选择原有的模板地域策略组，最终落地行仍然写入：

```yaml
dialer-proxy: <existing-region-group-name>
```

新增能力不体现在 `dialer-proxy` 指向的新名字上，而体现在最终生成的 YAML 上：若用户为某个地域组开启“激进故障转移”配置，系统就在最终 YAML 中找到这个现有地域策略组，并按用户选择把它的 `type` / 健康检查相关参数改写为激进 profile。

也就是说，方案一的关键不是“再造一个组”，而是“继续引用老组，但在最终产物上改老组”。

最终该行写法不变：

```yaml
dialer-proxy: <existing-region-group-name>
```

### 适配价值

- 对现有 Stage 2 行模型侵入最小
- 与当前 `dialer-proxy` 语义最一致
- 对 `sourceLandingNodeName`、复制行、端口转发模式影响最小
- 不需要引入新的策略组名字，恢复与命名成本最低
- 更容易先做后端渲染与恢复，再补前端交互

### 建议建模

- 保持 `mode = chain` 不变
- `chainTargets[]` 继续只暴露现有候选，不新增“衍生激进组”这一类 targetName
- 新增的是“组级 profile 配置”：某个已选地域组是否启用激进故障转移、使用 `fallback` 还是 `url-test`
- 首版建议只允许对模板识别出的地域策略组启用该能力，不扩展到任意单个 transit `proxy`

### 建议渲染

- 保持 `proxy-groups[].name` 不变
- 在最终 YAML 上定位被启用的现有地域策略组，并覆盖其 `type` 与相关参数
- 组成员列表仍沿用 full-base 里的现有成员结果，不另外生成新组，也不重新展开组成员
- 对 `fallback` 与 `url-test` 采用统一激进 profile，仅 `type` 不同

### 关键难点

- 需要定义“哪些现有组允许被覆盖”，避免误改非地域策略组
- 需要裁决若模板原始组本身已经是 `fallback` / `url-test`，用户配置与模板原值谁优先
- 需要为恢复链路记录组级 profile，否则 `targetName` 仍在，但无法知道是否要改写组参数

### 推荐拆分

- 后端优先：组级 profile 数据模型、最终 YAML 组参数覆盖、恢复校验、测试 fixture
- 前端后补：阶段 2 为已选地域组增加“默认 / 激进 fallback / 激进 url-test”之类的 profile 选择

## 方案二：用户副本 + 新策略组打包

### 核心思路

复用当前阶段 2 已有的复制语义：用户自己把同一 `sourceLandingNodeName` 复制成多行，并分别配置不同的 `proxyName` 与 `dialer-proxy` 目标。系统不负责替用户生成这些副本；系统只在最终 YAML 上额外生成一个新的策略组，把这些“用户已经配置好的同源落地副本”打包进去。

示意：

```text
HK Landing
  ├─ HK Landing / Transit-A
  ├─ HK Landing / Transit-B
  └─ HK Landing / Transit-C

HK Landing Aggressive Group
  ├─ HK Landing / Transit-A
  ├─ HK Landing / Transit-B
  └─ HK Landing / Transit-C
```

这里的 `HK Landing / Transit-A|B|C` 都应视为用户在阶段 2 显式复制和配置出来的最终代理项；系统只新增最下面这个打包组。

### 适配价值

- 更贴近“整条链路级故障转移”：组里每个成员都是完整链路，而不只是前置 hop
- 即使不同 `dialer-proxy` 对同一落地节点的表现不同，也能按完整链路做切换
- 与你想要的“这次失败，下一次很快切走”目标更接近
- 保持当前“复制副本由用户控制”的交互直觉，不额外引入系统隐式副本

### 建议建模

- 复用现有复制语义，副本就是 `stage2Snapshot.rows[]` 里的普通行
- 新增的是“组装关系”模型：哪些行属于同一个同源落地的激进故障转移组、该组使用 `fallback` 还是 `url-test`
- 首版可要求：只有共享同一 `sourceLandingNodeName` 的多行，才允许被打包进同一个激进组

### 建议渲染

- 用户副本行继续按现有规则渲染成多个实际 `proxies[]` 项
- 每个副本项各自写入用户选定的 `dialer-proxy`
- 系统额外生成一个新的 `fallback` / `url-test` 组，成员指向这些已渲染出来的副本项
- 最方便的实现路径确实是在最终 YAML 基础上做这一层追加/改写，而不是在前面重构 Stage 2 的复制语义

### 关键难点

- 需要定义“哪些用户副本属于同一个组”的显式关系，否则仅靠命名推断会很脆弱
- 需要决定用户最终消费的是“原副本名”还是“新打包组名”，以及二者如何在恢复链路中稳定引用
- 相比方案一仍然多出一个新增组名，因此恢复与命名成本仍高于方案一

### 推荐拆分

- 先验证后端最小闭环：用户副本照常展开、系统打包组追加、恢复判定、输出 YAML 与 fixture
- 再决定前端暴露“组装关系”的方式：显式组选项，或在同源副本上新增“加入某故障转移组”配置器

## 两方案对比

| 维度 | 方案一：覆盖已有地域组参数 | 方案二：用户副本打包成组 |
|------|----------------------------|----------------------------|
| 对现有行模型侵入 | 小 | 中到大 |
| 对现有 `dialer-proxy` 语义一致性 | 很高 | 高 |
| 故障转移粒度 | 既有地域组粒度 | 完整链路粒度 |
| 恢复与命名复杂度 | 低到中 | 中到高 |
| 前端改动量 | 小到中 | 中到大 |
| 后端渲染复杂度 | 低到中 | 中到高 |
| 首个可交付原型速度 | 更快 | 更慢 |

结论建议：

- 若目标是尽快上线一条可控的“激进故障转移”能力，优先推进方案一
- 若目标是把“同一落地 + 多 dialer-proxy”做成完整链路级切换能力，方案二更有长期价值

## 建议的 worktree 并行拆分

### Worktree A：方案一

聚焦范围：

- 已有地域组的激进 profile 数据模型
- `stage2Snapshot` 所需的最小扩展
- 最终 YAML 上的组参数覆盖与恢复判定
- 后端测试与最小前端交互

建议先产出：

- 一份可恢复的长链接 payload 设计
- 一条完整 fixture，证明 `dialer-proxy` 继续指向原地域组，但最终 YAML 中该组参数已被改成激进 `fallback` / `url-test`

### Worktree B：方案二

聚焦范围：

- 用户显式副本的组装关系模型
- 新打包组包装多个用户副本代理的渲染路径
- `stage2Snapshot` / 组装关系 / 恢复判定的最小字段设计
- Comprehensive fixture 与恢复冲突场景

建议先产出：

- 一份最小 YAML 例子，证明“用户复制的同一落地 + 不同 dialer-proxy 副本 + 新策略组”可被 Mihomo 正常消费
- 一份对 `resolve-url` / `stage2Snapshot` 的字段影响说明

## 共享基础任务

无论先做哪条路线，两队都应共享以下基础裁决与产物：

1. 受管命名规则：仅覆盖已有组时不新增名字；若新增打包组，则约定组名前缀与冲突处理
2. 激进 profile：`fallback` / `url-test` 允许的首版参数集合
3. 长链接版本演进策略：是否需要提升 `v`，以及如何兼容旧 payload
4. 测试基线：至少补一条 service 层语义测试和一条 artifact/render 回放测试
5. 文档回写策略：方案定稿后再回写 `docs/spec/03-backend-api.md` 与 `docs/spec/04-business-rules.md`

## 首轮验收口径

任一方案进入实现前，建议以以下最小闭环作为阶段验收：

1. `stage1/convert` 能给出可选的激进链式能力入口，且不破坏现有 `chain` / `port_forward`
2. `generate` 能产出长链接；`resolve-url` 能正确恢复该配置
3. 订阅打开/下载时能渲染出包含激进 `fallback` 或 `url-test` 的 Mihomo YAML
4. 现有“落地节点出组”语义仍成立，不把落地节点误混回地域组
5. 同一输入快照下，生成与恢复得到的组 profile / 打包组命名稳定一致

## 当前建议

- 先切两条 worktree 并行探索，但默认把方案一视为更快出原型的主线
- 方案二先以技术验证和数据模型验证为主，不急于在第一轮就敲定前端最终交互
- 两队共享一份 profile 草案；只有方案二需要额外共享“新打包组命名规则”