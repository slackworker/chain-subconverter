# 02 - 前置条件：中转节点与落地节点

> **核心原则**：项目的一切输入最终都需转换为 Mihomo 兼容的节点格式。中转节点与落地节点可有多种输入形式，系统负责解析并统一。

---

## 一、中转节点 (Transit / Dialer Nodes)

中转节点用于建立到落地节点的「跳板」连接，是链式代理或端口转发的前置。

### 1.1 输入形式

| 形式 | 说明 | 示例 |
|------|------|------|
| 机场订阅链接 | HTTP/HTTPS 订阅 URL，返回 base64 或 YAML | `https://example.com/sub?token=xxx` |
| YAML 配置 URL | 指向完整 Mihomo YAML 的 URL | `https://example.com/config.yaml` |
| YAML 配置文件 | 用户上传的本地 `.yaml` / `.yml` 文件 | 拖拽或选择文件 |
| YAML 直接内容 | 用户粘贴的 YAML 文本（包含必要节点） | 粘贴到文本框 |
| 端口转发模式 | 仅需中转服务器地址和端口，不包含具体协议节点 | `relay.example.com:1080` |

### 1.2 解析要求

- **订阅链接 / YAML URL**：通过 HTTP GET 拉取，解析出**完整 YAML 配置**，作为后续修改基础。不需要解析 `proxy-providers` 中的具体节点，只需在 `proxy-groups` 中保留 `use: [provider1]` 引用即可。
- **YAML 文件 / 粘贴内容**：直接解析 YAML，得到完整配置结构。
- **端口转发模式**：不解析节点，仅记录 `(server, port)`；输入方式为表单填入或粘贴解析。允许多个中转机（多个 (server, port) 对）。

### 1.3 输出

- **非端口转发模式**：得到**完整 YAML 配置文件**，作为修改基础。
- **端口转发模式**：同样需要**完整 YAML 配置文件**作为修改基础，同时得到 `{ server, port }`（可多个）用于替换落地节点的 `server` 与 `port`。

---

## 二、落地节点 (Landing Nodes)

落地节点是链式代理的「最后一跳」，用户流量最终经此节点访问目标。

### 2.1 输入形式

| 形式 | 说明 | 示例 |
|------|------|------|
| 代理节点链接 | 标准代理协议 URI | `ss://base64...`、`vless://...`、`SOCKS5://` |
| 填表模式 | 用户手动填写节点参数（仅支持 SOCKS5） | 见 2.2 |
| 已包含在中转配置中 | 从中转 YAML / 订阅中识别 | 自动关键字识别 或 用户手动指定 |

### 2.2 填表模式字段

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

### 2.3 已包含在中转配置中

- **自动识别**：按节点 `name` 匹配预设关键字（如 `落地`、`Landing`、`出口`、`exit`），可配置扩展
- **手动指定**：用户从解析出的节点列表中勾选/指定哪些为落地节点

### 2.4 输出与操作逻辑

- 所有落地节点均需转换为 Mihomo `proxies` 列表中的一项。
- **按落地节点类型区分**：
  - **ss / SOCKS5 节点**：**直接修改**原节点，增加 `dialer-proxy`（链式）或替换 `server`/`port`（端口转发），节点名改为 `原节点名 + 空格 + "链式"/"Chain"` 或 `"转发"/"Forward"`（根据原节点名是否含中文自动选择）。
  - **reality 节点**：**复制**出新节点再修改，原节点保留，新节点命名为 `原节点名 + 空格 + "转发"/"Forward"`，替换 `server`/`port`。
- **约束**：链式代理的落地节点不允许 reality，仅支持 ss、SOCKS5。reality 仅适用于端口转发。

---

## 三、统一节点格式 (Mihomo Proxy 格式)

无论中转节点或落地节点来源如何，**最终都必须转换为 Mihomo 的 proxy 节点格式**。

### 3.1 通用结构

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

### 3.2 示例：SS 节点

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

### 3.3 端口转发字段

端口转发时，所有协议均只需替换 `server` 与 `port` 字段。

### 3.4 节点修改示例

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

### 3.5 转换责任

- **代理链接 (ss://、vmess:// 等)**：解析 URI，填充 `name`、`type`、`server`、`port` 及协议字段
- **填表模式**：按用户输入直接构造节点对象
- **YAML/订阅中的节点**：若已是 Mihomo 格式则直接使用；否则需做格式转换

---

## 四、自建落地节点协议指南

| 方式 | 场景 | 落地协议 |
|------|------|----------|
| 链式代理 | 自建落地 + 机场 | ss |
| 端口转发 | 自建落地 + 专线中转 | ss |
| 端口转发 | 自建落地 + 直连线路优化中转机 | reality |

填表模式仅支持 SOCKS5（见 2.2）。

---

## 五、前置条件汇总

| 条件 | 说明 |
|------|------|
| 中转节点 | 至少有一种：订阅链接、YAML URL、YAML 文件、YAML 粘贴、或端口转发（仅地址+端口） |
| 落地节点 | 至少有一种：代理链接、填表、或已包含在中转配置中（自动/手动指定） |
| 统一格式 | 所有参与配置的节点最终为 Mihomo `proxies` 列表项格式 |
