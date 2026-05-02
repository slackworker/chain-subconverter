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

### `scope` 与阶段标签

- `blockingErrors[].scope` 是共享层稳定的错误定位语义，不是 Stage 枚举
- 当前 `scope` 承担 5 类定位：`global`、`stage1_field`、`stage2_row`、`stage3_field`、`stage3_action`
- 前端若需要在 UI 上明确标记“该错误来自 Stage 1 / Stage 2 / Stage 3”，该标签属于方案层展示语义，可按当前请求入口或工作流上下文派生为 `originStage`
- `originStage` 只表示本次请求从哪个阶段发起；它不替代 `scope`，也不进入后端响应结构
- 阶段标签不得反向改变 `scope` 契约；Stage 3 的展示标签与 `stage3_*` scope 仍分别承担“请求来源说明”与“局部定位”的不同职责

### 共享通知承载模型

- 共享层通知承载模型固定为 4 类：主阻断反馈承载位、全局消息日志、阶段内嵌工作流状态槽位、字段/行级局部定位提示
- 这 4 类承载区只定义共享语义，不规定任何方案层的页面排版、视觉样式或容器结构
- 主阻断反馈承载位只承载当前失败请求的 `blockingErrors[]`
- 单次失败请求只能有 1 个主阻断反馈承载位；方案层可选择 `stage-local` 或 `global-only` 两种承载策略
- 选择 `stage-local` 时，可归属于具体阶段操作的问题默认锚定在 `originStage` 对应的阶段操作区；若本次失败只包含 `scope = global` 的系统级或请求级异常，则该请求唯一的主阻断反馈承载位可例外回落到全局位置
- 若方案层需要展示 Stage 1 / 2 / 3 来源标签，只能由请求入口或工作流上下文派生，不得由 `scope` 反推
- 全局消息日志只承载后端返回的 `messages[]`；默认折叠/隐藏，只展示最近一条；共享层不要求 Stage 1 / 2 / 3 各自维护独立日志区
- 阶段内嵌工作流状态槽位只承载 `stale`、`awaiting`、`conflicted` 等状态提示；它们不等同于请求失败后的阻断反馈堆栈
- 字段/行级局部定位提示只负责把用户带到具体修正位置；它们不单独构成新的主通知区
- 共享层不允许同一请求同时出现“stage 主反馈位”和“global 主反馈位”两个并列主反馈位
- 共享层不推荐把 Stage 1 / Stage 2 / Stage 3 / global / log 设计为多个同权重并列的主消息堆栈

---

## 阶段 1：输入区

阶段 1 负责收集原始输入，并通过“转换并自动填充”生成阶段 2 所需的配置基底。

### 1.1 落地节点信息输入区

- 用途：输入落地节点或落地订阅信息
- 输入方式：通过多行文本框输入订阅 URL、节点 URI；通过按钮弹出表单手动添加 SOCKS5 节点
- 展示规则：每条一行，显示行号，不自动换行，允许横向滚动
- 手动添加 SOCKS5 节点按钮位置：位于“落地节点”输入区的右上角

#### 1.1.1 手动添加 SOCKS5 节点

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | text | 是 | 节点名称 |
| `server` | text | 是 | 服务器地址 |
| `port` | number | 是 | 端口号 |
| `username` | text | 否 | 用户名 |
| `password` | text | 否 | 密码 |

- 仅支持手动添加 SOCKS5 类型的节点
- `username` 与 `password` 必须成对出现
- `server`、`port` 的录入合法性必须在前端共享层统一校验：`server` 只允许 IPv4 或 ASCII 域名，`port` 只允许 `1-65535` 的十进制整数
- 表单应提供可选 `socks5://` URI 粘贴输入框；当前端收到该 URI 时，必须先解析为 `name/server/port/username/password`，再允许用户确认或补充后提交
- 弹窗字段布局建议为四行：第一行 `name`；第二行左 `server` / 右 `port`；第三行左 `username` / 右 `password`；第四行 `socks5://` URI（可选）
- `socks5://` URI 输入框不单独提供提交按钮，与分字段输入共用同一个提交动作
- 提交后必须转换为一条 `subconverter` 可解析的 SOCKS URI 追加到落地输入区
- 提交时必须统一编码为 `tg://socks?server=<server>&port=<port>&remarks=<name>`；若存在认证信息，则继续追加 `&user=<username>&pass=<password>`
- 统一使用 `tg://socks` 是权威口径，不再区分 `IPv4` / 主机名，也不再生成 `socks://<base64>`；原因是 `subconverter` 已正式支持 Telegram 风格 SOCKS 源，且该格式可以规避当前 `socks://<base64>` 在“域名 + 认证”等组合上的解析局限
- 方案层只负责表单交互、错误展示、弹窗开关与提交时机；`server` / `port` 的共享合法性规则不得散落在单一 UI 方案组件内重复实现

