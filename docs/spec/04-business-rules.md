# 04 - 业务规则

> 本章是“转换并自动填充”“阶段 2 初始化”“生成前校验与改写”的唯一权威定义。前端展示见 [02-frontend-spec](02-frontend-spec.md)，接口字段见 [03-backend-api](03-backend-api.md)。

---

## 0. `subconverter` 集成前提

- 后端统一通过本地 HTTP 服务访问 `subconverter`
- `subconverter` 作为本项目部署内的内部转换组件存在
- 本章定义的转换规则均建立在该集成前提之上
- 运行时与部署层约束（如超时、并发、缓存、重试与部署拓扑）见 [05-tech-stack](05-tech-stack.md) §4.1、§6

### 0.1 运行边界与部署约束

- `subconverter` 运行边界（默认值与失败语义）以 [05-tech-stack](05-tech-stack.md) §4.1 为准
- 部署拓扑与网络暴露约束以 [05-tech-stack](05-tech-stack.md) §6 为准

### 0.2 `subconverter` 调用契约

- 本项目当前只定义一种内部转换入口：`GET /sub`
- 三个 pass 都必须复用同一组固定参数与阶段 1 高级选项映射结果
- 三个 pass 必须属于同一条转换管线；`full-base pass` 必须与同一管线中的两个 discovery pass 保持输入快照一致
- 实现必须核对 discovery pass 返回的每个落地/中转身份，都能在同一管线的 `full-base pass` 完整代理集合中完成唯一定位；若不能唯一定位，视为 pass 失败
- `subconverter` 调用若出现超时、连接失败、非成功 HTTP 响应或不可解析结果，均视为该 pass 失败
- `landing-discovery pass`、`transit-discovery pass`、`full-base pass` 中任一必需 pass 失败时，当前请求必须整体失败；不做跨 pass 降级，不复用旧结果
- 若本次有效模板已识别出某地域策略组，但该地域策略组在同一条转换管线的 `full-base pass` 产物（经 `1.3` 后处理后的 `baseCompleteConfig`）中完全不存在，必须视为 `full-base pass` 失败；不得按空组静默降级

### 0.2.1 pass 级参数约束

- 三个 pass 的 `target` 都必须传 `clash`
- `landing-discovery pass`：`url` 只传落地节点信息，传 `list=true`
- `transit-discovery pass`：`url` 只传中转节点信息，**不传** `list`
- `full-base pass`（即第 3 个 pass）：`url` 传托管 landing 短链 + 中转节点信息（`|` 拼接），不传 `list`；落地正文由 Pass 3 前按 `stage2Snapshot` 合并生成，不再把原始落地 URI 列表直接塞入 `url`
- 当同一字段存在多条订阅 URL、节点 URI 或 `data:text/plain,<base64文本>` 时，传给 `subconverter` 的单个 `url` 查询参数前必须先用 `|` 拼接，再整体 URL 编码
- 输入区中的换行只承担编辑态分条语义；不得把换行字面量直接传给上游 `url` 参数
- 输入区分条时，`LF`、`CRLF` 与单独 `CR` 都必须按换行等价处理
- URL 输入归一化时按行去除首尾空白并忽略空行；传给上游的 `url` 参数不得包含由空白行产生的空项
- 阶段 1 输入边界校验必须复用与真实请求一致的 query 拼装规则，按完整请求 URI 长度判定是否超出上游预算；不得再使用独立的“规范化文本总字节数”粗略近似

### 0.2.2 `subconverter` 参数表

本表是后端调用上游 `subconverter GET /sub` 时查询参数的唯一权威定义位置。前端展示只见 [02-frontend-spec](02-frontend-spec.md)，接口快照字段只见 [03-backend-api](03-backend-api.md)。

术语约束：

- `config` 在本表中只表示与 `subconverter` 对接时沿用的上游查询参数名；其业务语义固定为“外部配置（模板）URL”
- 本项目的人类可见描述中，`config` 不得再泛指最终 Mihomo YAML；最终产物统一称 `completeConfig`、完整配置或最终订阅 YAML

