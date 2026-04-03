# 04 - 业务规则

> 本章是“转换并自动填充”“阶段 2 初始化”“生成前校验与改写”的唯一权威定义。前端展示见 [02-frontend-spec](02-frontend-spec.md)，接口字段见 [03-backend-api](03-backend-api.md)。

---

## 0. `subconverter` 集成前提

- 后端统一通过本地 HTTP 服务访问 `subconverter`
- `subconverter` 作为本项目部署内的内部转换组件存在
- 本章定义的转换规则均建立在该集成前提之上

### 0.1 `subconverter` 运行边界

- 后端统一调用同部署内常驻的 `subconverter` HTTP 服务
- 后端对 `subconverter` 的每次调用都必须设置超时；超时值必须可配置，默认 `15s`
- 默认部署下，`subconverter` 必须开启订阅/配置/规则集缓存，或提供等价的重复拉取收敛机制；不得以关闭缓存作为正常运行默认值
- 后端对 `subconverter` 的同时在途请求数必须受控且可配置，默认 `10`
- 达到并发上限时，后端必须立即失败；不得继续转发、不得排队等待
- 业务层默认不对失败的 `subconverter` 调用自动重试
- 若显式启用重试，最多只允许 `1` 次串行重试，且不得并行放大请求
- 后端必须在转发给 `subconverter` 前先校验参与本次转换的输入边界；超限时必须直接拒绝，不得转发给 `subconverter`
- 参与转换的 `landingRawText` 与 `transitRawText` 规范化后总大小上限必须可配置，默认 `2048` bytes
- 若阶段 1 支持多 URL 输入，`landingRawText` 与 `transitRawText` 各自承载的 URL 数量上限都必须可配置，默认每个字段最多 `20` 条
- `subconverter` 调用若出现超时、连接失败、非成功 HTTP 响应、不可解析结果或并发上限拒绝，均视为该 pass 失败
- `landing-discovery pass`、`transit-discovery pass`、`full-base pass` 中任一必需 pass 失败时，当前请求必须整体失败；不做跨 pass 降级，不复用旧结果

### 0.2 `subconverter` 调用契约

- 本项目当前只定义一种内部转换入口：`GET /sub`
- 三个 pass 都必须复用同一组固定参数与阶段 1 高级选项映射结果
- 三个 pass 必须属于同一条转换管线；`full-base pass` 必须与同一管线中的两个 discovery pass 保持输入快照一致
- 实现必须核对 discovery pass 返回的每个 `proxy.name`，都能在同一管线的 `full-base pass` 完整代理集合中按同名定位；若不能定位，视为 pass 失败

### 0.2.1 pass 级参数约束

- 三个 pass 的 `target` 都必须传 `clash`
- `landing-discovery pass`：`url` 只传落地节点信息，传 `list=true`
- `transit-discovery pass`：`url` 只传中转节点信息，传 `list=true`
- `full-base pass`：`url` 传“落地节点信息 + 中转节点信息”，不传 `list`
- `url` 的拼接与编码沿用既有逻辑；本 spec 不再展开

### 0.2.2 `subconverter` 参数表

本表是 `GET /sub` 查询参数的唯一权威定义位置。前端展示只见 [02-frontend-spec](02-frontend-spec.md)，接口快照字段只见 [03-backend-api](03-backend-api.md)。

| 参数 | 前端状态 | 默认值 | 传递规则 |
|------|----------|--------|----------|
| `target` | 隐藏 | `clash` | 必传，固定传 `clash` |
| `url` | 隐藏 | 无 | 必传；按 `0.2.1` 的 pass 规则传 |
| `emoji` | 展示 | 勾选 | 勾选时传 `true`；不勾选时不传，保持上游默认 |
| `udp` | 展示 | 勾选 | 勾选时传 `true`；不勾选时不传，保持上游默认 |
| `scv` | 展示 | 不勾选 | 勾选时传 `true`；不勾选时不传，保持上游默认 |
| `list` | 隐藏 | 无 | 两个 discovery pass 传 `true`；`full-base pass` 不传 |
| `config` | 展示 | 见下方补充 | 非空才传；留空时回落默认本地配置；允许自定义 |
| `include` | 展示 | 空 | 非空才传 |
| `exclude` | 展示 | 空 | 非空才传 |
| `expand` | 隐藏 | `false` | 必传，固定传 `false` |
| `classic` | 隐藏 | `true` | 必传，固定传 `true` |

