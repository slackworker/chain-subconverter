# 04 - 业务规则

> 本章是“转换并自动填充”、候选收集、生成前校验与 YAML 改写的权威定义。  
> **Stage2 嵌套树 schema / 身份 / 顺序 / v5 / merge-reset**：以 [06-stage2-model](06-stage2-model.md) 为唯一事实源；本章 §2 仅摘要并保留 Pass 相关规则。  
> 前端展示见 [02-frontend-spec](02-frontend-spec.md)，接口字段见 [03-backend-api](03-backend-api.md)。

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
- 长链接状态载荷固定为 `statePayload v5`；`GET /sub`、`short-links` 与完整可重放恢复**拒绝非当前版本**；`resolve-url` 对旧版可尽力还原 `stage1Input`（见 [06 §7](06-stage2-model.md)）；`resolve-url`、`short-links` 与 `GET /sub?...` 不再接受外层 query 的状态覆写

### 0.2.1 pass 级参数约束

- 三个 pass 的 `target` 都必须传 `clash`
- `landing-discovery pass`：`url` 只传落地节点信息，传 `list=true`
- `transit-discovery pass`：`url` 只传中转节点信息，**不传** `list`
- `full-base pass`（即第 3 个 pass）：`url` 传托管 landing 短链（`stage2.snapshot` 合并后）+ 托管 transit proxies 短链（`|` 拼接），不传 `list`；两侧均不得含 `list` 或 `emoji` 查询参数；落地正文由 Pass 3 前按 snapshot 树 DFS 展开 instances 合并生成，中转侧由 Pass 2 emoji 处理后的 `proxies[]` 片段托管生成，**不得**把原始 `transitRawText` 直接塞入 `url`
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
- `config` 必须是阶段 1 快照中显式保存的远程 HTTP(S) 模板 URL；前端初始值来自部署默认模板 URL，部署默认模板 URL 必须可配置，默认值为 `https://raw.githubusercontent.com/slackworker/Aethersailor-Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini`
- `chain-subconverter` 必须先拉取 `config` 指向的模板，再把后端托管的内部模板 URL 传给 `subconverter`
- `chain-subconverter` 不得把用户提供的远程模板 URL 直接透传给 `subconverter`
- 当 `config` 等于部署默认模板 URL 时，其成功拉取结果必须先通过模板解析校验，只有校验通过的内容才允许写入默认模板缓存
- 当 `config` 等于部署默认模板 URL 且刷新失败时，若当前服务进程中存在此前校验通过的默认模板缓存，可以继续使用该缓存完成本次转换，并在支持 `messages[]` 的响应中返回 warning；若不存在可用缓存，当前请求必须在调用 `subconverter` 前失败
- `include`、`exclude` 若存在多个 Tag，后端必须基于阶段 1 快照中的数组值，按输入顺序用 `|` 拼接原始值，再整体做 URL 编码后传给 `subconverter`；例如 `["TagA", "TagB", "TagC"]` 最终形成 `include=TagA%7CTagB%7CTagC`
- `emoji` 高级选项仍属于阶段 1 快照字段，对外兼容 subconverter 参数模型；实现上由 chain 拦截并统一处理，不得向 `subconverter` 透传 `emoji` 查询参数
- 模板拉取返回非成功 HTTP 状态、请求失败或空内容时，当前请求必须在调用 `subconverter` 前失败
- 若模板中识别出的地域策略组行缺少必需字段，或其正则无法编译，当前请求必须在调用 `subconverter` 前失败
- 模板可正常拉取但未识别出任何地域策略组时，请求仍可继续；此时只是不支持基于地域策略组的自动填充
- 阶段 1 高级选项快照进入 query 构造前，先按 [03-backend-api](03-backend-api.md) 的接口接受层模型完成入站归一化；`config` 缺失、为空或不是 HTTP(S) URL 时必须阻断当前请求
- query 构造逐项保持该语义：复选框 `null` 不传、显式 `true/false` 按值传递；`config` 必须由后端模板准备流程统一处理；`include`、`exclude` 仅在非空数组时参与 query 构造，并在传给上游前按输入顺序用 `|` 拼接为单个参数
- 同一次转换管线内，三个 pass 的 `udp`、`scv`、`config`、`include`、`exclude` 都必须来自同一份阶段 1 高级选项快照；`emoji` 仅参与 chain 内部处理，不进入 pass query
- `expand=false` 与 `classic=true` 不提供前端控件，后端必须固定传递

### 0.2.3 chain 侧 emoji 统一处理

#### 设计意图