| 参数 | 前端状态 | 默认值 | 传递规则 |
|------|----------|--------|----------|
| `target` | 隐藏 | `clash` | 必传，固定传 `clash` |
| `url` | 隐藏 | 无 | 必传；按 `0.2.1` 的 pass 规则传 |
| `emoji` | 展示 | 勾选 | 当前前端 checkbox：勾选提交 `true`，不勾选提交 `null`；若接口显式收到 `false`，仍传 `false` |
| `udp` | 展示 | 勾选 | 当前前端 checkbox：勾选提交 `true`，不勾选提交 `null`；若接口显式收到 `false`，仍传 `false` |
| `scv` | 展示 | 不勾选 | 当前前端 checkbox：勾选提交 `true`，不勾选提交 `null`；若接口显式收到 `false`，仍传 `false` |
| `list` | 隐藏 | 无 | 仅 `landing-discovery pass` 传 `true`；`transit-discovery pass` 与 `full-base pass` 不传 |
| `config` | 展示 | 前端初始值来自部署默认模板 URL | 该参数在上游沿用 `config` 命名，但业务语义是“外部配置（模板）URL”；前端提交当前快照中的远程模板 URL；后端必须先拉取有效模板，再向 `subconverter` 传递后端托管的内部模板 URL |
| `include` | 展示 | 空 | 前端快照使用字符串数组；后端仅在传给 `subconverter` 前按输入顺序用 `|` 拼接并整体 URL 编码；`null`/空数组/留空时不传 |
| `exclude` | 展示 | 空 | 前端快照使用字符串数组；后端仅在传给 `subconverter` 前按输入顺序用 `|` 拼接并整体 URL 编码；`null`/空数组/留空时不传 |
| `expand` | 隐藏 | `false` | 必传，固定传 `false` |
| `classic` | 隐藏 | `true` | 必传，固定传 `true` |

补充规则：

- “跳过证书验证”这一高级选项的业务语义对应上游 `skip_cert_verify`；实际传给 `subconverter` 的查询参数名为 `scv`
- `config` 必须是阶段 1 快照中显式保存的远程 HTTP(S) 模板 URL；前端初始值来自部署默认模板 URL，部署默认模板 URL 必须可配置，默认值为 `https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini`
- `chain-subconverter` 必须先拉取 `config` 指向的模板，再把后端托管的内部模板 URL 传给 `subconverter`
- `chain-subconverter` 不得把用户提供的远程模板 URL 直接透传给 `subconverter`
- 当 `config` 等于部署默认模板 URL 时，其成功拉取结果必须先通过模板解析校验，只有校验通过的内容才允许写入默认模板缓存
- 当 `config` 等于部署默认模板 URL 且刷新失败时，若当前服务进程中存在此前校验通过的默认模板缓存，可以继续使用该缓存完成本次转换，并在支持 `messages[]` 的响应中返回 warning；若不存在可用缓存，当前请求必须在调用 `subconverter` 前失败
- `include`、`exclude` 若存在多个 Tag，后端必须基于阶段 1 快照中的数组值，按输入顺序用 `|` 拼接原始值，再整体做 URL 编码后传给 `subconverter`；例如 `["TagA", "TagB", "TagC"]` 最终形成 `include=TagA%7CTagB%7CTagC`
- 模板拉取返回非成功 HTTP 状态、请求失败或空内容时，当前请求必须在调用 `subconverter` 前失败
- 若模板中识别出的地域策略组行缺少必需字段，或其正则无法编译，当前请求必须在调用 `subconverter` 前失败
- 模板可正常拉取但未识别出任何地域策略组时，请求仍可继续；此时只是不支持基于地域策略组的自动填充
- 阶段 1 高级选项快照进入 query 构造前，先按 [03-backend-api](03-backend-api.md) 的接口接受层模型完成入站归一化；`config` 缺失、为空或不是 HTTP(S) URL 时必须阻断当前请求
- query 构造逐项保持该语义：复选框 `null` 不传、显式 `true/false` 按值传递；`config` 必须由后端模板准备流程统一处理；`include`、`exclude` 仅在非空数组时参与 query 构造，并在传给上游前按输入顺序用 `|` 拼接为单个参数
- 同一次转换管线内，三个 pass 的 `emoji`、`udp`、`scv`、`config`、`include`、`exclude` 都必须来自同一份阶段 1 高级选项快照
- `expand=false` 与 `classic=true` 不提供前端控件，后端必须固定传递

---

## 1. 转换并自动填充

### 1.1 输入

统一转换管线使用以下输入：

- 落地节点信息
- 中转节点信息
- `config`（外部配置/模板 URL）与其他 `subconverter` 配置参数
- 端口转发服务信息（`forwardRelayItems[]`）

其中：

- `subconverter` 使用落地节点信息、中转节点信息、`config`（外部配置/模板 URL）与其他 `subconverter` 配置参数
- `config` 的用户输入只用于确定本次有效模板来源；模板内容由 `chain-subconverter` 拉取、校验并托管后，再供 `subconverter` 使用
- 端口转发服务信息作为阶段 2 与订阅渲染阶段的附加输入保留
- `forwardRelayItems = []` 时，流程仍视为“未提供任何端口转发服务项”；允许继续转换，但不会产出任何 `forwardRelays[]` 候选
- `transitRawText` 支持三种输入项：订阅 URL、节点 URI、`data:text/plain,<base64文本>`
- `data:text/plain,<base64文本>` 在业务语义上视为订阅 URL，不单独引入“内联原始订阅文本”输入类型

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

