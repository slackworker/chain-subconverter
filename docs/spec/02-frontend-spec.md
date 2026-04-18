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
- 阻断错误与普通消息如何按 `scope` 和 `level` 映射到页面承载区
- `blockingErrors[].scope` 与前端展示中的 Stage 1 / 2 / 3 标签各自承担什么语义

### 方案层在无约定的情况下可自由决定的内容

- 页面结构、信息架构、布局方向、滚动节奏、分栏方式
- Stage 标题、说明文案、按钮文案、图标与视觉层级
- 是否使用卡片、分段、抽屉、弹层、菜单、页内折叠等具体呈现形式

### 共享业务层与方案层组件边界

| 范围 | 必须稳定/可自由分化 | 当前内容 |
|------|------|------|
| 共享业务层 | 必须稳定 | domain types、API client、页面状态模型、恢复/转换/生成/短链切换流程、`blockingErrors[]/messages[]` 语义、`chainTargets[].kind` 业务抽象 |
| 共享业务层 | 必须稳定 | 全局阻断错误承载语义、局部定位语义、Stage 3 单一当前链接输入框的业务语义 |
| 方案层 | 可自由分化 | Stage 容器、notice/message 呈现、status 展示、target chooser 的具体 UI 形态 |
| 方案层 | 可自由分化 | Stage 标题与说明文案、页面壳层、布局、视觉风格、阶段标签文案、动作分组与信息层级 |

- 前端共享入口只允许依赖共享业务层接口，不得直接把某一套默认方案组件当成共享层本体
- 方案层可以通过注入或装配的方式提供 Stage 容器、notice renderer、status display、target chooser 等 UI 实现，但不得改变共享业务语义
- A/B/C 方案应以 `0 UI` 为起点独立开发，不以任一既有页面壳层作为继承前提
- 共享层严格限定为业务契约与状态语义，不包含任何 UI 壳、页面骨架或视觉容器实现

### `scope` 与阶段标签

- `blockingErrors[].scope` 是共享层稳定的错误定位语义，不是 Stage 枚举
- 当前 `scope` 只承担 3 类定位：`global`、`stage1_field`、`stage2_row`
- 前端若需要在 UI 上明确标记“该错误来自 Stage 1 / Stage 2 / Stage 3”，该标签属于方案层展示语义，可按当前请求入口或工作流上下文派生
- 阶段标签不得反向改变 `scope` 契约；Stage 3 展示标签也不得推出新的 `stage3_*` scope

---

## 阶段 1：输入区

阶段 1 负责收集原始输入，并通过“转换并自动填充”生成阶段 2 所需的配置基底。

### 1.1 落地节点信息输入区

- 用途：输入落地节点或落地订阅信息
- 输入方式：通过多行文本框输入订阅 URL、节点 URI；通过按钮弹出表单手动添加 SOCKS5 节点
- 展示规则：每条一行，显示行号，不自动换行，允许横向滚动

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
- 提交后转换为一条 `subconverter` 可解析的 `socks://<URL Safe Base64(user:pass@host:port 或 host:port)>#备注` URI 追加到落地输入区

#### 1.1.2 落地副本

- 同一落地节点的多个副本只能在阶段 1 创建
- 多条完全一致的 URI 不去重，视为用户显式创建副本
- 副本名称将由后端稳定重命名，供阶段 2 第一列展示

### 1.2 中转信息输入区

- 用途：输入中转节点或中转订阅信息
- 输入方式：订阅 URL、节点 URI、`data:text/plain,<base64文本>`
- 展示规则：每条一行，显示行号，不自动换行，允许横向滚动
- 具体输入归一化与上游传递规则见 [04-business-rules](04-business-rules.md)
- 若横向宽度充足，允许与“落地节点信息输入区”左右排列

### 1.3 端口转发服务信息区（属于中转信息输入区的一部分）

- 启用前提：先展开高级菜单，再开启“启用端口转发（实验性）”Switch
- 默认状态：隐藏
- 布局位置：位于“中转信息输入区”下方。若“落地节点信息输入区”和“中转信息输入区”左右排列，则在两者下方
- 输入形态：单行TagInput，按输入项逐个录入 `server:port`
- 关闭“启用端口转发（实验性）”时，前端必须隐藏并清空该输入区
- 提交阶段 1 快照时，端口转发服务信息必须以 `forwardRelayItems: string[]` 传递；每个 Tag 对应数组中的一个输入项，保留输入顺序
- 校验与去重口径：统一遵循 [04-business-rules](04-business-rules.md) `1.1.2 端口转发服务输入校验（权威口径）`

### 1.4 高级菜单区

