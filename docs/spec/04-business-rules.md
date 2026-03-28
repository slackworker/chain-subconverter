# 04 - 业务规则

> 本章是“转换并自动填充”“阶段 2 初始化”“生成前校验与改写”的唯一权威定义。前端展示见 [02-frontend-spec](02-frontend-spec.md)，接口字段见 [03-backend-api](03-backend-api.md)。

---

## 0. `subconverter` 集成前提

- 后端统一通过本地 HTTP 服务访问 `subconverter`
- `subconverter` 作为本项目部署内的内部转换组件存在
- 本章定义的转换规则均建立在该集成前提之上

---

## 1. 转换并自动填充

### 1.1 输入

统一转换管线使用以下输入：

- 落地节点信息
- 中转节点信息
- 转换模板
- 其他 `subconverter` 配置参数
- 端口转发服务信息

其中：

- `subconverter` 使用落地节点信息、中转节点信息、转换模板与其他 `subconverter` 配置参数
- 端口转发服务信息作为阶段 2 与订阅渲染阶段的附加输入保留

### 1.1.1 统一转换管线（权威口径）

一次“转换”必须复用同一条 3-pass 转换管线：

1. `landing-discovery pass`
   - 仅使用落地节点输入
   - 产出落地身份集合
   - 输出形态以节点列表为主
2. `transit-discovery pass`
   - 仅使用中转节点输入
   - 产出中转身份集合与阶段 2 所需的链式候选基础数据
   - 输出形态以中转候选发现所需的最小结果为主
3. `full-base pass`
   - 使用落地节点输入、中转节点输入、转换模板与其他 `subconverter` 参数
   - 产出后续校验与订阅渲染所需的基底配置

执行依赖：

- `landing-discovery pass` 与 `transit-discovery pass` 彼此无数据依赖，允许并行执行
- 本规格不要求这两个 pass 的物理执行先后顺序；只要求其输出语义满足本节定义

复用范围：

- 阶段 1 的“转换并自动填充”必须复用该 3-pass 管线
- `POST /api/generate` 的生成前校验必须复用该 3-pass 管线
- `POST /api/resolve-url` 的恢复可重放性判定必须复用该 3-pass 管线
- 订阅链接实际被打开或下载时的 YAML 渲染必须复用该 3-pass 管线

### 1.1.2 端口转发服务输入校验（权威口径）

本项目当前对端口转发服务输入只做简单校验。

输入与校验规则：

- 逐行解析；空行忽略；保留其余非空行原始顺序
- 每个非空行必须严格匹配 `server:port`
- `server` 仅允许 IPv4 或域名（当前不支持 IPv6）
- `port` 必须是十进制整数，取值范围 `1-65535`
- 不做自动纠错；非空行若包含首尾空白、缺失 `:`、端口非数字或越界，都视为非法行
- 非法行报错；重复行（`server` 与 `port` 完全一致）报错
- 只要存在任一报错，阶段 1 视为失败，不产出 `stage2Init.forwardRelays[]`
- 具体失败响应语义见 [03-backend-api](03-backend-api.md)

### 1.2 输出

统一转换管线存在两类结果语义：

- `stage2Init`：阶段 1 对前端暴露的初始化数据
- `baseCompleteConfig`：`full-base pass` 生成并经后端后处理后的基底完整配置，供后端校验与订阅渲染使用

补充规则：

- 阶段 1 对外返回 `stage2Init`
- `POST /api/generate` 返回校验通过后的链接
- 面向用户消费的最终 `completeConfig` 在订阅链接被打开或下载时即时生成并返回

### 1.3 转换后立即后处理

后端在 `full-base pass` 拿到可解析配置后，必须立刻完成一次“落地节点出组”后处理，再产出 `baseCompleteConfig`。

处理规则：

1. 识别默认模板生成的 6 个区域策略组
2. 从这些区域策略组的成员列表中剔除所有落地节点
3. 若某落地节点同时出现在多个区域策略组中，必须在每个命中的区域策略组内都剔除
4. 完成剔除后的结果，才是后续校验与订阅渲染统一使用的 `baseCompleteConfig`

---

## 2. 阶段 2 初始化

### 2.1 收集落地节点

- 必须从 `landing-discovery pass` 的结果中收集所有落地节点
- 这些节点按稳定名称写入 `stage2Init.landingNodes[]`
- 同时按“每个落地节点一行”生成 `stage2Init.rows[]`
- 阶段 2 第一列只展示这些落地节点，不允许在阶段 2 重新选择或新增

### 2.1.1 落地节点命名与身份边界

- 在当前规格中，`landingNodeName` 是阶段 2 快照、生成改写与恢复重放的唯一定位键
- `landingNodeName` 来源于 `landing-discovery pass` 产出的落地身份集合
- 落地节点名称的产出、重名处理与相关实现细节由 `subconverter` 服务负责；本规格不规定具体命名或消歧算法
- 前端只消费 `stage2Init` 中返回的 `landingNodeName`，不得自行重命名、去重或补算映射
- 稳定性保证范围为“同一后端实现 + 同一输入快照”；跨后端版本或实现细节变化不承诺名称完全一致，若导致旧快照无法按名定位，按 3.2.1 判定为 `conflicted`