- 阶段 1 的“转换并自动填充”复用该管线定义，但只执行前两个 discovery pass（见 `1.1.3`）
- `POST /api/generate` 的生成前校验必须复用该 3-pass 管线
- `POST /api/resolve-url` 的恢复可重放性判定必须复用该 3-pass 管线
- 订阅链接实际被打开或下载时的 YAML 渲染必须复用该 3-pass 管线

### 1.1.3 pass 调用范围

三个 pass 同属一条管线，但各入口执行的 pass 不同：

- `POST /api/stage1/convert`：只执行 `landing-discovery pass` 与 `transit-discovery pass`；不执行 `full-base pass`，不产出 `baseCompleteConfig`
- `POST /api/generate`、`POST /api/resolve-url` 校验、订阅打开/下载：执行完整三 pass；`full-base pass` 的落地侧为按 `stage2Snapshot` 合并后的托管 landing 短链

### 1.1.2 端口转发服务输入校验（权威口径）

输入与校验规则：

- `stage1Input.forwardRelayItems` 必须是数组；每个元素承载一个独立输入项，不使用连续文本回拼
- 逐个解析 `stage1Input.forwardRelayItems[]` 中的输入项；空字符串项忽略；保留其余有效输入项的原始顺序
- 每个有效输入项都必须严格匹配 `server:port`
- 当前不支持 IPv6；`server` 只允许两类：严格 IPv4、ASCII hostname
- 若 `server` 仅由数字与 `.` 组成，则必须按严格 IPv4 校验：恰有 `4` 段、每段为 `0-255` 的十进制整数、多位段不得有前导 `0`
- 否则必须按 ASCII hostname 校验：总长度 `1-253`、至少包含一个 `.`、按 `.` 分段后每段长度 `1-63`、每段仅允许字母/数字/`-`、段首尾不得为 `-`
- ASCII hostname 不允许空段，因此不允许连续 `.` 与尾点；不允许 `_`；不允许原始 Unicode 字符
- `port` 必须是十进制整数，取值范围 `1-65535`
- 不做自动纠错；有效输入项若包含首尾空白、缺失 `:`、端口非数字或越界，都视为非法项
- 本规则只做语法校验；不做 DNS 解析、可达性校验；私网、环回与其他保留 IPv4 地址不因地址类型额外判错
- 非法输入项报错；重复输入项报错。重复判定时，hostname 必须按 ASCII 小写归一化后与 `port` 一起比较；IPv4 按原值与 `port` 一起比较
- 每条合法服务都必须生成唯一的规范化字面量 `server:port`：hostname 一律转为 ASCII 小写，IPv4 保持原值，`port` 一律转为无前导 `0` 的十进制字符串
- 只要存在任一报错，阶段 1 视为失败，不产出 `stage2Init.forwardRelays[]`
- 前端可复用本节同一语法与规范化口径做录入期预校验，但不得以 UI 预校验替代后端在阶段 1 的最终裁决
- 具体失败响应语义见 [03-backend-api](03-backend-api.md)

### 1.2 输出

统一转换管线存在两类结果语义：

- `stage2Init`：阶段 1 对前端暴露的初始化数据
- `baseCompleteConfig`：`full-base pass` 生成并经后端后处理后的基底完整配置，供后端校验与订阅渲染使用；不得与模板内容混称为“配置文件”

补充规则：

- 阶段 1 对外返回 `stage2Init`
- `POST /api/generate` 返回校验通过后的链接
- 面向用户消费的最终 `completeConfig` 在订阅链接被打开或下载时即时生成并返回；面向用户时可称“最终订阅 YAML”

### 1.3 落地节点出组后处理

后端在 `full-base pass` 拿到可解析配置后，必须在后续首次消费 `baseCompleteConfig` 之前，语义上完成一次“落地节点出组”后处理。

实现可以采用“预先落地改写”或“按需值视图/流式替换”，但对外行为必须等价。

处理规则：

1. 识别本次有效模板中声明的地域策略组
2. 从这些区域策略组的成员列表中剔除落地身份名；剔除集合 = 当前 `landing-discovery pass` 全部 `proxy.name`（各行 `sourceLandingNodeName`）∪ `stage2Snapshot` 全部 `proxyName`
3. 若某名称同时出现在多个区域策略组中，必须在每个命中的区域策略组内都剔除
4. 完成剔除后的结果，才是后续校验与订阅渲染统一使用的 `baseCompleteConfig`
5. 在执行 2.3 的区域策略组成员统计前，先应用剔除语义；区域策略组成员统计只计入中转节点

