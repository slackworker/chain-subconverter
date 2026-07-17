# 02 - 前端 UI 规格

> 本章只定义共享层必须稳定的前端业务契约，以及方案层可自由分化的边界。业务规则见 [04-business-rules](04-business-rules.md)，接口字段见 [03-backend-api](03-backend-api.md)。

## 主线业务路径

- 当前前端主线固定为：阶段 1 输入 -> 转换并自动填充 -> 阶段 2 配置 -> 生成链接 -> 阶段 3 消费链接
- “阶段 1 -> 阶段 2 -> 阶段 3”仅表示业务顺序；页面建议三阶段自上而下平铺展示，动作可用性由状态与校验结果控制
- `resolve-url` 只承担“从既有 `longUrl` / `shortUrl` 恢复页面状态”的辅助职责，不单独形成新的业务阶段
- 恢复入口归属于阶段 3 的输出域能力
- Navbar、stepper/tab、品牌头图、主题切换等页面外壳不属于共享业务边界，可由 A/B/C 方案自行决定

---

## 全局边界

### 共享层必须定义的内容

- 系统要收集哪些输入、展示哪些业务结果、允许哪些关键交互行为
- 阶段 1、阶段 2、阶段 3 的职责边界与数据流向
- 恢复、转换、生成、短链切换、错误阻断、只读冲突态等状态语义
- 共享通知承载模型：阻断反馈区、消息日志、阶段内嵌状态提示与局部定位提示各自承担什么语义
- `blockingErrors[].scope` 与前端展示中的 Stage 1 / 2 / 3 标签各自承担什么语义

### 方案层在无约定的情况下可自由决定的内容

- 页面结构、信息架构、布局方向、滚动节奏、分栏方式
- Stage 标题、说明文案、按钮文案、图标与视觉层级
- 是否使用卡片、分段、抽屉、弹层、菜单、页内折叠等具体呈现形式

### 共享业务层与方案层组件边界

| 范围 | 必须稳定/可自由分化 | 当前内容 |
|------|------|------|
| 共享业务层 | 必须稳定 | domain types、API client、页面状态模型、恢复/转换/生成/短链切换流程、`blockingErrors[]/messages[]` 语义、`chainTargets[].kind` 业务抽象 |
| 共享业务层 | 必须稳定 | 主阻断反馈承载位、全局消息日志、阶段内嵌状态提示、局部定位语义、Stage 3 单一当前链接输入框的业务语义 |
| 方案层 | 可自由分化 | Stage 容器、notice/message 呈现、status 展示、target chooser 的具体 UI 形态 |
| 方案层 | 可自由分化 | Stage 标题与说明文案、页面壳层、布局、视觉风格、阶段标签文案、动作分组与信息层级 |

- 前端共享入口只允许依赖共享业务层接口，不得直接把某一套默认方案组件当成共享层本体
- 方案层可以通过注入或装配的方式提供 Stage 容器、notice renderer、status display、target chooser 等 UI 实现，但不得改变共享业务语义
- A/B/C 方案应以 `0 UI` 为起点独立开发，不以任一既有页面壳层作为继承前提
- 共享层严格限定为业务契约与状态语义，不包含任何 UI 壳、页面骨架或视觉容器实现
- 默认发布方案与探索性方案必须保持运行时解耦；不得把默认方案降级为某个实验方案的运行时别名
- 每个方案入口必须保持自包含，并通过稳定的共享业务层接口接入；不得让默认发布方案在运行时直接依赖实验方案页面实现

### 方案分级：发布基线与探索性

| 方案 | 路由 | `interactionTier` | 定位 |
|------|------|-------------------|------|
| `default` | `/` | `baseline` | 发布默认入口；冻结目录，不作为 dev 上的持续实验场 |
| UI B-1 | `/ui/b1` | `exploratory` | 探索性方案 B 变体 1（`feat/ui-b-1`） |
| UI B-2 | `/ui/b2` | `exploratory` | 探索性方案 B 变体 2（`feat/ui-b-2`） |
| UI C-1 | `/ui/c1` | `exploratory` | 探索性方案 C 变体 1（`feat/ui-c-1`） |
| UI C-2 | `/ui/c2` | `exploratory` | 探索性方案 C 变体 2（`feat/ui-c-2`） |

**探索性方案（UI B / UI C）**