- **对外字段保持稳定**：阶段 1 快照与 `statePayload v5` 保留 `emoji` 字段名与 `true | false | null` 三态语义；前端高级选项保持“是否启用节点 emoji”。
- **对内由 chain 拦截并统一执行**：`emoji` 不再作为上游 `GET /sub` 查询参数透传，也不在模板文本中注入 `add_emoji` / `remove_old_emoji` / `emoji=` 以驱动 `subconverter` 侧 emoji pipeline。
- **拦截原因（与其他能力协同）**：
  - Stage2 支持用户显式改名；若 `subconverter` 在转换阶段再次执行 emoji 规则，会与 Stage2 展示名及最终 YAML 输出产生不可控覆写。
  - 本项目采用 snapshot-first Pipeline 与双托管 Pass 3（托管 landing + 托管 transit proxies）；节点名需在 `buildStage2Bundle` 前确定，并在后续生成/订阅读取中保持所见即所得。
  - 模板 emoji 规则仍需参与命名，但应作为 **chain 内部规则来源** 读取，而非改写模板后再交给 `subconverter` 执行，避免“模板注入 + 上游 emoji pipeline + Stage2 改名”三重叠加。
- **权威定义位置**：本节是 emoji 处理时机、规则来源与命名权威的唯一业务定义；[03-backend-api](03-backend-api.md) 只描述接口字段，[05-tech-stack](05-tech-stack.md) 只描述分层职责。

当阶段 1 高级选项 `emoji = true`（或等价启用节点 emoji）时，后端必须在 **Stage1 的 subconverter 输出之后、进入 Stage2 bundle 构建之前**，由 chain 统一执行节点 emoji 处理；模板文本本身不得被覆写注入 emoji 规则。

规则：

- `emoji = false` 或未开启时：chain 不做节点 emoji 处理
- `emoji = true` 时：chain 基于模板中已声明的 `add_emoji`、`remove_old_emoji` 与 `emoji=` 规则，结合地域策略组识别结果构建统一处理器
- 规则来源按节点名 **first-match** 分层尝试，优先级从高到低：
  1. 模板显式 `emoji=` 行（含 `emoji=!!import:snippets/emoji.txt` / `snippets/emoji.toml`；chain 将其展开为内置 `default_emoji.txt` 规则，归入本层而非默认兜底层）
  2. 地域策略组 `custom_proxy_group` 推导（组名前缀国旗 + 组内 matcher regex）
  3. 内置 `default_emoji.txt` 默认规则（仅当前两层均未命中 regex 时参与匹配）
- 模板显式 `emoji=` 规则优先于地域组推导规则；同 regex 发生冲突时保留模板显式规则，并返回 warning `TEMPLATE_EMOJI_RULE_CONFLICT`（见 [03-backend-api](03-backend-api.md)）
- `remove_old_emoji` / `add_emoji` 的处理顺序对齐 subconverter：先按 UTF-8 `0xF0 0x9F` 前缀循环剥离旧 emoji（`remove_old_emoji=true` 时），再按上述规则表匹配并前缀新 emoji（`add_emoji=true` 时）；剥离后若名为空则回退原名
- chain 处理器只改节点名称，不改模板文本；不得向模板补写 `add_emoji`、`remove_old_emoji` 或 `emoji=...`
- 写入 subconverter 托管模板副本时，必须强制 `add_emoji=false`、`remove_old_emoji=false`（可覆盖模板原值），以确保 subconverter 不再执行 emoji pipeline；`emoji=` 行保留供 chain 读取。`PreparedConversion.TemplateConfig` 仍保留用户原始模板快照
- chain 处理对象 = Pass 1 `proxies[]` + Pass 2 `proxies[]`（仅节点 `name`；不改 `proxy-groups` 结构）
- `chainTargets[].name`（`kind = proxies`）= emoji 处理后的 transit 名
- `chainTargets[].name`（`kind = proxy-groups`）= 模板识别名（已有 emoji 前缀）
- chain 处理必须满足幂等性：同一节点名重复处理结果保持一致
- Stage2 catalog 源的 `defaultProxyName` 必须来自 Pass 1 chain 处理后的名称；`sourceId` 继续保留 discovery 原始身份名
- Stage2 后续编辑仍以 instance `proxyName` 为最终权威；Pass 3 及之后禁止二次 emoji 改写，保证所见即所得

---

## 1. 转换并自动填充

### 1.1 输入

统一 Pipeline 使用以下输入：

- `stage1Input.landingRawText`
- `stage1Input.transitRawText`
- `stage1Input.advancedOptions`（含模板 URL）
- `stage1Input.forwardRelayItems[]`

补充规则：

- `config` 的业务语义固定为模板 URL；模板内容必须先由后端拉取、校验并托管，再供 `subconverter` 使用
- `forwardRelayItems = []` 表示未录入端口转发服务；不会阻断转换，但 `forwardRelays[]` 为空
- `transitRawText` 支持订阅 URL、节点 URI、`data:text/plain,<base64文本>` 三类输入；第三类按订阅 URL 语义处理
- 同一请求内，所有 pass 与后续校验都必须复用同一份归一化后的 `stage1Input`

### 1.1.1 统一转换 Pipeline（hard-break 权威口径）

一次请求必须复用同一条 Pipeline。不存在旧版分支、旁路校验或跨 pass 结果拼接。

`0.2` 只定义上游调用契约；本节只定义 Pipeline 的业务步骤、输入、输出与顺序。

