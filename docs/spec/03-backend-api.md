# 03 - 后端 API 契约

> 本章只定义 HTTP 契约。业务规则与转换语义见 [04-business-rules](04-business-rules.md)。

---

## 通用访问约束

- 当前 spec 定义的所有对外 HTTP 端点都不需要鉴权
- 服务端按匿名请求处理，不校验登录态、`Authorization` 头、API Key、签名或其他认证凭据
- `POST /api/*`、`GET /subscription/<id>.yaml` 与 `GET /subscription?data=...` 都按匿名请求处理
- 可额外暴露 `GET /healthz` 作为部署侧健康检查端点；该端点只用于存活/就绪探测，不承载业务契约，也不改变本文对 `/api/*` 与 `/subscription*` 的定义范围

## 通用数据模型

### 1. 阶段 1 输入快照

```json
{
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayItems": [],
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": null,
      "config": null,
      "include": ["TagA", "TagB"],
      "exclude": null,
      "enablePortForward": false
    }
  }
}
```

约束：

- `forwardRelayItems` 始终是字符串数组；`advancedOptions.enablePortForward = false` 时必须为 `[]`，非空视为无效请求
- `forwardRelayItems[]` 的每个元素对应一个独立端口转发输入项；数组顺序保留用户输入顺序，不使用连续文本序列化
- `advancedOptions` 只保留前端可配置且会影响转换和生成结果的字段；固定隐藏 `subconverter` 参数不进入接口快照
- 接口接受层中，`advancedOptions` 采用显式三态快照模型：`emoji`、`udp`、`skipCertVerify` 使用 `true | false | null`；`config` 使用 `非空字符串 | null`；`include`、`exclude` 使用 `非空字符串数组 | null`
- `advancedOptions.config` 的字段名保留 `config`，用于兼容 `subconverter` 的既有 `config` 查询参数；其业务语义固定为“模板 URL”或“外部配置（模板）URL”，不得理解为最终 Mihomo YAML
- 三态语义为：复选框 `true` 表示显式传 `true`、`false` 表示显式传 `false`、`null` 表示不向上游传该参数；`config = null` 表示该字段留空；`include = null`、`exclude = null` 表示对应 Tag 列表留空。当前 Web 前端产出层 checkbox 只会产出 `true` 或 `null`，但服务端仍必须正确处理显式传入的 `false`
- `config` 表示用户填写的模板 URL；`include` 与 `exclude` 为透传 Tag 列表。为兼容空输入，服务端可接受 `config = ""`、`include = []`、`exclude = []`，但必须在入站归一化为 `null`
- 当前 Web 前端若以 TagInput 承载 `include`、`exclude`，接口接受层收到的必须是按输入顺序排列的字符串数组，不使用连续文本序列化
- `emoji`、`udp`、`skipCertVerify` 与上游 `GET /sub` 的查询参数一一对应；其中 `skipCertVerify` 对应查询参数 `scv`；参数默认值与具体传递规则以 [04-business-rules](04-business-rules.md) `0.2.2 subconverter 参数表` 为准
- 参与转换的 `landingRawText` 与 `transitRawText` 规范化后总大小必须受限；该上限必须可配置，默认 `2048` bytes
- 若任一字段支持多 URL 输入，则该字段承载的 URL 数量必须受限；该上限必须可配置，默认每个字段最多 `20` 条

### 2. 阶段 2 配置快照

```json
{
  "stage2Snapshot": {
    "rows": [
      {
        "landingNodeName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ]
  }
}
```

约束：

- `rows` 表示阶段 2 的完整固定行模型，不是增量补丁
- `rows` 以 `landingNodeName` 作为唯一定位键；数组顺序不承载语义
- `rows` 在通过后端业务校验时，必须与当前转换得到的落地节点集合一一对应：每个落地节点恰好出现一次，不允许缺行、重复行或额外行
- `landingNodeName` 在同一份快照中必须唯一
- `mode` 只能是 `none`、`chain`、`port_forward`
- `mode = none` 时，`targetName` 必须为空或 `null`
- `mode = chain` 时，`targetName` 必须等于某个 `chainTargets[].name`
- `mode = port_forward` 时，`targetName` 必须等于某个 `forwardRelays[].name`，且同一份 `stage2Snapshot` 中不可被多个 `rows[]` 重复使用

### 3. 阶段 2 初始化数据

