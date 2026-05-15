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
- 默认部署下，`subconverter` 以“开启订阅/配置/规则集缓存”或“等价的重复拉取收敛机制”运行
- 后端对 `subconverter` 的同时在途请求数必须受控且可配置，默认 `10`
- 达到并发上限时，后端立即失败，不转发、不排队
- 业务层默认不对失败的 `subconverter` 调用自动重试
- 若显式启用重试，最多只允许 `1` 次串行重试，且不得并行放大请求
- 后端在转发给 `subconverter` 前先校验参与本次转换的输入边界；超限请求直接拒绝
- 当前阶段 1 的主预算口径固定为“完整上游请求 URI 长度”：`landing-discovery pass`、`transit-discovery pass`、`full-base pass` 三个请求中任意一个超过预算都必须在转发前阻断；该上限必须可配置，默认 `16384` bytes
- 若阶段 1 支持多 URL 输入，`landingRawText` 与 `transitRawText` 各自承载的输入项数量上限都必须可配置，默认每个字段最多 `32` 条
- `subconverter` 调用若出现超时、连接失败、非成功 HTTP 响应、不可解析结果或并发上限拒绝，均视为该 pass 失败
- `landing-discovery pass`、`transit-discovery pass`、`full-base pass` 中任一必需 pass 失败时，当前请求必须整体失败；不做跨 pass 降级，不复用旧结果
- 若本次有效模板已识别出某地域策略组，但该地域策略组在同一条转换管线的 `full-base pass` 产物（经 `1.3` 后处理后的 `baseCompleteConfig`）中完全不存在，必须视为 `full-base pass` 失败；不得按空组静默降级

### 0.2 `subconverter` 调用契约

- 本项目当前只定义一种内部转换入口：`GET /sub`
- 三个 pass 都必须复用同一组固定参数与阶段 1 高级选项映射结果
- 三个 pass 必须属于同一条转换管线；`full-base pass` 必须与同一管线中的两个 discovery pass 保持输入快照一致
- 实现必须核对 discovery pass 返回的每个落地/中转身份，都能在同一管线的 `full-base pass` 完整代理集合中完成唯一定位；若不能唯一定位，视为 pass 失败

### 0.2.1 pass 级参数约束

- 三个 pass 的 `target` 都必须传 `clash`
- `landing-discovery pass`：`url` 只传落地节点信息，传 `list=true`
- `transit-discovery pass`：`url` 只传中转节点信息，传 `list=true`
- `full-base pass`：`url` 传“落地节点信息 + 中转节点信息”，不传 `list`
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
| `list` | 隐藏 | 无 | 两个 discovery pass 传 `true`；`full-base pass` 不传 |
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

- 阶段 1 的“转换并自动填充”必须复用该 3-pass 管线
- `POST /api/generate` 的生成前校验必须复用该 3-pass 管线
- `POST /api/resolve-url` 的恢复可重放性判定必须复用该 3-pass 管线
- 订阅链接实际被打开或下载时的 YAML 渲染必须复用该 3-pass 管线

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
2. 从这些区域策略组的成员列表中剔除所有落地节点
3. 若某落地节点同时出现在多个区域策略组中，必须在每个命中的区域策略组内都剔除
4. 完成剔除后的结果，才是后续校验与订阅渲染统一使用的 `baseCompleteConfig`
5. 在执行 2.3 的区域策略组成员统计前，先应用剔除语义；区域策略组成员统计只计入中转节点

---

## 2. 阶段 2 初始化

### 2.1 收集落地节点

- 必须从 `landing-discovery pass` 的结果中收集所有落地节点
- 收集口径固定为：读取 `list=true` 返回的 Clash YAML `proxies[]`，按每个 `proxy.name` 提取落地身份
- `landingNodeName` 固定来源于 `landing-discovery pass` 返回的结构化 `proxy.name`
- `landingNodeName` 必须与同一条转换管线的 `full-base pass` 代理集合做唯一对应校验；只有能唯一定位到 `1` 个同名代理时，才允许固化为最终 `landingNodeName`
- `landingNodeType` 固定来源于 `landing-discovery pass` 返回的结构化 `proxy.type`，并允许结合该节点内的附加字段做展示分类
- 当前展示分类补充规则为：`type = vless` 且存在 `reality-opts` 时，展示类型记为 `Reality`；`type = ss` 且存在 `plugin=shadow-tls`、`plugin: shadow-tls`、`shadow-tls` 或等价 `plugin-opts` 标记时，展示类型记为 `ShadowTLS`
- 按“每个落地节点一行”生成 `stage2Init.rows[]`
- 阶段 2 第一列展示 `landingNodeName`，第二列展示 `landingNodeType`

