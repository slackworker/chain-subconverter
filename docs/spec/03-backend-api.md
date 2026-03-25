# 03 - 后端 API 契约

> 本章定义阶段 1 转换、阶段 3 生成、长短链接解析与消息模型。前端交互语义见 [02-frontend-spec](02-frontend-spec.md)。

---

## 设计原则

- 阶段 1 与阶段 3 分离：先转换并识别，再基于快照生成 YAML
- 长链接是规范化快照；短链接只是长链接的后端别名
- 阶段 3 生成必须可复现：只要拿到同一份长链接，就应能还原出相同的阶段 1 输入和阶段 2 配置快照
- 为减少字段重复，后端返回统一使用 `messages[]` 表达普通日志与 warning；阻断错误单独放在 `blockingErrors[]`

---

## 通用数据模型

### 1. 阶段 1 输入快照

长链接编码的最小状态必须覆盖以下内容：

```json
{
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayRawText": "...",
    "advancedOptions": {
      "client": "mihomo",
      "template": "default",
      "emoji": false,
      "udp": true,
      "skipCertVerify": false,
      "enablePortForward": false
    }
  }
}
```

说明：

- `forwardRelayRawText` 在未开启端口转发时可为空字符串
- `advancedOptions` 只保留能影响转换和生成结果的字段

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

- `landingNodeName` 必须在同一份快照中唯一
- `mode` 只能是 `none`、`chain`、`port_forward`
- `mode = none` 时，`targetName` 必须为空或 `null`

### 3. 阶段 1 产物

阶段 1 最小产物固定为：

```json
{
  "completeConfig": "string",
  "landingNodes": [
    { "name": "HK 01", "type": "ss" }
  ],
  "forwardRelays": [
    { "name": "relay-1", "server": "relay.example.com", "port": 1080 }
  ]
}
```

说明：

- `completeConfig` 为 subconverter 转换后的完整配置字符串
- `landingNodes[]` 是阶段 2 行模型的唯一数据来源
- `forwardRelays[]` 供 `mode = port_forward` 的第三列选择器使用
- 阶段 2 需要的策略组与节点候选可由 `completeConfig` 推导；是否额外返回派生字段属于实现优化，不改变最小契约

### 4. 消息与错误模型

`messages[]`：

```json
[
  {
    "level": "info",
    "code": "AUTO_MATCH_SUCCESS",
    "message": "已自动匹配香港策略组",
    "context": { "landingNodeName": "HK 01" }
  },
  {
    "level": "warning",
    "code": "MULTIPLE_REGION_GROUPS",
    "message": "匹配到多个区域策略组，请手动选择",
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
    "context": { "rowId": "row-2" }
  }
]
```

约束：

- `messages[]` 只承载 `info` 与 `warning`
- `blockingErrors[]` 非空时，本次请求视为失败
- 成功响应中允许存在 warning，但不得存在阻断错误

---

## API 端点

### 1. `POST /api/stage1/convert`

用途：接收阶段 1 输入，调用 subconverter，返回阶段 2 所需的最小产物。

请求：

```json
{
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayRawText": "...",
    "advancedOptions": {
      "client": "mihomo",
      "template": "default",
      "emoji": false,
      "udp": true,
      "skipCertVerify": false,
      "enablePortForward": true
    }
  }
}
```

成功响应：

```json
{
  "completeConfig": "string",
  "landingNodes": [
    { "name": "HK 01", "type": "ss" }
  ],
  "forwardRelays": [
    { "name": "relay-1", "server": "relay.example.com", "port": 1080 }
  ],
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
      "code": "SUBCONVERTER_FAILED",
      "message": "subconverter 转换失败"
    }
  ]
}
```

补充规则：

- 落地输入区中多条完全一致的 URI 不得在阶段 1 被静默去重
- 若这些 URI 解析后名称冲突，当前项目必须在阶段 1 产物层面完成稳定重命名，例如追加 ` 02`、` 03`
- 不应把该规则委托给前端运行时猜测，也不应依赖 subconverter 的通用重名处理副作用

### 2. `POST /api/generate`

用途：基于阶段 1 输入快照和阶段 2 配置快照生成最终 YAML，并返回长链接与可选短链接。

请求：

```json
{
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayRawText": "...",
    "advancedOptions": {
      "client": "mihomo",
      "template": "default",
      "emoji": false,
      "udp": true,
      "skipCertVerify": false,
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
  "createShortUrl": true
}
```

成功响应：

```json
{
  "yaml": "string",
  "longUrl": "https://example.com/subscription?data=...",
  "shortUrl": "https://example.com/subscription/abc123.yaml",
  "messages": [],
  "blockingErrors": []
}
```

失败响应：

```json
{
  "messages": [
    {
      "level": "warning",
      "code": "REALITY_CHAIN_UNSUPPORTED",
      "message": "vless-reality 不支持链式代理"
    }
  ],
  "blockingErrors": [
    {
      "code": "MISSING_TARGET",
      "message": "存在未完成配置的行"
    }
  ]
}
```

生成语义：

- `mode = none`：该落地节点保持原样
- `mode = chain`：将 `targetName` 直接写入该落地节点的 `dialer-proxy`
- `mode = port_forward`：将 `targetName` 对应的端口转发服务写入该落地节点的 `server` 与 `port`
- `vless-reality` 在 `mode = port_forward` 下允许直接修改原节点
- `vless-reality` 在 `mode = chain` 下视为不支持

### 3. `POST /api/resolve-url`

用途：输入长链接或短链接，返回规范化长链接与可用于回填页面的快照。

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
  "stage1Input": {
    "landingRawText": "...",
    "transitRawText": "...",
    "forwardRelayRawText": "...",
    "advancedOptions": {
      "client": "mihomo",
      "template": "default",
      "emoji": false,
      "udp": true,
      "skipCertVerify": false,
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

- 若传入的是长链接，直接解码其中的快照
- 若传入的是短链接，后端先解析出其绑定的长链接，再返回同一份快照
- 该接口只负责恢复快照，不直接返回 YAML

### 4. `GET /subscription/<id>.yaml`

用途：供 Mihomo 客户端拉取 YAML。

规则：

- 短链接必须能稳定解析到一份长链接
- 后端可选择“按短链接解析出长链接后即时生成 YAML”，也可返回已缓存的 YAML
- 无论采用哪种实现，外部契约都必须等价为“短链接是长链接的别名”

---

## 长短链接语义

### 长链接

- 必须编码阶段 1 输入快照和阶段 2 配置快照
- 必须是可逆的，能够反向恢复页面状态
- 应作为生成结果的规范化来源

### 短链接

- 是后端为长链接分配的稳定别名
- 前端不得把短链接视为独立于长链接的另一套状态来源
- 若需要回填页面，统一先将短链接解析为长链接，再解码快照

---

## 与当前 `subconverter` 的边界

- `subconverter` 负责把阶段 1 原始输入转换为完整配置
- 本项目额外负责：
  - 保存阶段 1 与阶段 2 快照
  - 将链式代理选择写入 `dialer-proxy`
  - 将端口转发服务写回落地节点的 `server` 与 `port`
  - 提供长短链接解析与恢复能力
  - 保证“完全相同 URI 的落地副本”在阶段 1 产物中拥有稳定唯一名称