```json
{
  "stage2Init": {
    "availableModes": ["none", "chain", "port_forward"],
    "chainTargets": [
      { "name": "🇭🇰 香港节点", "kind": "proxy-groups", "isEmpty": true },
      { "name": "Transit A", "kind": "proxies" }
    ],
    "forwardRelays": [
      { "name": "relay.example.com:1080" }
    ],
    "rows": [
      {
        "landingNodeName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      },
      {
        "landingNodeName": "Reality 01",
        "restrictedModes": {
          "chain": {
            "reasonCode": "UNSUPPORTED_BY_LANDING_PROTOCOL",
            "reasonText": "该落地节点当前不支持链式代理"
          }
        },
        "mode": "port_forward",
        "targetName": "relay.example.com:1080"
      }
    ]
  }
}
```

字段说明：

- `availableModes[]`：阶段 2 第二列的模式列表；出现条件与顺序见 [04-business-rules](04-business-rules.md)
- `chainTargets[]`：阶段 2 第三列在 `mode = chain` 时的候选列表
- `chainTargets[].name`：链式候选名称；同时作为 `stage2Snapshot.rows[].targetName` 的可选值
- `chainTargets[].kind`：链式候选类别；当前只允许 `proxy-groups` 或 `proxies`
- `chainTargets[].isEmpty`：可选布尔值；仅 `kind = proxy-groups` 时有语义。空策略组写 `true`；非空策略组留空
- `forwardRelays[]`：阶段 2 第三列在 `mode = port_forward` 时的候选列表
- `forwardRelays[].name`：规范化后的 `server:port` 字面量，同时作为稳定标识与展示值
- `rows[]`：阶段 2 默认行模型，前端直接渲染
- `rows[].restrictedModes`：当前行的模式限制映射；出现条件见 [04-business-rules](04-business-rules.md)
- `rows[].restrictedModes.<mode>.reasonCode`：禁用原因码
- `rows[].restrictedModes.<mode>.reasonText`：禁用原因文案

### 4. 消息与错误模型

`messages[]`：

```json
[
  {
    "level": "info",
    "code": "AUTO_CHAIN_TARGET_SELECTED",
    "message": "已自动填入香港区域策略组"
  },
  {
    "level": "warning",
    "code": "AUTO_CHAIN_TARGET_NOT_UNIQUE",
    "message": "未能唯一识别链式前置节点，请手动选择"
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
    "context": { "landingNodeName": "HK 02", "field": "targetName" }
  }
]
```

约束：