### 2.1.1 落地节点命名与身份边界

- 在当前规格中，`landingNodeName` 是阶段 2 快照、生成改写与恢复重放的唯一定位键
- `landingNodeName` 来源于 `landing-discovery pass` 产出的落地身份集合，但必须经过与同一条转换管线 `full-base pass` 的唯一同名校验后才能固化
- `landingNodeType` 来源于 `landing-discovery pass` 的结构化 `proxy.type` 与展示分类规则；当前只承担阶段 2 展示语义，不进入阶段 2 快照、生成改写或恢复定位键
- 若阶段 2 的其他规则需要读取落地节点的 `server`、`port` 或同类端点字段，必须在完成上述唯一同名校验后，从匹配到的 `full-base pass` 代理对象读取；不得把 `landing-discovery pass` 中除身份与展示分类外的附加字段视为稳定契约
- 落地节点名称的产出、重名处理与相关实现细节由 `subconverter` 服务负责；本规格不规定具体命名或消歧算法
- 前端只消费 `stage2Init` 中返回的 `landingNodeName`，不得自行重命名、去重或补算映射
- 稳定性保证范围为“同一后端实现 + 同一输入快照”；跨后端版本或实现细节变化不承诺名称完全一致，若导致旧快照无法按名定位，按 3.2.1 判定为 `conflicted`

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

链式候选统一来自同一条 3-pass 管线的中转相关结果，写入 `stage2Init.chainTargets[]`。

收集范围：

- `full-base pass` 生成并满足 `1.3` 剔除语义后的、由本次有效模板识别出的地域策略组
- `transit-discovery pass` 识别出的单个中转 `proxy`

处理规则：

1. 对区域策略组，读取 `baseCompleteConfig` 中本次有效模板识别出的全部地域策略组当前结果
2. 区域策略组成员数按“真实中转节点成员”计算；占位的 `DIRECT` 与所有落地节点都不计入成员数
3. 若某区域策略组只包含 `DIRECT`，或剔除 `DIRECT` 与所有落地节点后成员数为 `0`，该区域策略组仍必须进入 `chainTargets[]`，但必须标记 `isEmpty = true`
4. 若有效模板识别出的某地域策略组在 `baseCompleteConfig` 当前结果中完全不存在，必须直接以 `SUBCONVERTER_UNAVAILABLE` 阻断当前请求；错误文案必须明确为 `subconverter` 未成功获取或应用后端托管模板，或等价表达
5. 若某区域策略组存在至少 1 个真实中转节点成员，则该区域策略组写入 `chainTargets[]` 时 `isEmpty` 留空
6. 对单个 `proxy` 候选，读取 `transit-discovery pass` 的 Clash YAML `proxies[]`，按每个 `proxy.name` 收集中转节点
7. `chainTargets[]` 只返回 `name`、`kind` 与 `isEmpty`
8. 有效模板识别出的地域策略组写入 `chainTargets[]` 时，`kind = proxy-groups`
9. 单个中转 `proxy` 写入 `chainTargets[]` 时，`kind = proxies`
10. `kind` 仅用于前端分组展示
11. `chainTargets[].name` 在同一次转换内必须全局唯一；它既是阶段 2 下拉选项值，也是 `stage2Snapshot.rows[].targetName` 的序列化值
12. 若任一中转 `proxy.name` 与任一地域策略组重名，或任意两个中转 `proxy` 重名，必须以 `CHAIN_TARGET_NAME_CONFLICT` 直接阻断本次请求

### 2.4 收集端口转发候选

- 从阶段 1 录入并校验通过的 `forwardRelayItems[]` 中收集 `forwardRelays[]`
- `forwardRelays[].name` 必须等于该服务的规范化 `server:port` 字面量
- 保留用户输入顺序
- 当端口转发功能未开启时，`forwardRelays[]` 为空

### 2.5 自动填写 `mode` 与第四列

阶段 2 初始化时，后端必须直接为每行产出 `landingNodeType`、默认的 `mode` 与 `targetName`；前端按 `stage2Init.rows[]` 渲染初始状态。

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

---

## 3. 生成前校验与改写

### 3.1 阶段 2 快照语义