- 形态：默认折叠/隐藏
- 阶段 1 中可配置的 `subconverter` 其他参数以及端口转发开关收纳在此区域
- 前端控件集合（阶段 1 快照字段名）：`emoji`、`udp`、`skipCertVerify`（与 `GET /sub` 查询参数 `scv` 对应）、`config`、`include`、`exclude`、`enablePortForward`
- 阶段 1 提交模型必须保持结构化：高级菜单区作为 `advancedOptions` 对象提交；端口转发服务信息区作为 `forwardRelayItems` 数组提交
- 行位顺序：第 1 行为“模板 URL”；第 2、3 行为 `include`、`exclude`，默认各占一行，横向宽度充足时可左右同排；第 4 行为 `emoji`、`udp`、`skipCertVerify` 与 `enablePortForward`
- 控件类型：
  - `config`：单行文本输入框
  - `include`、`exclude`：单行TagInput
  - `emoji`、`udp`、`skipCertVerify`：checkbox
  - `enablePortForward`：switch
- 交互联动：开启 `enablePortForward` 后，在“中转信息输入区”下方显示“端口转发服务信息区”；关闭时必须隐藏并清空该输入区
- `config` 的界面语义是“模板 URL”；字段名保留 `config` 仅为了兼容后端 API 与 `subconverter` 上游查询参数
- “模板 URL”输入框默认留空，placeholder：`请使用带地域分组的模板，留空将使用推荐的 Aethersailor 模板`
- 方案层Tooltip向用户提示当前默认推荐模板 URL 为 `https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini`，并说明上游更新可能导致规则变化；具体使用提示 icon、说明文本或其他呈现方式由方案层决定
- 前端默认状态：`emoji` 与 `udp` 默认勾选，`skipCertVerify` 默认不勾选
- `include`、`exclude` 使用 TagInput 时，多标签值必须以字符串数组写入阶段 1 快照，数组顺序保留输入顺序；例如前端填写 `TagA`、`TagB`、`TagC`，快照值应为 `["TagA", "TagB", "TagC"]`
- 当前 Web 前端产出层提交值规则：`emoji`、`udp`、`skipCertVerify` 的 checkbox 只提交 `true | null`（勾选 `true`，未勾选 `null`）；`config` 留空提交 `null`；`include`、`exclude` 在无标签时提交 `null`，有标签时提交按输入顺序组成的字符串数组
- 前端只负责渲染与提交高级选项快照；接口接受层的三态模型与入站归一化规则以 [03-backend-api](03-backend-api.md) 为准；参数默认值与 `GET /sub` 传递规则以 [04-business-rules](04-business-rules.md) `0.2.2 subconverter 参数表` 为准

### 1.5 转换动作