- 优先验证不同的信息架构、操作路径、布局节奏与视觉风格；**不作为**本章对方案层交互/呈现细节的权威样板，也不要求与 `default` 在壳层或视觉上对齐。
- **允许**：在不影响业务正确性的前提下，脱离本章对交互方式、分步/平铺节奏、通知区具体形态、按钮分组与文案层级等的描述，自行定义交互与风格。
- **不得**：削弱或改写上文「共享层必须定义的内容」、[04-business-rules](04-business-rules.md) 业务规则、[03-backend-api](03-backend-api.md) 接口契约，以及共享业务层状态语义（含 `blockingErrors[]` / `messages[]`、`restoreStatus`、阶段 2 只读冲突态等）。
- **验收口径（业务能力）**：须能完整走通主线——阶段 1「转换并自动填充」→ 阶段 2 配置（含 stale、复制 instance、`conflicted` 只读冲突等）→ 阶段 3 生成与消费（长/短链、打开预览、复制、下载、反向解析）→ 必要时经 `resolve-url` 恢复；错误须按 `scope` 可定位且可阻断错误操作。不要求与 spec 02 的交互细节或文案一一对应。
- **提升为 default**：探索性方案经回归与产品确认后，仍可通过 promote 脚本整体复制为 `default`；提升时须重新评估是否收敛到发布级交互约定。

各 scheme 的 `interactionTier` 在 `web/src/scheme/<id>/index.ts` 元数据中声明；共享层与 CI 不据此改变行为，仅作文档与维护者约定。

### `scope` 与阶段标签

- `blockingErrors[].scope`、`originStage` 的权威定义见 [03-backend-api](03-backend-api.md)「4. 消息与错误模型」
- 本章只约束前端展示边界：`scope` 负责局部定位语义；阶段标签只负责请求来源说明

### 共享通知承载模型

- 共享层通知承载模型固定为 4 类：主阻断反馈承载位、全局 workflow log、阶段内嵌工作流状态槽位、字段/行级局部定位提示
- 本节只定义“每类承载区装什么”，不定义创建、清除、压制与降级时机；后者以 [04 §4](04-business-rules.md) 为准
- 主阻断反馈承载位只承载当前失败请求的 `blockingErrors[]`；单次失败请求只能有 1 个主阻断反馈承载位
- 方案层可选择 `stage-local` 或 `global-only` 两种主反馈承载策略；若展示 Stage 1 / 2 / 3 来源标签，只能由请求入口或工作流上下文派生，不得由 `scope` 反推
- `SUBCONVERTER_UNAVAILABLE` 的主提示与 `blockingErrors[].context.diagnostic` 只允许映射为业务化文案；不得直接暴露内部 pass、容器主机名、内部 URL、查询串或原始技术错误
- 全局 workflow log 承载当前页面会话内的用户可读工作流历史；后端 `messages[]` 只是其中一种消息源，不等同于整个日志系统
- workflow log 可折叠、可限量保留，但必须保持顺序并允许查看最近保留历史；不得退化为“仅当前请求消息”或“仅最近一条消息”
- workflow log 可追加少量本地生成的用户可读事件，但不得写入内部调试噪声；纯 UI 回声默认不进入 workflow log
- 阶段内嵌工作流状态槽位只承载 `stale`、`awaiting`、`conflicted` 等状态提示，不等同于阻断反馈
- 字段/行级局部定位提示只负责把用户带到具体修正位置，不单独构成新的主通知区
- 共享层不允许同一请求同时出现两个并列主反馈位，也不推荐把多个阶段消息区与全局区设计为同权重主消息堆栈

---

## 阶段 1：输入区

阶段 1 负责收集原始输入，并通过“转换并自动填充”生成阶段 2 所需的配置基底。

### 1.1 落地节点信息输入区

- 用途：输入落地节点或落地订阅信息
- 输入内容：订阅 URL、节点 URI，以及手动补录的 SOCKS5 节点

#### 1.1.1 手动添加 SOCKS5 节点

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 节点名称 |
| `server` | 是 | 服务器地址 |
| `port` | 是 | 端口号 |
| `username` | 否 | 用户名 |
| `password` | 否 | 密码 |