#### 1.1.2 落地副本

- 同一落地节点的多个副本只能在阶段 1 创建
- 多条完全一致的 URI 不去重，视为用户显式创建副本
- 副本名称将由后端稳定重命名，供阶段 2 第一列展示

### 1.2 中转信息输入区

- 用途：输入中转节点或中转订阅信息
- 输入方式：订阅 URL、节点 URI、`data:text/plain,<base64文本>`
- 展示规则：每条一行，显示行号，不自动换行，允许横向滚动
- `+端口转发` 按钮视觉上挂靠在“中转信息”输入区右上角，但其承载的不是 `transitRawText` 文本输入本身；仅当高级菜单区第 4 行 `enablePortForward` switch 开启时显示
- 具体输入归一化与上游传递规则见 [04-business-rules](04-business-rules.md)
- 若横向宽度充足，允许与“落地节点信息输入区”左右排列

#### 1.2.1 端口转发服务

- 启用前提：高级菜单区第 4 行 `enablePortForward` switch 已开启
- 端口转发服务在视觉编排上挂靠“中转信息输入区”，在业务语义上是阶段 1 的独立逻辑块
- 端口转发服务不写入 `transitRawText`，而是以独立字段 `forwardRelayItems` 进入阶段 1 快照
- 端口转发服务的后续消费链路独立于中转节点文本输入；其输入、校验、去重与阶段 2 消费均按独立业务语义处理
- 触发控件：`+端口转发` 是当前 Web 前端唯一录入入口
- 交互形态：点击按钮后弹出独立 modal；modal 标题为“添加端口转发服务（实验性）”
- 输入形态：modal 内使用 TagInput 录入一个或多个 `server:port`
- 提交时机：用户点击 modal 的“确认”后，才将本次录入的端口转发服务写入阶段 1 快照
- 展示规则：确认后，已录入条目以 Tag 列表显示在“中转信息”输入框下方；未录入任何条目时不展示列表；当 `enablePortForward` 关闭时，中转区周边的端口转发入口、Tag 列表与相关局部反馈一并隐藏
- 布局规则：若“落地节点信息输入区”和“中转信息输入区”左右排列，端口转发服务的入口按钮、Tag 列表与错误反馈仍跟随“中转信息输入区”展示，不跨列到落地区
- 提交阶段 1 快照时，端口转发服务必须以 `forwardRelayItems: string[]` 传递；每个 Tag 对应数组中的一个输入项，保留输入顺序
- `enablePortForward` 是前端本地 UI 控制字段，不进入后端 API 请求体，也不进入长链接共享状态
- 当前 Web 前端本地状态：`enablePortForward` 的初始值固定默认 `false`；用户开启 switch 后可先进入“显示端口转发入口但尚未录入条目”的状态；用户关闭 switch 后必须清空 `forwardRelayItems`；仅因用户删除或移除全部端口转发条目时，前端不得自动将该 switch 反向关闭
- 从 `resolve-url` 恢复页面时，前端必须按 `forwardRelayItems.length > 0` 自动派生 `enablePortForward = true`；否则派生为 `false`
- 校验与去重口径：统一遵循 [04-business-rules](04-business-rules.md) `1.1.2 端口转发服务输入校验（权威口径）`
- 前端可在 modal 录入或确认提交时复用同一口径做预校验，并阻止非法值进入 `forwardRelayItems`；但后端返回的校验结果仍是最终裁决

### 1.3 高级菜单区

- 形态：默认折叠/隐藏
- 阶段 1 中可配置的 `subconverter` 其他参数与端口转发开关收纳在此区域
- 前端控件集合：`emoji`、`udp`、`skipCertVerify`（与 `GET /sub` 查询参数 `scv` 对应）、`config`、`include`、`exclude`、`enablePortForward`
- 阶段 1 提交模型必须保持结构化：高级菜单区中的 API 字段作为 `advancedOptions` 对象提交；端口转发服务作为 `forwardRelayItems` 数组提交；`enablePortForward` 不提交
- 行位顺序：第 1 行为“模板 URL”；第 2、3 行为 `include`、`exclude`，默认各占一行，横向宽度充足时可左右同排；第 4 行为 `emoji`、`udp`、`skipCertVerify` 与 `enablePortForward`
- 控件类型：
  - `config`：单行文本输入框
  - `include`、`exclude`：单行TagInput
  - `emoji`、`udp`、`skipCertVerify`：checkbox
  - `enablePortForward`：switch
