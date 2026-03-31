# 03 - 后端 API 契约

> 本章只定义接口字段与响应结构。`subconverter` 集成口径、转换管线、阶段 2 初始化、生成前校验与订阅渲染语义统一见 [04-business-rules](04-business-rules.md)。

---

## 通用访问约束

- 当前 spec 定义的所有对外 HTTP 端点都不需要鉴权
- 服务端不得要求登录态、`Authorization` 头、API Key、签名或其他认证凭据作为调用前提
- `POST /api/*`、`GET /subscription/<id>.yaml` 与 `GET /subscription?data=...` 都按匿名请求处理

## 通用数据模型

### 1. 阶段 1 输入快照

```json
{
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayRawText": "...",
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": false,
      "config": "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
      "include": "",
      "exclude": "",
      "enablePortForward": false
    }
  }
}
```

约束：

- `forwardRelayRawText` 在未开启端口转发时可为空字符串
- `advancedOptions` 只保留前端可配置且会影响转换和生成结果的字段；固定隐藏 `subconverter` 参数不进入接口快照
- `config`、`include`、`exclude` 都是字符串；可为空字符串
- `emoji`、`udp`、`skipCertVerify` 记录的是前端勾选状态；实际 `GET /sub` 传参规则见 [04-business-rules](04-business-rules.md)
- 参与转换的 `landingRawText` 与 `transitRawText` 规范化后总大小必须受限；该上限必须可配置，默认 `2 MiB`
- 若任一字段支持多 URL 输入，则该字段承载的 URL 数量必须受限；该上限必须可配置，默认每个字段最多 `20` 条

### 2. 阶段 2 配置快照

```json
{
  "stage2Snapshot": {
    "rows": [
      {
        "rowId": "row-1",
        "landingNodeName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ]
  }
}
```

约束：

- `landingNodeName` 在同一份快照中必须唯一
- `mode` 只能是 `none`、`chain`、`port_forward`
- `mode = none` 时，`targetName` 必须为空或 `null`

### 3. 阶段 2 初始化数据

```json
{
  "stage2Init": {
    "landingNodes": [
      { "name": "HK 01", "type": "ss" }
    ],
    "chainTargets": [
      { "name": "🇭🇰 香港节点", "kind": "region_group", "regionId": "HK" },
      { "name": "Transit A", "kind": "proxy" }
    ],
    "forwardRelays": [
      { "name": "relay-1", "server": "relay.example.com", "port": 1080 }
    ],
    "rows": [
      {
        "rowId": "row-1",
        "landingNodeName": "HK 01",
        "allowedModes": ["none", "chain", "port_forward"],
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ]
  }
}
```

字段说明：

- `landingNodes[]`：阶段 2 第一列的原始来源
- `chainTargets[]`：阶段 2 第三列在 `mode = chain` 时的候选列表
- `forwardRelays[]`：阶段 2 第三列在 `mode = port_forward` 时的候选列表
- `rows[]`：阶段 2 默认行模型，前端直接渲染

### 4. 消息与错误模型

`messages[]`：

```json
[
  {
    "level": "info",
    "code": "AUTO_CHAIN_TARGET_SELECTED",
    "message": "已自动填入香港区域策略组",
    "context": { "landingNodeName": "HK 01" }
  },
  {
    "level": "warning",
    "code": "AUTO_CHAIN_TARGET_NOT_UNIQUE",
    "message": "未能唯一识别链式前置节点，请手动选择",
    "context": { "landingNodeName": "HK 02" }
  }
]
```

`blockingErrors[]`：

```json
[
  {
    "code": "MISSING_TARGET",
    "message": "存在未完成配置的行",
    "scope": "stage2_row",
    "context": { "rowId": "row-2", "field": "targetName" }
  }
]
```

约束：