- 仅支持手动添加 SOCKS5 类型的节点
- `username` 与 `password` 必须成对出现
- `server`、`port` 的录入合法性必须在前端共享层统一校验：`server` 只允许 IPv4 或 ASCII 域名，`port` 只允许 `1-65535` 的十进制整数
- 若前端支持 `socks5://` URI 粘贴输入，收到后必须先解析为 `name/server/port/username/password` 再进入提交流程
- 提交后必须转换为一条 `subconverter` 可解析的 SOCKS URI 追加到落地输入区
- 提交时必须统一编码为 `tg://socks?server=<server>&port=<port>&remarks=<name>`；若存在认证信息，则继续追加 `&user=<username>&pass=<password>`
- 统一使用 `tg://socks` 是权威口径，不再区分 `IPv4` / 主机名，也不再生成 `socks://<base64>`；原因是 `subconverter` 已正式支持 Telegram 风格 SOCKS 源，且该格式可以规避当前 `socks://<base64>` 在“域名 + 认证”等组合上的解析局限
- `server` / `port` 的共享合法性规则不得散落在单一 UI 方案组件内重复实现

#### 1.1.2 落地副本

- 同一落地节点的多个副本只能在阶段 1 创建
- 多条完全一致的 URI 不去重，视为用户显式创建副本
- 副本名称将由后端稳定重命名，供阶段 2 第一列展示

### 1.2 中转信息输入区

- 用途：输入中转节点或中转订阅信息
- 输入方式：订阅 URL、节点 URI、`data:text/plain,<base64文本>`
- 端口转发服务录入能力属于阶段 1 的独立逻辑块，不是 `transitRawText` 文本输入本身
- 具体输入归一化与上游传递规则见 [04-business-rules](04-business-rules.md)

#### 1.2.1 端口转发服务

- `default` 方案与探索性方案（`b1`、`b2`、`c1`、`c2`）均直接暴露端口转发入口；用户可通过「+端口转发」添加条目，无需先开启开关
- 端口转发服务在业务语义上是阶段 1 的独立逻辑块
- 端口转发服务不写入 `transitRawText`，而是以独立字段 `forwardRelayItems` 进入阶段 1 快照
- 端口转发服务的后续消费链路独立于中转节点文本输入；其输入、校验、去重与阶段 2 消费均按独立业务语义处理
- 提交阶段 1 快照时，端口转发服务必须以 `forwardRelayItems: string[]` 传递；每个 Tag 对应数组中的一个输入项，保留输入顺序
- 校验与去重口径：统一遵循 [04-business-rules](04-business-rules.md) `1.1.2 端口转发服务输入校验（权威口径）`
- 前端可在 modal 录入或确认提交时复用同一口径做预校验，并阻止非法值进入 `forwardRelayItems`；但后端返回的校验结果仍是最终裁决

### 1.3 高级菜单区

- 形态：默认折叠/隐藏
- 阶段 1 中可配置的 `subconverter` 参数收纳在此区域
- 前端控件集合：`emoji`、`udp`、`skipCertVerify`（与 `GET /sub` 查询参数 `scv` 对应）、`config`、`include`、`exclude`
- `emoji` 对外仍表现为 subconverter 风格高级选项（参数名与勾选语义不变）；前端仅负责采集该字段，处理规则以 [04 §0.2.3](04-business-rules.md) 为准
- 阶段 1 提交模型必须保持结构化：高级菜单区中的 API 字段作为 `advancedOptions` 对象提交；端口转发服务作为 `forwardRelayItems` 数组提交
- `config` 的界面语义是“模板 URL”；字段名保留 `config` 仅为了兼容后端 API 与 `subconverter` 上游查询参数
- “模板 URL”输入框默认填入 `GET /api/runtime-config` 返回的 `defaultTemplateURL`
- 前端同时从 `GET /api/runtime-config` 读取 `maxPublicLongURLLength`，用于决定何时必须强制切换为短链接展示
- 前端必须把默认模板 URL 作为普通输入值写入 `advancedOptions.config`；该值随阶段 1 请求、生成请求与长链接状态载荷一起提交
- 前端默认值、三态模型与入站归一化规则以 [03-backend-api](03-backend-api.md) 为准
- 参数默认值与 `GET /sub` 传递规则以 [04-business-rules](04-business-rules.md) `0.2.2 subconverter 参数表` 为准

### 1.4 转换动作

