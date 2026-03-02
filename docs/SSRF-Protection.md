# SSRF 防护说明

本文档说明 chain-subconverter 的 SSRF（Server-Side Request Forgery，服务端请求伪造）防护策略、配置方式及使用风险。

---

## 一、什么是 SSRF？在本项目中的风险

### 1.1 正常请求流程

```
A (订阅者) → 请求 B (本服务) → B 向 C (远程订阅地址) 拉取数据 → B 处理 → 返回给 A
```

- **A**：订阅者（客户端）
- **B**：chain-subconverter 服务
- **C**：远程订阅源 URL（用户提供的 `remote_url`）

### 1.2 SSRF 攻击原理

攻击者（如恶意订阅者 A）可构造异常的 `remote_url`，诱使 **B 这台服务器** 向不该访问的目标发起请求，例如：

| 目标 | 示例 URL | 风险 |
|------|----------|------|
| 云元数据服务 | `http://169.254.169.254/latest/meta-data/` | 泄露云凭证、密钥 |
| B 本机内部服务 | `http://127.0.0.1:6379` | 探测/访问 Redis 等 |
| B 所在内网其他主机 | `http://192.168.1.1/admin` | 访问内网管理界面 |

**受影响方**：B 及其所在内网、云环境，而非 A 或正常的订阅源 C。

---

## 二、防护策略与结论

### 2.1 无例外禁止的地址

**云元数据及 link-local 网段 `169.254.0.0/16`**：

- 包括 `169.254.169.254` 等云厂商元数据端点
- 几乎不可能作为合法订阅源
- 始终禁止访问，不可通过配置放宽

### 2.2 localhost 访问开关

通过环境变量 `ALLOW_LOCALHOST_SUBSCRIPTION` 控制对 `127.0.0.1`、`localhost`、`::1` 的访问：

| 配置值 | 行为 |
|--------|------|
| `false`（默认） | 禁止访问 localhost，不允许 B 和 C 同机部署 |
| `true` | 允许访问 localhost，支持 B 与 C 同机部署 |

### 2.3 可选：限制 localhost 端口

当 `ALLOW_LOCALHOST_SUBSCRIPTION=true` 时，可通过 `LOCALHOST_ALLOWED_PORTS` 限制允许的端口。

**常见订阅服务默认端口**（同机部署时常用）：

| 服务 | 默认端口 | 说明 |
|------|----------|------|
| [subconverter](https://github.com/tindy2013/subconverter) | 25500 | 订阅转换服务 |
| [SubStore](https://github.com/sub-store-org/Sub-Store) | 3001 | 订阅管理后端 API |

**默认允许的 localhost 端口**（推荐配置，包含上述服务及本服务）：

```
LOCALHOST_ALLOWED_PORTS=80,443,25500,3001,8080,8443,11200
```

- 未设置：允许任意端口
- 已设置：仅允许列出的端口，降低探测本机非 Web 服务（如 Redis、MySQL）的风险

---

## 三、同机部署（B 与 C 在同一台机器）

### 3.1 典型场景

- B 运行在端口 11200
- C 为同机的订阅服务，如 `http://127.0.0.1:8080/subscription.yaml`

### 3.2 配置步骤

1. 设置环境变量：
   ```bash
   ALLOW_LOCALHOST_SUBSCRIPTION=true
   ```

2. （可选）限制端口，降低风险（默认包含 subconverter 25500、SubStore 3001 及本服务 11200）：
   ```bash
   LOCALHOST_ALLOWED_PORTS=80,443,25500,3001,8080,8443,11200
   ```

3. Docker 示例：
   ```bash
   docker run -d \
     --name chain-subconverter \
     -p 11200:11200 \
     -e ALLOW_LOCALHOST_SUBSCRIPTION=true \
     -e LOCALHOST_ALLOWED_PORTS=80,443,25500,3001,8080,8443,11200 \
     ghcr.io/slackworker/chain-subconverter:latest
   ```

### 3.3 启用 localhost 访问时的风险

在 `ALLOW_LOCALHOST_SUBSCRIPTION=true` 时：

- 恶意用户可通过构造 `remote_url` 让 B 访问本机其他服务
- 可能被用来探测本机端口（如 22、6379、3306 等）
- 若 B 与敏感服务同机，风险更高

**建议**：

- 仅在确实需要 B 与 C 同机部署时开启
- 尽量配合 `LOCALHOST_ALLOWED_PORTS` 限制端口
- 评估 B 所在主机的敏感服务及暴露程度

---

## 四、配置汇总

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `ALLOW_LOCALHOST_SUBSCRIPTION` | `false` | 是否允许 `remote_url` 指向 localhost |
| `LOCALHOST_ALLOWED_PORTS` | 未设置（不限制） | 允许的 localhost 端口，逗号分隔，仅在 `ALLOW_LOCALHOST_SUBSCRIPTION=true` 时生效。推荐包含 subconverter(25500)、SubStore(3001)、本服务(11200) 及 80,443,8080,8443 |

**注意**：`169.254.0.0/16` 始终被禁止，无配置项可覆盖。

---

## 五、相关文档

- [部署指南](https://github.com/slackworker/chain-subconverter/wiki/Deployment-Guide)  
- [使用教程](https://github.com/slackworker/chain-subconverter/wiki)
