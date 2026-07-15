# 06 - Stage2 数据模型（权威）

> Stage2 **唯一事实源**：嵌套树 schema、Client/Wire 分层、顺序域、v5 载荷、merge/reset/resolve、错误 scope。  
> 他处（01–05）仅摘要并链接本文；不得平行维护旧 `rows[]` / `rowId` / `serverAggregationGroups[]` 权威描述。

---

## 0. 范式摘要

- **权威形状**：`servers[] → sources[] → instances[]`（Server ⊃ Source ⊃ Instance）
- **UI 平铺**：仅为对树的 DFS 投影；不得用 UI 形态反推存储
- **source**：分组容器，无独立 `mode` / `targetName`
- **instance**：唯一可编辑配置行；每个 `sourceId` 至少保留 1 个 instance
- **Client/Wire 分层**：前端编辑态可有本地 ID；API / v5 只传业务字段与 `proxyName`
- **聚合 UI 开关**：只影响展示；关闭时草稿仅存前端临时 store，**不进请求体 / payload / shortId**
- **编辑方式**：前端本地改 snapshot，一次性 `generate`；无 `apply-ops`
- **破坏性升级**：拒绝入站旧字段 `instanceId`、`memberInstanceIds`、`memberLocalInstanceIds`
- **废弃**：`POST /api/stage2/reset`、会话/编码双语义 `rowId`、平铺 `rows[]` + 外挂 `serverAggregationGroups[]`、平行 `presentationOrder`

---

## 1. 术语表

| 术语 | 定义 |
|------|------|
| `sourceId` | Pass 1 落地身份（原 `sourceLandingNodeName` / `proxy.name`）；只读；绑定连接参数 |
| `serverKey` | 落地 server 稳定键（discovery `server`，空则 `source:{sourceId}`）；只读；位于 server 父节点 |
| `instance` | 某 source 下的派生配置行；可编辑 `proxyName` / `mode` / `targetName` |
| `instanceId`（Client only） | 前端编辑期本地 ID：`trim(sourceId) + "::i" + N`（N 从 1 起）；**不进** API / v5 |
| `memberLocalInstanceIds`（Client only） | 前端聚合成员本地引用数组，值为 `sourceId::iN`；仅 UI/编辑态使用 |
| `proxyName` | 最终 YAML `proxies[].name`；全表唯一；可改名 |
| `memberProxyNames`（Wire） | API / v5 聚合成员字段，值为 `proxyName[]` |
| `groupName` | server 层唯一用户可改展示/YAML 聚合组名 |
| `catalog` | 只读元数据树（同构嵌套，无 aggregation / instances） |
| `snapshot` | 用户配置真相或默认树（含 aggregation + instances） |
| `stage2` / `Stage2Bundle` | API 外壳 `{ catalog, snapshot }`（端点按需带齐） |

---

## 2. API 外壳 `Stage2Bundle`

```json
{
  "stage2": {
    "catalog": { "...": "只读，每次 convert/resolve 重算" },
    "snapshot": { "...": "用户配置真相或默认树（Wire 形状）" }
  }
}
```

| 端点 | 请求 snapshot | 响应 snapshot | catalog |
|------|---------------|---------------|---------|
| `POST /api/stage1/convert` | **不带**（仅 `stage1Input`） | **默认树（Wire）** | 必返 |
| `POST /api/generate` | **必填**（`stage2.snapshot`，Wire） | **不回传** | 后端重算校验，不回传 |
| `POST /api/resolve-url` | **不带**（仅 `url`） | **解码后树（Wire）** | 建议返回 |

- **convert**：返回 `catalog` + 默认 `snapshot`；reconvert 时前端本地 merge，**不**把旧 snapshot 传给后端
- **resolve**：恢复后返回 Wire snapshot；是否补全 Client `instanceId` 由前端本地 hydrate 决定
- **全局 reset**：无独立 API；再调 convert，用返回的默认 `snapshot` **整份覆盖**（跳过 merge）
- **局部 reset**：纯前端；按 `sourceId` 取 catalog `default*` 覆盖目标 instance
- **废弃**：`POST /api/stage2/reset`（路由、handler、实现均删除）

---

## 3. `catalog`（只读元数据）

与 snapshot **同构嵌套**，不含 aggregation / instances：