| 步骤 | 输入 | 输出 | convert | generate / sub / resolve |
|------|------|------|---------|--------------------------|
| `prepareTemplate` | `stage1Input` | 托管模板 URL、`regionMatchers`、`emojiProcessor` | Y | Y |
| `pass1Discover` | `landingRawText` | `LandingDiscoveryYAML` | Y | Y |
| `pass2Discover` | `transitRawText` | `TransitDiscoveryYAML` | Y | Y |
| `applyEmoji` | Pass 1/2 `proxies[]` | 改名后 YAML 片段 | Y | Y |
| `buildStage2Bundle` | 上步 + `forwardRelays` | `stage2`（catalog + 默认 snapshot） | Y | Y（内部） |
| `mergeManagedLanding` | `stage2.snapshot` + Pass 1 | `ManagedLandingYAML` | — | Y |
| `hostManagedTransit` | Pass 2 `proxies[]` 片段 | `ManagedTransitProxiesURL` | — | Y |
| `pass3FullBase` | 两个托管 URL + 模板 | `baseCompleteConfig` | — | Y |
| `postProcess` | `baseCompleteConfig` + `stage2.snapshot` | `completeConfig` | — | Y |

统一约束：

- 所有步骤共享同一份高级选项快照与模板托管结果
- 任一必需步骤失败，当前请求整体失败；不得降级、不得复用旧结果
- Pass 1/2 发现的身份必须能在 Pass 3 产物中完成一致性校验；失败即按 pass 失败处理
- `applyEmoji` 发生在 Pass 1/2 之后、`buildStage2Bundle` 之前；Pass 3 与订阅读取不再做二次 emoji 改写
- `stage1Input.transitRawText` 仍保留在载荷中，供每次 Pass 2 discovery 重拉订阅；Pass 3 **永不**直接使用原始 transit URL

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
- 只要存在任一报错，阶段 1 视为失败，不产出 `catalog.forwardRelays[]`
- 前端可复用本节同一语法与规范化口径做录入期预校验，但不得以 UI 预校验替代后端在阶段 1 的最终裁决
- 具体失败响应语义见 [03-backend-api](03-backend-api.md)

### 1.1.3 入口子集

同一条 Pipeline 在不同入口执行的子集固定如下（步骤定义见 `1.1.1`）：

| 入口 | 执行步骤 |
|------|----------|
| `POST /api/stage1/convert` | `prepareTemplate` → `pass1Discover` → `pass2Discover` → `applyEmoji` → `buildStage2Bundle` |
| `POST /api/generate` | 完整 Pipeline 至 `postProcess` 的内部 dry-run 校验；编码 `statePayload v5`，但不返回 `completeConfig` |
| `POST /api/resolve-url` | 先解码 v5 载荷并执行与 `generate` 同口径的完整内部校验；成功后返回 `replayable` 或 `conflicted`。若载荷 `v` 非当前版本但 `stage1Input` 仍可按现行契约解析，则返回 `conflicted` 且仅还原 Stage1（Stage2 为空），不得迁移旧 Stage2 |
| `GET /sub?...` 与 `GET /sub/<id>` | 完整 Pipeline 至 `postProcess`；即时渲染 `completeConfig` |

硬约束：

- `resolve` 不得使用“仅结构校验”的降级路径
- 订阅读取不得跳过 Pass 1/2 直接复用历史中间产物
- 以上入口全部走同一条核心编排主干，差异仅在“返回什么”

### 1.2 输出

统一 Pipeline 对外与对内结果语义如下：

- `stage2`（catalog + 默认 snapshot）：`convert` 对前端暴露的初始化数据
- `baseCompleteConfig`：Pass 3 产出的内部基底配置，供后端校验与订阅渲染使用
- `completeConfig`：`GET /sub*` 返回给客户端的最终 YAML

补充规则：

- `convert` 只返回 `stage2`；不接受旧 snapshot 入参
- `generate` 只返回链接，不返回 YAML；但服务端必须在返回前完成至 `postProcess` 的内部 dry-run 校验
- `resolve` 返回恢复快照与恢复裁决，不返回 YAML
- `completeConfig` 只在订阅读取时对外返回
- **无** `POST /api/stage2/reset`；全局/局部 reset 见 [06 §9](06-stage2-model.md)

### 1.3 落地节点出组后处理

后端在 `full-base pass` 拿到可解析配置后，必须在后续首次消费 `baseCompleteConfig` 之前，语义上完成一次“落地节点出组”后处理。

实现可以采用“预先落地改写”或“按需值视图/流式替换”，但对外行为必须等价。

处理规则：

1. 确定出组目标策略组（并集，以下均以最终 YAML 的 `proxy-groups[].type` / `name` 为准）：
   - 本次有效模板中声明的地域策略组（不论其 `type`）
   - 所有 `type: url-test` 的策略组
   - 所有 `type: smart` 的策略组
