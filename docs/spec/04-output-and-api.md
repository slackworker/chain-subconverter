# 04 - 输出与 API 契约

> 本章只描述对外接口与输出形态；业务规则分别引用：
>
> - 生成完整配置：见 [02-generate-complete-config](02-generate-complete-config.md)
> - 修改完整配置：见 [03-modify-config](03-modify-config.md)

## 输出

- **最终产物**：可直接供 Mihomo 使用的完整 YAML（通用配置 + 节点）。
- **交付形态**：
  - 直接返回 YAML（供复制/下载）
  - 可选：生成可供客户端周期拉取的订阅短链接（`/subscription/<id>.yaml`）

---

## API 设计原则

- **无状态优先**：生成接口尽量一次性返回 YAML；如需长期订阅地址，使用短 ID 而不是把参数塞进 URL。
- **统一 POST + JSON body**：所有业务参数统一放 JSON body；旧版 query 入参形式一律弃用。
- **解析与生成分离**：
  - `/api/parse_config`：用于前端预览/引导（检测“是否包含通用配置”、列出节点供用户勾选）
  - `/api/validate_configuration`：一次性完成：解析 → 生成完整配置（两条路径）→ 修改 → 输出

---

## 端点

### 1) `POST /api/parse_config`

用途：解析单份输入源，返回结构化信息，用于前端做引导与选择（尤其是：中转输入是否包含通用配置）。

请求（概念字段）：

- `source`: 一个输入源（见“输入源模型”）

响应（最低要求）：

- `general_config_present`: `boolean`（按 02 的“通用配置判定规则”）
- `nodes[]`: 解析得到的节点摘要列表（至少含 `name` 与 `type`；可选含 `server/port` 供 UI 展示）
- `errors[]`: 解析错误（可为空）
- `warnings[]`: 非致命告警（可为空）

### 2) `POST /api/validate_configuration`

用途：生成最终 YAML（可选：返回订阅短链接）。

请求（概念字段，后续实现可调整命名，但语义必须保持）：

#### A. 输入源（至少提供一份）

- `transit_source?`: 中转信息输入（可省略/为空）
- `landing_source?`: 落地信息输入（可省略/为空）
- 约束：`transit_source` 与 `landing_source` 不能同时为空

#### B. 生成完整配置的路径选择（与 02 对齐）

- `generation_mode`：
  - `"use_transit_general_config"`：使用用户中转输入中的通用配置（仅当检测到 `general_config_present=true` 时可用）
  - `"use_template_subconverter"`：使用模板 + subconverter 生成通用配置
- `template_source?`: 当 `generation_mode="use_template_subconverter"` 时必填（可用默认模板或用户自定义模板）
- `subconverter_params?`: 当 `generation_mode="use_template_subconverter"` 时可选（用于传递必要参数）

> 规则：若服务端检测到中转输入不包含通用配置，则必须强制走 `"use_template_subconverter"`（前端应在 UI 上引导，但后端也必须强校验）。

#### C. 修改方式与必要输入（与 03 对齐）

- `modification_mode`：
  - `"chain"`
  - `"port_forward"`
  - `"chain_and_port_forward"`
- `selected_landing_names[]`: 用户确认的落地节点名称列表（必填）

链式代理（当 `modification_mode` 包含 `chain`）：

- `chain_dialer_membership`: 每个落地节点对应的 dialer 成员（后端不应猜测 UI 选择），建议形态：
  - `{ "<LandingName>": { "type": "proxies", "proxies": ["TransitA", "TransitB"] } }`
  - 或 `{ "<LandingName>": { "type": "provider", "provider": "provider1" } }`

端口转发（当 `modification_mode` 包含 `port_forward`）：

- `forward_relays[]`: `[{ "id": "r1", "server": "relay.example.com", "port": 1080 }, ...]`
- `forward_mapping`: 用户的“转发映射”，建议支持两种形态其一：
  - **全局单 relay**：`{ "mode": "single", "relay_id": "r1" }`
  - **按落地节点分别指定**：`{ "mode": "by_landing", "mapping": { "<LandingA>": "r1", "<LandingB>": "r2" } }`

#### D. 输出选项（可选）

- `return_subscription`: `boolean`（是否生成短链接）
- `subscription_ttl_seconds?`: `number`（可选；实现可用“固定数量上限”替代 TTL）

响应（最低要求）：

- `yaml`: 最终 YAML 字符串
- `subscription_url?`: 当 `return_subscription=true` 时返回（如 `/subscription/<id>.yaml`）
- `warnings[]`
- `errors[]`（若有错误则应以失败响应返回，不应同时返回 YAML）

### 3) `GET /subscription/<id>.yaml`

用途：通过短 ID 获取 YAML，供客户端周期拉取。

> 存储策略（SQLite/Redis 等）属于实现细节，但必须保证“短链接可复现/可取回”的契约成立。

---

## 输入源模型

输入源（`transit_source` / `landing_source` / `/api/parse_config.source`）建议用可扩展的联合类型表达：

- `type: "remote_url"`：
  - `url: string`（订阅或 YAML 地址）
- `type: "upload_yaml"`：
  - `yaml: string`
- `type: "nodes_only"`：
  - `nodes: string[]`（每项为 `ss://` / `vmess://` / `trojan://` / `socks5://` 等 URI）
- `type: "socks5_form"`（落地输入常见）：
  - `nodes: [{ "name": string, "server": string, "port": number, "username"?: string, "password"?: string }]`
  - 约束：仅允许 SOCKS5

---

## 模板模型（Template）

`template_source` 建议支持：

- `type: "default"`：使用内置默认模板
- `type: "remote_url"`：
  - `url: string`
- `type: "upload_file"`：
  - `content: string`（模板内容；具体格式由实现决定）

---

## SSRF 与安全约束（最低要求）

- 当 `source.type="remote_url"` 或 `template_source.type="remote_url"` 时，必须做 SSRF 防护（策略见 `docs/SSRF-Protection.md`）。