补充规则：

- “跳过证书验证”这一高级选项的业务语义对应上游 `skip_cert_verify`；实际传给 `subconverter` 的查询参数名为 `scv`
- `config` 的默认行为为：留空时不传 `config` 参数，并由集成的 `subconverter` 回落使用其目录下的 `base/config/Aethersailor_Custom_Clash.ini`
- 若用户显式填写 `config`，则三个 pass 都按该值透传，允许使用其他本地或远程配置文件
- 同一次转换管线内，三个 pass 的 `emoji`、`udp`、`scv`、`config`、`include`、`exclude` 都必须来自同一份阶段 1 高级选项快照
- `expand=false` 与 `classic=true` 不提供前端控件，后端必须固定传递

---

## 1. 转换并自动填充

### 1.1 输入

统一转换管线使用以下输入：

- 落地节点信息
- 中转节点信息
- `config` 与其他 `subconverter` 配置参数
- 端口转发服务信息

其中：

- `subconverter` 使用落地节点信息、中转节点信息、`config` 与其他 `subconverter` 配置参数
- 端口转发服务信息作为阶段 2 与订阅渲染阶段的附加输入保留
- `advancedOptions.enablePortForward = false` 时，端口转发服务信息必须为空字符串，且不得参与解析、校验或候选生成

### 1.1.1 统一转换管线（权威口径）

一次“转换”必须复用同一条 3-pass 转换管线。

`0.2` 是该管线的唯一调用契约定义位置；`1.1.1` 只定义每个 pass 的输入职责与产物，不重复定义 HTTP 路径、查询参数或公共 `subconverter` 参数复用规则。

1. `landing-discovery pass`
   - 只使用落地节点输入
   - 产出落地身份集合
   - 输出形态以节点列表为主
2. `transit-discovery pass`
   - 只使用中转节点输入
   - 产出中转身份集合与阶段 2 所需的链式候选基础数据
   - 输出形态以中转候选发现所需的最小结果为主
3. `full-base pass`
   - 同时使用落地节点输入与中转节点输入
   - 产出后续校验与订阅渲染所需的基底配置

具体 HTTP 路径、查询参数约束与 discovery/full-base 的一致性要求，统一以 `0.2` 为准。

复用范围：

- 阶段 1 的“转换并自动填充”必须复用该 3-pass 管线
- `POST /api/generate` 的生成前校验必须复用该 3-pass 管线
- `POST /api/resolve-url` 的恢复可重放性判定必须复用该 3-pass 管线
- 订阅链接实际被打开或下载时的 YAML 渲染必须复用该 3-pass 管线

### 1.1.2 端口转发服务输入校验（权威口径）

输入与校验规则：

- 逐行解析；空行忽略；保留其余非空行原始顺序
- 每个非空行必须严格匹配 `server:port`
- 当前不支持 IPv6；`server` 只允许两类：严格 IPv4、ASCII hostname
- 若 `server` 仅由数字与 `.` 组成，则必须按严格 IPv4 校验：恰有 `4` 段、每段为 `0-255` 的十进制整数、多位段不得有前导 `0`
- 否则必须按 ASCII hostname 校验：总长度 `1-253`、至少包含一个 `.`、按 `.` 分段后每段长度 `1-63`、每段仅允许字母/数字/`-`、段首尾不得为 `-`
- ASCII hostname 不允许空段，因此不允许连续 `.` 与尾点；不允许 `_`；不允许原始 Unicode 字符
- `port` 必须是十进制整数，取值范围 `1-65535`
- 不做自动纠错；非空行若包含首尾空白、缺失 `:`、端口非数字或越界，都视为非法行
- 本规则只做语法校验；不做 DNS 解析、可达性校验；私网、环回与其他保留 IPv4 地址不因地址类型额外判错
- 非法行报错；重复行报错。重复判定时，hostname 必须按 ASCII 小写归一化后与 `port` 一起比较；IPv4 按原值与 `port` 一起比较
- 每条合法服务都必须生成唯一的规范化字面量 `server:port`：hostname 一律转为 ASCII 小写，IPv4 保持原值，`port` 一律转为无前导 `0` 的十进制字符串
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

### 1.3 落地节点出组后处理

