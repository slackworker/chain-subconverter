# 03 - 后端 API 契约

> 本章定义接口字段与响应结构。转换并自动填充、阶段 2 初始化、生成前校验与改写的业务语义见 [04-business-rules](04-business-rules.md)。

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

用途：接收阶段 1 输入，调用 `subconverter`，并返回本次转换得到的 `completeConfig` 与 `stage2Init`。

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

- 本接口返回的 `completeConfig` 只用于本次阶段 2 初始化语义，不要求前端在阶段 3 回传
- 多条完全一致的落地 URI 不得被静默去重
- 名称冲突必须在后端稳定消歧，不得交给前端猜测

### 2. `POST /api/generate`

用途：接收阶段 1 快照、阶段 2 快照与短链接开关，完成最终校验并返回可消费的长链接与可选短链接。

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

接口约束：

- 请求体不包含 `completeConfig`
- 生成前校验与改写规则统一见 [04-business-rules](04-business-rules.md)
- 本接口不返回 YAML 文本；YAML 在订阅链接被访问时交付

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

- `restoreStatus` 只能是 `replayable` 或 `conflicted`
- 传入长链接时，先解码 `stage1Input` 与 `stage2Snapshot`
- 传入短链接时，先解析为长链接，再解码同一份快照
- 解码后，后端必须基于恢复出的 `stage1Input` 重新执行一次阶段 1 转换，并按 [04-business-rules](04-business-rules.md) 中“恢复链接时的可重放性判定”给出 `restoreStatus`
- `restoreStatus = replayable` 表示该恢复快照可直接继续编辑和继续生成
- `restoreStatus = conflicted` 表示该恢复快照只能用于页面展示恢复，不能直接继续编辑和继续生成
- `restoreStatus = conflicted` 时，仍必须返回原始 `stage1Input` 与 `stage2Snapshot`
- `restoreStatus = conflicted` 时，`messages[]` 必须包含冲突提示，供前端进入只读冲突态

### 4. `GET /subscription/<id>.yaml`

用途：供 Mihomo 客户端拉取 YAML。

规则：

- 短链接必须稳定映射到某个长链接
- 仅即时生成 YAML，暂不提供 YAML 缓存
- 外部契约始终等价于“短链接是长链接的别名”

### 5. `GET /subscription?data=...`

用途：长链接对应的订阅资源地址；访问时返回 YAML。

规则：

- `data` 必须可逆编码 `stage1Input` 与 `stage2Snapshot`
- 服务端仅即时生成 YAML，暂不提供 YAML 缓存
- 其外部契约与短链接一致，差别仅在于长链接直接携带完整快照

---

## 长短链接语义

- 长链接必须编码 `stage1Input` 和 `stage2Snapshot`
- 长链接必须可逆，能恢复页面状态
- 长链接恢复页面状态后的后续操作权限，必须以后端 `resolve-url` 返回的 `restoreStatus` 为准
- 长链接本身也是订阅资源地址
- 短链接只是不透明别名，不是另一套状态源
- 短链接与长链接在外部契约上都表现为“可直接消费的订阅链接”