---

## 2. 阶段 2 初始化

### 2.1 收集落地节点

- 必须从 `landing-discovery pass` 的结果中收集所有落地节点
- 收集口径固定为：读取 `list=true` 返回的 Clash YAML `proxies[]`，按每个 `proxy.name` 提取落地身份
- `landingNodeName` 固定来源于 `landing-discovery pass` 返回的结构化 `proxy.name`
- `stage2Init` 阶段仅依赖 Pass 1 身份；Pass 3 前按 `sourceLandingNodeName` 从 Pass 1 取连接参数（见 `2.1.2`）
- `landingNodeType` 固定来源于 `landing-discovery pass` 返回的结构化 `proxy.type`，并允许结合该节点内的附加字段做展示分类
- `server` 固定来源于当前落地节点解析结果中的 `server` 字段（优先以 Pass 3 可唯一匹配身份的节点端点为准）；必填且不能为空
- 当前展示分类补充规则为：`type = vless` 且存在 `reality-opts` 时，展示类型记为 `Reality`；`type = ss` 且存在 `plugin=shadow-tls`、`plugin: shadow-tls`、`shadow-tls` 或等价 `plugin-opts` 标记时，展示类型记为 `ShadowTLS`
- 按“每个落地节点一行”生成 `stage2Init.rows[]`
- 阶段 2 第一列展示 `proxyName`，第二列展示 `landingNodeType`，并提供 `server` 元信息用于分组展示

### 2.1.1 落地节点命名与身份边界（`stage2Init`）

- `stage2Init` 中 `landingNodeName` 来源于 `landing-discovery pass` 的 `proxy.name`
- `landingNodeType` 只承担展示语义，不进入快照定位键
- 连接参数在 Pass 3 前从 Pass 1 按 `sourceLandingNodeName` 读取；快照行模型见 `2.1.2`
- 落地节点名称的产出、重名处理与相关实现细节由 `subconverter` 服务负责；本规格不规定具体命名或消歧算法
- 前端初始化时消费 `stage2Init.landingNodeName`；`stage2Snapshot.proxyName` 的编辑/复制规则见 `2.1.2` 与 [02](02-frontend-spec.md)
- 稳定性保证范围为“同一后端实现 + 同一输入快照”；跨后端版本或实现细节变化不承诺名称完全一致，若导致旧快照无法按名定位，按 3.2.1 判定为 `conflicted`

### 2.1.2 `stage2Snapshot` 行身份

- `stage2Init`：每 Pass 1 落地一行；`landingNodeName` 只读；同时返回 `rowId`、`sourceLandingNodeName`、`proxyName`（初始三者同 Pass 1 名）
- `rowId`：行稳定 ID（全表唯一）；复制行须新生成，不与 `proxyName` 绑定
- `proxyName`：最终 YAML `proxies[].name`（全表唯一，可改名）
- `sourceLandingNodeName`：Pass 1 原始 `proxy.name`（连接参数键；复制行可共享）
- 复制：共享 `sourceLandingNodeName`；新 `rowId`；`proxyName` 默认 `原名 2`、`原名 3`…
- `rowId` 在 `stage2Snapshot.rows[]` 中为必填；`landingNodeName` 仅作为 `proxyName` 兼容字段，不承担回退定位语义
- 行集：每个落地身份至少一行；不得引用未知 `sourceLandingNodeName`

### 2.2 判断全局可用模式与行级限制

阶段 2 第三列的候选模式分为两层：

- `stage2Init.availableModes`：本次阶段 2 的全局模式基线
- `rows[].restrictedModes`：某一行额外禁用的模式与原因；仅在该行存在额外限制时返回
- `rows[].modeWarnings`：某一行模式仍可选择、但需要提示“不推荐”的 warning；仅在该行存在附加提示时返回

#### 全局规则

- `stage2Init.availableModes` 必须始终包含 `none`
- 当存在至少一个可选择的链式代理候选时，`stage2Init.availableModes` 必须包含 `chain`
- 当满足以下两个条件时，`stage2Init.availableModes` 必须包含 `port_forward`
  - 阶段 1 已录入至少一个合法端口转发服务
- 当某模式不满足上述全局条件时，`stage2Init.availableModes` 不得包含该模式
- `stage2Init.availableModes` 的顺序固定为 `none`、`chain`、`port_forward`；未启用的模式直接省略，不重排其余模式相对顺序