- `messages[]` 只承载 `info` 与 `warning`
- `blockingErrors[]` 只承载阻断当前请求的错误
- `blockingErrors[]` 的每个元素都必须包含 `code`、`message` 与 `scope`
- `retryable` 为可选字段；仅在后端需要显式表达“当前错误可直接重试”时返回
- `scope` 只能是 `global`、`stage1_field` 或 `stage2_row`
- `scope = stage1_field` 时，`context.field` 必填
- `scope = stage2_row` 时，`context.rowId` 必填；若错误落在具体列上，`context.field` 必填
- `blockingErrors[]` 非空时，本次请求视为失败；失败响应不得返回对应成功载荷字段
- `STAGE1_INPUT_TOO_LARGE` 与 `TOO_MANY_UPSTREAM_URLS` 用于阶段 1 输入边界校验；具体边界见 [04-business-rules](04-business-rules.md)
- `SUBCONVERTER_UNAVAILABLE` 用于必需转换 pass 失败；具体触发条件见 [04-business-rules](04-business-rules.md)

### 5. HTTP 状态码

- `200`：请求成功；`blockingErrors[]` 必须为空
- `400`：请求体结构、字段类型或 URL 形态不符合接口契约；`blockingErrors[]` 必须包含 `INVALID_REQUEST` 或 `INVALID_URL`
- `422`：请求体结构合法，但业务校验未通过；`blockingErrors[]` 必须非空
- `503`：依赖暂时不可用；`blockingErrors[]` 必须非空；若返回 `retryable`，其值必须为 `true`
- `500`：未知内部错误；`blockingErrors[]` 必须非空
- `POST /api/resolve-url` 返回 `restoreStatus = conflicted` 时仍是 `200`，不视为接口失败

---

## API 端点

### 1. `POST /api/stage1/convert`

用途：接收阶段 1 输入，并返回本次转换得到的 `stage2Init`。

请求：

```json
{
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayRawText": "...",
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": false,
      "config": "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
      "include": "",
      "exclude": "",
      "enablePortForward": true
    }
  }
}
```

成功响应：

```json
{
  "stage2Init": {
    "landingNodes": [
      { "name": "HK 01", "type": "ss" }
    ],
    "chainTargets": [
      { "name": "🇭🇰 香港节点", "kind": "region_group", "regionId": "HK" },
      { "name": "Transit A", "kind": "proxy" }
    ],
    "forwardRelays": [
      { "name": "relay-1", "server": "relay.example.com", "port": 1080 }
    ],
    "rows": [
      {
        "rowId": "row-1",
        "landingNodeName": "HK 01",
        "allowedModes": ["none", "chain", "port_forward"],
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ]
  },
  "messages": [],
  "blockingErrors": []
}
```

失败响应：

```json
{
  "messages": [],
  "blockingErrors": [
    {
      "code": "SUBCONVERTER_UNAVAILABLE",
      "message": "subconverter 暂时不可用",
      "retryable": true,
      "scope": "global"
    }
  ]
}
```

补充规则：

- 本接口不返回 `completeConfig` 或 `baseCompleteConfig`
- `stage2Init` 的来源、候选收集与默认填充规则统一见 [04-business-rules](04-business-rules.md)
- 多条完全一致的落地 URI 不得被静默去重
- `landingNodeName` 的具体命名与重名处理由转换服务负责；前端只消费接口返回结果，不得自行猜测

最小失败语义：

- `400`：`INVALID_REQUEST`，`scope = global`
- `422`：`INVALID_FORWARD_RELAY_LINE`、`DUPLICATE_FORWARD_RELAY`、`STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`
- `INVALID_FORWARD_RELAY_LINE`、`DUPLICATE_FORWARD_RELAY`：都必须返回 `scope = stage1_field` 与 `context.field = forwardRelayRawText`
- `STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`：都必须返回 `scope = stage1_field`，且 `context.field` 必须指向 `landingRawText` 或 `transitRawText`
- `503`：`SUBCONVERTER_UNAVAILABLE`；必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 2. `POST /api/generate`

用途：接收阶段 1 快照与阶段 2 快照，完成最终校验并返回可消费的长链接。

请求：

```json
{
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayRawText": "...",
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": false,
      "config": "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
      "include": "",
      "exclude": "",
      "enablePortForward": true
    }
  },
  "stage2Snapshot": {
    "rows": [
      {
        "rowId": "row-1",
        "landingNodeName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ]
  }
}
```

接口约束：

- 请求体不包含 `completeConfig`
- 本接口返回规范化长链接；生成前校验规则见 [04-business-rules](04-business-rules.md)
- 本接口不返回 YAML 文本

成功响应：