后端在 `full-base pass` 拿到可解析配置后，必须在后续首次消费 `baseCompleteConfig` 之前，语义上完成一次“落地节点出组”后处理。

实现可以采用“预先落地改写”或“按需值视图/流式替换”，但对外行为必须等价。

处理规则：

1. 识别默认模板生成的 6 个区域策略组
2. 从这些区域策略组的成员列表中剔除所有落地节点
3. 若某落地节点同时出现在多个区域策略组中，必须在每个命中的区域策略组内都剔除
4. 完成剔除后的结果，才是后续校验与订阅渲染统一使用的 `baseCompleteConfig`
5. 在执行 2.3 的区域策略组成员统计前，必须保证剔除语义已生效；不得把落地节点计入区域策略组成员数

---

## 2. 阶段 2 初始化

### 2.1 收集落地节点

- 必须从 `landing-discovery pass` 的结果中收集所有落地节点
- 收集口径固定为：读取 `list=true` 返回的 Clash YAML `proxies[]`，按每个 `proxy.name` 提取落地身份
- 按“每个落地节点一行”生成 `stage2Init.rows[]`
- 阶段 2 第一列只展示这些落地节点，不允许在阶段 2 重新选择或新增

### 2.1.1 落地节点命名与身份边界

- 在当前规格中，`landingNodeName` 是阶段 2 快照、生成改写与恢复重放的唯一定位键
- `landingNodeName` 来源于 `landing-discovery pass` 产出的落地身份集合
- 落地节点名称的产出、重名处理与相关实现细节由 `subconverter` 服务负责；本规格不规定具体命名或消歧算法
- 前端只消费 `stage2Init` 中返回的 `landingNodeName`，不得自行重命名、去重或补算映射
- 稳定性保证范围为“同一后端实现 + 同一输入快照”；跨后端版本或实现细节变化不承诺名称完全一致，若导致旧快照无法按名定位，按 3.2.1 判定为 `conflicted`

### 2.2 判断全局可用模式与行级限制

阶段 2 第二列的候选模式分为两层：

- `stage2Init.availableModes`：本次阶段 2 的全局模式基线
- `rows[].restrictedModes`：某一行额外禁用的模式与原因；仅在该行存在额外限制时返回

#### 全局规则

- `stage2Init.availableModes` 必须始终包含 `none`
- 当存在链式代理候选时，`stage2Init.availableModes` 必须包含 `chain`
- 当满足以下两个条件时，`stage2Init.availableModes` 必须包含 `port_forward`
  - 阶段 1 已开启端口转发功能
  - 阶段 1 已录入至少一个合法端口转发服务
- 当某模式不满足上述全局条件时，`stage2Init.availableModes` 不得包含该模式
- `stage2Init.availableModes` 的顺序固定为 `none`、`chain`、`port_forward`；未启用的模式直接省略，不重排其余模式相对顺序

#### 行级规则

- 某行的最终可选模式 = `stage2Init.availableModes` 扣除当前行 `restrictedModes` 中出现的模式键
- `rows[].restrictedModes` 为可选字段；缺失表示该行无额外模式限制
- `rows[].restrictedModes` 中的模式键必须属于 `stage2Init.availableModes`
- `rows[].restrictedModes.<mode>.reasonCode` 与 `reasonText` 都必须返回；`reasonText` 面向用户展示
- 若 `chain` 已出现在 `stage2Init.availableModes` 中，且某落地节点协议不支持链式代理，则该行必须返回 `restrictedModes.chain`
- 当前明确规则为：`vless-reality` 落地节点不支持链式代理；当 `chain` 已出现在 `stage2Init.availableModes` 中时，该行的 `restrictedModes.chain.reasonCode` 必须为 `UNSUPPORTED_BY_LANDING_PROTOCOL`

### 2.3 收集链式候选

链式候选统一来自同一条 3-pass 管线的中转相关结果，写入 `stage2Init.chainTargets[]`。

收集范围：

- `full-base pass` 生成并满足 `1.3` 剔除语义后的默认模板 6 个区域策略组
- `transit-discovery pass` 识别出的单个中转 `proxy`

处理规则：