#### 行级规则

- 某行的最终可选模式 = `stage2Init.availableModes` 扣除当前行 `restrictedModes` 中出现的模式键
- `rows[].restrictedModes` 为可选字段；缺失表示该行无额外模式限制
- `rows[].restrictedModes` 中的模式键必须属于 `stage2Init.availableModes`
- `rows[].restrictedModes.<mode>.reasonCode` 与 `reasonText` 都必须返回；`reasonText` 面向用户展示
- `rows[].modeWarnings` 为可选字段；缺失表示该行无额外 warning
- `rows[].modeWarnings` 中的模式键必须属于 `stage2Init.availableModes`
- `rows[].modeWarnings.<mode>.reasonCode` 与 `reasonText` 都必须返回；`reasonText` 面向用户展示
- 若 `chain` 已出现在 `stage2Init.availableModes` 中，且某落地节点协议属于“链式代理不推荐”集合，则该行必须返回 `modeWarnings.chain`
- 若 `chain` 已出现在 `stage2Init.availableModes` 中，且某落地节点当前使用端口大于 `10000`，则该行必须返回 `modeWarnings.chain`，提示建议改用 `10000` 以内端口，避免部分机场屏蔽高位端口导致不通
- 前端不得自行识别落地端口并补算该 warning；落地端口识别与 warning 组装都属于后端阶段 2 初始化职责
- 若同一行同时命中多条 `chain` warning 条件，后端必须合并为单个 `modeWarnings.chain` 项；`reasonCode` 允许为 `DISCOURAGED_BY_LANDING_PROTOCOL`、`DISCOURAGED_BY_LANDING_PORT` 或 `DISCOURAGED_BY_LANDING_PROTOCOL_AND_PORT`
- 当前链式代理不推荐集合为：`hysteria`、`hysteria2`、`tuic`、`wireguard`、`anytls`、`vless-reality`、`shadowtls`
- 上述协议在当前规格中仍允许手动选择 `chain`、允许自动填充 `chain`、允许进入生成与恢复链路；warning 仅承担前端提示语义，不改变可选性

### 2.3 收集链式候选

链式候选写入 `stage2Init.chainTargets[]`。在 `POST /api/stage1/convert` 路径下，候选收集只依赖 discovery 结果与模板识别结果，不依赖 Pass 3 产物。

收集范围：

- 本次有效模板识别出的地域策略组名称（`kind = proxy-groups`）
- `transit-discovery pass` 识别出的单个中转 `proxy`

处理规则：

1. 对区域策略组：按模板识别结果收集组名并写入候选，`kind = proxy-groups`
2. 对单个 `proxy` 候选：读取 `transit-discovery pass` 的 Clash YAML `proxies[]`，按每个 `proxy.name` 收集中转节点，`kind = proxies`
3. `kind` 仅用于前端分组展示
4. `chainTargets[]` 只返回 `name`、`kind` 与 `isEmpty`
5. `stage1/convert` 阶段允许省略 `isEmpty`（未知即留空）；`EMPTY_CHAIN_TARGET` 的最终裁决在生成/订阅校验链路完成 Pass 3 后执行
6. `chainTargets[].name` 在同一次转换内必须全局唯一；它既是阶段 2 下拉选项值，也是 `stage2Snapshot.rows[].targetName` 的序列化值
7. 若任一中转 `proxy.name` 与任一地域策略组重名，或任意两个中转 `proxy` 重名，必须以 `CHAIN_TARGET_NAME_CONFLICT` 直接阻断本次请求
8. 按 `2.7` 渲染出的 `serverAggregationGroups` 聚合组属于最终 YAML 衍生产物，不参与 `chainTargets[]` 收集

### 2.4 收集端口转发候选

- 从阶段 1 录入并校验通过的 `forwardRelayItems[]` 中收集 `forwardRelays[]`
- `forwardRelays[].name` 必须等于该服务的规范化 `server:port` 字面量
- 保留用户输入顺序
- 当端口转发功能未开启时，`forwardRelays[]` 为空

### 2.5 自动填写 `mode` 与第四列

阶段 2 初始化时，后端必须直接为每行产出 `landingNodeType`、`server`、默认的 `mode` 与 `targetName`；前端按 `stage2Init.rows[]` 渲染初始状态。

#### 初始化决策顺序