- `config` 的界面语义是“模板 URL”；字段名保留 `config` 仅为了兼容后端 API 与 `subconverter` 上游查询参数
- “模板 URL”输入框默认填入 `GET /api/runtime-config` 返回的 `defaultTemplateURL`
- 前端必须把默认模板 URL 作为普通输入值写入 `advancedOptions.config`；该值随阶段 1 请求、生成请求与长链接状态载荷一起提交
- 模板 URL 输入框右侧必须提供“恢复默认”动作；触发后将输入框值改回当前 `defaultTemplateURL`
- 前端不得在输入框外重复展示“当前默认模板”URL 文本块；用户复制默认 URL 时直接从输入框选中文本复制
- 若运行时配置读取失败，方案层可回退到内置推荐 Aethersailor 模板 URL 并写入 `advancedOptions.config`
- 方案层Tooltip可说明该初始值来自部署默认模板 URL，且上游更新可能导致规则变化；具体使用提示 icon、说明文本或其他呈现方式由方案层决定
- 前端默认状态：`emoji` 与 `udp` 默认勾选，`skipCertVerify` 默认不勾选
- 当前 Web 前端默认状态：`enablePortForward` 默认关闭
- `include`、`exclude` 使用 TagInput 时，多标签值必须以字符串数组写入阶段 1 快照，数组顺序保留输入顺序；例如前端填写 `TagA`、`TagB`、`TagC`，快照值应为 `["TagA", "TagB", "TagC"]`
- 当前 Web 前端产出层提交值规则：`emoji`、`udp`、`skipCertVerify` 的 checkbox 只提交 `true | null`（勾选 `true`，未勾选 `null`）；`config` 提交当前输入框中的非空模板 URL；`include`、`exclude` 在无标签时提交 `null`，有标签时提交按输入顺序组成的字符串数组
- `enablePortForward` 开启后，前端才展示“中转信息输入区”周边的端口转发入口与 Tag 列表；关闭后必须隐藏这些控件，并清空 `forwardRelayItems`
- 前端只负责渲染与提交高级选项快照；接口接受层的三态模型与入站归一化规则以 [03-backend-api](03-backend-api.md) 为准；参数默认值与 `GET /sub` 传递规则以 [04-business-rules](04-business-rules.md) `0.2.2 subconverter 参数表` 为准

### 1.4 转换动作

