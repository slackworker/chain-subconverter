# 03 - 后端 API 契约

> 本章只定义 HTTP 契约。业务规则与转换语义见 [04-business-rules](04-business-rules.md)。

---

## 通用访问约束

- 当前 spec 定义的所有对外 HTTP 端点都不需要鉴权
- 服务端按匿名请求处理，不校验登录态、`Authorization` 头、API Key、签名或其他认证凭据
- `GET /api/runtime-config`、`POST /api/*`、`GET /sub/<id>` 与 `GET /sub?...` 都按匿名请求处理
- 可额外暴露 `GET /healthz` 作为部署侧健康检查端点；该端点只用于存活/就绪探测，不承载业务契约，也不改变本文对 `/api/*` 与 `/sub*` 的定义范围

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
      "config": "https://raw.githubusercontent.com/slackworker/Aethersailor-Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
      "include": ["TagA", "TagB"],
      "exclude": null
    }
  }
}
```

约束：

- `forwardRelayItems` 始终是字符串数组；是否录入过端口转发服务只由该数组自身表达，空数组表示当前未录入任何端口转发服务项
- `forwardRelayItems[]` 的每个元素对应一个独立端口转发输入项；数组顺序保留用户输入顺序，不使用连续文本序列化
- `advancedOptions` 只保留前端可配置且会影响转换和生成结果的字段；固定隐藏 `subconverter` 参数不进入接口快照
- 接口接受层中，`advancedOptions` 采用显式快照模型：`emoji`、`udp`、`skipCertVerify` 使用 `true | false | null`；`config` 使用非空字符串；`include`、`exclude` 使用 `非空字符串数组 | null`
- `enablePortForward` 不属于后端 API 契约，也不属于长链接状态载荷；若请求体或长链接 payload 仍携带该字段，后端必须按未知字段拒绝，而不是静默兼容
- `advancedOptions.config` 的字段名保留 `config`，用于兼容 `subconverter` 的既有 `config` 查询参数；其业务语义固定为“模板 URL”或“外部配置（模板）URL”，不得理解为最终 Mihomo YAML
- 复选框语义为：`true` 表示显式传 `true`、`false` 表示显式传 `false`、`null` 表示不向上游传该参数；`include = null`、`exclude = null` 表示对应 Tag 列表留空。当前 Web 前端产出层 checkbox 只会产出 `true` 或 `null`，但服务端仍必须正确处理显式传入的 `false`
- `config` 表示当前快照使用的模板 URL，必须是非空 HTTP(S) URL；`include` 与 `exclude` 为透传 Tag 列表。为兼容空输入，服务端可接受 `include = []`、`exclude = []`，但必须在入站归一化为 `null`
- 当前 Web 前端若以 TagInput 承载 `include`、`exclude`，接口接受层收到的必须是按输入顺序排列的字符串数组，不使用连续文本序列化
- `udp`、`skipCertVerify` 与上游 `GET /sub` 的查询参数一一对应；其中 `skipCertVerify` 对应查询参数 `scv`；参数默认值与具体传递规则以 [04-business-rules](04-business-rules.md) `0.2.2 subconverter 参数表` 为准
- `emoji` 字段保留在阶段 1 快照中并兼容 `true | false | null`；其上游透传与处理时机按 [04 §0.2.3](04-business-rules.md) 执行
- 参与转换的 `landingRawText` 与 `transitRawText` 必须受上游 `GET /sub` 请求 URI 预算约束；该预算必须可配置，默认完整请求 URI 最多 `16384` bytes
- 若任一字段支持多 URL 输入，则该字段承载的输入项数量必须受限；该上限必须可配置，默认每个字段最多 `32` 条

### 2. 阶段 2 配置快照

```json
{
  "stage2Snapshot": {
    "rows": [
      {
        "rowId": "HK 01",
        "sourceLandingNodeName": "HK 01",
        "proxyName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ],
    "chainProxyTargetGroupSwitchOptimizationEnabled": true,
    "serverAggregationGroups": [
      {
        "server": "landing.example.com",
        "groupName": "HK 手动分组",
        "enabled": true,
        "strategy": "fallback",
        "memberRowIds": ["HK 01", "HK 01 2"]
      },
      {
        "server": "edge.reality.example",
        "enabled": false,
        "strategy": "",
        "memberRowIds": []
      }
    ]
  }
}
```

约束：

- `rows` 表示阶段 2 的完整固定行模型，不是增量补丁
- `rowId` 为行稳定 ID（全表唯一，必填）；`proxyName` 为 YAML 节点名（全表唯一）；`sourceLandingNodeName` 为 Pass 1 原始落地名；字段语义见 [04 §2.1.2](04-business-rules.md)
- `rows[]` 数组顺序与 `serverAggregationGroups[].memberRowIds[]` 数组顺序都属于稳定契约的一部分；具体语义见 [04 §2.1.2a / §2.1.3 / §2.7](04-business-rules.md)
- 每个当前落地身份至少一行；允许多行共享同一 `sourceLandingNodeName`（复制）
- `mode` 只能是 `none`、`chain`、`port_forward`
- `mode = none` 时，`targetName` 必须为空或 `null`
- `mode = chain` 时，`targetName` 必须等于某个 `chainTargets[].name`
- `mode = port_forward` 时，`targetName` 必须等于某个 `forwardRelays[].name`，且同一份 `stage2Snapshot` 中不可被多个 `rows[]` 重复使用
- `serverAggregationGroups[]` 可选；字段形状见上文示例；业务语义、校验、命名与渲染规则见 [04 §2.7](04-business-rules.md) 与 [04 §3.3.2](04-business-rules.md)
- `serverAggregationGroups[].server` 是组稳定标识，表达“该聚合组对应哪个落地 server”；同一 `stage2Snapshot` 内唯一
- `serverAggregationGroups[].groupName` 为可选字符串，表达用户显式编辑后的聚合组名；缺失或空字符串都表示“当前未设置自定义组名，应回退到默认命名规则”
- `serverAggregationGroups[].groupName` 只承载聚合组命名语义，不得改变任何 `rows[]` 的 `proxyName`、`rowId` 或 `sourceLandingNodeName`
- 渲染出的聚合组是最终 YAML 产物，不回流到 `stage2Init.chainTargets[]`，也不作为 `rows[].targetName` 的可选值
- `chainProxyTargetGroupSwitchOptimizationEnabled` 为可选布尔值；开启后对所有 `mode = chain` 且 `targetName` 为 `kind = proxy-groups` 的行统一覆写 `timeout` 与 `max-failed-times`；适用条件与校验见 [04 §3.1–3.2](04-business-rules.md)

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
        "rowId": "HK 01",
        "sourceLandingNodeName": "HK 01",
        "proxyName": "HK 01",
        "landingNodeType": "SS",
        "server": "landing.example.com",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      },
      {
        "rowId": "Reality 01",
        "sourceLandingNodeName": "Reality 01",
        "proxyName": "Reality 01",
        "landingNodeType": "Reality",
        "server": "edge.reality.example",
        "modeWarnings": {
          "chain": {
            "reasonCode": "DISCOURAGED_BY_LANDING_PROTOCOL",
            "reasonArgs": { "protocolClass": "udp_or_tls_obfuscated" }
          }
        },
        "mode": "chain",
        "targetName": "relay-group-hk"
      }
    ]
  }
}
```

字段说明：

- `availableModes[]`：阶段 2 第三列的模式列表；出现条件与顺序见 [04-business-rules](04-business-rules.md)
- `chainTargets[]`：阶段 2 第四列在 `mode = chain` 时的候选列表
- `chainTargets[].name`：链式候选名称；同时作为 `stage2Snapshot.rows[].targetName` 的可选值
- `chainTargets[].kind`：链式候选类别；当前只允许 `proxy-groups` 或 `proxies`
- `chainTargets[].isEmpty`：可选布尔值；仅 `kind = proxy-groups` 时有语义。空策略组写 `true`；非空策略组留空
- `chainTargets[]` 仅包含阶段 2 可直接选择的链式候选；任何由 `serverAggregationGroups[]` 派生的聚合组都不应出现在该列表中
- `forwardRelays[]`：阶段 2 第四列在 `mode = port_forward` 时的候选列表
- `forwardRelays[].name`：规范化后的 `server:port` 字面量，同时作为稳定标识与展示值
- `rows[]`：阶段 2 默认行模型，前端直接渲染
- `rows[].landingNodeType`：落地节点类型展示值
- `rows[].server`：落地节点 server 展示值（用于按 server 分组与聚合配置）；必填且不能为空字符串
- `stage2Init.rows[]` 不暴露切换优化字段；开关由 `stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled` 全局承载（见 §2）
- `rows[].restrictedModes`：当前行的模式限制映射；出现条件见 [04-business-rules](04-business-rules.md)
- `rows[].restrictedModes.<mode>.reasonCode`：禁用原因码；文案由前端基于 `reasonCode` 与 `reasonArgs` 本地映射
- `rows[].restrictedModes.<mode>.reasonArgs`：禁用原因参数对象（可选）
- `rows[].modeWarnings`：当前行的模式 warning 映射；出现条件见 [04-business-rules](04-business-rules.md)
- `rows[].modeWarnings.<mode>.reasonCode`：warning 原因码；文案由前端基于 `reasonCode` 与 `reasonArgs` 本地映射
- `rows[].modeWarnings.<mode>.reasonArgs`：warning 原因参数对象（可选）
- `modeWarnings.chain.reasonCode` 在当前规格中允许为 `DISCOURAGED_BY_LANDING_PROTOCOL`、`DISCOURAGED_BY_LANDING_PORT` 或 `DISCOURAGED_BY_LANDING_PROTOCOL_AND_PORT`
- 当同一行同时命中多条 `chain` warning 条件时，后端必须合并为单个 `modeWarnings.chain` 项，并在 `reasonArgs` 中返回组合原因参数

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
    "context": { "rowId": "HK 02", "proxyName": "HK 02", "field": "targetName" }
  }
]
```

`restoreConflicts[]`（仅 `POST /api/resolve-url` 成功响应可返回）：

```json
[
  {
    "reasonCode": "TARGET_NOT_FOUND",
    "reasonArgs": { "rowId": "HK 02", "field": "targetName" }
  }
]
```

约束：

- `messages[]` 只承载 `info` 与 `warning`
- `messages[]` 表示服务端返回的非阻断用户提示；它是前端 workflow log 的后端消息源之一，但不等同于整个前端日志系统
- 当前稳定业务摘要 code 可包括 `STAGE1_CONVERT_SUMMARY`、`AUTO_CHAIN_TARGET_SELECTED`、`STAGE2_RESET`、`STAGE2_ROW_RESET`、`GENERATE_METADATA_READY`、`RESTORE_METADATA_READY`、`SHORT_LINK_CREATED`、`CHAIN_TARGET_REVIEW`、`DEFAULT_TEMPLATE_CACHE_USED`、`TEMPLATE_EMOJI_RULE_CONFLICT` 与 `RESTORE_CONFLICT`
- `messages[]` 不承诺字段级或行级定位语义，也不单独决定前端展示位置
- `messages[]` 不定义 `scope`；若返回 `context`，仅作为辅助元数据，前端与测试不得依赖其决定展示位置
- `messages[]` 可选返回 `reasonArgs`；若返回则必须是对象，由前端基于 `code` 本地映射文案
- `blockingErrors[]` 只承载阻断当前请求的错误
- `blockingErrors[]` 的每个元素都必须包含 `code`、`message` 与 `scope`；`code` 与 `restoreConflicts[].reasonCode` 共享同一稳定原因码命名空间（如 `TARGET_NOT_FOUND`）
- `blockingErrors[]` 可选返回 `reasonArgs`；若返回则必须是对象；前端基于 `code` 与 `reasonArgs` 本地映射 `message` 之外的补充文案
- `retryable` 为可选字段；仅在后端需要显式表达“当前错误可直接重试”时返回
- `scope` 只能是 `global`、`stage1_field`、`stage2_row`、`stage3_field` 或 `stage3_action`
- `scope` 只定义共享层必须稳定的业务定位语义，不规定前端的具体布局、视觉样式或组件形态
- `scope` 不是 Stage 枚举；前端若需要展示 Stage 1 / 2 / 3 标签，必须按请求入口或工作流上下文派生，不得把 `scope` 当成阶段编号使用
- 前端可在展示层派生 `originStage` 一类的请求来源语义，用于决定本次反馈属于哪个阶段动作；该语义不进入后端响应结构，也不替代 `scope`
- 当前 `scope` 覆盖范围固定为现阶段三段业务模型：`global` 表示系统级或请求级阻断，`stage1_field` 表示阶段 1 字段定位，`stage2_row` 表示阶段 2 行级定位，`stage3_field` 与 `stage3_action` 表示阶段 3 的输入定位与动作定位
- `POST /api/resolve-url` 与 `POST /api/short-links` 的失败响应允许使用 `stage3_field` 或 `stage3_action`；仅当错误属于存储、依赖或未知内部异常时使用 `scope = global`
- 前端仍可在展示层派生 Stage 3 来源标签，但该标签不替代 `stage3_*` 的局部定位职责
- `scope = stage1_field` 时，`context.field` 必填
- `scope = stage2_row` 时，`context.rowId` 必填；`context.proxyName` 建议同时返回；列级错误须含 `context.field`
- `scope = stage3_field` 时，`context.field` 必填；当前前端默认使用 `currentLinkInput` 作为 Stage 3 当前链接输入框的稳定字段键
- `scope = stage3_action` 时，`context.action` 为可选字段；若返回，则其值必须只承担动作来源说明，不得替代 `originStage`
- `blockingErrors[]` 非空时，本次请求视为失败；失败响应不得返回对应成功载荷字段
- `restoreConflicts[]` 只在 `restoreStatus = conflicted` 的成功响应中返回；每个元素都必须包含 `reasonCode`，`reasonArgs` 可选；`reasonCode` 与 `blockingErrors[].code` 共享同一稳定原因码命名空间
- `STAGE1_INPUT_TOO_LARGE` 与 `TOO_MANY_UPSTREAM_URLS` 用于阶段 1 输入边界校验；具体边界见 [04-business-rules](04-business-rules.md)
- `SUBCONVERTER_UNAVAILABLE` 用于必需转换 pass 失败；具体触发条件见 [04-business-rules](04-business-rules.md)
- `SUBCONVERTER_UNAVAILABLE.message` 必须是面向最终用户的业务化提示，不得出现 pass 名称、容器主机名、内部请求 URL、查询串或原始技术错误串
- `SUBCONVERTER_UNAVAILABLE` 如返回 `context.diagnostic`，公开字段只允许使用 `problemClass` 与 `userInputSource`
- 所有 `500` 级内部异常的 `message` 都必须是脱敏后的用户文案；原始技术原因只允许进入 operator log，并通过 `X-Request-ID` 关联
- `RATE_LIMITED` 用于命中服务端 per-IP 限速；当前用于 `POST /api/stage1/convert`、`POST /api/generate`、`POST /api/short-links`、`POST /api/resolve-url`、`GET /sub` 与 `GET /sub/<id>`，必须返回 `scope = global`，可返回 `retryable = true`；限速分桶默认按连接对端地址识别客户端，只有当直接对端 IP 命中 `TRUSTED_PROXY_CIDRS` 时才允许改用 `X-Forwarded-For` 推断客户端 IP

### 5. HTTP 状态码

- `200`：请求成功；`blockingErrors[]` 必须为空
- `400`：请求体结构、字段类型或 URL 形态不符合接口契约；`blockingErrors[]` 必须包含 `INVALID_REQUEST` 或 `INVALID_URL`
- `429`：命中服务端限速；`blockingErrors[]` 必须包含 `RATE_LIMITED`
- `422`：请求体结构合法，但业务校验未通过；`blockingErrors[]` 必须非空
- `503`：依赖暂时不可用；`blockingErrors[]` 必须非空；若返回 `retryable`，其值必须为 `true`
- `500`：未知内部错误；`blockingErrors[]` 必须非空
- `POST /api/resolve-url` 返回 `restoreStatus = conflicted` 时仍是 `200`，不视为接口失败
- 所有 `/api/*` 与 `/sub*` 响应应返回 `X-Request-ID` header，供前端问题与服务端 access / operation log 关联；该值不进入 JSON body

### 5b. 运维 access log（stderr）

面向部署者 / `docker logs`；不等同于 API `messages[]` 或前端 workflow log。实现见 `internal/api/access_log.go`。

- 默认只记录：HTTP 状态 `>= 400`、关键业务 `operation`（如 `stage1_convert`、`generate`、`short_link_create`、`resolve_url`、订阅读取）、或响应含 warning 级 `messages[]` 的成功请求
- 成功的 `GET /healthz` 与常规静态资源成功请求默认不写入 access log
- 典型字段：`method`、`path`（敏感 query 已 redact）、`status`、`duration_ms`、`client_ip`、`request_id`、`operation`、`error_code`、`warning_codes`；反代场景含 `origin_scheme` / `origin_host` / `trusted_proxy`
- 原始技术错误串不得写入用户可见通道；排障通过 `request_id` 关联 access log 与 operator 上下文

---

## API 端点

### 1. `GET /api/runtime-config`

用途：返回前端展示所需的运行时公开配置。

请求：

- 不需要请求体

成功响应：

```json
{
  "defaultTemplateURL": "https://raw.githubusercontent.com/slackworker/Aethersailor-Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
  "maxPublicLongURLLength": 8192
}
```

约束：

- `defaultTemplateURL` 表示前端阶段 1 模板 URL 输入框的部署默认初始值
- 前端必须把该值作为普通模板 URL 写入 `advancedOptions.config`，并随阶段 1 请求、生成请求与长链接载荷提交
- `maxPublicLongURLLength` 表示当前部署对外公开 longUrl 的预算上限；当前 Web 前端必须据此决定何时自动切换为短链接展示
- 该接口不承载鉴权、转换、模板拉取或健康检查语义

### 2. `GET /api/runtime-status`

用途：返回部署运行态摘要（应用版本、subconverter 探测结果、短链存储用量）。

请求：

- 不需要请求体
- 可选查询参数 `refresh=1`：跳过后端探测缓存并重新访问上游 `/version`

成功响应：

```json
{
  "app": {
    "version": "v3.2.0-beta.1",
    "releaseTag": "v3.2.0-beta.1",
    "imageTag": "3.2.0-beta.1",
    "revision": "86922c3deadbeef86922c3deadbeef86922c3d",
    "imageDigest": "sha256:eeff0ea63c5d5f23e3605e69486922af7b75fe02ce3ae3abe7af906605ed3c24"
  },
  "subconverter": {
    "healthy": true,
    "networkScope": "internal",
    "latencyMs": 42,
    "version": "subconverter v0.9.1",
    "lastCheckedAt": "2026-05-29T12:00:00.000000000Z"
  },
  "storage": {
    "mode": "temporary",
    "used": 1,
    "capacity": 1000
  }
}
```

约束：

- `app.version` 为展示字段：优先 `releaseTag`，否则回退 `imageTag`，再回退本地构建默认值
- `app.releaseTag` 仅在版本发布 tag 构建时返回（例如 `v3.2.0-beta.1`）
- `app.imageTag` 为当前镜像 tag（例如 `beta-latest`、`latest`、`dev-latest` 或版本号镜像 tag）
- `app.revision` 为构建来源 commit SHA，供诊断与发布追溯
- `app.imageDigest` 为当前部署镜像 digest（`sha256:…`）；构建时经 `APP_IMAGE_DIGEST` 注入，或由运行时环境变量 `CHAIN_SUBCONVERTER_IMAGE_DIGEST` 覆盖；footer hover 展示构建元信息（`releaseTag`、`imageTag`、短 `revision`、`imageDigest`）
- `subconverter` 字段由后端探测上游 `/version` 获得；`error` 为脱敏摘要
- `subconverter.networkScope` 采用推荐部署约定：当 `app -> subconverter` 访问主机名为 compose 服务名 `subconverter` 时标记为 `internal`，其余场景标记为 `cross_network`
- 前端展示建议：`healthy + internal` 显示绿色、`healthy + cross_network` 显示黄色、`healthy = false` 显示红色
- `storage.mode` 由 `CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH` 推断：`/tmp` 下为 `temporary`，否则为 `persistent`
- 与 `GET /healthz` 职责分离：本接口用于运行态展示，不替代存活探测
- 不并入 `GET /api/runtime-config`

### 3. `POST /api/stage1/convert`

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
      "config": "https://raw.githubusercontent.com/slackworker/Aethersailor-Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
      "include": ["TagA", "TagB"],
      "exclude": ["TagX"]
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
      "message": "转换服务未就绪或无法连接。请确认 subconverter 已部署、已启动，且地址和端口配置正确。",
      "retryable": true,
      "scope": "global",
      "context": {
        "diagnostic": {
          "problemClass": "service_unreachable"
        }
      }
    }
  ]
}
```

补充规则：

- 本接口不返回 `completeConfig` 或 `baseCompleteConfig`
- `stage2Init` 的来源、候选收集与默认填充规则统一见 [04-business-rules](04-business-rules.md)
- 本接口执行的 Pipeline 步骤见 [04 §1.1.1](04-business-rules.md)：`prepareTemplate` → `pass1Discover` → `pass2Discover` → `applyEmoji` → `buildStage2Init`；不执行 `pass3FullBase` 及之后步骤
- 多条完全一致的落地 URI 不得被静默去重
- `proxyName` 的具体命名与重名处理由转换服务和 chain 侧命名流程共同决定；前端只消费接口返回结果，不得自行猜测
- `advancedOptions.config` 虽保留历史字段名 `config`，但其业务语义始终是“模板 URL”；阻断错误中的 `context.field = config` 也对应这一字段

最小失败语义：

- `400`：`INVALID_REQUEST`；默认 `scope = global`，当后端能明确定位到具体阶段 1 字段时可返回 `scope = stage1_field`
- `429`：`RATE_LIMITED`；必须返回 `scope = global`；可返回 `retryable = true`
- `422`：`INVALID_FORWARD_RELAY_LINE`、`DUPLICATE_FORWARD_RELAY`、`CHAIN_TARGET_NAME_CONFLICT`、`INVALID_TEMPLATE_CONFIG`、`STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`
- `INVALID_FORWARD_RELAY_LINE`、`DUPLICATE_FORWARD_RELAY`：都必须返回 `scope = stage1_field` 与 `context.field = forwardRelayItems`
- `CHAIN_TARGET_NAME_CONFLICT`：必须返回 `scope = global`
- `INVALID_TEMPLATE_CONFIG`：必须返回 `scope = stage1_field` 与 `context.field = config`；该字段指向阶段 1 的模板 URL 输入及其派生出的模板内容校验
- `STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`：都必须返回 `scope = stage1_field`，且 `context.field` 必须指向 `landingRawText` 或 `transitRawText`
- `503`：`TEMPLATE_CONFIG_UNAVAILABLE`、`SUBCONVERTER_UNAVAILABLE`；两者都必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 4. `POST /api/generate`

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
        "rowId": "HK 01",
        "sourceLandingNodeName": "HK 01",
        "proxyName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ],
    "chainProxyTargetGroupSwitchOptimizationEnabled": true,
    "serverAggregationGroups": [
      {
        "server": "landing.example.com",
        "groupName": "HK 手动分组",
        "enabled": true,
        "strategy": "fallback",
        "memberRowIds": ["HK 01", "HK 02"]
      }
    ]
  }
}
```

接口约束：

- 请求体不包含 `completeConfig`
- 本接口返回规范化长链接；生成前校验规则见 [04-business-rules](04-business-rules.md)
- 本接口执行的 Pipeline 步骤见 [04 §1.1.1](04-business-rules.md)：完整 Pipeline 至 `postProcess` 的内部 dry-run 校验；并按 hard-break 规则编码 `statePayload v4`
- 本接口不返回 YAML 文本

成功响应：

```json
{
  "longUrl": "https://example.com/sub?data=...",
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
      "context": { "rowId": "HK 02", "proxyName": "HK 02", "field": "targetName" }
    }
  ]
}
```

补充规则：

- `longUrl` 是本系统唯一的规范化状态链接
- 本接口不负责创建短链接；短链接创建由单独接口处理
- 本接口成功表示当前快照已通过校验，并已得到可消费的长链接
- `longUrl` 的编码必须可逆、URL-safe 且具确定性；同一份 `stage1Input` 与 `stage2Snapshot` 必须生成相同的数据载荷（`data` query 参数），链接的路径与查询结构必须稳定；`longUrl` 的 scheme 与 host 由服务端发布地址决定：若显式配置了 `USER_FACING_BASE_URL`，则始终以该配置为准；若未配置，则以当前请求来源推断：默认使用 TLS 状态与 `Host` 请求头；仅当直接对端 IP 命中 `TRUSTED_PROXY_CIDRS` 时，允许改用 `X-Forwarded-Proto` 与 `X-Forwarded-Host`；多入口访问场景下 host 部分可能随入口不同而变化
- 当前 Web 前端拿到 `longUrl` 后，若其长度超过 `GET /api/runtime-config` 返回的 `maxPublicLongURLLength`，必须立即创建并切换为 `shortUrl` 展示；此时 `longUrl` 只作为前端与后端之间的内部中间值存在，不再作为主展示结果
- 请求体中的 `advancedOptions.config` 仍表示模板 URL，而不是最终订阅 YAML

最小失败语义：

- `400`：`INVALID_REQUEST`；默认 `scope = global`，当后端能明确定位到具体阶段 1 字段时可返回 `scope = stage1_field`
- 若 `stage2Snapshot` 含有不受支持的 `mode`，或违反 [04 §3.2](04-business-rules.md) 中 `chainProxyTargetGroupSwitchOptimizationEnabled` 相关校验，后端必须返回 `400 INVALID_REQUEST`，并使用 `scope = stage2_row`
- `429`：`RATE_LIMITED`；必须返回 `scope = global`；可返回 `retryable = true`
- `422`：`CHAIN_TARGET_NAME_CONFLICT`、`INVALID_TEMPLATE_CONFIG`、`STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`、`STAGE2_ROWSET_MISMATCH`、`DUPLICATE_PROXY_NAME`、`LANDING_NODE_NOT_FOUND`、`MISSING_TARGET`、`TARGET_NOT_FOUND`、`DUPLICATE_FORWARD_RELAY_TARGET`、`EMPTY_CHAIN_TARGET`、`INVALID_SERVER_AGGREGATION_GROUP`、`DUPLICATE_SERVER_AGGREGATION_GROUP`、`SERVER_AGGREGATION_MEMBER_NOT_FOUND`、`SERVER_AGGREGATION_GROUP_TOO_SMALL`、`SERVER_AGGREGATION_SERVER_MISMATCH`
- `STAGE1_INPUT_TOO_LARGE`、`TOO_MANY_UPSTREAM_URLS`：都必须返回 `scope = stage1_field`，且 `context.field` 必须指向 `landingRawText` 或 `transitRawText`
- `CHAIN_TARGET_NAME_CONFLICT`：必须返回 `scope = global`
- `INVALID_TEMPLATE_CONFIG`：必须返回 `scope = stage1_field` 与 `context.field = config`；该字段指向阶段 1 的模板 URL 输入及其派生出的模板内容校验
- `STAGE2_ROWSET_MISMATCH`：必须返回 `scope = global`
- `DUPLICATE_PROXY_NAME`、`MISSING_TARGET`、`TARGET_NOT_FOUND`、`DUPLICATE_FORWARD_RELAY_TARGET`、`EMPTY_CHAIN_TARGET`：须 `scope = stage2_row`，`context.rowId` 必填；建议同时返回 `context.proxyName`；列级错误加 `context.field`
- `LANDING_NODE_NOT_FOUND`：当错误来源是行快照引用缺失时，须 `scope = stage2_row`（`context.rowId` 必填，建议同时返回 `context.proxyName`）；当错误来源是 server 聚合成员引用到当前环境缺失的落地节点时，须 `scope = global`
- `INVALID_SERVER_AGGREGATION_GROUP`、`DUPLICATE_SERVER_AGGREGATION_GROUP`、`SERVER_AGGREGATION_MEMBER_NOT_FOUND`、`SERVER_AGGREGATION_GROUP_TOO_SMALL`、`SERVER_AGGREGATION_SERVER_MISMATCH`：都必须返回 `scope = global`，且不要求返回 `context`
- `503`：`TEMPLATE_CONFIG_UNAVAILABLE`、`SUBCONVERTER_UNAVAILABLE`；两者都必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 5. `POST /api/stage2/reset`

用途：基于当前 `stage1Input` 重新计算 Stage 2 初始配置，并按指定范围恢复 `stage2Snapshot`。

请求结构：

- `stage1Input`：结构同 `POST /api/stage1/convert` 请求体中的 `stage1Input`
- `stage2Snapshot`：当前编辑态快照，结构同本文“2. 阶段 2 配置快照”
- `reset`：恢复动作
  - `scope = all`：恢复整个 Stage 2 为初始配置
  - `scope = row`：只恢复指定 `rowId` 对应行
  - `rowId`：`scope = row` 时必填

最小请求示例：

```json
{
  "stage1Input": { "...": "同 POST /api/stage1/convert 请求示例" },
  "stage2Snapshot": {
    "rows": [
      {
        "rowId": "HK 01",
        "sourceLandingNodeName": "HK 01",
        "proxyName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ],
    "chainProxyTargetGroupSwitchOptimizationEnabled": true,
    "serverAggregationGroups": []
  },
  "reset": {
    "scope": "row",
    "rowId": "HK 01"
  }
}
```

成功响应：

```json
{
  "stage2Init": { "...": "结构同本文“3. 阶段 2 初始化数据”" },
  "stage2Snapshot": { "...": "重置后的快照" },
  "messages": [],
  "blockingErrors": []
}
```

规则：

- `scope = all`：`stage2Snapshot` 必须恢复为当前 `stage1Input` 对应的初始快照（`rows` 来自 `stage2Init.rows`，`serverAggregationGroups = []`，切换优化开关为 `false`）
- `scope = row`：仅恢复指定行的 `proxyName`、`mode` 与 `targetName`；其他行与聚合组保持不变
- `scope = row` 时，行定位以 `rowId` 为准；若找不到对应行，接口失败
- 本接口执行的 Pipeline 步骤见 [04 §1.1.1](04-business-rules.md)：`prepareTemplate` → `pass1Discover` → `pass2Discover` → `applyEmoji` → `buildStage2Init`；随后按 `reset` 范围重置 `stage2Snapshot`

最小失败语义：

- `400`：`INVALID_REQUEST`（包括 `reset.scope` 非法、`scope = row` 但 `rowId` 缺失）
- `422`：`STAGE2_ROW_NOT_FOUND`、`LANDING_NODE_NOT_FOUND`
- `429`：`RATE_LIMITED`；必须返回 `scope = global`；可返回 `retryable = true`
- `503`：`SUBCONVERTER_UNAVAILABLE`；必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 6. `POST /api/short-links`

用途：为既有 `longUrl` 创建或获取其确定性短链接。

请求：

```json
{
  "longUrl": "https://example.com/sub?data=..."
}
```

成功响应：

```json
{
  "longUrl": "https://example.com/sub?data=...",
  "shortUrl": "https://example.com/sub/7NpK2mQx9a",
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
      "scope": "stage3_field",
      "context": { "field": "currentLinkInput" }
    }
  ]
}
```

规则：

- 请求体只接受 `longUrl`，不重复接收 `stage1Input` 与 `stage2Snapshot`
- 后端必须先校验 `longUrl` 是否为本系统可识别、可解析的规范长链接
- 对同一份规范状态的多次成功调用须**幂等**；映射未淘汰且存储可用时，成功响应中的 `shortUrl` 须一致；即使 `USER_FACING_BASE_URL` 或请求入口变化导致规范化 `longUrl` 的 scheme / host / base path 变化，只要状态载荷相同，`shortUrl` 中的 `<id>` 也必须保持一致。存储层如何保证见下文「长短链接语义」中短链接索引相关条目
- `longUrl` 必须是规范长链接（仅包含 `data`）；若携带其他 query，必须返回 `INVALID_LONG_URL`
- 成功响应的 `messages[]` 可包含短链接存储淘汰相关 warning

最小失败语义：

- `400`：`INVALID_REQUEST`；必须返回 `scope = stage3_field` 与 `context.field = currentLinkInput`
- `429`：`RATE_LIMITED`；必须返回 `scope = global`；可返回 `retryable = true`
- `422`：`INVALID_LONG_URL`；必须返回 `scope = stage3_field` 与 `context.field = currentLinkInput`
- `503`：`SHORT_LINK_STORE_UNAVAILABLE`；必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 7. `POST /api/resolve-url`

用途：输入长链接、短链接或短链接 `shortID`，返回规范化长链接、页面恢复所需快照，以及该快照当前是否允许继续编辑和继续生成。

请求：

```json
{
  "url": "https://example.com/sub/7NpK2mQx9a"
}
```

成功响应：

```json
{
  "longUrl": "https://example.com/sub?data=...",
  "shortUrl": "https://example.com/sub/7NpK2mQx9a",
  "restoreStatus": "conflicted",
  "restoreConflicts": [
    {
      "reasonCode": "TARGET_NOT_FOUND",
      "reasonArgs": { "rowId": "HK 02", "field": "targetName" }
    }
  ],
  "stage1Input": { "...": "结构同 POST /api/stage1/convert 请求中的 stage1Input" },
  "stage2Snapshot": { "...": "结构同本文“2. 阶段 2 配置快照”" },
  "messages": [],
  "blockingErrors": []
}
```

规则：

- `restoreStatus` 只能是 `replayable` 或 `conflicted`
- `restoreConflicts[]` 为可选数组；`restoreStatus = replayable` 时可省略或返回空数组，`restoreStatus = conflicted` 时必须非空
- 传入长链接时，先解码 `stage1Input` 与 `stage2Snapshot`
- 传入短链接或裸 `shortID` 时，先解析为长链接，再解码同一份快照
- 传入短链接或裸 `shortID` 且解析成功时，成功响应必须额外返回规范化 `shortUrl`；传入长链接时不返回该字段
- 裸 `shortID` 仅接受当前短链编码 token；其他非 URL 文本必须按 `INVALID_URL` 处理
- 若传入长链接携带 `data` 与可选 `download=1` 之外的 query，必须返回 `INVALID_LONG_URL`
- 若解码出的 `stage1Input` 不满足当前接口契约或输入上限，接口按失败响应返回；失败响应不包含 `restoreStatus`
- 本接口执行的 Pipeline 步骤见 [04 §1.1.1](04-business-rules.md)：与 `POST /api/generate` 同口径，完成至 `postProcess` 的内部校验；不得走兼容分支或旧版载荷解码路径
- `restoreStatus` 的判定规则见 [04-business-rules](04-business-rules.md)
- `restoreStatus = replayable` 表示该恢复快照可直接继续编辑和继续生成
- `restoreStatus = conflicted` 表示该恢复快照只能用于页面展示恢复，不能直接继续编辑和继续生成
- `restoreStatus = conflicted` 时，仍必须返回原始 `stage1Input`、`stage2Snapshot` 与 `restoreConflicts[]`
- `restoreConflicts[].reasonCode` 必填；`reasonArgs` 可选且必须是对象
- `restoreStatus = conflicted` 时，`messages[]` 必须包含 `RESTORE_CONFLICT`，供前端进入只读冲突态

最小失败语义：

- `400`：`INVALID_REQUEST`、`INVALID_URL`；两者都必须返回 `scope = stage3_field` 与 `context.field = currentLinkInput`
- `429`：`RATE_LIMITED`；必须返回 `scope = global`；可返回 `retryable = true`
- `422`：`INVALID_LONG_URL`、`SHORT_URL_NOT_FOUND`；两者都必须返回 `scope = stage3_field` 与 `context.field = currentLinkInput`
- `503`：`SUBCONVERTER_UNAVAILABLE`、`SHORT_LINK_STORE_UNAVAILABLE`；两者都必须返回 `scope = global`；如需显式标记可重试，可返回 `retryable = true`
- `500`：`INTERNAL_ERROR`；必须返回 `scope = global`

### 8. `GET /sub/<id>`

用途：供 Mihomo 客户端拉取 YAML。

规则：

- YAML 渲染规则见 [04-business-rules](04-business-rules.md)
- 本接口执行的 Pipeline 步骤见 [04 §1.1.1](04-business-rules.md)：完整 Pipeline 至 `postProcess`；即时渲染 `completeConfig`
- 仅即时生成 YAML，暂不提供 YAML 缓存
- 外部契约始终等价于“短链接是长链接的别名”
- 本入口只接受短链路径参数与可选 `download=1`；不接受状态覆写或透传 query
- 成功 `200`：正文为 UTF-8 YAML；`Content-Type: text/yaml; charset=utf-8`；`Cache-Control: private, no-store`（或 `no-cache, no-store, must-revalidate`）；`Content-Disposition` 默认 `inline; filename="<id>.yaml"`；存在查询参数 `download=1` 时改为 `attachment`（文件名规则不变）
- 失败：正文为 JSON，`Content-Type: application/json; charset=utf-8`，结构同本文「消息与错误模型」；`400` `INVALID_REQUEST`；`429` `RATE_LIMITED`；`422` `SHORT_URL_NOT_FOUND`；`503` `SUBCONVERTER_UNAVAILABLE` 或 `SHORT_LINK_STORE_UNAVAILABLE`；`500` `RENDER_FAILED`（解码成功、依赖可用，但 YAML 渲染管线因内部原因失败）或 `INTERNAL_ERROR`；均为 `scope = global`；`429` 与 `503` 可返回 `retryable = true`

### 9. `GET /sub?...`

用途：长链接对应的订阅资源地址；访问时返回 YAML。

规则：

- 路径固定为 `GET /sub`
- `data` 必须可逆编码 `stage1Input` 与 `stage2Snapshot`
- 长链接编码必须 URL-safe 且具确定性；编码规范见下文“长链接编码规范”
- YAML 渲染规则见 [04-business-rules](04-business-rules.md)
- 本接口执行的 Pipeline 步骤见 [04 §1.1.1](04-business-rules.md)：完整 Pipeline 至 `postProcess`；即时渲染 `completeConfig`
- 服务端仅即时生成 YAML，暂不提供 YAML 缓存
- 其外部契约与短链接一致，差别仅在于长链接直接携带完整快照
- 除 `data` 与可选 `download=1` 外，不接受任何其他 query；否则必须返回 `INVALID_LONG_URL`
- HTTP 成功与失败协定同上一节；成功时默认 `Content-Disposition` 的 `filename` 为 `subscription.yaml`
- 增量失败语义（下表以「解码管线」指 `query parse → data(base64url → gunzip → JSON parse) → schema 结构校验 → 输入上限校验`）：
  - `400` `INVALID_REQUEST`：`data` 参数缺失
  - `429` `RATE_LIMITED`：命中服务端读接口限速；`scope = global`
  - `422` `INVALID_LONG_URL`：解码管线任一步骤失败；`scope = global`
  - `500` `RENDER_FAILED`：解码成功、依赖可用，但 YAML 渲染管线因内部原因失败；`scope = global`

---

## 长链接编码规范

### 1. 权威边界

- 规范长链接路径固定为 `GET /sub`
- 规范短链接路径固定为 `GET /sub/<id>`
- 当前公开契约不保留 `/subscription*` 兼容路径
- 规范长链接只能由后端生成；前端不得自行构造、重写或“规范化” `longUrl`
- 前端只提交 `stage1Input` 与 `stage2Snapshot`，并消费后端返回的 `longUrl`
- 后端是唯一权威编码器，也是 `resolve-url` 与 `GET /sub?...` 的唯一权威解码器

### 2. 规范载荷

`data` 解码后的逻辑载荷必须是如下结构：

```json
{
  "v": 4,
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayItems": ["relay.example.com:1080"],
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": null,
      "config": "https://raw.githubusercontent.com/slackworker/Aethersailor-Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
      "include": ["TagA", "TagB"],
      "exclude": null
    }
  },
  "stage2Snapshot": {
    "rows": [
      {
        "rowId": "HK 01",
        "sourceLandingNodeName": "HK 01",
        "proxyName": "HK 01",
        "mode": "chain",
        "targetName": "🇭🇰 香港节点"
      }
    ],
    "chainProxyTargetGroupSwitchOptimizationEnabled": true,
    "serverAggregationGroups": [
      {
        "server": "landing.example.com",
        "groupName": "HK 手动分组",
        "enabled": true,
        "strategy": "fallback",
        "memberRowIds": ["HK 01", "HK 02"]
      }
    ]
  }
}
```

规则：

- `v` 是长链接编码版本字段；当前 hard-break 版本固定 `v = 4`；不接受 `v = 1/2/3` 或缺失 `v` 的兼容解码
- 当前版本的规范长链接只编码 `stage1Input` 与 `stage2Snapshot`；其中 `stage1Input.advancedOptions.config` 必须是本次快照使用的具体模板 URL
- `stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled` 属于规范长链接状态的一部分
- `enablePortForward` 不进入规范长链接；若 `data` 解码后的 payload 仍含该字段，必须视为无效长链接
- 解码时若 `v` 缺失、不是整数、或不等于 `4`，必须视为无效长链接

### 3. query 约束（hard-break）

规范长链接由后端生成时，查询参数只包含 `data`。解析端在订阅读取、`resolve-url` 与 `short-links` 校验时必须遵循以下规则：

- `download=1` 仅是消费侧的下载辅助参数，不属于状态载荷；出现在 `resolve-url` 与 `short-links` 输入时也必须被忽略而非写回状态
- `resolve-url` 与 `short-links` 请求中，只允许 `data` 与可选 `download=1`
- `GET /sub?...` 请求中，只允许 `data` 与可选 `download=1`；出现其他 query 必须返回 `INVALID_LONG_URL`
- 后端重编码规范长链接时只保留 `data`

### 4. 规范编码算法

编码步骤固定为：

1. 将逻辑载荷按当前版本结构组装为 JSON 对象
2. 将该对象序列化为 UTF-8 的规范化 JSON
3. 将规范化 JSON 字节做 gzip 压缩
4. 将压缩结果做 base64url 编码，且不带 `=` padding
5. 作为 `data` 查询参数拼接到 `GET /sub?data=...`

规范化 JSON 规则：

- 对象键必须按字典序递归排序
- 数组元素顺序按各数组的语义顺序保留；其中 `stage2Snapshot.rows[]` 的 presentation order（见 [04 §2.1.3](04-business-rules.md)）必须在长链接编码中保留
- JSON 文本不得包含额外空白
- 布尔值、`null`、数字与字符串必须使用标准 JSON 表示
- 当前版本的规范编码输出中，不得包含 schema 未定义字段

gzip 规则：

- 必须使用 gzip 格式
- 为保证同一份快照得到完全相同的 `longUrl`，gzip header 中会影响字节稳定性的时间戳字段必须固定为 `0`

### 5. 解码与错误处理

- 后端解码长链接时，必须执行 `query parse -> data(base64url -> gunzip -> JSON parse) -> schema 结构校验 -> 输入上限校验`
- 解码管线包含以下步骤：query 解析、`data` 的 `base64url` 解码、`gunzip` 解压、JSON parse、schema 结构校验、输入上限校验；任一步骤失败都必须返回 `INVALID_LONG_URL`
- `INVALID_LONG_URL` 的覆盖范围严格限定于解码管线失败；解码成功后的业务处理（包括 subconverter 调用、YAML 渲染）不属于 `INVALID_LONG_URL` 语义范畴
- `POST /api/resolve-url` 与 `POST /api/short-links` 对解码管线失败须一致返回 `INVALID_LONG_URL`

### 6. 长度约束

- 单条规范化 `longUrl` 的总长度必须受限
- 当前公开预算默认上限为 `8192` bytes，并通过 `GET /api/runtime-config.maxPublicLongURLLength` 对前端显式暴露
- 阶段 1 输入边界与公开 `longUrl` 预算必须分别调节：阶段 1 边界以 `GET /sub` 的完整请求 URI 预算为准，公开 `longUrl` 预算只约束主展示结果，不直接决定转换是否可继续
- 当前编码固定写出 `v = 4`；若 canonical `longUrl` 长度超过公开预算，前端必须自动切换为短链接展示，而不是把该状态视为生成失败
- `POST /api/short-links` 与 `POST /api/resolve-url` 在解码已成功的前提下，不再因公开 `longUrl` 预算而失败；它们必须允许内部 canonical `longUrl` 超过公开预算，只要状态本身仍在当前阶段 1 输入边界内

---

## 长短链接语义

- 本节只定义长链接与短链接的关系、索引与存储语义；编码结构、query 约束与错误处理见上一节“长链接编码规范”
- 长链接是唯一规范化状态源：编码 `stage1Input` 与 `stage2Snapshot`，可逆、URL-safe、具确定性，并显式固定 `v = 4`
- 长链接恢复页面状态后的后续操作权限，必须以后端 `resolve-url` 返回的 `restoreStatus` 为准
- 长链接本身也是订阅资源地址；公开路径固定为 `/sub?...`
- 短链接是长链接的不透明别名，不单独承载状态源语义；公开路径固定为 `/sub/<id>`，不带 `.yaml` 后缀
- 短链接 ID 必须由**规范状态键**通过确定性算法生成；规范状态键由规范化状态载荷唯一导出，等价于与公开基地址无关的 canonical data key；同一份规范状态必须得到同一个 `<id>`
- 短链 `canonicalStateKey` **必须保留** `rows[]` presentation order；仅做字段 trim/归一化，**不得**对 `rows[]` 重排序；长链接 `data` 编码亦必须保留 presentation order（见 [04 §2.1.2a / §2.1.3](04-business-rules.md)）
- 当前默认短链接 ID 生成算法为：对规范状态键计算 `SHA-256`，取前 `64` bit，并以 base62 编码输出；输出长度因此为 `1-11` 个 ASCII 字符
- 规范状态键不得包含 `USER_FACING_BASE_URL`、请求来源 host、scheme 或 base path 等发布入口信息；这些信息只能影响返回给用户的 `longUrl` / `shortUrl` 前缀，不得影响 `<id>`
- 短链接索引在逻辑上是 `canonicalStateKey ↔ shortId` 的双射子集，并额外维护 `shortId -> longUrl` 的当前反查值：除淘汰导致的失效外，同一 `canonicalStateKey` 不得对应多个并存的可解析 `shortId`。并发创建路径上须以 **`canonicalStateKey` 唯一约束**，或等价的事务/锁与冲突处理（例如唯一冲突后回读已有行并返回）保证；仅依赖非原子「先查后写」而未处理冲突的实现不符合本契约；不能仅凭确定性 ID 算法而假定该性质成立
- 在当前默认 `64` bit 设计下，允许仅实现极简碰撞防御：若检测到 `shortId` 已被另一条 `canonicalStateKey` 占用，后端必须 fail closed，并保持「一短一状态」映射关系
- 后端必须持久化维护有限容量的 `shortId -> longUrl` 反查索引，用于将短链接还原为可解码的 `longUrl`；该 `longUrl` 可随当前发布基地址变化而更新，但其对应的规范状态不得变化
- 短链接索引的默认持久化实现使用本地 SQLite 文件
- 短链接索引记录至少包含 `canonicalStateKey`、`shortId`、`longUrl` 与 `lastAccessedAt`
- 短链接索引容量必须可配置；早期原型默认上限为 `1000` 条记录
- 单条 `longUrl` 存储长度必须可配置；当前默认上限为 `8192` bytes
- 设计目标支持约 `100` 到 `100000` 条记录、约 `100KB` 到 `100MB` 存储规模
- `POST /api/short-links` 命中既有 `canonicalStateKey` 时，必须返回与既有记录相同 `<id>` 的 `shortUrl`；其前缀按当前发布基地址构造，并刷新其 `lastAccessedAt`
- 短链接被后端成功解析时，必须刷新其 `lastAccessedAt`
- 短链接索引存在容量上限；达到上限后创建新的不同 `longUrl` 映射时，必须淘汰 `lastAccessedAt` 最早的一条记录，再写入新记录
- 当部署将容量从较大值下调到较小值时，运行时可短暂出现 `used > capacity` 的超容状态；该状态必须通过 runtime-status 原样暴露，供前端显示为告警/错误
- 容量下调后的超容数据不要求在启动阶段立即裁剪；在首次写路径触发时（包括命中既有 `canonicalStateKey` 的幂等写），后端必须按 LRU 一次性裁剪至可写状态并完成本次写入
- 对“首次新增写入”场景，裁剪后再写入的结果必须满足写后 `used == capacity`；对“首次幂等写”场景，裁剪后并刷新命中记录，结果同样必须满足 `used == capacity`
- 在首次写路径触发前，仅解析短链接（读路径）不得触发容量裁剪
- 因淘汰而失去索引记录的短链接不再保证可解析
- 短链接与长链接在外部契约上都表现为“可直接消费的订阅链接”