### 2.2 判断每行可选模式

阶段 2 第二列的候选模式由功能开关与输入可用性共同决定。

#### 全局规则

- `none` 始终可选
- 当存在链式代理候选时，`chain` 可作为可选模式
- 当满足以下两个条件时，`port_forward` 可作为可选模式：
  - 阶段 1 已开启端口转发功能
  - 阶段 1 已录入至少一个合法端口转发服务

#### 行级规则

- 若某落地节点协议不支持链式代理，则该行不得提供 `chain`
- 当前明确规则为：`vless-reality` 落地节点不支持链式代理

### 2.3 收集链式候选

链式候选统一来自 `transit-discovery pass` 的结果，写入 `stage2Init.chainTargets[]`。

收集范围：

- 中转输入单独转换后可用的默认模板 6 个区域策略组
- `transit-discovery pass` 识别出的单个中转 `proxy`

处理规则：

1. 对区域策略组，读取“仅中转输入”语义下可用的区域策略组结果
2. 若某区域策略组成员数为 `0`，则该区域策略组不进入 `chainTargets[]`
3. 对单个 `proxy` 候选，收集 `transit-discovery pass` 明确识别出的中转节点
4. `chainTargets[]` 中保留区域策略组和单个 `proxy` 两类候选
5. 链式候选范围由区域策略组与中转 `proxy` 构成

### 2.4 收集端口转发候选

- 从阶段 1 录入并校验通过的端口转发服务信息中收集 `forwardRelays[]`
- 保留用户输入顺序
- 当端口转发功能未开启时，`forwardRelays[]` 为空

### 2.5 自动填写 `mode` 与第三列

阶段 2 初始化时，后端必须直接为每行产出默认的 `mode` 与 `targetName`；前端只消费 `stage2Init.rows[]`，不得自行补算初始状态。

#### 初始化决策顺序

1. 先按 `2.2` 为该行确定 `allowedModes`
2. 若 `chain` 在 `allowedModes` 中，则优先按“当链式代理可用”规则尝试自动识别
3. 若 `chain` 不在 `allowedModes` 中、但 `port_forward` 在 `allowedModes` 中，则该行默认 `mode = port_forward`，并按“当 `mode = port_forward`”规则填写 `targetName`
4. 若 `allowedModes` 只有 `none`，则该行默认 `mode = none`，且 `targetName = null`

#### 当链式代理可用

链式代理默认优先尝试“区域策略组自动识别”。

处理步骤：

1. 从落地节点名称中识别其所属区域
2. 在 6 个区域策略组中查找对应区域的候选组
3. 若唯一命中，则：
   - 该行默认 `mode = chain`
   - `targetName` 自动填写为对应区域策略组名称
4. 若无法唯一命中，则：
   - 该行默认 `mode = none`
   - `targetName = null`
   - 保留完整 `chainTargets[]` 供用户手动选择

#### 当 `mode = port_forward`

- 本规则同时适用于“初始化直接落到 `port_forward`”和“用户后续手动切换到 `port_forward`”
- 若 `forwardRelays[]` 中仅有 1 个服务，则 `targetName` 自动填写该服务
- 若 `forwardRelays[]` 中有多个服务，则 `targetName = null`，并保留完整 `forwardRelays[]` 供用户手动选择

#### 初始化决策表

| `allowedModes` | 链式自动识别结果 | `forwardRelays[]` 数量 | 初始化 `mode` | 初始化 `targetName` |
|----------------|------------------|------------------------|---------------|---------------------|
| `["none"]` | 不适用 | 不适用 | `none` | `null` |
| `["none", "chain"]` | 唯一命中 | 不适用 | `chain` | 对应区域策略组名称 |
| `["none", "chain"]` | 未唯一命中 | 不适用 | `none` | `null` |
| `["none", "port_forward"]` | 不适用 | `1` | `port_forward` | 唯一 relay 名称 |
| `["none", "port_forward"]` | 不适用 | `>1` | `port_forward` | `null` |
| `["none", "chain", "port_forward"]` | 唯一命中 | 任意 | `chain` | 对应区域策略组名称 |
| `["none", "chain", "port_forward"]` | 未唯一命中 | 任意 | `none` | `null` |

### 2.6 区域识别口径

当前区域自动识别仅面向默认模板的 6 个区域策略组：

| 区域 ID | 区域名 | 默认模板策略组名 |
|---------|--------|------------------|
| `HK` | 香港 | `🇭🇰 香港节点` |
| `US` | 美国 | `🇺🇸 美国节点` |
| `JP` | 日本 | `🇯🇵 日本节点` |
| `SG` | 新加坡 | `🇸🇬 新加坡节点` |
| `TW` | 台湾 | `🇼🇸 台湾节点` |
| `KR` | 韩国 | `🇰🇷 韩国节点` |