- 功能：调用 `POST /api/stage1/convert`
- 成功后：使用后端返回的 `stage2Init` 直接初始化阶段 2
- 当接口返回失败时，前端按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`
- 阶段 1 成功不代表前端已拿到 `completeConfig`；前端只消费初始化结果

### 1.5 阶段 1 交互约束

- 逻辑上必须覆盖：落地输入、手动添加 SOCKS5 节点、中转输入、端口转发开关、端口转发服务弹窗录入与标签展示、高级选项与转换动作
- 方案层在无约定的情况下可以重组这些内容的物理布局、信息层级与展开节奏，但不得删改其业务语义
- 修改阶段 1 任一输入后，阶段 2 标记过期：禁用“生成链接”，直到下一次转换成功
- `stage2Stale` 属于阶段工作流状态语义；方案层可在阶段内嵌状态槽位提示“需重新执行转换并自动填充”
- 当页面当前存在请求级阻断反馈时，`stage2Stale` 的正文提示不应继续作为同层主通知与阻断反馈并列竞争；状态 pill、禁用态等状态语义仍需保留

---

## 阶段 2：配置区

阶段 2 以“每个落地节点一项配置单元”的固定业务模型渲染，数据完全来自后端返回的 `stage2Init`，并固定以列表形式呈现。

### 2.1 数据模型

| 字段 | 类型 | 说明 |
|------|------|------|
| `availableModes` | `mode[]` | 阶段 2 第三列的全局模式基线 |
| `chainTargets[]` | object[] | 链式候选列表；每项包含 `name`、`kind`，空策略组额外返回 `isEmpty = true` |
| `rows[].landingNodeName` | string | 本行对应的落地节点名称 |
| `rows[].landingNodeType` | string | 本行对应的落地节点类型展示值 |
| `rows[].restrictedModes` | object，可选 | 本行额外禁用的模式及原因；缺失表示该行无额外限制 |
| `rows[].modeWarnings` | object，可选 | 本行额外 warning 的模式及原因；缺失表示该行无额外提示 |
| `rows[].mode` | `none \| chain \| port_forward` | 当前选择的配置方式 |
| `rows[].targetName` | `string \| null` | 第四列当前值；`chain` 时为 `chainTargets[].name`，`port_forward` 时为规范化 `server:port` |

### 2.2 共享业务槽位

| 槽位 | 内容 | 交互 |
|------|------|------|
| 落地节点展示 | `landingNodeName` | 只读 |
| 节点类型展示 | `landingNodeType` | 只读 |
| 配置方式选择 | `mode` | 按后端返回的模式结果渲染；禁用项展示对应原因 |
| 目标选择 | `targetName` | 由 `mode` 决定数据源与控件状态 |

### 2.3 第一列：落地节点

- 数据来源：`stage2Init.rows[]`
- 展示语义：只展示，不允许替换或新增

### 2.4 第二列：节点类型

- 数据来源：`stage2Init.rows[].landingNodeType`
- 展示语义：只展示，不允许编辑

### 2.5 第三列：配置方式

- `none`：不修改该落地节点
- `chain`：第四列从 `stage2Init.chainTargets[]` 中选择
- `port_forward`：第四列从 `stage2Init.forwardRelays[]` 中选择
- 模式可用性、行级限制、warning 与对应原因由后端按 [04-business-rules](04-business-rules.md) 产出；前端只消费 `availableModes`、当前行 `restrictedModes`、`modeWarnings` 与 `reasonText`
- 前端按后端返回结果渲染可选项、禁用态与 warning，不自行补算额外规则
- 前端不得自行解析落地节点协议、端口或其他隐藏字段去补算 `modeWarnings`；若后端已将多个 warning 原因合并到同一个 `modeWarnings.chain`，前端必须原样展示 `reasonText`
- `restrictedModes` 表示该模式不可选；`modeWarnings` 表示该模式仍可选，但必须展示 warning 提示
- 当某行的 `chain` 同时存在于 `availableModes` 且 `modeWarnings.chain` 已返回时，前端不得禁用该模式，也不得阻止用户提交；只允许以 Tooltip、辅助文案或等价方式提示“不推荐”原因

### 2.6 第四列：目标（单项选择器）

- 当 `mode = none` 时，第四列清空并禁用
- 当 `mode = chain` 时，第四列展示链式候选列表
- 链式候选按 `chainTargets[].kind` 在**同一个目标选择菜单内**区分常用选项与折叠/隐藏选项：`proxy-groups` 中的区域策略组是默认展示的常用选项来源，`proxies` 中的节点是折叠/隐藏选项来源
- 折叠/展开语义可以是菜单内/组内交互（如展开、折叠、二级列表等）
- 前端使用后端返回的 `chainTargets[].name` 作为选项值
- `chainTargets[].isEmpty = true` 的 `proxy-groups` 候选保留展示、禁止选择，并提示“策略组为空，不允许作为中转策略组”
- 当 `mode = port_forward` 时，第四列展示端口转发服务列表；每个选项值都是后端返回的规范化 `server:port`；提示用户端口转发服务必须在中转机上完成与落地节点一一对应的配置；不可多个落地节点选择同一个端口转化服务，当一个端口转发服务已被其他落地节点选择时保留展示、禁止选择
- 前端直接使用后端返回的候选列表与默认值

### 2.7 生成动作

- 功能：提交阶段 1 输入快照与阶段 2 配置快照，调用 `POST /api/generate`，获取可消费的长链接
- 成功后：进入阶段 3
- 请求进行中时对应触发控件必须禁用，避免重复提交
- 当接口返回失败时，按钮恢复默认文案；前端按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`

---

## 阶段 3：输出区

### 3.1 总体结构

- 阶段 3 必须提供以下能力：生成链接展示、短链切换、打开预览、复制、下载、输入已有 URL 进行反向解析、消息展示
- 共享层只定义能力与状态语义，不固定阶段 3 的分区、行数、按钮顺序或控件位置
- 恢复能力归属于阶段 3 输出域，不单独构成新的页面阶段

### 3.2 链接展示与短链切换