```typescript
interface Stage2Catalog {
  availableModes: Mode[];
  chainTargets: ChainTarget[];
  forwardRelays: ForwardRelay[];
  servers: Array<{
    serverKey: string;
    sources: Array<{
      sourceId: string;
      landingNodeType: string;
      restrictedModes?: Partial<Record<Mode, ModeReason>>;
      modeWarnings?: Partial<Record<Mode, ModeReason>>;
      defaultProxyName: string;
      defaultMode: Mode;
      defaultTargetName: string | null;
    }>;
  }>;
}
```

约束：

- `availableModes` / `chainTargets` / `forwardRelays` 的收集与模式规则仍见 [04 §2.2–2.6](04-business-rules.md)
- 局部 reset / join：按 `sourceId` 在树中定位，取该源 `defaultProxyName` / `defaultMode` / `defaultTargetName`
- source **不**冗余携带 `serverKey`（归属由父节点表达）
- `serverKey`：优先 Pass 1 discovery 的 `server`；缺失时用 `source:{sourceId}`

---

## 4. `snapshot`（用户配置树）

### 4.1 Wire 形状（API / v5 / 存储传输）

```typescript
interface Stage2SnapshotWire {
  chainProxyTargetGroupSwitchOptimizationEnabled?: boolean;
  servers: Array<{
    serverKey: string;
    aggregation:
      | { enabled: false }
      | {
          enabled: true;
          groupName?: string;
          strategy: AggregationStrategy; // fallback | url-test | select | load-balance
          memberProxyNames: string[];
        };
    sources: Array<{
      sourceId: string;
      instances: Array<{
        proxyName: string;
        mode: Mode;
        targetName: string | null;
      }>; // length >= 1
    }>;
  }>;
}
```

### 4.2 Client 形状（前端本地编辑态）

```typescript
interface Stage2SnapshotClient extends Stage2SnapshotWire {
  servers: Array<{
    serverKey: string;
    aggregation:
      | { enabled: false }
      | {
          enabled: true;
          groupName?: string;
          strategy: AggregationStrategy;
          memberLocalInstanceIds: string[]; // sourceId::iN
        };
    sources: Array<{
      sourceId: string;
      instances: Array<{
        instanceId: string; // sourceId::iN
        proxyName: string;
        mode: Mode;
        targetName: string | null;
      }>;
    }>;
  }>;
}
```

### 4.3 默认 snapshot（Wire）

由 catalog 生成：每个 catalog 源下恰好 1 个默认 instance：

- `proxyName = defaultProxyName`
- `mode = defaultMode`
- `targetName = defaultTargetName`
- 每个 server：`aggregation.enabled = false`（请求体侧仅 `{ enabled: false }`，见 §8）
- `chainProxyTargetGroupSwitchOptimizationEnabled = false`

### 4.4 字段约束

- 每个当前落地 `sourceId` 至少 1 个 instance；不得引用未知 `sourceId`
- `proxyName` 全表唯一（trim 后）
- `mode ∈ { none, chain, port_forward }`
- `mode = none` ⇒ `targetName` 为空/`null`
- `mode = chain` ⇒ `targetName` ∈ `chainTargets[].name`
- `mode = port_forward` ⇒ `targetName` ∈ `forwardRelays[].name`，且全表不可重复占用同一 relay
- `memberProxyNames`（Wire）**必须全部落在该 server 子树内**；跨 server 引用阻断
- `memberLocalInstanceIds`（Client）仅允许引用本地同 server 子树内实例
- `groupName` 只命名聚合组，不改变任何 instance 的 `proxyName` / `sourceId`
- 渲染出的聚合组是最终 YAML 产物，不回流 `catalog.chainTargets`，也不作为 `targetName` 候选
- 入站 payload 若出现 `instanceId`、`memberInstanceIds`、`memberLocalInstanceIds`，必须返回 `INVALID_REQUEST`

---

## 5. 前端本地 `instanceId`（ordinal）

```
instanceId = trim(sourceId) + "::i" + N
```

- 仅前端本地使用；后端与 v5 线格式不持久化该字段
- 同一 `sourceId` 下按 `instances[]` 当前顺序分配 `i1..iN`
- clone 时分配 `maxOrdinal + 1`；删除可留空号；restore/convert hydrate 可重新压紧为 `i1..iN`
- 改名 `proxyName` **不**触发 `instanceId` 变化；不再存在改名级联 ID 语义

