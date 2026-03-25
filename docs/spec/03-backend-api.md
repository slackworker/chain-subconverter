# 03 - 后端 API 契约

> 本章定义接口字段与响应结构。转换并自动识别、阶段 2 初始化和配置改写的业务语义见 [04-business-rules](04-business-rules.md)。

---

## 设计原则

- 阶段 1 与阶段 3 分离：先转换并初始化阶段 2，再基于快照生成最终 YAML
- 阶段 2 初始化由后端完成，前端不解析 `completeConfig`
- 长链接是规范化快照；短链接只是长链接的后端别名
- 后端统一返回 `messages[]` 与 `blockingErrors[]`

---

## 通用数据模型

### 1. 阶段 1 输入快照

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

约束：

- `forwardRelayRawText` 在未开启端口转发时可为空字符串
- `advancedOptions` 只保留会影响转换和生成结果的字段

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
    "context": { "rowId": "row-2" }
  }
]
```

约束：

- `messages[]` 只承载 `info` 与 `warning`
- `blockingErrors[]` 非空时，本次请求视为失败

---

## API 端点

### 1. `POST /api/stage1/convert`

用途：接收阶段 1 输入，调用 `subconverter`，并返回 `completeConfig` 与 `stage2Init`。

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
      "code": "SUBCONVERTER_FAILED",
      "message": "subconverter 转换失败"
    }
  ]
}
```

补充规则：

- `completeConfig` 是阶段 2 和阶段 3 的唯一配置基础
- 多条完全一致的落地 URI 不得被静默去重
- 名称冲突必须在后端稳定消歧，不得交给前端猜测

### 2. `POST /api/generate`

用途：基于 `completeConfig` 对应的阶段 1 快照与阶段 2 快照生成最终 YAML，并返回长链接与可选短链接。

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

### 3. `POST /api/resolve-url`

用途：输入长链接或短链接，返回规范化长链接与页面恢复所需快照。

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

- 传入长链接时，直接解码快照
- 传入短链接时，先解析为长链接，再返回同一份快照

### 4. `GET /subscription/<id>.yaml`

用途：供 Mihomo 客户端拉取 YAML。

规则：

- 短链接必须稳定映射到某个长链接
- 可即时生成 YAML，也可返回缓存 YAML
- 外部契约始终等价于“短链接是长链接的别名”

---

## 长短链接语义

- 长链接必须编码 `stage1Input` 和 `stage2Snapshot`
- 长链接必须可逆，能恢复页面状态
- 短链接只是不透明别名，不是另一套状态源

---

## 与 `subconverter` 的边界

- `subconverter` 负责：基于阶段 1 输入生成 `completeConfig`
- 本项目额外负责：
  - 解析 `completeConfig`，生成 `stage2Init`
  - 维护阶段 1 与阶段 2 快照
  - 将链式代理选择写入 `dialer-proxy`
  - 将端口转发服务写回落地节点的 `server` 与 `port`
  - 提供长短链接解析与恢复能力