1. 对区域策略组，读取 `baseCompleteConfig` 中这 6 个区域策略组的当前结果
2. 区域策略组成员数按“真实中转节点成员”计算；占位的 `DIRECT` 与所有落地节点都不计入成员数
3. 若某区域策略组只包含 `DIRECT`，或剔除 `DIRECT` 后成员数为 `0`，则该区域策略组不进入 `chainTargets[]`
4. 对单个 `proxy` 候选，读取 `transit-discovery pass` 的 Clash YAML `proxies[]`，按每个 `proxy.name` 收集中转节点
5. `chainTargets[]` 中只保留 `name` 与 `kind`；不得暴露 `regionId` 或其他当前前端不消费的元数据
6. 默认模板 6 个区域策略组写入 `chainTargets[]` 时，`kind = proxy-groups`
7. 单个中转 `proxy` 写入 `chainTargets[]` 时，`kind = proxies`
8. `kind` 只是前端分组展示辅助字段，不参与候选匹配、快照序列化或恢复定位
9. `chainTargets[].name` 在同一次转换内必须全局唯一；它既是阶段 2 下拉选项值，也是 `stage2Snapshot.rows[].targetName` 的序列化值
10. 若任一中转 `proxy.name` 与默认模板 6 个区域策略组中的任意一个重名，或任意两个中转 `proxy` 重名，必须以 `CHAIN_TARGET_NAME_CONFLICT` 直接阻断本次请求

### 2.4 收集端口转发候选

- 从阶段 1 录入并校验通过的端口转发服务信息中收集 `forwardRelays[]`
- `forwardRelays[].name` 必须等于该服务的规范化 `server:port` 字面量
- 保留用户输入顺序
- 当端口转发功能未开启时，`forwardRelays[]` 为空

### 2.5 自动填写 `mode` 与第三列

阶段 2 初始化时，后端必须直接为每行产出默认的 `mode` 与 `targetName`；前端只消费 `stage2Init.rows[]`，不得自行补算初始状态。

#### 初始化决策顺序

1. 先按 `2.2` 确定 `stage2Init.availableModes`
2. 再为该行计算 `restrictedModes`
3. 用 `stage2Init.availableModes` 扣除该行 `restrictedModes`，得到该行最终可选模式
4. 若 `chain` 在该行最终可选模式中，则优先按“当链式代理可用”规则尝试自动识别
5. 若 `chain` 不在该行最终可选模式中、但 `port_forward` 在该行最终可选模式中，则该行默认 `mode = port_forward`，并按“当 `mode = port_forward`”规则填写 `targetName`
6. 若该行最终可选模式只有 `none`，则该行默认 `mode = none`，且 `targetName = null`

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
- `targetName` 必须保存所选 `forwardRelays[].name`，不得另造别名
- 若 `forwardRelays[]` 中仅有 1 个服务，则 `targetName` 自动填写该服务的 `name`
- 若 `forwardRelays[]` 中有多个服务，则 `targetName = null`，并保留完整 `forwardRelays[]` 供用户手动选择

#### 初始化决策表

| 行最终可选模式 | 链式自动识别结果 | `forwardRelays[]` 数量 | 初始化 `mode` | 初始化 `targetName` |
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

**区域归属**（`landingNodeName` 属于哪一区域）的**唯一规则来源**为仓库内置文件 `internal/service/default_region_config.ini` 中与上表六条「默认模板策略组名」对应的六行 `custom_proxy_group=…` `url-test` 所声明的完整正则 pattern。

阶段 2 初始化时，无论用户是否显式填写 `config`，实现都必须直接使用这六条完整正则在完整 `landingNodeName` 上匹配；不得自行改写、拆分或降级为关键词规则，也不得为了自动识别再额外读取用户提供的本地或远程 `config` 内容。

用户填写的 `config` 仍只影响同一次 3-pass 转换的实际产物，因此“对应区域策略组是否可用于自动填充”必须以当次 `stage2Init.chainTargets[]` 为准：只有当唯一命中的区域策略组名字面量同时存在于 `chainTargets[]` 中时，才允许自动填写；否则按 `2.5` 的“未唯一命中”处理，保留候选供用户手动选择中转目标。

命中 **0** 条或 **多于 1** 条时，链式自动识别失败（见 2.5）；**恰好 1** 条时，默认 `targetName` 为上表中该行的策略组名字面量，且须在当次 `chainTargets[]` 中存在同名区域策略组条目。

---

## 3. 生成前校验与改写

### 3.1 阶段 2 快照语义