---

## 6. 顺序域（嵌套数组即权威）

| 顺序 | 承载 | 影响 |
|------|------|------|
| Server 块序 | `servers[]` 下标 | 聚合树 server 块、v5、平铺 DFS 大段序 |
| Source 序 | `servers[].sources[]` 下标 | 同 server 内源分组顺序 |
| Instance 序 | `sources[].instances[]` 下标 | 副本序、平铺行序、托管 landing 写出序 |
| 聚合成员集合（Client） | `memberLocalInstanceIds` 的**集合** | 哪些 instance 入组；`enabled=false` 时不校验、不编码 |
| 聚合成员集合（Wire） | `memberProxyNames` 的**集合** | API / v5 入组成员语义 |
| 聚合成员序（fallback） | `memberLocalInstanceIds` / `memberProxyNames` 数组顺序 | YAML `fallback` failover 序 |
| 界面行展示序 | 嵌套下标 DFS | 平铺/聚合树所见行序；非 fallback 编码时成员写出序以此为准 |

**编码成员序**：

| 条件 | 成员集合 | 成员顺序来源 |
|------|----------|--------------|
| `enabled=false` | **不编码**（strip `groupName`/`strategy`/`member*`） | — |
| `enabled=true` 且 `strategy=fallback` | 编码 `memberProxyNames[]` | 前端顺序面板顺序（由 `memberLocalInstanceIds` 映射） |
| `enabled=true` 且非 `fallback` | 编码 `memberProxyNames[]` | 对该 server 子树 DFS，筛已入组成员按首次出现序（**不是** `proxyName` 字典序，也**不是**顺序面板拖拽序） |

废除：平行 `presentationOrder`、`rows[]` / `memberRowIds[]` / server 首次出现的三顺序域旧描述。

---

## 7. statePayload v5

- `longURLSchemaVersion = 5`
- **拒绝 v4**（及更旧版本）→ `INVALID_REQUEST` / `INVALID_LONG_URL`
- 载荷存**编码态树**（可见字段 + 嵌套数组序）
- 编码态 `instances[]` 不得包含 `instanceId`
- 编码态聚合成员仅 `memberProxyNames[]`（不允许 `memberInstanceIds` / `memberLocalInstanceIds`）

**语义等价**：同 `stage1Input` + 同树结构/各层数组序/各 instance `(sourceId, proxyName, mode, targetName)` + 各 server 聚合在 canonicalize 后的可见字段 → 同 `data` / `shortId`。

**规范化（编码前）**：

1. trim 字符串；空 `groupName` 归一化
2. `enabled=true && fallback`：`memberProxyNames[]` 按前端面板顺序
3. `enabled=true && 非 fallback`：按 server 子树 DFS 展示序重排已入组成员
4. `enabled=false`：strip 至仅 `{ "enabled": false }`（**server 节点与 instances 子树仍保留**）
5. 防御性拒绝旧字段：`instanceId` / `memberInstanceIds` / `memberLocalInstanceIds`

短链 `canonicalStateKey` 使用同一规范化结果。

---

## 8. 关聚合时数据分层

「关闭聚合仍保留 aggregation」**仅指前端临时草稿**，绝不进入请求体 / payload / shortId。

| 层 | `enabled=false` 时行为 |
|----|------------------------|
| 前端临时草稿（`aggregationDraftsByServerKey`，与 snapshot 分离） | 保留完整草稿（`groupName` / `strategy` / `memberLocalInstanceIds`） |
| 发往后端的 snapshot（Wire） | **只含** `{ enabled: false }`；不得带草稿字段 |
| 编码 canonicalize | 防御性 strip 至仅 `enabled: false` |
| YAML 渲染 | 不写聚合策略组 |
| resolve-url 恢复 | 只有 `enabled: false`，无草稿；再开聚合从默认空配置开始 |

补充：

- 关聚合或提交 `generate` 前：前端把对应 server 的 `aggregation` 规范为仅 `enabled: false`，草稿只写临时 store
- 后端对 `enabled=false` 入站：多余字段视为非法或一律 strip 后校验；**不以跳过校验接受草稿**
- 开聚合：有草稿则写回；否则默认空配置

---

## 9. 前端本地操作