1. 先按 `2.2` 确定 `stage2Init.availableModes`
2. 再为该行计算 `restrictedModes`
3. 再为该行计算 `modeWarnings`
4. 用 `stage2Init.availableModes` 扣除该行 `restrictedModes`，得到该行最终可选模式
5. 若 `chain` 在该行最终可选模式中，则优先按“当链式代理可用”规则尝试自动识别
6. 若 `chain` 不在该行最终可选模式中、但 `port_forward` 在该行最终可选模式中，则该行默认 `mode = port_forward`，并按“当 `mode = port_forward`”规则填写 `targetName`
7. 若该行最终可选模式只有 `none`，则该行默认 `mode = none`，且 `targetName = null`

#### 当链式代理可用

链式代理默认优先尝试“区域策略组自动识别”。

处理步骤：

1. 使用本次有效模板识别出的地域策略组正则，在完整 `landingNodeName` 上逐一匹配
2. 若唯一命中且命中的地域策略组在本次 `chainTargets[]` 中存在，且 `isEmpty` 留空，则该行默认 `mode = chain`，`targetName` 自动填写为对应地域策略组名称；即使该行同时存在 `modeWarnings.chain` 也不改变这一默认行为
3. 其他情况一律按“未唯一命中”处理：`mode = none`，`targetName = null`

#### 当 `mode = port_forward`

- 本规则同时适用于“初始化直接落到 `port_forward`”和“用户后续手动切换到 `port_forward`”
- `targetName` 保存所选 `forwardRelays[].name`
- `targetName` 仅允许由用户手动选择，系统不得自动填充；进入 `port_forward` 时默认 `targetName = null`，并保留完整 `forwardRelays[]` 供用户选择

#### 初始化决策表

| 行最终可选模式 | 链式自动识别结果 | `forwardRelays[]` 数量 | 初始化 `mode` | 初始化 `targetName` |
|----------------|------------------|------------------------|---------------|---------------------|
| `["none"]` | 不适用 | 不适用 | `none` | `null` |
| `["none", "chain"]` | 唯一命中 | 不适用 | `chain` | 对应区域策略组名称 |
| `["none", "chain"]` | 未唯一命中 | 不适用 | `none` | `null` |
| `["none", "port_forward"]` | 不适用 | `>=1` | `port_forward` | `null` |
| `["none", "chain", "port_forward"]` | 唯一命中 | 任意 | `chain` | 对应区域策略组名称 |
| `["none", "chain", "port_forward"]` | 未唯一命中 | 任意 | `none` | `null` |

### 2.6 区域识别口径

当前区域自动识别以本次有效模板中识别出的地域策略组为准。

识别规则：

- 只处理未被注释的 `custom_proxy_group=` 行
- 仅当策略组名形如“国旗 emoji + 任意文本 + 节点”时，才将该行视为地域策略组候选
- 解析时按反引号分段；必须至少包含策略组名、组类型与正则三段
- 正则以该行第三段内容为准；组类型当前不限制为 `url-test`
- 候选顺序以模板中出现顺序为准

命中 **0** 条或 **多于 1** 条时，链式自动识别失败（见 2.5）；**恰好 1** 条时，只有当该策略组在当次 `chainTargets[]` 中存在且 `isEmpty` 留空，才允许自动填写。

### 2.7 按 server 聚合配置（`stage2Snapshot.serverAggregationGroups[]`）

按落地 `server` 分组；多个 `sourceLandingNodeName` 可共享同一 `server` 端点并入同一组，成员以 `rowId` 显式引用。

- `serverAggregationGroups[]` 表达“按 server 分组的显式聚合策略组配置”
- `serverAggregationGroups[].server` 必须非空，且同一 `stage2Snapshot` 内唯一
- `serverAggregationGroups[].enabled = true` 时才参与聚合组渲染；`strategy` 仅允许 `fallback` 或 `url-test`
- `serverAggregationGroups[].memberRowIds[]` 仅允许引用当前 `rows[]` 的 `rowId`；数组顺序承载组内成员顺序，去重时保留首次出现的位置
- `enabled = true` 时，去重后的 `memberRowIds[]` 至少包含 2 个不同成员；重复 `rowId` 不计入人数
- `enabled = true` 时，每个成员行对应的 `rows[].server` 必须与组 `server` 一致；跨 server 入组必须阻断
- `enabled = false` 时，该组不参与渲染，且 `strategy`、`memberRowIds` 不参与校验
- 该聚合配置只影响最终 YAML 产物，不回写阶段 2 链式候选；`rows[].targetName` 在 `mode = chain` 下仍只允许引用 `chainTargets[].name`

#### 聚合组 YAML 名称推导

聚合组无独立 `groupName` 字段；最终 YAML 策略组名由 **`memberRowIds[]` 去重后第一个成员**（锚点行）的 `proxyName` 推导：