- 功能：调用 `POST /api/stage1/convert`
- 成功后：使用后端返回的 `stage2.catalog` + 默认 `stage2.snapshot` 初始化阶段 2；若为 reconvert，前端按 [06 §9](06-stage2-model.md) 本地 merge（全局 reset 则整份覆盖）
- 当接口返回失败时，前端按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`
- 阶段 1 成功不代表前端已拿到 `completeConfig`；前端只消费初始化结果

### 1.5 阶段 1 交互约束

- 逻辑上必须覆盖：落地输入、手动添加 SOCKS5 节点、中转输入、端口转发服务弹窗录入与标签展示、高级选项与转换动作；探索性方案另外覆盖端口转发开关
- 方案层在无约定的情况下可以重组这些内容的物理布局、信息层级与展开节奏，但不得删改其业务语义
- 修改阶段 1 任一输入后，阶段 2 标记过期：禁用“生成链接”，直到下一次转换成功
- `stage2Stale` 属于阶段工作流状态语义；方案层可在阶段内嵌状态槽位提示“需重新执行转换并自动填充”
- 当页面当前存在请求级阻断反馈时，`stage2Stale` 的正文提示不应继续作为同层主通知与阻断反馈并列竞争；状态 pill、禁用态等状态语义仍需保留

---

## 阶段 2：配置区

阶段 2 以嵌套树 `stage2.snapshot`（`servers → sources → instances`）为权威数据；平铺表仅为 DFS 投影。初始化来自 convert 返回的 `stage2.catalog` + 默认 `snapshot`；字段与操作语义见 [06-stage2-model](06-stage2-model.md)。

### 2.1 数据模型

| 字段 | 类型 | 说明 |
|------|------|------|
| `catalog.availableModes` | `mode[]` | 阶段 2 第三列的全局模式基线 |
| `catalog.chainTargets[]` | object[] | 链式候选；每项含 `name`、`kind`，空策略组可有 `isEmpty = true` |
| `catalog.forwardRelays[]` | object[] | 端口转发候选 |
| `catalog.servers[].serverKey` | string | 落地 server 键（只读） |
| `catalog.servers[].sources[]` | object[] | 源元数据：`sourceId`、`landingNodeType`、`default*`、可选 `restrictedModes` / `modeWarnings` |
| `snapshot.servers[].aggregation` | object | **Client**：`enabled` / `groupName` / `strategy` / `memberLocalInstanceIds`（值为 `sourceId::iN`）；**Wire** 发请求时用 `memberProxyNames[]` |
| `snapshot...instances[]` | object[] | **Client** 可编辑行：`instanceId`（`sourceId::iN`）/ `proxyName` / `mode` / `targetName`；**Wire** 无 `instanceId`；每源长度 ≥ 1 |
| `chainProxyTargetGroupSwitchOptimizationEnabled` | `boolean` | 全局开关；开启后对符合条件的 `proxy-groups` 目标统一覆写 |

- 顺序域：嵌套数组下标即权威；聚合成员集合/序见 [06 §6](06-stage2-model.md)
- 平铺表与聚合树均对同一棵 snapshot 树做 DFS；聚合开时画 server/source/instance，聚合关时只画 instance 行
- **关闭聚合不得清空** server 上的业务意图：草稿进 `aggregationDraftsByServerKey`；发往后端的 snapshot 该 server 仅 `{ enabled: false }`（见 [06 §8](06-stage2-model.md)）

### 2.2 共享业务槽位

| 槽位 | 内容 | 交互 |
|------|------|------|
| 节点名 | `proxyName` | 可编辑；复制实例默认 `原名 2`… |
| 节点类型展示 | catalog `landingNodeType` | 只读 |
| 配置方式选择 | `mode` | 按后端返回的模式结果渲染；禁用项展示对应原因 |
| 目标选择 | `targetName` | 由 `mode` 决定数据源与控件状态 |

### 2.3 第一列：节点名

- 展示/编辑 instance `proxyName`；初始化时与 catalog `defaultProxyName` 一致
- 提供复制/删除实例（至少保留每个 `sourceId` 一个 instance）
- 复制时：`proxyName` 按 `原名 2`、`原名 3`… 派生；`instanceId` 分配新 ordinal（见 [06 §5](06-stage2-model.md)）
- 改名时仅改 `proxyName`；`instanceId` 与 `memberLocalInstanceIds` **不变**
- convert/resolve 响应后须 `hydrateInstanceIds`（补 `instanceId`，并将 Wire `memberProxyNames` → Client `memberLocalInstanceIds`）；`generate` 前须 `normalizeSnapshotForRequest`（strip `instanceId`，`memberLocalInstanceIds` → `memberProxyNames`）

### 2.4 第二列：节点类型

- 数据来源：catalog 同 `sourceId` 的 `landingNodeType`
- 展示语义：只展示，不允许编辑

### 2.5 第三列：配置方式

- `none`：不修改该落地节点
- `chain`：第四列从 `catalog.chainTargets[]` 中选择
- `port_forward`：第四列从 `catalog.forwardRelays[]` 中选择
- 模式可用性、源级限制、warning 与对应原因由后端按 [04-business-rules](04-business-rules.md) 产出；前端只消费 `availableModes`、当前源 `restrictedModes`、`modeWarnings` 及其 `reasonCode` / `reasonArgs`
- 前端必须基于 `reasonCode` 与 `reasonArgs` 本地映射展示文案；不得依赖后端返回人类可读 `reasonText` 字段，也不得自行补算额外规则
- 前端不得自行解析落地节点协议、端口或其他隐藏字段去补算 `modeWarnings`
- `restoreConflicts[]` 的 `reasonCode` / `reasonArgs` 与 `blockingErrors[].code` / `reasonArgs` 共用同一映射表；只读冲突态下前端基于 `restoreConflicts[]` 展示失效原因
- `restrictedModes` 表示该模式不可选；`modeWarnings` 表示该模式仍可选，但必须展示 warning 提示
- 当某源的 `chain` 同时存在于 `availableModes` 且 `modeWarnings.chain` 已返回时，前端不得禁用该模式，也不得阻止用户提交；只允许以 Tooltip、辅助文案或等价方式提示“不推荐”原因

### 2.6 第四列：目标（单项选择器）

- 当 `mode = none` 时，第四列清空并禁用
- 当 `mode = chain` 时，第四列展示链式候选列表
- 链式候选按 `chainTargets[].kind` 在**同一个目标选择菜单内**区分常用选项与折叠/隐藏选项：`proxy-groups` 中的区域策略组是默认展示的常用选项来源，`proxies` 中的节点是折叠/隐藏选项来源
- 折叠/展开语义可以是菜单内/组内交互（如展开、折叠、二级列表等）
- 前端使用后端返回的 `chainTargets[].name` 作为选项值
- `chainTargets[].isEmpty = true` 的 `proxy-groups` 候选保留展示、禁止选择，并提示“策略组为空，不允许作为中转策略组”
- 当 `mode = port_forward` 时，第四列展示端口转发服务列表；每个选项值都是后端返回的规范化 `server:port`；提示用户端口转发服务必须在中转机上完成与落地节点一一对应的配置；不可多个 instance 选择同一个端口转发服务，当一个端口转发服务已被其他 instance 选择时保留展示、禁止选择
- 前端直接使用后端返回的候选列表与默认值

### 2.6.1 链式地域组节点切换优化（基线路由）

- 本阶段只提供**全局开关**，不提供每行选择器；切换优化控件属于阶段 2 的**基线路由**能力：当前只在 `/`（`default`）暴露；探索性路由 `/ui/b*`、`/ui/c*` 本轮不复制该控件
- 全局开关开启时，前端必须写入 `snapshot.chainProxyTargetGroupSwitchOptimizationEnabled = true`；关闭时写入 `false`（沿用模板默认）
- 符合条件的 instance：`mode = chain` 且当前 `targetName` 对应 `chainTargets[].kind = proxy-groups`
- 当用户把链式目标从 `proxy-groups` 切到 `proxies`（固定节点）、切换到 `none` / `port_forward`，或第四列被清空时，前端不需要额外写入行级字段；后端仅按当前符合条件 instance 与全局开关状态决定是否覆写目标策略组

### 2.6.2 线路聚合模式（基线路由 UI）

- 表格上方 toolbar 提供「线路聚合模式」开关；开启后平铺表 ↔ 聚合树切换（非高级选项内）
- **关闭聚合模式时不得清空**聚合配置意图：将当前 `aggregation` 挪入前端临时草稿 `aggregationDraftsByServerKey`，snapshot 写回 `{ enabled: false }`；请求体永不带关聚合草稿（见 [06 §8](06-stage2-model.md)）
- 聚合组配置写入 `servers[].aggregation`；渲染语义见 [04 §2.7 / §3.3.2](04-business-rules.md) 与 [06](06-stage2-model.md)
- `memberLocalInstanceIds` 序与嵌套展示序是独立顺序域：前者在 `strategy=fallback` 时由顺序面板写入；发请求时映射为 `memberProxyNames`；后者决定平铺/聚合树行序（见 [06 §6](06-stage2-model.md)）
- 不自动为所有 server 批量启用；用户须在聚合树内显式启用

### 2.6.3 两种故障转移能力的分工

| 能力 | 开关位置 | 作用对象 | 典型场景 |
|------|----------|----------|----------|
| 策略组节点切换优化 | 高级选项 | 链式目标为**既有地域策略组**（`proxy-groups`） | 加快该策略组内中转节点切换 |
| 线路聚合 | 表格 toolbar | 同一 **server** 下多 instance（副本/不同中转） | 多线路互为 backup，追加新策略组 |

- **允许同时开启**；后端顺序：§3.3.1 覆写既有组 → §3.3.2 追加聚合组 → §3.3.3 注入 select 策略组（见 [04 §3.5](04-business-rules.md)）
- **不做互斥**；两者解决不同层级问题，非二选一
- 链式目标选固定节点/端口转发时，仅聚合能力 relevant；选地域策略组时，切换优化 relevant

### 2.6.4 重置语义

- **全局 reset**：再调 `POST /api/stage1/convert`，用返回的默认 `snapshot` **整份覆盖**本地状态（跳过 merge），并替换 `catalog`、清空聚合草稿；**不**调用已废弃的 `/api/stage2/reset`
- **局部 reset**：纯前端，从 catalog 同 `sourceId` 的 `default*` 恢复目标 instance
- **reconvert merge**：convert 成功后按 `sourceId` 保留既有 instances；规则见 [06 §9](06-stage2-model.md)

### 2.7 生成动作

- 功能：提交阶段 1 输入快照与 `stage2.snapshot`，调用 `POST /api/generate`，获取可消费的长链接
- 提交前必须将所有 `enabled=false` 的 aggregation 规范为仅 `{ enabled: false }`
- 成功后：进入阶段 3
- 请求进行中时对应触发控件必须禁用，避免重复提交
- 当接口返回失败时，按钮恢复默认文案；前端按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`

