# 04 - API 与输出

## 一、API 设计（现有与计划）

| 端点 | 方法 | 说明 | 状态 |
|------|------|------|------|
| `/api/validate_configuration` | POST | 验证配置并应用节点对 | 已实现 |
| `/api/auto_detect_pairs` | GET | 自动识别落地与前置节点对 | 已实现 |
| `/subscription.yaml` | GET | 生成订阅 YAML | 已实现 |
| `/api/parse_config` | POST | 解析上传/粘贴的 YAML，返回 config 结构 | 待实现 |

### 1.1 传参约定

- **URL 源**：`remote_url` 指定订阅或 YAML 地址
- **节点对**：当前为 `landing:front,landing:front`，节点名含 `:` 或 `,` 会解析失败
- **建议**：改用 base64(JSON) 或 structured query，避免特殊字符问题

---

## 二、输出方式

| 配置来源 | 输出形式 |
|----------|----------|
| URL 拉取 | 生成 `/subscription.yaml?remote_url=...&manual_pairs=...` 形式的订阅链接 |
| 文件上传 / 粘贴 | 生成可下载的 YAML 文件，或返回 JSON 中的 YAML 字符串 |

### 2.1 用户操作

- **复制**：将生成链接或配置复制到剪贴板
- **打开**：新标签打开订阅链接（仅 URL 源）
- **下载**：直接下载 YAML 文件

---

## 三、Spec 与实现一致性

- 所有 API 行为须符合 [02-prerequisites](02-prerequisites.md) 与 [03-config-flow](03-config-flow.md)
- 新增输入形式（填表、代理链接解析等）需在 02 中补充，并在实现中对应
