# 04 - API 与输出

## 一、API 设计（重构后规范：无状态优先）

| 端点 | 方法 | 说明 | 状态 |
|------|------|------|------|
| `/api/parse_config` | POST | 解析上传的 YAML 文件，返回结构化信息（完整配置? 节点列表等） | 计划 |
| `/api/validate_configuration` | POST | 校验输入并生成最终完整 Mihomo YAML（可选：生成订阅短链接） | 计划 |
| `/subscription/<id>.yaml` | GET | 通过短 ID 获取订阅 YAML（无 query；用于客户端周期拉取） | 计划 |

### 1.1 传参约定

- **统一**：所有业务接口统一使用 `POST` + **JSON body** 传参（不再使用 query 承载业务参数）
- **两份输入源**：Web App 的主交互是“中转信息输入 + 落地信息输入”，因此所有生成类接口都必须显式区分：
  - `transit_source`: 中转信息输入
  - `landing_source`: 落地信息输入
- **弃用**：旧版 query 形式（如 `remote_url=...`、`manual_pairs=...` 以及 `/subscription.yaml?...`）在重构后 **直接弃用**（不再支持）

**内置订阅转换（节点-only → 完整配置）**：

- 当任一输入源解析后**没有完整配置**，且最终无法选出“基准完整配置”时（见 02 的 1.5），服务端必须启用内置订阅转换服务生成完整配置（见 [02-prerequisites](02-prerequisites.md) 的 1.4）。
- **固定模板**：使用 [Custom_Clash.ini](https://github.com/Aethersailor/Custom_OpenClash_Rules/blob/main/cfg/Custom_Clash.ini)（远程拉取建议使用 raw：`https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/main/cfg/Custom_Clash.ini`），并支持远程拉取 + 本地缓存（失败时回退到本地缓存）。

### 1.2 输入源结构（`transit_source` / `landing_source`）

输入源使用结构化字段表达：

- `type`: `"remote_url" | "upload_yaml" | "nodes_only"`
- `remote_url`: 订阅或 YAML 地址（当 `type="remote_url"`；可能返回完整配置，也可能仅包含节点）
- `yaml`: YAML 字符串（当 `type="upload_yaml"`）
- `nodes`: 节点列表（当 `type="nodes_only"`；每项为 `ss://` / `vmess://` / `trojan://` 等 URI 字符串）

> 注意：端口转发的中转机 `server:port` 不属于 `nodes`，应使用单独字段 `forward_relays` 传入。

### 1.3 生成接口的关键业务字段（与四阶段主线一致）

`POST /api/validate_configuration` 必须包含：

- `transit_source` / `landing_source`：两份输入源
- `modification_mode`：用户指定修改方式（见 02「四、修改方式」）
  - `"chain"`：链式代理
  - `"port_forward"`：端口转发
  - `"chain_and_port_forward"`：同时启用
- `selected_landing_names[]`：用户确认的落地节点名称列表（必须提供，自动识别只能作为默认值）

条件必填字段：

- `base_config_preference`：当 **两份输入源都包含完整配置**时必填（见 02 的 1.5）
  - `"transit"`：以中转输入的完整配置为基准
  - `"landing"`：以落地输入的完整配置为基准
- `forward_relays[]`：当 `modification_mode` 包含端口转发时必填
  - 形态：`[{ "server": "relay.example.com", "port": 1080 }, ...]`

链式代理的中转候选选择（阶段 3 的 UI 选择结果）：

- `chain_dialer_membership`: 将“每个落地节点的 dialer 组成员”显式传入，避免后端猜测 UI 选择
  - 形态示例：
    - `{"Landing A": ["HK 01", "US 02"], "Landing B": ["SG 03"]}`
  - 约束：成员不得包含该落地节点自身（防递归）

### 1.4 无状态与订阅短链接（解决“参数越来越大 / URL 越来越长”）

- **目标**：服务实例本身不保存会话与中间态（可水平扩容）；当需要“可被客户端长期/周期拉取的订阅地址”时，使用 **短 ID** 而不是把参数塞进 URL。
- **做法**：
  - `POST /api/validate_configuration` 在生成 YAML 的同时，可选写入“短链接记录”，返回：
    - `subscription_id`：短 ID
    - `subscription_url`：`/subscription/<id>.yaml`
    - `expires_in`：有效期（秒，可选；本地部署也可不用 TTL，改用固定数量上限）
  - `GET /subscription/<id>.yaml` 通过 `subscription_id` 取回记录并返回 YAML
- **存储形态**：
  - **自用/本地部署（推荐）**：SQLite 本地文件存储，设置固定上限（如保留 10–20 份）；超出上限时淘汰最旧记录
  - **多实例部署**：Redis/KeyDB 等 KV 或对象存储（如需 TTL 可启用）
- **保存内容**（本地部署可选更简单的方式）：
  - **仅保存请求输入**：保存 `source`、`pairs`、选项与版本号；每次 `GET` 时重新拉取/重新生成
  - **保存完整 YAML（允许）**：保存生成后的整份 YAML（保留 10–20 份时占用通常可忽略），`GET` 直接返回，减少重复拉取与计算
- **配置建议**：
  - `SHORTLINK_ENABLED`：是否启用短链接能力（服务端总开关）
  - `SHORTLINK_STORE`：`sqlite` / `redis` / `object`
  - `SHORTLINK_MAX_ENTRIES`：本地保留条数上限（建议 10–20）
  - `SHORTLINK_TOKEN`（可选）：访问短链接时校验 token（防误暴露被访问）
- **注意**：`source.remote_url` 仍需 SSRF 防护，见 `docs/SSRF-Protection.md`。

---

## 二、输出方式

| 配置来源 | 输出形式 |
|----------|----------|
| 中转/落地输入为 URL 拉取 | `POST /api/validate_configuration` 返回 YAML（或 JSON 中的 YAML 字符串）；如需订阅链接则返回 `subscription_url`（短 ID） |
| 中转/落地输入含文件上传 | 先 `POST /api/parse_config`（可选，仅用于前端预览/选择），再 `POST /api/validate_configuration` 返回 YAML；如需订阅链接则返回 `subscription_url`（短 ID） |
| 任一输入为节点-only | `POST /api/validate_configuration` 必要时先走“内置订阅转换”生成基准完整配置，再返回 YAML；如需订阅链接则返回 `subscription_url`（短 ID） |

### 2.1 用户操作

- **复制**：将生成的 YAML 复制到剪贴板
- **下载**：下载 YAML 文件

---

## 三、Spec 与实现一致性

- 所有 API 行为须符合 [02-prerequisites](02-prerequisites.md) 与 [03-config-flow](03-config-flow.md)
- 新增输入形式（填表、代理链接解析等）需在 02 中补充，并在实现中对应