---

## 阶段 3：输出区

### 3.1 总体结构

- 阶段 3 必须提供以下能力：生成链接展示、短链切换、打开预览、复制链接、下载配置、输入已有 URL 进行反向解析、消息展示
- 共享层只定义能力与状态语义，不固定阶段 3 的分区、行数、按钮顺序或控件位置
- 恢复能力归属于阶段 3 输出域，不单独构成新的页面阶段

### 3.2 链接展示与短链切换

- 阶段 3 必须展示本次生成的订阅链接，并提供“使用短链接”切换能力
- “使用短链接”切换能力属于阶段 3 稳定能力
- 反向解析须在同一输入框中允许用户输入已有 URL（本系统生成的 `longUrl` 或 `shortUrl`）或对应短链接 `shortID` 供 `resolve-url` 使用
- 长链接是规范化快照链接，始终作为页面状态来源；短链接是长链接的后端别名；两者都可直接作为订阅地址消费
- 切换规则：无 `longUrl` 时切换到“使用短链接”只记录展示偏好，不改写当前恢复输入；有 `longUrl` 且首次开启“使用短链接”且尚无 `shortUrl` 时，前端调用 `POST /api/short-links` 创建短链接，成功后展示短链接；若当前 `longUrl` 未超过 `maxPublicLongURLLength`，短链创建失败时允许保持展示长链接并显著提示错误；后续已获得 `shortUrl` 时再次开启只切换展示值，不重新生成链接
- 当 `POST /api/generate` 返回的 `longUrl` 长度超过 `maxPublicLongURLLength` 时，前端必须立即创建短链接，并在成功后强制展示 `shortUrl`；该场景下若短链创建失败，本次生成视为未完成，不得回落展示超预算 `longUrl`
- 当当前状态的 `longUrl` 已超过 `maxPublicLongURLLength` 且页面已持有对应 `shortUrl` 时，前端不得允许用户切回展示长链接
- 方案层若为阻断错误显示阶段标签，首次短链创建失败属于 Stage 3