说明：`TW` 对应 `🇼🇸 台湾节点` 是默认转换模板的既有命名约定，按该字面值参与自动识别与默认填充；此处不是笔误。

关键字与匹配规则：

- 大小写不敏感
- 英文关键字按词边界匹配
- 中文与 emoji 关键字按子串匹配
- 若同一名称同时命中多个区域，则视为无法自动唯一识别

---

## 3. 生成前校验与改写

### 3.1 阶段 2 快照语义

每个落地节点对应一行配置：

- `mode = none`：保持原样
- `mode = chain`：第三列表示要写入的 `dialer-proxy`
- `mode = port_forward`：第三列表示要应用的端口转发服务

### 3.2 生成前校验

- 生成时必须先根据 `stage1Input` 重新执行同一条 3-pass 转换管线，得到当前的落地身份集合、链式候选集合与 `baseCompleteConfig`
- 任一行若无法在本次 `baseCompleteConfig` 中按 `landingNodeName` 定位到对应落地节点，必须阻断生成
- 任一行若 `mode != none` 且 `targetName` 为空，必须阻断生成
- 若某行选择 `chain` 但该落地节点协议不支持链式代理，必须阻断生成
- 若 `targetName` 在对应候选列表中不存在，必须阻断生成
- 具体失败响应语义见 [03-backend-api](03-backend-api.md)
- `POST /api/generate` 完成上述校验与链接编码，返回可消费的链接

### 3.2.1 恢复链接时的可重放性判定

本节是 `POST /api/resolve-url` 判断 `restoreStatus` 的权威口径。其关注点是“恢复快照中的配置引用是否仍然有效”，而不是“上游输入是否发生过任何变化”。`resolve-url` 的校验必须复用本章定义的生成前校验口径。

判定规则：

- 后端必须基于恢复出的 `stage1Input` 重新执行同一条 3-pass 转换管线，得到当前的落地身份集合、链式候选集合与 `baseCompleteConfig`
- 后端必须用恢复出的 `stage2Snapshot` 执行与生成阶段一致的逐行校验
- 只要每一行的 `landingNodeName` 仍可定位、`mode` 仍合法、`targetName` 仍可在对应候选集合中解析，则该恢复快照应视为可重放
- 任一行只要出现引用失效，即应判定整个恢复快照不可重放，并返回 `restoreStatus = conflicted`

补充说明：

- 上游订阅内容变化本身不是失败条件；只有变化导致恢复快照中的引用失效，才构成不可重放
- 若 `targetName` 引用的是区域策略组，只要该区域策略组在当前候选集合中仍存在且可用，即使其成员节点发生变化，也应允许恢复并继续生成
- 若 `targetName` 引用的是单个 proxy，则该 proxy 名称必须仍存在于当前候选集合中，否则视为引用失效
- 若某行的 `landingNodeName` 在当前转换结果中已不存在、被重命名或无法唯一对应，则视为引用失效
- `restoreStatus = conflicted` 时，响应必须附带冲突提示消息；具体消息语义见 [03-backend-api](03-backend-api.md)

示例：

- 合法放行：中转订阅更新后，`🇭🇰 香港节点` 这个区域策略组的成员发生变化，但恢复快照中的某行仍引用 `targetName = "🇭🇰 香港节点"`；此时应判定为可重放
- 不合法阻断：落地订阅更新后，原来的 `landingNodeName = "HK 01"` 变成了其他名称，导致恢复快照无法按原名称定位该落地节点；此时应判定为不可重放

### 3.3 链式代理改写

订阅链接被访问时，后端必须在本次重新生成的 `baseCompleteConfig` 基础上执行如下改写：

- 按 `landingNodeName` 定位落地节点
- 当 `mode = chain` 时，为该落地节点添加 `dialer-proxy: <targetName>`
- `targetName` 可以是区域策略组，也可以是单个 proxy；生成时按字符串原样写入

### 3.4 端口转发改写

- 改写基础必须是订阅渲染阶段本次重新生成的 `baseCompleteConfig`
- 按 `landingNodeName` 定位落地节点
- 当 `mode = port_forward` 时，用选中的端口转发服务替换该落地节点的 `server` 与 `port`
- 仅替换 `server` 与 `port`，不联动修改其他字段

### 3.5 协议限制

- `vless-reality` 不支持链式代理
- `vless-reality` 允许端口转发
- 端口转发对 `vless-reality` 仍只替换 `server` 与 `port`

### 3.6 最终配置交付时机

- 订阅链接被打开或下载时，后端即时生成并返回最终 `completeConfig`
- 订阅渲染时，后端必须先重新执行同一条 3-pass 转换管线，得到当前 `baseCompleteConfig`
- 后端随后基于请求中的 `stage2Snapshot` 应用 3.3 与 3.4 改写
- 改写完成后的结果作为本次返回给用户消费的最终 `completeConfig`