```json
{
  "longUrl": "https://example.com/subscription?data=...",
  "messages": [],
  "blockingErrors": []
}
```

失败响应：

```json
{
  "messages": [],
  "blockingErrors": [
    {
      "code": "MISSING_TARGET",
      "message": "存在未完成配置的行",
      "scope": "stage2_row",
      "context": { "rowId": "row-2", "field": "targetName" }
    }
  ]
}
```

补充规则：

- `longUrl` 是本系统唯一的规范化状态链接
- 本接口不负责创建短链接；短链接创建由单独接口处理
- 本接口成功表示当前快照已通过校验，并已得到可消费的长链接
- `longUrl` 的编码必须可逆、URL-safe 且具确定性；同一份 `stage1Input` 与 `stage2Snapshot` 必须生成相同的 `longUrl`

最小失败语义：

- `400`：`INVALID_REQUEST`，`scope = global`
- `422`：`STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`、`LANDING_NODE_NOT_FOUND`、`MISSING_TARGET`、`CHAIN_MODE_NOT_ALLOWED`、`TARGET_NOT_FOUND`、`LONG_URL_TOO_LONG`
- `STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`：都必须返回 `scope = stage1_field`，且 `context.field` 必须指向 `landingRawText` 或 `transitRawText`
- `LANDING_NODE_NOT_FOUND`：必须返回 `scope = stage2_row` 与 `context.rowId`
- `MISSING_TARGET`：必须返回 `scope = stage2_row`、`context.rowId` 与 `context.field = targetName`
- `CHAIN_MODE_NOT_ALLOWED`：必须返回 `scope = stage2_row`、`context.rowId` 与 `context.field = mode`
- `TARGET_NOT_FOUND`：必须返回 `scope = stage2_row`、`context.rowId` 与 `context.field = targetName`
- `LONG_URL_TOO_LONG`：必须返回 `scope = global`
- `503`：`SUBCONVERTER_UNAVAILABLE`；必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 3. `POST /api/short-links`

用途：为既有 `longUrl` 创建或获取其确定性短链接。

请求：

```json
{
  "longUrl": "https://example.com/subscription?data=..."
}
```

成功响应：

```json
{
  "longUrl": "https://example.com/subscription?data=...",
  "shortUrl": "https://example.com/subscription/abc123.yaml",
  "messages": [],
  "blockingErrors": []
}
```

失败响应：

```json
{
  "messages": [],
  "blockingErrors": [
    {
      "code": "INVALID_LONG_URL",
      "message": "longUrl 不是可识别的规范长链接",
      "scope": "global"
    }
  ]
}
```

规则：

- 请求体只接受 `longUrl`，不重复接收 `stage1Input` 与 `stage2Snapshot`
- 后端必须先校验 `longUrl` 是否为本系统可识别、可解析的规范长链接
- 对同一 `longUrl` 的多次成功调用须**幂等**；映射未淘汰且存储可用时，成功响应中的 `shortUrl` 须一致；并发下不得出现同一 `longUrl` 对应多条可解析的不同短链（「一长多短」）。存储层如何保证见下文「长短链接语义」中短链接索引相关条目
- 成功响应的 `messages[]` 可包含短链接存储淘汰相关 warning

最小失败语义：

- `400`：`INVALID_REQUEST`，`scope = global`
- `422`：`INVALID_LONG_URL`；必须返回 `scope = global`
- `503`：`SHORT_LINK_STORE_UNAVAILABLE`；必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 4. `POST /api/resolve-url`

用途：输入长链接或短链接，返回规范化长链接、页面恢复所需快照，以及该快照当前是否允许继续编辑和继续生成。

请求：

```json
{
  "url": "https://example.com/subscription/abc123.yaml"
}
```

成功响应：

```json
{
  "longUrl": "https://example.com/subscription?data=...",
  "restoreStatus": "replayable",
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayRawText": "...",
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": false,
      "config": "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
      "include": "",
      "exclude": "",
      "enablePortForward": true
    }
  },
  "stage2Snapshot": {
    "rows": [
      {
        "rowId": "row-1",
        "landingNodeName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ]
  },
  "messages": [],
  "blockingErrors": []
}
```

规则：