### 3.3 链接消费动作与反向解析

- 阶段 3 必须提供「打开预览」「复制链接」「下载配置」「反向解析」4 类动作（方案层可见文案可与此一致）

| 动作 | 功能 |
|------|------|
| 打开预览 | 在新标签页打开当前选中的订阅链接 |
| 复制链接 | 复制当前选中的长链接或短链接 |
| 下载配置 | 基于当前选中的订阅链接触发 `.yaml` 下载 |
| 反向解析 | 对「用于本次反向解析的 URL」调用 `POST /api/resolve-url` |

- 前端不主动 fetch YAML；“打开”与“下载”都直接消费当前选中的订阅链接
- “打开”与“下载”触发前必须先确认当前输入是完整 HTTP(S) 绝对 URL；不合法时必须阻止浏览器跳转或下载，并以 `scope = stage3_field`、`context.field = currentLinkInput` 展示阶段 3 错误
- 最终订阅 YAML 由后端在链接实际被打开或下载时即时生成并交付
- 当前架构下，“打开”与“下载”不承诺把订阅渲染失败自动回流为页面内 `blockingErrors[]`；若未来需要该能力，应另行设计 preflight 或受控代理链路
- 反向解析输入只接受本系统生成的 `longUrl`、`shortUrl` 或其对应 `shortID`
- 恢复失败时，前端按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`，并保留当前页面状态
- 方案层若为阻断错误显示阶段标签，`resolve-url` 失败属于 Stage 3；若 `resolve-url` 成功后前端为了重建可编辑态继续触发后续初始化请求，该链路中的失败在展示语义上仍归属于 Stage 3

### 3.4 阻断错误与 workflow log

- 阶段 3 适用前文“共享通知承载模型”的统一规则
- `resolve-url`、`short-links` 与 Stage 3 触发的后续恢复链路失败，在展示语义上都归属于 Stage 3
- `scope = stage3_field` 时，前端必须把问题稳定定位到 Stage 3 的可编辑输入控件；当前默认字段键为 `currentLinkInput`
- `scope = stage3_action` 时，前端可在 Stage 3 主反馈位说明失败动作；若后端同时提供 `context.action`，方案层可用它补充动作来源标签
- Stage 3 的本地事件可追加进 workflow log；写入边界与保留规则仍以本章“共享通知承载模型”及 [04 §4](04-business-rules.md) 为准

---

## 跨阶段交互

- 业务流程通常按“Stage 1 -> Stage 2 -> Stage 3”推进；恢复能力由阶段 3 输出域拥有，但可在需要时回放已有链接并重建页面状态
- 前端界面可采用自上而下平铺、分段滚动、分栏或其他不改变业务边界的组织方式
- 重新执行阶段 1 后，阶段 2 按 [06 §9](06-stage2-model.md) 处理：reconvert 默认 merge；显式全局 reset 则整份覆盖默认 snapshot
- 阶段 3 的长/短链接可作为页面状态恢复来源
- 前端通过 `resolve-url` 恢复页面时，成功响应只消费后端返回的 `stage1Input`、`stage2`（`catalog` + `snapshot`）、`restoreStatus` 与 `messages[]`；其中 `messages[]` 作为后端消息源追加到 workflow log，而不是覆盖整个历史；失败响应按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`
- `restoreStatus = replayable` 时，前端按正常可编辑态恢复阶段 1 与阶段 2，用户可直接继续编辑和生成
- `restoreStatus = conflicted` 时，前端仍恢复阶段 1 输入与阶段 2 快照用于展示（旧版载荷可能仅有 Stage1、Stage2 为空），但阶段 2 必须进入只读冲突态
- 只读冲突态下，前端必须禁用阶段 2 编辑控件与“生成链接”按钮，并显著提示用户需重新执行「转换并自动填充」；`LEGACY_PAYLOAD_VERSION` 等 `restoreConflicts[]` 文案须本地映射
- 只读冲突态下，阶段 1 输入与「转换并自动填充」必须仍可用；用户唯一允许的继续路径是重新执行转换，再进入后续配置和生成流程

---

## 前端边界

- 前端不负责解析、缓存或回传 `completeConfig`
- 前端不持有 `baseCompleteConfig`
- 前端不负责从节点名推导区域、从 `proxy-groups` 过滤候选、或决定默认模式
- 前端不自行判断恢复快照是否仍可重放；恢复后的页面权限完全以后端 `resolve-url` 返回的 `restoreStatus` 为准
- 前端只负责展示后端返回的初始化结果、允许用户手动修改，并提交最终快照
- 前端共享入口只消费共享业务层接口；默认方案组件与后续 A/B/C 方案组件都属于可替换的方案层实现