1. 若锚点行 `proxyName` 非空、不等于其 `sourceLandingNodeName`、且不以 `srv` + 空白 + `:` / `：` 前缀开头，则聚合组名 = 该 `proxyName`
2. 否则使用默认展示名：`国旗 emoji + server`（组内源行行名前缀国旗一致时取该 emoji；无法确定单一国旗时仅 `server`）
3. 若推导名与既有 `proxy-groups` 或同批待写入聚合组重名，按 `基名 2`、`基名 3`…递增直至唯一

前端 Stage 2 聚合树中 server 分组节点的可编辑名称与上述锚点行 `proxyName` 保持同步；用户编辑组名即编辑锚点行 `proxyName`。

---

## 3. 生成前校验与改写

### 3.1 阶段 2 快照语义

每行 `proxyName` 对应最终配置中的一个 `proxies[]` 项：

- `mode = none`：保持原样
- `mode = chain`：第四列写入 `dialer-proxy`
- `mode = port_forward`：第四列写入端口转发 `server:port`
- `rows` 数组顺序不参与生成语义；校验与恢复以 `rowId` 为行定位主键，`sourceLandingNodeName` 仅用于连接参数绑定
- `serverAggregationGroups[]` 只新增聚合策略组产物，不得覆盖任何行的 `mode/targetName` 语义

### 3.2 生成前校验

- 生成/订阅/恢复判定时必须先根据 `stage1Input` 重跑 Pass 1+2，再按 `3.5` 执行 Pass 3 与出组
- 若任一必需 pass 失败，必须直接阻断
- `stage2Snapshot` 须满足 `2.1.2` 行集规则；`proxyName` 重复为 `DUPLICATE_PROXY_NAME`
- 任一行若 `mode != none` 且 `targetName` 为空，必须阻断生成
- 若 `targetName` 在对应候选列表中不存在，必须阻断生成
- 若多个落地节点同时选择同一个 `forwardRelays[].name` 作为 `port_forward` 目标，必须以 `DUPLICATE_FORWARD_RELAY_TARGET` 阻断生成
- 若某行选择的 `chain` 目标在当前 `chainTargets[]` 中 `isEmpty = true`，必须以 `EMPTY_CHAIN_TARGET` 阻断生成
- 若 `serverAggregationGroups[]` 违反 `2.7` 校验规则，必须阻断生成
- 具体失败响应语义见 [03-backend-api](03-backend-api.md)
- `POST /api/generate` 完成上述校验与链接编码，返回可消费的链接

### 3.2.1 恢复链接时的可重放性判定

本节是 `POST /api/resolve-url` 判断 `restoreStatus` 的权威口径。判定目标是“恢复快照中的目标引用是否仍然有效”。`resolve-url` 的校验必须复用本章定义的生成前校验口径。

判定规则：

- 后端必须基于恢复出的 `stage1Input` 重跑 Pass 1+2，并按 `3.5` 与生成阶段一致的校验口径判定可重放性
- 若任一必需 pass 失败，`resolve-url` 直接返回失败响应；`restoreStatus` 只用于解码与校验成功后的可重放性结果
- 后端必须用恢复出的 `stage2Snapshot` 执行与生成阶段一致的逐行校验
- 只要每一行满足 `2.1.2` 行集规则且 `mode` / `targetName` 仍可在当前候选集合中解析，则视为可重放
- 任一行只要出现引用失效，即应判定整个恢复快照不可重放，并返回 `restoreStatus = conflicted`

补充规则：

- 上游订阅内容变化导致引用仍有效时，恢复结果保持可重放；导致任一引用失效时，恢复结果为不可重放
- 若 `targetName` 引用的是 `proxy-groups` 候选，只要该候选在当前候选集合中仍存在且可用，即使其成员节点发生变化，也应允许恢复并继续生成
- 若 `targetName` 引用的是 `proxies` 候选，则该 `proxy.name` 必须仍存在于当前候选集合中，否则视为引用失效
- 若 `targetName` 引用的是端口转发服务，则该规范化 `server:port` 字面量必须仍存在于当前 `forwardRelays[]` 中，否则视为引用失效
- 若某行的 `sourceLandingNodeName` 已不在当前落地集合，或 `proxyName` / `targetName` 引用失效，则视为不可重放
- 若 `serverAggregationGroups[]` 中某启用组违反 `2.7` 校验规则（未知成员 `rowId`、跨 server 入组、成员数不足 2 等），则视为不可重放
- 启用组成员仅因 `proxyName` 变化导致聚合组 YAML 名变化，不单独判为不可重放；只要成员 `rowId` 与 `server` 引用仍有效即可
- `restoreStatus = conflicted` 时，响应必须附带冲突提示消息；具体消息语义见 [03-backend-api](03-backend-api.md)