- `restoreStatus` 只能是 `replayable` 或 `conflicted`
- 传入长链接时，先解码 `stage1Input` 与 `stage2Snapshot`
- 传入短链接时，先解析为长链接，再解码同一份快照
- 若解码出的 `stage1Input` 不满足当前接口契约或输入上限，必须直接返回失败响应，不得返回 `restoreStatus`
- `restoreStatus` 的判定规则见 [04-business-rules](04-business-rules.md)
- `restoreStatus = replayable` 表示该恢复快照可直接继续编辑和继续生成
- `restoreStatus = conflicted` 表示该恢复快照只能用于页面展示恢复，不能直接继续编辑和继续生成
- `restoreStatus = conflicted` 时，仍必须返回原始 `stage1Input` 与 `stage2Snapshot`
- `restoreStatus = conflicted` 时，`messages[]` 必须包含 `RESTORE_CONFLICT`，供前端进入只读冲突态

最小失败语义：

- `400`：`INVALID_REQUEST`、`INVALID_URL`；两者都必须返回 `scope = global`
- `422`：`INVALID_LONG_URL`、`SHORT_URL_NOT_FOUND`；两者都必须返回 `scope = global`
- `503`：`SUBCONVERTER_UNAVAILABLE`、`SHORT_LINK_STORE_UNAVAILABLE`；两者都必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 5. `GET /subscription/<id>.yaml`

用途：供 Mihomo 客户端拉取 YAML。

规则：

- YAML 渲染规则见 [04-business-rules](04-business-rules.md)
- 仅即时生成 YAML，暂不提供 YAML 缓存
- 外部契约始终等价于“短链接是长链接的别名”
- 成功 `200`：正文为 UTF-8 YAML；`Content-Type: text/yaml; charset=utf-8`；`Cache-Control: private, no-store`（或 `no-cache, no-store, must-revalidate`）；`Content-Disposition` 默认 `inline; filename="<id>.yaml"`；存在查询参数 `download=1` 时改为 `attachment`（文件名规则不变）
- 失败：正文为 JSON，`Content-Type: application/json; charset=utf-8`，结构同本文「消息与错误模型」，不得返回 YAML；`400` `INVALID_REQUEST`；`422` `SHORT_URL_NOT_FOUND`；`503` `SUBCONVERTER_UNAVAILABLE` 或 `SHORT_LINK_STORE_UNAVAILABLE`；`500` `INTERNAL_ERROR`；均为 `scope = global`；`503` 可返回 `retryable = true`

### 6. `GET /subscription?data=...`

用途：长链接对应的订阅资源地址；访问时返回 YAML。

规则：

- `data` 必须可逆编码 `stage1Input` 与 `stage2Snapshot`
- `data` 编码必须 URL-safe 且具确定性；编码规范见下文“长链接编码规范”
- YAML 渲染规则见 [04-business-rules](04-business-rules.md)
- 服务端仅即时生成 YAML，暂不提供 YAML 缓存
- 其外部契约与短链接一致，差别仅在于长链接直接携带完整快照
- HTTP 成功与失败协定同上一节；成功时默认 `Content-Disposition` 的 `filename` 为 `subscription.yaml`。增量失败：`400` `INVALID_REQUEST`（例如缺少 `data`）；`422` `INVALID_LONG_URL`（与「长链接编码规范」及 `POST /api/resolve-url` 对齐）

---

## 长链接编码规范

### 1. 权威边界

- 规范长链接只能由后端生成；前端不得自行构造、重写或“规范化” `longUrl`
- 前端只提交 `stage1Input` 与 `stage2Snapshot`，并消费后端返回的 `longUrl`
- 后端是唯一权威编码器，也是 `resolve-url` 与 `GET /subscription?data=...` 的唯一权威解码器

### 2. 规范载荷

`data` 解码后的逻辑载荷必须是如下结构：

```json
{
  "v": 1,
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayRawText": "...",
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": false,
      "config": "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
      "include": "",
      "exclude": "",
      "enablePortForward": true
    }
  },
  "stage2Snapshot": {
    "rows": [
      {
        "rowId": "row-1",
        "landingNodeName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ]
  }
}
```

规则：