- `messages[]` 只承载 `info` 与 `warning`
- `messages[]` 只用于非阻断的全局普通提示，不承诺字段级或行级定位语义
- `messages[]` 不定义 `scope`；若返回 `context`，仅作为辅助元数据，前端与测试不得依赖其决定展示位置
- `blockingErrors[]` 只承载阻断当前请求的错误
- `blockingErrors[]` 的每个元素都必须包含 `code`、`message` 与 `scope`
- `retryable` 为可选字段；仅在后端需要显式表达“当前错误可直接重试”时返回
- `scope` 只能是 `global`、`stage1_field` 或 `stage2_row`
- `scope` 只定义共享层必须稳定的业务定位语义，不规定前端的具体布局、视觉样式或组件形态
- `scope` 不是 Stage 枚举；前端若需要展示 Stage 1 / 2 / 3 标签，必须按请求入口或工作流上下文派生，不得把 `scope` 当成阶段编号使用
- 当前 `scope` 覆盖范围固定为现阶段三段业务模型：`global` 表示请求级阻断，`stage1_field` 表示阶段 1 字段定位，`stage2_row` 表示阶段 2 行级定位
- `POST /api/resolve-url` 的失败响应当前不单独引入 `stage3_*` scope；其阻断错误统一按现有 `scope` 模型表达
- 前端可把 `POST /api/resolve-url`、`POST /api/short-links` 或 Stage 3 触发的后续恢复链路失败统一标记为 Stage 3 展示语义，但该展示语义不进入后端响应结构
- `scope = stage1_field` 时，`context.field` 必填
- `scope = stage2_row` 时，`context.landingNodeName` 必填；若错误落在具体列上，`context.field` 必填
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
    "forwardRelayItems": ["relay.example.com:1080"],
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": null,
      "config": null,
      "include": ["TagA", "TagB"],
      "exclude": ["TagX"],
      "enablePortForward": true
    }
  }
}
```

成功响应：

- 返回 `stage2Init`、`messages` 与 `blockingErrors`
- `stage2Init` 的完整结构见“3. 阶段 2 初始化数据”
- 成功时 `blockingErrors[]` 必须为空

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
- `advancedOptions.config` 虽保留历史字段名 `config`，但其业务语义始终是“模板 URL”；阻断错误中的 `context.field = config` 也对应这一字段

最小失败语义：

- `400`：`INVALID_REQUEST`；默认 `scope = global`，当后端能明确定位到具体阶段 1 字段时可返回 `scope = stage1_field`
- `422`：`INVALID_FORWARD_RELAY_LINE`、`DUPLICATE_FORWARD_RELAY`、`CHAIN_TARGET_NAME_CONFLICT`、`INVALID_TEMPLATE_CONFIG`、`STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`
- `INVALID_FORWARD_RELAY_LINE`、`DUPLICATE_FORWARD_RELAY`：都必须返回 `scope = stage1_field` 与 `context.field = forwardRelayItems`
- `CHAIN_TARGET_NAME_CONFLICT`：必须返回 `scope = global`
- `INVALID_TEMPLATE_CONFIG`：必须返回 `scope = stage1_field` 与 `context.field = config`；该字段指向阶段 1 的模板 URL 输入及其派生出的模板内容校验
- `STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`：都必须返回 `scope = stage1_field`，且 `context.field` 必须指向 `landingRawText` 或 `transitRawText`
- `503`：`TEMPLATE_CONFIG_UNAVAILABLE`、`SUBCONVERTER_UNAVAILABLE`；两者都必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 2. `POST /api/generate`

用途：接收阶段 1 快照与阶段 2 快照，完成最终校验并返回可消费的长链接。

请求结构：

- `stage1Input`：结构同 `POST /api/stage1/convert` 的请求体中的 `stage1Input`
- `stage2Snapshot`：结构见本文“2. 阶段 2 配置快照”

最小请求示例：

```json
{
  "stage1Input": { "...": "同 POST /api/stage1/convert 请求示例" },
  "stage2Snapshot": {
    "rows": [
      {
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
      "context": { "landingNodeName": "HK 02", "field": "targetName" }
    }
  ]
}
```

补充规则：

- `longUrl` 是本系统唯一的规范化状态链接
- 本接口不负责创建短链接；短链接创建由单独接口处理
- 本接口成功表示当前快照已通过校验，并已得到可消费的长链接
- `longUrl` 的编码必须可逆、URL-safe 且具确定性；同一份 `stage1Input` 与 `stage2Snapshot` 必须生成相同的 `longUrl`
- 请求体中的 `advancedOptions.config` 仍表示模板 URL，而不是最终订阅 YAML

最小失败语义：

- `400`：`INVALID_REQUEST`；默认 `scope = global`，当后端能明确定位到具体阶段 1 字段时可返回 `scope = stage1_field`
- `422`：`CHAIN_TARGET_NAME_CONFLICT`、`INVALID_TEMPLATE_CONFIG`、`STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`、`STAGE2_ROWSET_MISMATCH`、`LANDING_NODE_NOT_FOUND`、`MISSING_TARGET`、`CHAIN_MODE_NOT_ALLOWED`、`TARGET_NOT_FOUND`、`DUPLICATE_FORWARD_RELAY_TARGET`、`EMPTY_CHAIN_TARGET`、`LONG_URL_TOO_LONG`
- `STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`：都必须返回 `scope = stage1_field`，且 `context.field` 必须指向 `landingRawText` 或 `transitRawText`
- `CHAIN_TARGET_NAME_CONFLICT`：必须返回 `scope = global`
- `INVALID_TEMPLATE_CONFIG`：必须返回 `scope = stage1_field` 与 `context.field = config`；该字段指向阶段 1 的模板 URL 输入及其派生出的模板内容校验
- `STAGE2_ROWSET_MISMATCH`：必须返回 `scope = global`
- `LANDING_NODE_NOT_FOUND`：必须返回 `scope = stage2_row` 与 `context.landingNodeName`
- `MISSING_TARGET`：必须返回 `scope = stage2_row`、`context.landingNodeName` 与 `context.field = targetName`
- `CHAIN_MODE_NOT_ALLOWED`：必须返回 `scope = stage2_row`、`context.landingNodeName` 与 `context.field = mode`
- `TARGET_NOT_FOUND`：必须返回 `scope = stage2_row`、`context.landingNodeName` 与 `context.field = targetName`
- `DUPLICATE_FORWARD_RELAY_TARGET`：必须返回 `scope = stage2_row`、`context.landingNodeName` 与 `context.field = targetName`
- `EMPTY_CHAIN_TARGET`：必须返回 `scope = stage2_row`、`context.landingNodeName` 与 `context.field = targetName`
- `LONG_URL_TOO_LONG`：必须返回 `scope = global`
- `503`：`TEMPLATE_CONFIG_UNAVAILABLE`、`SUBCONVERTER_UNAVAILABLE`；两者都必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
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
  "shortUrl": "https://example.com/subscription/7NpK2mQx9a.yaml",
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
- `422`：`INVALID_LONG_URL`、`LONG_URL_TOO_LONG`；必须返回 `scope = global`
- `503`：`SHORT_LINK_STORE_UNAVAILABLE`；必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 4. `POST /api/resolve-url`

用途：输入长链接或短链接，返回规范化长链接、页面恢复所需快照，以及该快照当前是否允许继续编辑和继续生成。

请求：

```json
{
  "url": "https://example.com/subscription/7NpK2mQx9a.yaml"
}
```

成功响应：

```json
{
  "longUrl": "https://example.com/subscription?data=...",
  "restoreStatus": "replayable",
  "stage1Input": { "...": "结构同 POST /api/stage1/convert 请求中的 stage1Input" },
  "stage2Snapshot": { "...": "结构同本文“2. 阶段 2 配置快照”" },
  "messages": [],
  "blockingErrors": []
}
```

规则：

- `restoreStatus` 只能是 `replayable` 或 `conflicted`
- 传入长链接时，先解码 `stage1Input` 与 `stage2Snapshot`
- 传入短链接时，先解析为长链接，再解码同一份快照
- 若解码出的 `stage1Input` 不满足当前接口契约或输入上限，接口按失败响应返回；失败响应不包含 `restoreStatus`
- `restoreStatus` 的判定规则见 [04-business-rules](04-business-rules.md)
- `restoreStatus = replayable` 表示该恢复快照可直接继续编辑和继续生成
- `restoreStatus = conflicted` 表示该恢复快照只能用于页面展示恢复，不能直接继续编辑和继续生成
- `restoreStatus = conflicted` 时，仍必须返回原始 `stage1Input` 与 `stage2Snapshot`
- `restoreStatus = conflicted` 时，`messages[]` 必须包含 `RESTORE_CONFLICT`，供前端进入只读冲突态

最小失败语义：

- `400`：`INVALID_REQUEST`、`INVALID_URL`；两者都必须返回 `scope = global`
- `422`：`INVALID_LONG_URL`、`SHORT_URL_NOT_FOUND`、`LONG_URL_TOO_LONG`；三者都必须返回 `scope = global`
- `503`：`SUBCONVERTER_UNAVAILABLE`、`SHORT_LINK_STORE_UNAVAILABLE`；两者都必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 5. `GET /subscription/<id>.yaml`

用途：供 Mihomo 客户端拉取 YAML。

规则：

- YAML 渲染规则见 [04-business-rules](04-business-rules.md)
- 仅即时生成 YAML，暂不提供 YAML 缓存
- 外部契约始终等价于“短链接是长链接的别名”
- 成功 `200`：正文为 UTF-8 YAML；`Content-Type: text/yaml; charset=utf-8`；`Cache-Control: private, no-store`（或 `no-cache, no-store, must-revalidate`）；`Content-Disposition` 默认 `inline; filename="<id>.yaml"`；存在查询参数 `download=1` 时改为 `attachment`（文件名规则不变）
- 失败：正文为 JSON，`Content-Type: application/json; charset=utf-8`，结构同本文「消息与错误模型」；`400` `INVALID_REQUEST`；`422` `SHORT_URL_NOT_FOUND`；`503` `SUBCONVERTER_UNAVAILABLE` 或 `SHORT_LINK_STORE_UNAVAILABLE`；`500` `RENDER_FAILED`（解码成功、依赖可用，但 YAML 渲染管线因内部原因失败）或 `INTERNAL_ERROR`；均为 `scope = global`；`503` 可返回 `retryable = true`

### 6. `GET /subscription?data=...`

用途：长链接对应的订阅资源地址；访问时返回 YAML。

规则：

- `data` 必须可逆编码 `stage1Input` 与 `stage2Snapshot`
- `data` 编码必须 URL-safe 且具确定性；编码规范见下文“长链接编码规范”
- YAML 渲染规则见 [04-business-rules](04-business-rules.md)
- 服务端仅即时生成 YAML，暂不提供 YAML 缓存
- 其外部契约与短链接一致，差别仅在于长链接直接携带完整快照
- HTTP 成功与失败协定同上一节；成功时默认 `Content-Disposition` 的 `filename` 为 `subscription.yaml`
- 增量失败语义（下表以「解码管线」指 `base64url → gunzip → JSON parse → version check → schema 结构校验 → 输入上限校验`）：
  - `400` `INVALID_REQUEST`：`data` 参数缺失
  - `422` `INVALID_LONG_URL`：解码管线任一步骤失败；`scope = global`
  - `500` `RENDER_FAILED`：解码成功、依赖可用，但 YAML 渲染管线因内部原因失败；`scope = global`

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
    "forwardRelayItems": ["relay.example.com:1080"],
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": null,
      "config": null,
      "include": ["TagA", "TagB"],
      "exclude": null,
      "enablePortForward": true
    }
  },
  "stage2Snapshot": {
    "rows": [
      {
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
- 当前版本的规范长链接只编码 `stage1Input` 与 `stage2Snapshot`
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
- 数组顺序按原语义顺序保留
- JSON 文本不得包含额外空白
- 布尔值、`null`、数字与字符串必须使用标准 JSON 表示
- 当前版本的规范编码输出中，不得包含 schema 未定义字段

gzip 规则：

- 必须使用 gzip 格式
- 为保证同一份快照得到完全相同的 `longUrl`，gzip header 中会影响字节稳定性的时间戳字段必须固定为 `0`

### 4. 解码与错误处理

- 后端解码长链接时，必须执行 `base64url -> gunzip -> JSON parse -> version check`
- 解码管线包含以下步骤：`base64url` 解码、`gunzip` 解压、JSON parse、version check、schema 结构校验、输入上限校验；任一步骤失败都必须返回 `INVALID_LONG_URL`
- `INVALID_LONG_URL` 的覆盖范围严格限定于解码管线失败；解码成功后的业务处理（包括 subconverter 调用、YAML 渲染）不属于 `INVALID_LONG_URL` 语义范畴
- `POST /api/resolve-url` 与 `POST /api/short-links` 对解码管线失败须一致返回 `INVALID_LONG_URL`

### 5. 长度约束

- 单条规范化 `longUrl` 的总长度必须受限
- 早期原型默认上限为 `2048` bytes
- 阶段 1 输入总大小上限与 `longUrl` 总长度上限都必须可配置；两者可以分别调节
- 当前 `v = 1` 编码下，早期原型默认将阶段 1 的 `landingRawText` 与 `transitRawText` 规范化后总大小上限设为 `2048` bytes
- `POST /api/generate` 若生成结果超过上限，必须返回阻断错误；结果按原请求语义终止，不截断、不自动切换为短链接
- 满足阶段 1 输入边界的合法请求，仍可能因最终 `longUrl` 超长而在生成阶段失败；该情形必须以 `LONG_URL_TOO_LONG` 返回
- 超限时错误码必须为 `LONG_URL_TOO_LONG`
- `POST /api/short-links` 与 `POST /api/resolve-url` 在解码已成功的前提下，若规范化重编码超出当前上限，同样返回 `LONG_URL_TOO_LONG`（非解码管线失败，故不使用 `INVALID_LONG_URL`）

---

## 长短链接语义

- 长链接必须编码 `stage1Input` 和 `stage2Snapshot`
- 长链接必须可逆，能恢复页面状态
- 长链接编码必须 URL-safe 且具确定性；同一份快照必须生成相同的长链接
- 长链接编码版本必须显式包含在载荷中；当前版本固定为 `v = 1`
- 长链接恢复页面状态后的后续操作权限，必须以后端 `resolve-url` 返回的 `restoreStatus` 为准
- 长链接本身也是订阅资源地址
- 长链接是唯一规范化状态源
- 短链接是长链接的不透明别名，不单独承载状态源语义
- 短链接 ID 必须由规范化 `longUrl` 通过确定性算法生成；同一个 `longUrl` 必须得到同一个 `shortUrl`
- 当前默认短链接 ID 生成算法为：对规范化 `longUrl` 计算 `SHA-256`，取前 `64` bit，并以 base62 编码输出；输出长度因此为 `1-11` 个 ASCII 字符
- 短链接索引在逻辑上是 `longUrl ↔ shortId` 的双射子集：除淘汰导致的失效外，同一 `longUrl` 不得对应多个并存的可解析 `shortId`。并发创建路径上须以 **`longUrl`（或与其一一对应的规范化键）唯一约束**，或等价的事务/锁与冲突处理（例如唯一冲突后回读已有行并返回）保证；仅依赖非原子「先查后写」而未处理冲突的实现不符合本契约；不能仅凭确定性 ID 算法而假定该性质成立
- 在当前默认 `64` bit 设计下，允许仅实现极简碰撞防御：若检测到 `shortId` 已被另一条 `longUrl` 占用，后端必须 fail closed，并保持「一短一长」映射关系
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