2. 排除目标：`3.3.2` 自建 / 受管 server 聚合策略组（按 `2.7` 推导名识别）。即使其 `type` 为 `url-test` / `smart`，也不得从中剔除落地成员；管线顺序上出组发生在聚合组追加之前，本条同时约束任何等价实现不得事后从聚合组回剔
3. 从上述目标组（扣除排除项后）的成员列表中剔除落地身份名；剔除集合 = 当前 `landing-discovery pass` 全部 `proxy.name`（各源 `sourceId`）∪ snapshot 全部 instance `proxyName`
4. 若某名称同时出现在多个目标组中，必须在每个命中的目标组内都剔除
5. 完成剔除后的结果，才是后续校验与订阅渲染统一使用的 `baseCompleteConfig`
6. 在执行 2.3 的区域策略组成员统计前，先应用剔除语义；区域策略组成员统计只计入中转节点（非地域的 `url-test` / `smart` 出组不影响 `chainTargets[]` 收集口径）

---

## 2. 阶段 2 初始化

> **权威模型**（嵌套树、`instanceId`、顺序域、v5、merge/reset）：见 [06-stage2-model](06-stage2-model.md)。本节保留候选收集、模式决策与聚合 YAML 命名细则。

### 2.1 收集落地节点（→ catalog / 默认 snapshot）

- 必须从 `landing-discovery pass` 的结果中收集所有落地节点
- 收集口径固定为：读取 `list=true` 返回的 Clash YAML `proxies[]`，按每个 `proxy.name` 提取落地身份 → `sourceId`
- Pass 3 前按 `sourceId` 从 Pass 1 取连接参数
- `landingNodeType` 固定来源于 `proxy.type`，并允许结合附加字段做展示分类（`vless`+`reality-opts`→`Reality`；`ss`+shadow-tls→`ShadowTLS`）
- `serverKey` 来源于落地 `server`；空则 `source:{sourceId}`；必填且不能为空
- 按 discovery 顺序归入 `catalog.servers[].sources[]`；默认 snapshot 每源恰好 1 个 instance（见 [06 §4.1](06-stage2-model.md)）
- emoji 处理后的名称写入 `defaultProxyName`；`sourceId` 保持 discovery 原始名

### 2.1.1–2.1.4 身份、顺序与编码

旧平铺 `rows[]` / 双语义 `rowId` / `presentationOrder` / `Canonicalize…` **已废除**。统一见：

- 身份：`sourceId` + 前端 ordinal `instanceId=sourceId::iN`；Wire 聚合成员 `memberProxyNames[]` — [06 §5](06-stage2-model.md)
- 顺序域：嵌套数组下标 — [06 §6](06-stage2-model.md)
- v5 编码规范化 — [06 §7](06-stage2-model.md)
- 前端 merge / 全局·局部 reset — [06 §9](06-stage2-model.md)

### 2.2 判断全局可用模式与源级限制

阶段 2 第三列的候选模式分为两层：

- `catalog.availableModes`：本次阶段 2 的全局模式基线
- `sources[].restrictedModes`：某一源额外禁用的模式与原因；仅在该源存在额外限制时返回
- `sources[].modeWarnings`：某一源模式仍可选择、但需要提示“不推荐”的 warning

#### 全局规则

- `catalog.availableModes` 必须始终包含 `none`
- 当存在至少一个可选择的链式代理候选时，`catalog.availableModes` 必须包含 `chain`
- 当满足以下两个条件时，`catalog.availableModes` 必须包含 `port_forward`
  - 阶段 1 已录入至少一个合法端口转发服务
- 当某模式不满足上述全局条件时，`catalog.availableModes` 不得包含该模式
- `catalog.availableModes` 的顺序固定为 `none`、`chain`、`port_forward`；未启用的模式直接省略，不重排其余模式相对顺序

#### 源级规则

- 某源的最终可选模式 = `catalog.availableModes` 扣除当前源 `restrictedModes` 中出现的模式键
- `restrictedModes` / `modeWarnings` 为可选字段；缺失表示该源无额外限制/warning
- 模式键必须属于 `catalog.availableModes`；`reasonCode` 必填；`reasonArgs` 可选且必须是对象
- 若 `chain` 已出现在 `availableModes` 中，且某落地节点协议属于“链式代理不推荐”集合，则该源必须返回 `modeWarnings.chain`
- 若 `chain` 已出现在 `availableModes` 中，且某落地节点当前使用端口大于 `10000`，则该源必须返回 `modeWarnings.chain`
- 前端不得自行识别落地端口并补算该 warning
- 若同一源同时命中多条 `chain` warning 条件，后端必须合并为单个 `modeWarnings.chain` 项；`reasonCode` 允许为 `DISCOURAGED_BY_LANDING_PROTOCOL`、`DISCOURAGED_BY_LANDING_PORT` 或 `DISCOURAGED_BY_LANDING_PROTOCOL_AND_PORT`
- 当前链式代理不推荐集合为：`hysteria`、`hysteria2`、`tuic`、`wireguard`、`anytls`、`vless-reality`、`shadowtls`
- 上述协议在当前规格中仍允许手动选择 `chain`、允许自动填充 `chain`、允许进入生成与恢复链路；warning 仅承担前端提示语义，不改变可选性