- `v` 是长链接编码版本字段，当前固定为 `1`
- 当前版本的规范长链接必须完整编码 `stage1Input` 与 `stage2Snapshot`，不得额外编码其他业务字段
- 解码时若 `v` 缺失、不是整数、或不是受支持版本，必须视为无效长链接

### 3. 规范编码算法

编码步骤固定为：

1. 将逻辑载荷按当前版本结构组装为 JSON 对象
2. 将该对象序列化为 UTF-8 的规范化 JSON
3. 将规范化 JSON 字节做 gzip 压缩
4. 将压缩结果做 base64url 编码，且不带 `=` padding
5. 作为 `data` 查询参数拼接到 `GET /subscription?data=...`

规范化 JSON 规则：

- 对象键必须按字典序递归排序
- 数组顺序必须保持原语义顺序，不得重排
- JSON 文本不得包含额外空白
- 布尔值、`null`、数字与字符串必须使用标准 JSON 表示
- 当前版本的规范编码输出中，不得包含 schema 未定义字段

gzip 规则：

- 必须使用 gzip 格式
- 为保证同一份快照得到完全相同的 `longUrl`，gzip header 中会影响字节稳定性的时间戳字段必须固定为 `0`

### 4. 解码与错误处理

- 后端解码长链接时，必须执行 `base64url -> gunzip -> JSON parse -> version check`
- 任一步骤失败，或解码后的载荷不满足当前版本接口契约与输入上限时，都必须返回 `INVALID_LONG_URL`
- `POST /api/resolve-url` 与 `POST /api/short-links` 对无效长链接的错误语义必须保持一致

### 5. 长度约束

- 单条规范化 `longUrl` 的总长度必须受限
- 早期原型默认上限为 `2048` bytes
- `POST /api/generate` 若生成结果超过上限，必须返回阻断错误，不得静默截断、不得自动改为短链接
- 超限时错误码必须为 `LONG_URL_TOO_LONG`

---

## 长短链接语义

- 长链接必须编码 `stage1Input` 和 `stage2Snapshot`
- 长链接必须可逆，能恢复页面状态
- 长链接编码必须 URL-safe 且具确定性；同一份快照必须生成相同的长链接
- 长链接编码版本必须显式包含在载荷中；当前版本固定为 `v = 1`
- 长链接恢复页面状态后的后续操作权限，必须以后端 `resolve-url` 返回的 `restoreStatus` 为准
- 长链接本身也是订阅资源地址
- 长链接是唯一规范化状态源
- 短链接只是不透明别名，不是另一套状态源
- 短链接 ID 必须由规范化 `longUrl` 通过确定性算法生成；同一个 `longUrl` 必须得到同一个 `shortUrl`
- 短链接索引在逻辑上是 `longUrl ↔ shortId` 的双射子集：除淘汰导致的失效外，同一 `longUrl` 不得对应多个并存的可解析 `shortId`。并发创建路径上须以 **`longUrl`（或与其一一对应的规范化键）唯一约束**，或等价的事务/锁与冲突处理（例如唯一冲突后回读已有行并返回）保证；仅依赖非原子「先查后写」而未处理冲突的实现不符合本契约；不能仅凭确定性 ID 算法而假定该性质成立
- 后端必须持久化维护有限容量的 `shortId -> longUrl` 反查索引，用于将短链接还原为对应 `longUrl`
- 短链接索引的默认持久化实现使用本地 SQLite 文件
- 短链接索引记录至少包含 `shortId`、`longUrl` 与 `lastAccessedAt`
- 短链接索引容量必须可配置；早期原型默认上限为 `1000` 条记录
- 单条 `longUrl` 存储长度必须可配置；早期原型默认上限为 `2048` bytes
- 设计目标支持约 `100` 到 `100000` 条记录、约 `100KB` 到 `100MB` 存储规模
- `POST /api/short-links` 命中既有 `longUrl` 时，必须返回既有 `shortUrl`，并刷新其 `lastAccessedAt`
- 短链接被后端成功解析时，必须刷新其 `lastAccessedAt`
- 短链接索引存在容量上限；达到上限后创建新的不同 `longUrl` 映射时，必须淘汰 `lastAccessedAt` 最早的一条记录，再写入新记录
- 因淘汰而失去索引记录的短链接不再保证可解析
- 短链接与长链接在外部契约上都表现为“可直接消费的订阅链接”
