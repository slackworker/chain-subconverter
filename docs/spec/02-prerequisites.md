# 02 - 前置条件：输入模型与依赖项（完整配置 / 中转 / 落地 / 修改方式）

> **核心原则**：本项目最终输出必须是**可直接供 Mihomo 内核使用的完整 YAML 配置**：包含全局配置、节点、策略组、`rules`，并按用户指定的“修改方式”完成链式代理与/或端口转发。

## 依赖结构

输出**完整 Mihomo YAML 配置**必须具备：全局配置、节点与策略组（`proxies`、`proxy-groups` / `proxy-providers`）、`rules`。依赖项如下：

| 依赖项 | 必填/选填 | 说明 |
|--------|-----------|------|
| **1. 基准（完整）Mihomo 配置** | 必填（可生成） | 后续“合成/拼接/修改”的基础骨架，必须包含全局配置、策略组与 `rules`。可来自任一输入源；若两份输入源均未提供完整配置，则必须由内置订阅转换服务生成（见 1.4 与 1.5）。 |
| **2. 中转信息（前置节点 / Transit）** | 必填 | 用于链式代理（`dialer-proxy` 的候选前置节点），和/或端口转发的“中转机地址+端口”。可来自基准配置、也可由用户单独提供并被拼接进入输出。 |
| **3. 落地/出口信息（Landing / Egress）** | 必填 | 用户最终出口节点集合。可完全来自基准配置（用户在 UI 中勾选“当前配置已包含落地节点”并从中选择），也可由用户单独提供并被拼接进入输出；无论来源如何，必须由用户指定/确认“哪些节点是落地节点”。 |
| **4. 修改方式（Modification Mode）** | 必填 | 用户必须指定要做哪类修改：链式代理、端口转发、或两者同时。不同模式对节点协议有约束（见 3.4 与「四、修改方式」）。 |

---

## 一、基准（完整）Mihomo 配置（必填，但允许由内置订阅转换生成）

基准配置提供最终输出的配置骨架（全局配置、`proxy-groups`、`rules` 等），并作为后续所有合成与修改的基础。

### 1.1 输入形式

| 形式 | 说明 | 示例 |
|------|------|------|
| 机场订阅链接 | HTTP/HTTPS 订阅 URL，返回 base64 或 YAML | `https://example.com/sub?token=xxx` |
| YAML 配置 URL | 指向完整 Mihomo YAML 的 URL | `https://example.com/config.yaml` |
| YAML 配置文件 | 用户上传的本地 `.yaml` / `.yml` 文件 | 拖拽或选择文件 |
| 仅节点输入（无完整配置） | 仅包含节点信息（如多条 `ss://`/`vmess://` URI，或“只含节点的订阅内容”） | 粘贴节点列表 / 订阅解析后仅得到节点 |

### 1.2 “完整配置”判定标准（用于分流到内置订阅转换）

当解析得到的 YAML **同时满足**以下条件时，判定为“完整 Mihomo 配置”：

- 顶层存在 `rules`，且为非空列表
- 顶层存在 `proxy-groups`（允许为空但必须存在；若不存在则视为缺少策略组骨架）

否则视为“仅节点或不完整配置”，进入 1.4 的内置订阅转换流程（生成包含 `proxy-groups` 与 `rules` 的完整配置骨架）。

### 1.2.1 解析要求

- **订阅链接 / YAML URL**：通过 HTTP GET 拉取并解析内容；若为完整配置则作为修改基础；若仅解析得到节点（缺少 `rules` / `proxy-groups` 等关键结构）则按 1.4 处理。
- **YAML 文件**：直接解析 YAML，得到完整配置结构。
- **proxy-providers**：不需要解析其中的具体节点，只需在 `proxy-groups` 中保留 `use: [provider1]` 引用即可。

### 1.3 输出

- 得到**完整 YAML 配置文件**，作为修改基础。

### 1.4 仅节点输入时：内置订阅转换服务（生成完整 Mihomo 配置）

当系统检测到**只有节点**而没有完整配置（例如缺少 `rules` / `proxy-groups`），必须提示用户使用项目内置的**基础订阅转换服务**生成一份完整 Mihomo 配置，作为后续所有修改的基础。