### 2.3 收集链式候选

链式候选写入 `catalog.chainTargets[]`。在 `POST /api/stage1/convert` 路径下，候选收集只依赖 discovery 结果与模板识别结果，不依赖 Pass 3 产物。

收集范围：

- 本次有效模板识别出的地域策略组名称（`kind = proxy-groups`）
- `transit-discovery pass` 识别出的单个中转 `proxy`

处理规则：

1. 对区域策略组：按模板识别结果收集组名并写入候选，`kind = proxy-groups`
2. 对单个 `proxy` 候选：读取 Pass 2 emoji 处理后的 Clash YAML `proxies[]`，按每个 `proxy.name` 收集中转节点，`kind = proxies`
3. `kind` 仅用于前端分组展示
4. `chainTargets[]` 只返回 `name`、`kind` 与 `isEmpty`
5. `stage1/convert` 阶段允许省略 `isEmpty`（未知即留空）；`EMPTY_CHAIN_TARGET` 的最终裁决在生成/订阅校验链路完成 Pass 3 后执行
6. `chainTargets[].name` 在同一次转换内必须全局唯一；它既是阶段 2 下拉选项值，也是 instance `targetName` 的序列化值
7. `chainTargets[].name`（`kind = proxies`）固定为 Pass 2 emoji 处理后的 transit 名；`kind = proxy-groups` 固定为模板识别名（已有 emoji 前缀）
8. 若任一中转 `proxy.name` 与任一地域策略组重名，或任意两个中转 `proxy` 重名，必须以 `CHAIN_TARGET_NAME_CONFLICT` 直接阻断本次请求
9. 按 `2.7` / [06](06-stage2-model.md) 渲染出的 server 聚合组属于最终 YAML 衍生产物，不参与 `chainTargets[]` 收集

### 2.4 收集端口转发候选

- 从阶段 1 录入并校验通过的 `forwardRelayItems[]` 中收集 `forwardRelays[]`
- `forwardRelays[].name` 必须等于该服务的规范化 `server:port` 字面量
- 保留用户输入顺序
- 当端口转发功能未开启时，`forwardRelays[]` 为空

### 2.5 自动填写默认 `mode` 与 `targetName`

阶段 2 初始化时，后端必须为每个 catalog 源产出 `landingNodeType`、`serverKey`、`defaultMode` 与 `defaultTargetName`；默认 snapshot 的 instance 直接采用这些默认值。

补充规则：

- catalog 不暴露切换优化字段；开关由 snapshot `chainProxyTargetGroupSwitchOptimizationEnabled` 全局承载

#### 初始化决策顺序

1. 先按 `2.2` 确定 `catalog.availableModes`
2. 再为该源计算 `restrictedModes`
3. 再为该源计算 `modeWarnings`
4. 用 `availableModes` 扣除该源 `restrictedModes`，得到该源最终可选模式
5. 若 `chain` 在该源最终可选模式中，则优先按“当链式代理可用”规则尝试自动识别
6. 若 `chain` 不在该源最终可选模式中、但 `port_forward` 在最终可选模式中，则默认 `mode = port_forward`，并按“当 `mode = port_forward`”规则填写 `targetName`
7. 若最终可选模式只有 `none`，则默认 `mode = none`，且 `targetName = null`

#### 当链式代理可用

链式代理默认优先尝试“区域策略组自动识别”。

处理步骤：

1. 使用本次有效模板识别出的地域策略组正则，在完整 `defaultProxyName`（即 Stage2 当前展示名）上逐一匹配
2. 若唯一命中且命中的地域策略组在本次 `chainTargets[]` 中存在，且 `isEmpty` 留空，则默认 `mode = chain`，`targetName` 自动填写为对应地域策略组名称；即使同时存在 `modeWarnings.chain` 也不改变这一默认行为
3. 其他情况一律按“未唯一命中”处理：`mode = none`，`targetName = null`

#### 当 `mode = port_forward`

- 本规则同时适用于“初始化直接落到 `port_forward`”和“用户后续手动切换到 `port_forward`”
- `targetName` 保存所选 `forwardRelays[].name`
- `targetName` 仅允许由用户手动选择，系统不得自动填充；进入 `port_forward` 时默认 `targetName = null`，并保留完整 `forwardRelays[]` 供用户选择

#### 初始化决策表

| 源最终可选模式 | 链式自动识别结果 | `forwardRelays[]` 数量 | 初始化 `mode` | 初始化 `targetName` |
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

### 2.7 按 server 聚合配置（`servers[].aggregation`）

权威字段与关聚合分层见 [06 §4 / §6 / §8](06-stage2-model.md)。本节保留 YAML 命名与渲染细则。