| 操作 | 规则 |
|------|------|
| hydrate 实例 ID | convert/resolve/reconvert 后，按每个 `sourceId` 下 `instances[]` 顺序分配 `i1..iN` |
| 复制实例 | 同 `sourceId` 下追加；`proxyName` 派生 `基名 2/3…`；`instanceId` 分配 `maxOrdinal+1` |
| 删除实例 | 禁止删除某 `sourceId` 的最后一个 instance |
| 改名 | 仅改 `proxyName`；`instanceId` / `memberLocalInstanceIds` 不级联变更 |
| 关聚合 UI | 隐藏 server row；当前 aggregation 挪入草稿；snapshot 写回 `{ enabled: false }` |
| reconvert merge | convert 成功后按 `sourceId` 匹配保留 instances；按新 catalog 的 server 归属挂载；新源追加默认 instance；失效源剔除并提示；**不**把旧 snapshot 发给 convert；merge 后重新 hydrate |
| 全局 reset | 再调 convert；默认 snapshot **整份覆盖**（跳过 merge）；同时替换 catalog；清空聚合草稿 |
| 局部 reset | catalog 同 `sourceId` 的 `default*` 覆盖目标 instance（Client 侧随后 hydrate） |

### 9.1 UI 映射

- **聚合开**：DFS —— server row → source 导轨 → instance 行
- **聚合关**：同一棵树 DFS，**只渲染 instance 行**（跳过/弱化 server 与 source 导轨）；数据结构不变

---

## 10. 错误 scope

| scope | 用途 | context |
|-------|------|---------|
| `stage2_instance` | instance 级定位 | `sourceId` + `proxyName` 必填；列级加 `field` |
| `stage2_server` | server / 聚合级定位 | `serverKey` 必填；可选 `field` |
| ~~`stage2_row`~~ | **废弃** | 文档与实现同步替换为上两者 |

行集整体不匹配等仍可用 `scope = global`（如 `STAGE2_ROWSET_MISMATCH` 语义升级为源/实例集不匹配时仍可用原 code 或后续更名）。

`restoreConflicts[].reasonArgs` 对齐：`sourceId` / `proxyName` / `field` / `serverKey`。

---

## 11. 与 Pipeline / Pass 3 的衔接

- convert Pipeline 终点由 `buildStage2Init` 升级为 `buildStage2Bundle`（产出 catalog + 默认 snapshot）
- Pass 3 托管 landing：按树 DFS 展开全部 instances，用 `sourceId` 从 Pass 1 取连接参数，以 `proxyName` 写出
- 出组剔除集合：全部 Pass 1 `sourceId` ∪ 全部 snapshot `proxyName`
- 聚合组渲染：仅 `enabled=true` 的 server；成员与顺序按 §6；命名规则见 [04 §2.7 / §3.3.2](04-business-rules.md)（字段改为 `servers[].aggregation`）
- 切换优化：仍由 `chainProxyTargetGroupSwitchOptimizationEnabled` 全局开关控制；作用对象为 `mode=chain` 且目标为 `kind=proxy-groups` 的 **instances**

---

## 12. 废除概念清单

- `rowId`（会话/编码双语义）
- `isStage2SourceRow`（`rowId === sourceLandingNodeName`）；现行口径为 `isStage2DefaultInstance`（`instanceIndex === 0`）
- `CanonicalizeStage2SnapshotForLinkEncoding` 的 ID 重映射（逻辑并入 v5 normalize）
- Wire 侧 `instanceId = sourceId::proxyName`
- Wire 侧 `memberInstanceIds[]`
- 平铺权威 `rows[]` + `serverAggregationGroups[]`
- 平行 `sources[]` + `servers[]` + `presentationOrder`
- `POST /api/stage2/reset` 及消息码 `STAGE2_RESET` / `STAGE2_ROW_RESET`（可保留历史日志兼容，新路径不再产出）

---

## 13. 交叉引用

- 概览术语：[01-overview](01-overview.md)
- 前端交互：[02-frontend-spec](02-frontend-spec.md) §阶段 2
- HTTP 契约：[03-backend-api](03-backend-api.md)
- Pipeline / 模式 / 渲染细则：[04-business-rules](04-business-rules.md)
- 类型与测试口径：[05-tech-stack](05-tech-stack.md)
