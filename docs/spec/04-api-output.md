# 04 - API 与输出

## 一、API 设计（重构后规范：无状态优先）

| 端点 | 方法 | 说明 | 状态 |
|------|------|------|------|
| `/api/auto_detect_pairs` | POST | 自动识别落地与前置节点对 | 计划 |
| `/api/validate_configuration` | POST | 校验输入并生成最终订阅 YAML（可选：生成订阅短链接） | 计划 |
| `/api/parse_config` | POST | 解析上传的 YAML 文件，返回 config 结构 | 计划 |
| `/subscription/<id>.yaml` | GET | 通过短 ID 获取订阅 YAML（无 query；用于客户端周期拉取） | 计划 |

### 1.1 传参约定

- **统一**：所有业务接口统一使用 `POST` + **JSON body** 传参（不再使用 query 承载业务参数）
- **输入源**：使用结构化字段表达，示例：
  - `source.type`: `"remote_url" | "upload_yaml" | "inline_yaml"`
  - `source.remote_url`: 订阅或 YAML 地址（当 `type="remote_url"`）
  - `source.yaml`: YAML 字符串（当 `type="inline_yaml"`，或上传后由前端读取填入）
- **节点对**：使用 JSON 结构表达，禁止使用 `landing:front,landing:front` 这类分隔符编码，避免节点名包含 `:` / `,` 时解析失败，例如：
  - `pairs`: `[{"landing":"<name>","front":"<name>"}, ...]`
- **弃用**：旧版 query 形式（如 `remote_url=...`、`manual_pairs=...` 以及 `/subscription.yaml?...`）在重构后 **直接弃用**（不再支持）

### 1.2 无状态与订阅短链接（解决“参数越来越大 / URL 越来越长”）

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
| URL 拉取 | `POST /api/validate_configuration` 返回 YAML（或 JSON 中的 YAML 字符串）；如需订阅链接则返回 `subscription_url`（短 ID） |
| 文件上传 | `POST /api/parse_config` 解析后再 `POST /api/validate_configuration` 返回 YAML；如需订阅链接则返回 `subscription_url`（短 ID） |

### 2.1 用户操作

- **复制**：将生成的 YAML 复制到剪贴板
- **下载**：下载 YAML 文件

---

## 三、Spec 与实现一致性

- 所有 API 行为须符合 [02-prerequisites](02-prerequisites.md) 与 [03-config-flow](03-config-flow.md)
- 新增输入形式（填表、代理链接解析等）需在 02 中补充，并在实现中对应