- 聚合挂在 snapshot 的 server 节点上；`serverKey` 唯一定位
- `enabled = true` 时才参与聚合组渲染；`strategy` 仅允许 `fallback`、`url-test`、`select` 或 `load-balance`
- `memberProxyNames[]`（Wire）仅允许引用**本 server 子树**内的 `proxyName`；Client 编辑态用 `memberLocalInstanceIds[]`（值为 `sourceId::iN`）；跨 server 阻断
- `enabled = true` 时，去重后至少 2 个不同成员
- `enabled = false` 时不参与渲染/校验；请求体只含 `{ enabled: false }`
- 聚合配置只影响最终 YAML，不回写 `catalog.chainTargets`；instance `targetName` 在 `mode = chain` 下仍只允许引用 `chainTargets[].name`
- `groupName` 与任何 instance 的 `proxyName` / `sourceId` 都是不同语义

#### 聚合组 YAML 名称推导

1. 若 `groupName` 非空，则聚合组名 = 该 `groupName`
2. 否则使用默认展示名：`国旗 emoji + serverKey`（组内源名前缀国旗一致时取该 emoji；无法确定单一国旗时仅 `serverKey`）
3. 若推导名与既有 `proxy-groups` 或同批待写入聚合组重名，按 `基名 2`、`基名 3`…递增直至唯一

补充规则：

- 默认展示名的基底是 `serverKey`，不是任何成员节点名
- 用户编辑聚合组名时，只允许写入 `groupName`
- 用户编辑任一成员 `proxyName` 时，只影响该 instance 最终 YAML 节点名；**不**级联 `instanceId` / `memberLocalInstanceIds`（见 [06 §5](06-stage2-model.md)）
- 当 `groupName` 被清空后，展示与 YAML 命名都必须回退到默认展示名规则
- `groupName` 参与长链接 `statePayload v5` 与短链 `canonicalStateKey` 的确定性映射；仅修改 `groupName` 时，`longUrl` 与 `shortId` 均须变化
- 前端 Stage 2 聚合树展示的组名必须与按本节规则推导的最终 YAML 组名一致

---

## 3. 生成前校验与改写

### 3.1 阶段 2 快照语义

每个 instance `proxyName` 对应最终配置中的一个 `proxies[]` 项：

- `mode = none`：保持原样
- `mode = chain`：第四列写入 `dialer-proxy`
- `mode = port_forward`：第四列写入端口转发 `server:port`
- 路由语义、展示顺序与聚合成员顺序见 [06 §6](06-stage2-model.md) 与 `2.7`
- `servers[].aggregation` 只新增聚合策略组产物，不得覆盖任何 instance 的 `mode/targetName` 语义
- `chainProxyTargetGroupSwitchOptimizationEnabled` 是全局保存、组级生效的受管配置：开启后，所有 `mode = chain` 且目标为 `proxy-groups` 的 instance 统一应用节点切换优化（覆写 `timeout` 与 `max-failed-times`），不改变该 instance `dialer-proxy` 指向的 `targetName`

### 3.2 生成前校验

- 生成、恢复判定与订阅读取都必须先根据 `stage1Input` 重跑 `pass1Discover` + `pass2Discover` + `applyEmoji`，再按 `3.3` 双托管与 `3.5` 执行 `pass3FullBase` 与出组
- 若任一必需 pass 失败，必须直接阻断
- snapshot 须满足 [06 §4](06-stage2-model.md) 实例集规则；`proxyName` 重复为 `DUPLICATE_PROXY_NAME`
- 任一 instance 若 `mode != none` 且 `targetName` 为空，必须阻断生成
- 若 `targetName` 在对应候选列表中不存在，必须阻断生成
- 若多个 instance 同时选择同一个 `forwardRelays[].name` 作为 `port_forward` 目标，必须以 `DUPLICATE_FORWARD_RELAY_TARGET` 阻断生成
- 若某 instance 选择的 `chain` 目标在当前 `chainTargets[]` 中 `isEmpty = true`，必须以 `EMPTY_CHAIN_TARGET` 阻断生成
- 若任一 `enabled=true` 的 aggregation 违反 `2.7` / [06](06-stage2-model.md) 校验规则，必须阻断生成
- 若 `chainProxyTargetGroupSwitchOptimizationEnabled = true`，后端只对当前符合条件 instance（`mode = chain` 且 `targetName` 为 `kind = proxy-groups`）生效
- 具体失败响应语义见 [03-backend-api](03-backend-api.md)
- `POST /api/generate` 完成上述校验与链接编码，返回可消费的链接

### 3.2.1 恢复链接时的可重放性判定

本节是 `POST /api/resolve-url` 判断 `restoreStatus` 的唯一权威口径。判定目标是“恢复快照是否还能在当前环境重放”。

判定规则：

- 后端必须基于恢复出的 `stage1Input` 执行与生成阶段同口径的 Pipeline 与校验
- 若任一必需 pass 失败，`resolve-url` 返回失败响应；`restoreStatus` 只用于“解码成功且校验过程可完成”的请求
- 后端必须用恢复出的 snapshot 执行与生成阶段一致的逐 instance 校验
- 只要所有 instance 满足 [06 §4](06-stage2-model.md) 且 `mode` / `targetName` 仍可在当前候选集合中解析，则视为 `replayable`
- 任一 instance 或任一聚合出现引用失效，即判定 `restoreStatus = conflicted`，并返回结构化 `restoreConflicts[]`