- **固定模板**：转换固定使用模板 [Custom_Clash.ini](https://github.com/Aethersailor/Custom_OpenClash_Rules/blob/main/cfg/Custom_Clash.ini)（远程拉取建议使用 raw：`https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/main/cfg/Custom_Clash.ini`）。
- **模板拉取与缓存**：
  - 服务端应支持从远端拉取模板，并**缓存到本地**（供离线/失败时回退使用）
  - 后续请求优先使用本地缓存，同时允许按需触发远端刷新
- **转换产物**：输出一份包含全局配置、策略组、`rules` 的完整 Mihomo YAML，并将“仅节点输入”转换为 `proxies`/`proxy-providers` 可用的节点集合（具体承载形态由实现决定，但必须能被后续链式代理/端口转发逻辑引用）。

### 1.5 一份或两份输入源：基准配置选择规则（前端必须提示，API 必须显式传入）

Web App 场景下，用户**可以只提供一份信息**，也可以分别提供两份信息：

- **中转信息（第一个信息源）**：允许输入单个或多个 URL，或拖入配置文件（解析后可能是完整配置 / 节点-only）。
- **落地信息（第二个信息源）**：允许输入单个或多个代理协议 URI（固定为节点-only）。
- **端口转发中转机**（`server:port`）：此为特殊配置，由第三个地方额外勾选输入。

系统应先解析可用的输入源并判定“是否包含完整配置”。由于落地信息源仅支持代理协议 URI（必然不包含完整配置），基准配置的确定仅依赖于第一个信息源的解析结果：

| 中转输入解析结果 | 基准配置来源 | 说明 |
|---|---|---|
| 不包含完整配置 | **内置订阅转换生成** | 将所有输入源解析得到的**全部节点**合并为节点集合，使用固定模板生成完整配置骨架，再进入后续“拼接/修改”。 |
| 仅包含一份完整配置 | **使用该完整配置** | 将其作为基准配置。若存在落地节点输入，将其拼接进 `proxies`，再进入后续“拼接/修改”。 |
| 包含多份完整配置 | **必须由用户选择** | 当由于输入多份 URL 或文件导致解析出多份完整配置时，前端必须提示用户“请选择哪一份作为基准配置”。 |

---

## 二、中转节点（前置节点 / Transit Nodes）

中转节点用于为落地/出口节点提供前置代理（`dialer-proxy`），或作为端口转发模式下的“中转机”（仅 `server+port`）。

### 2.1 输入形式

| 形式 | 说明 | 示例 |
|------|------|------|
| 已包含在完整配置中 | 来自 `proxies` 或 `proxy-providers` | `proxies:` / `proxy-providers:` |
| 代理节点链接 | 标准代理协议 URI（作为中转节点） | `ss://...`、`vmess://...`、`trojan://...`、`SOCKS5://...` |
| 中转 server+port | 仅提供中转机地址与端口（端口转发中转机） | `relay.example.com:1080` |

### 2.2 解析要求

- **来自完整配置**：读取 `proxies` 节点名列表；若使用 `proxy-providers`，只保留 `proxy-groups` 中的 `use` 引用，不强制展开 provider 节点明细。
- **代理节点链接**：解析 URI 并转换为 Mihomo 节点格式（写入或合并到最终输出的 `proxies:`）。
- **server+port**：解析为 `{ server, port }` 列表，供端口转发逻辑替换落地节点的 `server` 与 `port`。

### 2.3 输出

- **链式代理候选集**：可被加入 `"<落地节点名称> dialer"` 的候选中转节点（来自 `proxies` 或 provider 引用的策略组成员）。
- **端口转发中转机列表**：`{ server, port }`（可多个）。

---

## 三、落地/出口节点 (Landing / Egress Nodes)

落地/出口节点是用户流量最终经由访问目标的节点。

### 3.1 输入形式

| 形式 | 说明 | 示例 |
|------|------|------|
| 代理节点链接 | 标准代理协议 URI | `ss://base64...`、`vless://...`、`SOCKS5://` |
| 填表模式 | 用户手动填写节点参数（仅支持 SOCKS5） | 见 3.2 |
| 已包含在完整配置中 | 从配置 YAML / 订阅中识别 | 自动关键字识别 或 用户手动指定 |

### 3.2 填表模式字段

填表模式**仅支持 SOCKS5** 协议，固定 6 个字段：

| 字段 | 说明 |
|------|------|
| 名称 | 对应 `name` |
| 类型 | SOCKS5（固定） |
| 服务器 | 域名或 IP |
| 端口 | 1–65535 |
| 用户名 | 可选 |
| 密码 | 可选 |

**示例**：`名称: my-socks5`，`服务器: target.example.com`，`端口: 1080`，`用户名: user`，`密码: pass`

### 3.3 已包含在完整配置中

- **自动识别**：按节点 `name` 匹配预设关键字（如 `落地`、`Landing`、`出口`、`exit`），可配置扩展
- **手动指定**：用户从解析出的节点列表中勾选/指定哪些为落地节点

### 3.4 输出与操作逻辑

- 所有落地节点均需转换为 Mihomo `proxies` 列表中的一项。
- **按落地节点类型区分**：
  - **ss / SOCKS5 节点**：**直接修改**原节点，增加 `dialer-proxy`（链式）或替换 `server`/`port`（端口转发），节点名改为 `原节点名 + 空格 + "链式"/"Chain"` 或 `"转发"/"Forward"`（根据原节点名是否含中文自动选择）。
  - **reality 节点**：**复制**出新节点再修改，原节点保留，新节点命名为 `原节点名 + 空格 + "转发"/"Forward"`，替换 `server`/`port`。
- **约束**：
  - **链式代理**的落地节点不允许 reality，仅支持 **ss / SOCKS5**
  - **端口转发**支持所有协议（只替换 `server`/`port`），其中 reality 必须走“复制新节点”策略
  - **同时启用（链式 + 端口转发）**：仅对 **ss / SOCKS5** 落地节点生效；reality 仍只允许端口转发

---

## 四、修改方式（用户必须指定）

用户必须在生成前明确选择要做哪类修改（后续流程见 [03-config-flow](03-config-flow.md)）：

| 修改方式 | 目的 | 落地节点协议约束 | 必要输入 |
|---|---|---|---|
| 链式代理（Chain） | 给落地节点增加 `dialer-proxy`，其连接经由中转节点发起 | ss / SOCKS5 | 中转节点候选集（节点/组/provider）+ 落地节点集合 |
| 端口转发（Port Forward） | 将落地节点的 `server`/`port` 替换为中转机 `server:port` | 全协议（reality 复制新节点） | 端口转发中转机 `server:port` + 落地节点集合 |
| 链式 + 端口转发 | 同时应用以上两种修改 | ss / SOCKS5 | 同时满足链式与端口转发的必要输入 |

---

## 五、统一节点格式 (Mihomo Proxy 格式)

无论中转节点或落地节点来源如何，**最终都必须转换为 Mihomo 的 proxy 节点格式**。

### 4.1 通用结构

Mihomo 代理节点为对象，常见字段：

```yaml
- name: "AE_1"           # 必须，唯一
  type: ss               # 必须，如 ss/vmess/trojan/socks5/http 等
  server: "1.1.1.1"      # 必须，域名或 IP
  port: 12345            # 必须
  # 以下为协议相关字段，视 type 而定
  password: "12345"
  cipher: "aes-256-gcm"
  # ...
```

### 4.2 示例：SS 节点

```json
{
  "name": "AE_1",
  "server": "1.1.1.1",
  "port": 12345,
  "type": "ss",
  "password": "12345",
  "cipher": "aes-256-gcm"
}
```

### 4.3 端口转发字段

端口转发时，所有协议均只需替换 `server` 与 `port` 字段。

### 4.4 节点修改示例

**修改前**：

```yaml
proxies:
  - {name: Landing 01 ss, server: example.com, port: 23145, client-fingerprint: chrome, type: ss, cipher: 2022-blake3-aes-256-gcm, password: 8uEAC9gROufeWCei3PFGQC+XGxsvq00PQnQ6M+hZAqQ=, tfo: false, udp: true}
  - {name: Landing 01 reality, server: example.com, port: 443, reality-opts: {public-key: UtL7E7Gmgj3t5JdcPautpTRKo7q2hugky0v5k2XioUM}, client-fingerprint: chrome, type: vless, uuid: 8dc6515f-caeb-4h3e-act6-e6dagddf4454, tls: true, tfo: false, servername: www.example.com, flow: xtls-rprx-vision, skip-cert-verify: false, udp: true}
```

**修改后**（链式代理 + 端口转发同时应用）：

```yaml
proxies:
  # 链式：直接改原节点名并加 dialer-proxy，ss 节点变为 Landing 01 ss Chain
  - {name: Landing 01 ss Chain, server: example.com, port: 23145, client-fingerprint: chrome, type: ss, cipher: 2022-blake3-aes-256-gcm, password: 8uEAC9gROufeWCei3PFGQC+XGxsvq00PQnQ6M+hZAqQ=, tfo: false, udp: true, dialer-proxy: Landing 01 ss dialer}
  # 端口转发：原 Landing 01 reality 保留，新增 Landing 01 reality Forward
  - {name: Landing 01 reality, server: example.com, port: 443, reality-opts: {...}, type: vless, ...}
  - {name: Landing 01 reality Forward, server: forward.server.com, port: 16941, reality-opts: {public-key: UtL7E7Gmgj3t5JdcPautpTRKo7q2hugky0v5k2XioUM}, client-fingerprint: chrome, type: vless, uuid: 8dc6515f-caeb-4h3e-act6-e6dagddf4454, tls: true, tfo: false, servername: www.example.com, flow: xtls-rprx-vision, skip-cert-verify: false, udp: true}
```

### 4.5 转换责任

- **代理链接 (ss://、vmess:// 等)**：解析 URI，填充 `name`、`type`、`server`、`port` 及协议字段
- **填表模式**：按用户输入直接构造节点对象
- **YAML/订阅中的节点**：若已是 Mihomo 格式则直接使用；否则需做格式转换

---

## 六、自建落地节点协议指南

| 方式 | 场景 | 落地协议 |
|------|------|----------|
| 链式代理 | 自建落地 + 机场 | ss |
| 端口转发 | 自建落地 + 专线中转 | ss |
| 端口转发 | 自建落地 + 直连线路优化中转机 | reality |

填表模式仅支持 SOCKS5（见 3.2）。

---

## 七、快速回顾

- 依赖项与必填/选填关系：见上文「依赖结构」
- 本文后续章节分别展开：完整配置输入与转换、中转节点输入、落地/出口节点输入、统一节点格式