### 3.3 快照应用（Pass 3 前）

订阅渲染主路径在 `full-base pass` 之前完成 snapshot 语义：

- 按 `sourceLandingNodeName` 从 Pass 1 取连接参数，按 `proxyName` 展开托管 landing 的 `proxies[]`
- `mode = chain`：写入 `dialer-proxy: <targetName>`
- `mode = port_forward`：将 `targetName` 解析为 `server` 与 `port` 并替换
- Pass 3 后不再对 landing `proxies[]` 做上述 YAML 补丁；landing 行语义只通过 Pass 3 前的托管 landing 输入生效

### 3.3.1 server 聚合组追加（Pass 3 后）

`serverAggregationGroups[]` 中 `enabled = true` 的组，在 `full-base pass` 完成且执行 `1.3` 出组后，向最终 YAML 的 `proxy-groups` 追加新策略组（不修改既有 `proxies[]` 与行级 `dialer-proxy` 语义）。

每条追加组固定写入以下健康检查参数：

- `url = https://cp.cloudflare.com/generate_204`
- `interval = 60`
- `lazy = false`
- `timeout = 1000`
- `max-failed-times = 1`

组 `type` 取快照中的 `strategy`（`fallback` 或 `url-test`）；当前不写入 `tolerance` 等额外字段。

组 `proxies` 成员列表按 `memberRowIds[]` 去重后顺序，引用各行渲染结果的 `proxyName`；成员 proxy 必须已存在于最终 `proxies[]`。

组名按 `2.7` 聚合组 YAML 名称推导规则生成。

### 3.4 协议与端口限制

- `modeWarnings.chain` 的规则见 `2.2`；端口转发仍只改 `server` 与 `port`

### 3.5 最终配置交付时机

- 订阅打开/下载时即时生成 `completeConfig`
- 流程：重跑 Pass 1+2 → `3.3` 合并托管 landing → Pass 3 full-base → `1.3` 出组 → `3.3.1` server 聚合组追加 → 返回
- 任一必需 pass 失败则订阅渲染失败

## 4. 共享通知生命周期

- 本章只定义共享层通知语义的创建、压制、降级与清除规则；具体 UI 容器与视觉表现以 [02-frontend-spec](02-frontend-spec.md) 为准
- `blockingErrors[]` 属于请求结果的阻断反馈；`messages[]` 属于可追加进 workflow log 的后端消息源；`stage2Stale` 与 `restoreStatus = conflicted` 属于工作流状态提示；`scope = stage1_field | stage2_row | stage3_field | stage3_action` 额外承担局部定位语义
- `blockingErrors[]` 的清除、压制、降级规则只约束通知语义，不约束方案层把唯一主阻断反馈承载位放在阶段操作区还是单一全局位置
- workflow log 以当前页面会话为范围维护追加历史；共享层允许追加本地用户可读事件与后端 `messages[]`，但不得因发起新请求、输入变化或切换阶段而自动清空既有历史
- workflow log 可设置有限保留条数，但必须保持顺序并允许查看最近保留历史；共享层不得退化为只保留最近一条消息
- 修改阶段 1 任一输入后，若阶段 2 当前已有行快照，则阶段 2 必须标记为 `stale`；该状态直接驱动“生成链接”禁用，不依赖某条正文提示是否正在显示
- 用户点击“转换并自动填充”后，`stage2Stale` 的正文提示应立即隐藏；若转换成功，`stage2Stale` 清除；若转换失败，`stage2Stale` 作为数据状态保留，但不要求继续以主提示与本次失败反馈并列显示
- `stage1_field` 错误在对应字段值发生变化时必须清除；若某字段因交互联动被隐藏并清空，其历史 `stage1_field` 错误也必须同步清除
- `stage2_row` 错误在对应行的 `mode` 或 `targetName` 变化时必须清除
- `stage3_field` 错误在对应字段值发生变化时必须清除；当前默认对应 Stage 3 的 `currentLinkInput`
- `stage3_action` 错误在同一动作被重新触发，或其依赖的 Stage 3 当前链接来源发生变化时必须清除
- 当阶段 2 进入 `stale` 或 `conflicted` 时，已有 `stage2_row` 错误必须隐藏或降级，不再作为当前主提示与工作流状态提示竞争
- 字段/行级局部定位提示继续作为修复引导保留；它们不得升级为与主阻断反馈承载位同权重的第二主反馈堆栈
- 进入 workflow log 的后端 `messages[]` 与本地事件都不参与阻断优先级竞争；当前存在阻断反馈时，日志仍可保留，但不得取代阻断反馈的主提示地位