补充规则：

- 上游订阅内容变化导致引用仍有效时，恢复结果保持 `replayable`
- `targetName` 引用 `proxy-groups` 候选时，只要该候选仍存在即允许重放，不因成员变化单独判冲突
- `targetName` 引用 `proxies` 候选时，该 Pass 2 emoji 处理后的 `proxy.name` 必须仍能在当前 `chainTargets[]` 中定位，否则判冲突（`reasonCode = TARGET_NOT_FOUND`）
- 上游 transit 订阅变化导致 Pass 2 emoji 后某 transit proxy 消失时，凡 `targetName` 引用该 `kind = proxies` 候选的 instance 均判 `conflicted`
- `targetName` 引用端口转发服务时，该规范化 `server:port` 必须仍存在于 `forwardRelays[]`，否则判冲突
- 若某 instance 的 `sourceId` 缺失、`proxyName` 冲突或 `targetName` 引用失效，则判冲突
- 若启用聚合违反 `2.7`（未知成员、跨 server、成员数不足 2 等），则判冲突
- `restoreStatus = conflicted` 时仍返回恢复出的 `stage1Input` 与 `stage2`；前端必须进入只读冲突态，不得继续生成
- **旧版载荷（`v` ≠ 当前）**：不得走完整 Stage2 兼容迁移。若 `stage1Input` 满足现行契约与输入上限，则 `restoreStatus = conflicted`，`restoreConflicts[].reasonCode = LEGACY_PAYLOAD_VERSION`（`reasonArgs` 含 `payloadVersion` / `currentVersion`），返回原始 `stage1Input`，`stage2.snapshot` 为空树，且**不**执行 Pipeline dry-run；若 `stage1Input` 亦无法按现行契约解析，则按失败响应返回（无 `restoreStatus`）。`GET /sub` 与短链创建仍整包拒绝非当前版本

### 3.3 快照应用（Pass 3 前）

订阅渲染主路径在 `pass3FullBase` 之前完成 snapshot 语义：

#### 托管 landing（`mergeManagedLanding`）

- 按树 DFS 展开全部 instances（见 [06 §6](06-stage2-model.md)）
- 按 `sourceId` 从 Pass 1 取连接参数，按 `proxyName` 展开托管 landing 的 `proxies[]`
- `mode = chain`：写入 `dialer-proxy: <targetName>`
- `mode = port_forward`：将 `targetName` 解析为 `server` 与 `port` 并替换

#### 托管 transit proxies（`hostManagedTransit`）

- 从 Pass 2 emoji 处理后的 YAML 提取 `proxies[]` 片段；仅托管 `proxies:` 段，**不含** `proxy-groups`
- 地域 `proxy-groups` 由托管模板 config 提供，不写入托管 transit
- 每次 render 均：Pass 2 → `applyEmoji` → 托管 proxies → Pass 3；不得复用历史 transit 中间产物或直接向 Pass 3 透传原始 `transitRawText`

Pass 3 后不再对 landing `proxies[]` 做上述 YAML 补丁；landing instance 语义只通过 Pass 3 前的托管 landing 输入生效

### 3.3.1 既有地域策略组覆写（Pass 3 后）

若 `chainProxyTargetGroupSwitchOptimizationEnabled = true` 且某些 instance 为 `mode = chain` 且目标为 `proxy-groups`，后端在 `full-base pass` 完成且执行 `1.3` 出组后，必须继续对最终 YAML 中的同名既有地域策略组做受管覆写。

覆写规则：

- 覆写优先于模板原组中与快速判错相关的健康检查参数
- 只允许覆写当前快照引用到的既有 `proxy-groups`；不得为该能力新增新的策略组名
- 覆写对象按 `targetName` 定位；最终该 instance 的 `dialer-proxy` 仍保持 `dialer-proxy: <targetName>`
- 组成员列表沿用 `full-base pass` 与 `1.3` 出组后的结果，不因切换优化开关而重新展开成员
- 切换优化仅统一写入 `timeout = 500` 与 `max-failed-times = 1`；其余健康检查参数（含 `type`、`url`、`interval`、`lazy`、`tolerance` 等）保持模板 / full-base 原值

### 3.3.2 server 聚合组追加（Pass 3 后）

`servers[].aggregation.enabled = true` 的节点，在 `full-base pass` 完成且执行 `1.3` 出组后，向最终 YAML 的 `proxy-groups` 追加新策略组（不修改既有 `proxies[]` 与 instance 级 `dialer-proxy` 语义）。

每条追加组固定写入以下受管快速判错参数：

- `timeout = 500`
- `max-failed-times = 1`