每个落地节点对应一行配置：

- `mode = none`：保持原样
- `mode = chain`：第四列表示要写入的 `dialer-proxy`
- `mode = port_forward`：第四列表示要应用的端口转发服务
- `stage2Snapshot.rows` 的数组顺序不参与生成语义；生成校验、恢复判定与最终改写都只按 `landingNodeName` 匹配对应落地节点

### 3.2 生成前校验

- 生成时必须先根据 `stage1Input` 重新执行同一条 3-pass 转换管线，得到当前的落地身份集合、链式候选集合与 `baseCompleteConfig`
- 若任一必需 pass 失败，必须直接阻断生成
- `stage2Snapshot.rows` 必须与当前落地节点集合一一对应：每个落地节点恰好出现一次，不允许缺行、重复行或额外行；不满足时必须以 `STAGE2_ROWSET_MISMATCH` 阻断生成
- 任一行若无法在本次 `baseCompleteConfig` 中按 `landingNodeName` 定位到对应落地节点，必须阻断生成
- 任一行若 `mode != none` 且 `targetName` 为空，必须阻断生成
- 若 `targetName` 在对应候选列表中不存在，必须阻断生成
- 若多个落地节点同时选择同一个 `forwardRelays[].name` 作为 `port_forward` 目标，必须以 `DUPLICATE_FORWARD_RELAY_TARGET` 阻断生成
- 若某行选择的 `chain` 目标在当前 `chainTargets[]` 中 `isEmpty = true`，必须以 `EMPTY_CHAIN_TARGET` 阻断生成
- 具体失败响应语义见 [03-backend-api](03-backend-api.md)
- `POST /api/generate` 完成上述校验与链接编码，返回可消费的链接

### 3.2.1 恢复链接时的可重放性判定

本节是 `POST /api/resolve-url` 判断 `restoreStatus` 的权威口径。判定目标是“恢复快照中的目标引用是否仍然有效”。`resolve-url` 的校验必须复用本章定义的生成前校验口径。

判定规则：

- 后端必须基于恢复出的 `stage1Input` 重新执行同一条 3-pass 转换管线，得到当前的落地身份集合、链式候选集合与 `baseCompleteConfig`
- 若任一必需 pass 失败，`resolve-url` 直接返回失败响应；`restoreStatus` 只用于解码与校验成功后的可重放性结果
- 后端必须用恢复出的 `stage2Snapshot` 执行与生成阶段一致的逐行校验
- 只要每一行的 `landingNodeName` 仍可定位、`mode` 仍合法、`targetName` 仍可在对应候选集合中解析，则该恢复快照应视为可重放
- 任一行只要出现引用失效，即应判定整个恢复快照不可重放，并返回 `restoreStatus = conflicted`

补充规则：

- 上游订阅内容变化导致引用仍有效时，恢复结果保持可重放；导致任一引用失效时，恢复结果为不可重放
- 若 `targetName` 引用的是 `proxy-groups` 候选，只要该候选在当前候选集合中仍存在且可用，即使其成员节点发生变化，也应允许恢复并继续生成
- 若 `targetName` 引用的是 `proxies` 候选，则该 `proxy.name` 必须仍存在于当前候选集合中，否则视为引用失效
- 若 `targetName` 引用的是端口转发服务，则该规范化 `server:port` 字面量必须仍存在于当前 `forwardRelays[]` 中，否则视为引用失效
- 若某行的 `landingNodeName` 在当前转换结果中已不存在、被重命名或无法唯一对应，则视为引用失效
- `restoreStatus = conflicted` 时，响应必须附带冲突提示消息；具体消息语义见 [03-backend-api](03-backend-api.md)

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

### 3.5 协议与端口限制

- `modeWarnings.chain` 的触发条件、`reasonCode` 取值与多条件合并规则统一以 `2.2 模式可用性与行级限制` 为准
- 端口转发对上述协议仍只替换 `server` 与 `port`

### 3.6 最终配置交付时机

- 订阅链接被打开或下载时，后端即时生成并返回最终 `completeConfig`
- 订阅渲染时，后端必须先重新执行同一条 3-pass 转换管线，得到当前 `baseCompleteConfig`
- 若任一必需 pass 失败，订阅渲染必须直接失败
- 后端随后基于请求中的 `stage2Snapshot` 应用 3.3 与 3.4 改写
- 改写完成后的结果作为本次返回给用户消费的最终 `completeConfig`

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