- 阶段 3 必须展示本次生成的订阅链接，并提供“使用短链接”切换能力
- “使用短链接”切换控件属于阶段 3 稳定能力，位置约束为链接输入框右侧
- 反向解析须在同一输入框中允许用户输入已有 URL（本系统生成的 `longUrl` 或 `shortUrl`）供 `resolve-url` 使用
- 长链接是规范化快照链接，始终作为页面状态来源；短链接是长链接的后端别名；两者都可直接作为订阅地址消费
- 切换规则：无 `longUrl` 时切换到“使用短链接”只记录展示偏好，不改写当前恢复输入；有 `longUrl` 且首次开启“使用短链接”且尚无 `shortUrl` 时，前端调用 `POST /api/short-links` 创建短链接，成功后展示短链接，失败则保持展示长链接并显著提示错误；后续已获得 `shortUrl` 时再次开启只切换展示值，不重新生成链接
- 关闭“使用短链接”时切回展示长链接，不触发后端请求
- 方案层若为阻断错误显示阶段标签，首次短链创建失败属于 Stage 3

### 3.3 链接消费动作与反向解析

- 阶段 3 必须提供“打开预览”“复制”“下载”“反向解析”4 类动作

| 动作 | 功能 |
|------|------|
| 打开 | 在新标签页打开当前选中的订阅链接 |
| 复制 | 复制当前选中的长链接或短链接 |
| 下载 | 基于当前选中的订阅链接触发 `.yaml` 下载 |
| 反向解析 | 对「用于本次反向解析的 URL」调用 `POST /api/resolve-url` |

- 前端不主动 fetch YAML；“打开”与“下载”都直接消费当前选中的订阅链接
- 最终订阅 YAML 由后端在链接实际被打开或下载时即时生成并交付
- 当前架构下，“打开”与“下载”不承诺把订阅渲染失败自动回流为页面内 `blockingErrors[]`；若未来需要该能力，应另行设计 preflight 或受控代理链路
- 反向解析输入只接受本系统生成的 `longUrl` 或 `shortUrl`
- 恢复失败时，前端按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`，并保留当前页面状态
- 方案层若为阻断错误显示阶段标签，`resolve-url` 失败属于 Stage 3；若 `resolve-url` 成功后前端为了重建可编辑态继续触发后续初始化请求，该链路中的失败在展示语义上仍归属于 Stage 3

### 3.4 阻断错误与消息日志

- 阶段 3 适用前文“共享通知承载模型”的统一规则
- `resolve-url`、`short-links` 与 Stage 3 触发的后续恢复链路失败，在展示语义上都归属于 Stage 3
- `scope = stage3_field` 时，前端必须把问题稳定定位到 Stage 3 的可编辑输入控件；当前默认字段键为 `currentLinkInput`
- `scope = stage3_action` 时，前端可在 Stage 3 主反馈位说明失败动作；若后端同时提供 `context.action`，方案层可用它补充动作来源标签

---

## 跨阶段交互

- 业务流程通常按“Stage 1 -> Stage 2 -> Stage 3”推进；恢复能力由阶段 3 输出域拥有，但可在需要时回放已有链接并重建页面状态
- 前端界面可采用自上而下平铺、分段滚动、分栏或其他不改变业务边界的组织方式
- 重新执行阶段 1 后，阶段 2 必须完全按新的 `stage2Init` 重建
- 阶段 3 的长/短链接可作为页面状态恢复来源
- 前端通过 `resolve-url` 恢复页面时，成功响应只消费后端返回的 `stage1Input`、`stage2Snapshot`、`restoreStatus` 与 `messages[]`；失败响应按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`
- `restoreStatus = replayable` 时，前端按正常可编辑态恢复阶段 1 与阶段 2，用户可直接继续编辑和生成
- `restoreStatus = conflicted` 时，前端仍恢复阶段 1 输入与阶段 2 快照用于展示，但阶段 2 必须进入只读冲突态
- 只读冲突态下，前端必须禁用阶段 2 编辑控件与“生成链接”按钮，并显著提示“当前恢复快照引用的目标已失效，恢复结果仅供查看；请重新执行转换并自动填充后再继续”
- 只读冲突态下，用户唯一允许的继续路径是回到阶段 1 重新执行“转换并自动填充”，再进入后续配置和生成流程

---

## 前端边界

- 前端不负责解析、缓存或回传 `completeConfig`
- 前端不持有 `baseCompleteConfig`
- 前端不负责从节点名推导区域、从 `proxy-groups` 过滤候选、或决定默认模式
- 前端不自行判断恢复快照是否仍可重放；恢复后的页面权限完全以后端 `resolve-url` 返回的 `restoreStatus` 为准
- 前端只负责展示后端返回的初始化结果、允许用户手动修改，并提交最终快照
- 前端共享入口只消费共享业务层接口；默认方案组件与后续 A/B/C 方案组件都属于可替换的方案层实现