当 `strategy` 为 `fallback`、`url-test` 或 `load-balance` 时，还需写入与模板一致的基线健康检查字段：`url = https://cp.cloudflare.com/generate_204`、`interval = 300`；不写入 `lazy`、`tolerance` 等额外字段。`strategy = select` 时仅写入 `name`、`type` 与 `proxies`。

组 `type` 取快照中的 `strategy`（`fallback`、`url-test`、`select` 或 `load-balance`）。

组 `proxies` 成员列表按 [06 §6](06-stage2-model.md) 的编码/写出顺序，引用各 instance 的 `proxyName`；成员 proxy 必须已存在于最终 `proxies[]`。

组名按 `2.7` 聚合组 YAML 名称推导规则生成。

### 3.3.3 server 聚合组注入 select 策略组（Pass 3 后）

在 `3.3.2` 向 `proxy-groups` 末尾追加聚合策略组之后，必须将所有已成功渲染的聚合组名（与 `3.3.2` 使用同一套 `enabled = true` 推导名）按 snapshot `servers[]` 迭代顺序 prepend 到最终 YAML 中既有 `type: select` 策略组的 `proxies` 列表首位。

注入规则：

- 目标组：最终 YAML 中 `type: select` 的既有策略组（以 YAML `type` 为准）
- 排除目标：组名含「直连」（字面）或 `direct`（大小写不敏感）；以及 `3.3.2` 新生成的全部聚合策略组（不向聚合组自身注入）
- 成员去重：若聚合组名已存在于目标组 `proxies`，先从原位置移除再 prepend，保证位于默认选择位（首位）
- 多聚合组时按 snapshot server 顺序置于最前：`[Agg1, Agg2, …, 原成员…]`
- 无 `enabled` 聚合组时跳过，不改 YAML

本步不修改聚合组自身的 `proxies`、不修改 `proxies[]` 节点定义、不回写 `chainTargets[]`；不修改 `type` 为 `select` 以外的策略组。

### 3.4 协议与端口限制

- `modeWarnings.chain` 的规则见 `2.2`；端口转发仍只改 `server` 与 `port`

### 3.5 最终配置交付时机

- 订阅打开/下载时即时生成 `completeConfig`
- 流程：重跑 `pass1Discover` + `pass2Discover` → `applyEmoji` → `mergeManagedLanding` + `hostManagedTransit` → `pass3FullBase` → `1.3` 出组 → `3.3.1` 既有地域策略组覆写 → `3.3.2` server 聚合组追加 → `3.3.3` 聚合组注入 select 策略组 → 返回
- 任一必需步骤失败则订阅渲染失败

## 4. 共享通知生命周期

- 本章只定义共享层通知语义的创建、压制、降级与清除规则；具体承载类型与展示边界以 [02-frontend-spec](02-frontend-spec.md) 为准
- `blockingErrors[]`、后端 `messages[]`、`stage2Stale`、`restoreStatus = conflicted` 与各类 `scope` 的基础语义沿用 `02` 与 `03`；本节只补充它们在共享工作流中的生命周期规则
- `blockingErrors[]` 的清除、压制、降级规则只约束通知语义，不约束方案层把唯一主阻断反馈承载位放在阶段操作区还是单一全局位置
- workflow log 以当前页面会话为范围维护追加历史；允许追加本地用户可读事件与后端 `messages[]`，但不得因发起新请求、输入变化或切换阶段而自动清空既有历史
- workflow log 可设置有限保留条数，但必须保持顺序并允许查看最近保留历史
- 修改阶段 1 任一输入后，若阶段 2 当前已有 snapshot，则阶段 2 必须标记为 `stale`；该状态直接驱动“生成链接”禁用，不依赖某条正文提示是否正在显示
- 用户点击“转换并自动填充”后，`stage2Stale` 的正文提示应立即隐藏；若转换成功，`stage2Stale` 清除；若转换失败，`stage2Stale` 作为数据状态保留，但不要求继续以主提示与本次失败反馈并列显示
- `stage1_field` 错误在对应字段值发生变化时必须清除；若某字段因交互联动被隐藏并清空，其历史 `stage1_field` 错误也必须同步清除
- `stage2_instance` 错误在对应 instance 的 `mode` 或 `targetName` 变化时必须清除；`stage2_server` 错误在对应 server 聚合配置变化时必须清除
- `stage3_field` 错误在对应字段值发生变化时必须清除；当前默认对应 Stage 3 的 `currentLinkInput`
- `stage3_action` 错误在同一动作被重新触发，或其依赖的 Stage 3 当前链接来源发生变化时必须清除
- 当阶段 2 进入 `stale` 或 `conflicted` 时，已有 `stage2_instance` / `stage2_server` 错误必须隐藏或降级，不再作为当前主提示与工作流状态提示竞争
- 字段/行级局部定位提示继续作为修复引导保留；它们不得升级为与主阻断反馈承载位同权重的第二主反馈堆栈
- 进入 workflow log 的后端 `messages[]` 与本地事件都不参与阻断优先级竞争；当前存在阻断反馈时，日志仍可保留，但不得取代阻断反馈的主提示地位