- 功能：调用 `POST /api/stage1/convert`
- 成功后：使用后端返回的 `stage2Init` 直接初始化阶段 2
- 当接口返回失败时，前端按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`
- 阶段 1 成功不代表前端已拿到 `completeConfig`；前端只消费初始化结果

### 1.6 阶段 1 交互约束

- 逻辑上必须覆盖：落地输入、手动添加 SOCKS5 节点、中转输入、条件显示的端口转发输入、高级选项与转换动作
- 方案层在无约定的情况下可以重组这些内容的物理布局、信息层级与展开节奏，但不得删改其业务语义
- 修改阶段 1 任一输入后，阶段 2 标记过期：禁用“生成链接”，并提示重新执行“转换并自动填充”，直到下一次转换成功

---

## 阶段 2：配置区

阶段 2 以“每个落地节点一项配置单元”的固定业务模型渲染，数据完全来自后端返回的 `stage2Init`，并固定以列表形式呈现。

### 2.1 数据模型

| 字段 | 类型 | 说明 |
|------|------|------|
| `availableModes` | `mode[]` | 阶段 2 第二列的全局模式基线 |
| `chainTargets[]` | object[] | 链式候选列表；每项包含 `name`、`kind`，空策略组额外返回 `isEmpty = true` |
| `rows[].landingNodeName` | string | 本行对应的落地节点名称 |
| `rows[].restrictedModes` | object，可选 | 本行额外禁用的模式及原因；缺失表示该行无额外限制 |
| `rows[].mode` | `none \| chain \| port_forward` | 当前选择的配置方式 |
| `rows[].targetName` | `string \| null` | 第三列当前值；`chain` 时为 `chainTargets[].name`，`port_forward` 时为规范化 `server:port` |

### 2.2 共享业务槽位

| 槽位 | 内容 | 交互 |
|------|------|------|
| 落地节点展示 | `landingNodeName` | 只读 |
| 配置方式选择 | `mode` | 按后端返回的模式结果渲染；禁用项展示对应原因 |
| 目标选择 | `targetName` | 由 `mode` 决定数据源与控件状态 |

### 2.3 第一列：落地节点

- 数据来源：`stage2Init.rows[]`
- 展示语义：只展示，不允许替换或新增

### 2.4 第二列：配置方式

- `none`：不修改该落地节点
- `chain`：第三列从 `stage2Init.chainTargets[]` 中选择
- `port_forward`：第三列从 `stage2Init.forwardRelays[]` 中选择
- 模式可用性、行级限制与禁用原因由后端按 [04-business-rules](04-business-rules.md) 产出；前端只消费 `availableModes`、当前行 `restrictedModes` 与 `reasonText`
- 前端按后端返回结果渲染可选项与禁用态，不自行补算额外规则

### 2.5 第三列：目标（单项选择器）

- 当 `mode = none` 时，第三列清空并禁用
- 当 `mode = chain` 时，第三列展示链式候选列表
- 链式候选按 `chainTargets[].kind` 区分常用选项与折叠/隐藏选项：`proxy-groups` 中的区域策略组是默认展示的常用选项的来源，`proxies` 中的节点式折叠隐藏选项的来源
- 方案层可用展开、折叠、二级列表或其他交互方式承载该语义
- 前端使用后端返回的 `chainTargets[].name` 作为选项值
- `chainTargets[].isEmpty = true` 的 `proxy-groups` 候选保留展示、禁止选择，并提示“策略组为空，不允许作为中转策略组”
- 当 `mode = port_forward` 时，第三列展示端口转发服务列表；每个选项值都是后端返回的规范化 `server:port`；提示用户端口转发服务必须在中转机上完成与落地节点一一对应的配置；不可多个落地节点选择同一个端口转化服务，当一个端口转发服务已被其他落地节点选择时保留展示、禁止选择
- 前端直接使用后端返回的候选列表与默认值

### 2.6 生成动作

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
- 反向解析须允许用户输入已有 URL（本系统生成的 `longUrl` 或 `shortUrl`）供 `resolve-url` 使用
- 长链接是规范化快照链接，始终作为页面状态来源；短链接是长链接的后端别名；两者都可直接作为订阅地址消费
- 用户首次开启“使用短链接”且当前尚未创建短链接时，前端调用 `POST /api/short-links` 为当前 `longUrl` 创建短链接；创建成功后切换为展示短链接，失败则保持展示长链接并显著提示错误
- 已获得 `shortUrl` 后，再次开启“使用短链接”只切换展示值，不重新生成链接
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
- 反向解析输入只接受本系统生成的 `longUrl` 或 `shortUrl`
- 恢复失败时，前端按 [03-backend-api](03-backend-api.md) 的错误契约展示 `blockingErrors[]`，并保留当前页面状态
- 方案层若为阻断错误显示阶段标签，`resolve-url` 失败属于 Stage 3；若 `resolve-url` 成功后前端为了重建可编辑态继续触发后续初始化请求，该链路中的失败在展示语义上仍归属于 Stage 3

### 3.4 阻断错误与消息日志

- 前端必须提供阻断错误承载区，仅在 `blockingErrors[]` 非空时显示，并用于展示本次失败请求的阻断问题
- 共享层只规定 `blockingErrors[]` 的承载语义与定位语义，不固定页面布局、视觉样式或组件形态
- 若方案层展示 Stage 1 / 2 / 3 标签，该标签属于全局阻断错误承载区中的请求来源说明，不替代 `scope` 的局部定位职责
- 后端返回 `scope = stage1_field` 或 `scope = stage2_row` 时，前端应确保用户能清晰定位阻断环节；可采用全局承载区、局部定位提示或两者组合实现，具体由方案层决定
- 方案层可在不改变共享语义的前提下，对链接展示或反向解析输入相关控件补充局部提示，不改变后端 `scope` 契约
- 前端必须提供消息日志入口，用于承载后端返回的 `messages[]`
- 前端统一按 `level` 渲染 `messages[]` 到当前阶段可见消息承载区
- 历史消息日志默认折叠/隐藏，只展示最近一条

- 阻断错误展示目标是帮助用户快速定位问题；共享层不强制“全局/局部”的唯一实现方式，只要求最终定位效果清晰可感知
- `scope = global` 默认仅在全局阻断错误承载区展示；`scope = stage1_field` 与 `scope = stage2_row` 作为优先映射到阶段定位的语义提示
- 当 `scope = stage2_row` 且后端同时提供 `context.field` 时，方案层可进一步定位到该行内对应控件

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