每个落地节点对应一行配置：

- `mode = none`：保持原样
- `mode = chain`：第三列表示要写入的 `dialer-proxy`
- `mode = port_forward`：第三列表示要应用的端口转发服务
- `stage2Snapshot.rows` 的数组顺序不参与生成语义；生成校验、恢复判定与最终改写都只按 `landingNodeName` 匹配对应落地节点

### 3.2 生成前校验

- 生成时必须先根据 `stage1Input` 重新执行同一条 3-pass 转换管线，得到当前的落地身份集合、链式候选集合与 `baseCompleteConfig`
- 若任一必需 pass 失败，必须直接阻断生成
- `stage2Snapshot.rows` 必须与当前落地节点集合一一对应：每个落地节点恰好出现一次，不允许缺行、重复行或额外行；不满足时必须以 `STAGE2_ROWSET_MISMATCH` 阻断生成
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
- 若任一必需 pass 失败，`resolve-url` 必须直接返回失败响应；该情形不是 `restoreStatus = conflicted`
- 后端必须用恢复出的 `stage2Snapshot` 执行与生成阶段一致的逐行校验
- 只要每一行的 `landingNodeName` 仍可定位、`mode` 仍合法、`targetName` 仍可在对应候选集合中解析，则该恢复快照应视为可重放
- 任一行只要出现引用失效，即应判定整个恢复快照不可重放，并返回 `restoreStatus = conflicted`

补充说明：

- 上游订阅内容变化本身不是失败条件；只有变化导致恢复快照中的引用失效，才构成不可重放
- 若 `targetName` 引用的是 `proxy-groups` 候选，只要该候选在当前候选集合中仍存在且可用，即使其成员节点发生变化，也应允许恢复并继续生成
- 若 `targetName` 引用的是 `proxies` 候选，则该 `proxy.name` 必须仍存在于当前候选集合中，否则视为引用失效
- 若 `targetName` 引用的是端口转发服务，则该规范化 `server:port` 字面量必须仍存在于当前 `forwardRelays[]` 中，否则视为引用失效
- 若某行的 `landingNodeName` 在当前转换结果中已不存在、被重命名或无法唯一对应，则视为引用失效
- `restoreStatus = conflicted` 时，响应必须附带冲突提示消息；具体消息语义见 [03-backend-api](03-backend-api.md)

示例：

- 合法放行：中转订阅更新后，`🇭🇰 香港节点` 这个区域策略组的成员发生变化，但恢复快照中的某行仍引用 `targetName = "🇭🇰 香港节点"`；此时应判定为可重放
- 不合法阻断：落地订阅更新后，原来的 `landingNodeName = "HK 01"` 变成了其他名称，导致恢复快照无法按原名称定位该落地节点；此时应判定为不可重放

### 3.3 链式代理改写

订阅链接被访问时，后端必须在本次重新生成的 `baseCompleteConfig` 基础上执行如下改写：

- 按 `landingNodeName` 定位落地节点
- 当 `mode = chain` 时，为该落地节点添加 `dialer-proxy: <targetName>`
- `targetName` 可以是 `proxy-groups` 候选，也可以是 `proxies` 候选；生成时按字符串原样写入

### 3.4 端口转发改写

- 改写基础必须是订阅渲染阶段本次重新生成的 `baseCompleteConfig`
- 按 `landingNodeName` 定位落地节点
- 当 `mode = port_forward` 时，将 `targetName` 按规范化 `server:port` 重新解析为 `server` 与 `port`，再用其替换该落地节点的 `server` 与 `port`
- 仅替换 `server` 与 `port`，不联动修改其他字段

### 3.5 协议限制

- `vless-reality` 不支持链式代理
- `vless-reality` 允许端口转发
- 端口转发对 `vless-reality` 仍只替换 `server` 与 `port`

### 3.6 最终配置交付时机

- 订阅链接被打开或下载时，后端即时生成并返回最终 `completeConfig`
- 订阅渲染时，后端必须先重新执行同一条 3-pass 转换管线，得到当前 `baseCompleteConfig`
- 若任一必需 pass 失败，订阅渲染必须直接失败
- 后端随后基于请求中的 `stage2Snapshot` 应用 3.3 与 3.4 改写
- 改写完成后的结果作为本次返回给用户消费的最终 `completeConfig`

