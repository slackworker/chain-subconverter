# 发布说明

只记录当前 3.x 关键版本；完整历史见 [GitHub Releases](https://github.com/slackworker/chain-subconverter/releases) 与对应 tag。

---

## v3.1.0-beta.1

**Tag:** `v3.1.0-beta.1`  
**日期:** 2026-06-26  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）

### 概述

在 [v3.0.0-beta.4](#v300-beta4) 基础上，引入 **Stage 2 按落地 server 聚合**、**链式目标切换优化**、**模板 emoji 地域对齐预处理**、**长链接 payload v=3**，并强化默认 **`/`** 入口的阶段 1/2/3 体验。解码仍接受 v2 长链接；含聚合配置的状态须用 3.1 生成或恢复。

### 变更摘要

#### 阶段 2 业务能力（核心）

- **`serverAggregationGroups[]`**：按落地 `server` 分组聚合，策略 `fallback` / `url-test`，成员可拖拽排序（见 [spec 04 §2.7](docs/spec/04-business-rules.md)、[spec 03 §2](docs/spec/03-backend-api.md)）。
- **`chainProxyTargetGroupSwitchOptimizationEnabled`**：对符合条件的链式目标（地域 `proxy-groups`）启用 `url-test` 覆写优化（见 [spec 04 §3.3.2](docs/spec/04-business-rules.md)）。

#### 阶段 1 / 模板

- **模板 emoji 地域对齐预处理**：`emoji=true` 时，托管模板前为地域 `custom_proxy_group` 注入与组名 leading emoji 一致的节点 emoji 规则；模板已显式声明冲突规则时保留模板原规则并返回 `TEMPLATE_EMOJI_RULE_CONFLICT` warning（见 [spec 04 §0.2.3](docs/spec/04-business-rules.md)）。
- **默认模板 URL** 改为 slackworker fork（`Aethersailor-Custom_OpenClash_Rules`）。

#### 长链接 / 短链

- **长链接 payload `v=3`**（beta.4 为 `v=2`）：新编码含聚合组与切换优化开关；**解码仍接受 v2–v3**（`longURLSchemaMinVersion = 2`）。
- 含 `serverAggregationGroups` 或切换优化配置的快照须用 3.1 生成/恢复；旧 v2 链接在无上述字段时仍可恢复。

#### 默认 `/` UI（发布门禁 scheme）

- Stage 2：聚合树、目标菜单、复制/删除行图标、高级设置外露 emoji/UDP。
- 阶段 1：Tag 输入全角冒号归一化、长 URL 从粘贴提取。
- 大量样式与文案微调（归并为 default UI 体验修订）。

#### 测试 / fixture

- Full 场景 fixture 对齐 **4+1 落地** 与聚合/切换优化 golden（见 [fixtures.md](docs/testing/fixtures.md#full-场景)）。

### 自部署

将 `APP_IMAGE` 设为（打 tag 后可用版本 tag 或 digest 钉死）：

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
# 或
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:v3.1.0-beta.1"
```

### 从 beta.4 升级

1. 拉取新镜像并重启 Compose；短链数据卷可保留。
2. **长链接**：beta.4 生成的 v2 链接仍可解码恢复；新生成链接为 v3。若快照含聚合组或切换优化，须用 3.1 重新生成后再分享。
3. **`enablePortForward`** 仍不在 API/长链接中；端口转发由 UI 开关控制（延续 beta.4）。
4. 探索性 `/ui/b1|b2|c1|c2` 非发布门禁（见 [runbook](docs/testing/runbook.md)）。

### Beta 说明

仍属预发布；安全与部署注意同 beta.1（见下文「Beta 说明」与 [SECURITY.md](SECURITY.md)）。本轮发版仅更新 `beta` 分支与 `beta-latest`，**不同步 `main`**。

---

## v3.0.0-beta.4

**Tag:** `v3.0.0-beta.4`  
**日期:** 2026-06-01  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）

### 概述

在 [v3.0.0-beta.3](#v300-beta3) 基础上，强化**运行态展示**、**工作流日志与消息**、**反代场景访问日志**及默认 `/` 的端口转发默认行为；移除已废弃的 `enablePortForward` API 字段。无破坏性主流程变更。

### 变更摘要

- **运行态（footer）**：`GET /api/runtime-status` 增加 `imageDigest`、短链存储用量徽章、`subconverter.networkScope`（内网 / 跨网）；subconverter 状态与页脚响应式布局优化。
- **日志与消息**：运维 access log 与用户 workflow 消息分离；`messages[]` / 不可用错误增加分类与用户输入来源提示。
- **工作流前端**：`useAppWorkflow` 状态管理重构；Tooltip 与警告图标交互改进；默认 `/` **默认开启端口转发**（不再依赖旧 `enablePortForward` 字段）。
- **短链存储**：下调 `SHORT_LINK_CAPACITY` 时自动裁剪溢出条目。
- **访问日志**：反代后客户端 IP / Origin 识别（`TRUSTED_PROXY_CIDRS` 场景）；业务 API 路由结构化字段（`request_id`、`operation`、`error_code`）。
- **构建与文档**：Web 前端统一为 npm；spec / 回归记录与上述行为对齐。

### 自部署

与 beta.3 相同，将 `APP_IMAGE` 设为：

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
```

或钉死版本 tag / digest（例如 `v3.0.0-beta.4` 或 `sha256:7bf643fa…`，须自行核对 GHCR manifest）。

从 **beta.3** 升级：拉取新镜像并重启 Compose；短链数据卷可保留。若客户端仍发送 `enablePortForward`，请改由 UI 端口转发开关控制（该字段已从 API 移除）。

### Beta 说明

仍属预发布；安全与部署注意同 beta.1（见下文「Beta 说明」与 [SECURITY.md](SECURITY.md)）。

---

## v3.0.0-beta.3

**Tag:** `v3.0.0-beta.3`  
**日期:** 2026-05-29  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）

### 概述

在 [v3.0.0-beta.2](#v300-beta2) 基础上，补齐**落地节点副本**与 **Stage 2 节点行**（复制/改名/`rowId`）的端到端能力及 spec 口径；snapshot-first 三 pass 与 stage2 快照契约对齐。无破坏性 API 变更。

### 变更摘要

- **阶段 1 落地副本**：同一落地可显式创建多份；重复 URI 不去重；后端稳定重命名，供阶段 2 展示（见 [spec 02 §1.1.2](docs/spec/02-frontend-spec.md)）。
- **阶段 2 节点行管理**：`stage2Init` / `stage2Snapshot` 以 `rowId` 为行主键；支持复制行、删除行（每 `sourceLandingNodeName` 至少保留一行）；`proxyName` 可编辑，复制行默认 `原名 2`、`原名 3`…（见 [spec 04 §2.1.2](docs/spec/04-business-rules.md)）。
- **聚合组消费口径（行为说明）**：按 `serverAggregationGroups[]` 生成的聚合组只写入最终 YAML，组名与前端 Stage 2 聚合树显示/编辑名一致（默认 `国旗 emoji + server`）；设计上不进入 Stage 2 的 `chainTargets` 下拉；链式目标仍以 `stage2Init.chainTargets[]` 为唯一候选来源。
- **文档与测试**：spec、金样与回归记录与上述行为一致；默认 `/` 已覆盖主流程。

### 自部署

与 beta.2 相同，将 `APP_IMAGE` 设为：

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
```

或钉死 digest / 版本 tag（需自行核对 GHCR 是否已发布对应 manifest）。

从 **beta.2** 升级：拉取新镜像并重启 Compose 即可；短链数据卷可保留，无需改配置格式。

### Beta 说明

仍属预发布；安全与部署注意同 beta.1（见下文「Beta 说明」与 [SECURITY.md](SECURITY.md)）。

---

## v3.0.0-beta.2

**Tag:** `v3.0.0-beta.2`  
**日期:** 2026-05-25  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）

### 概述

在 [v3.0.0-beta.1](#v300-beta1) 基础上的第二轮 Beta 修订，侧重默认 `/` 的 Stage 2 体验、状态初始化与测试/文档收口；无破坏性 API 变更。

### 变更摘要

- **Stage 2 表格**：默认 `/` 引入自适应列宽与响应式测量，长节点名/relay 列更易读。
- **Stage 2 状态**：修正初始化逻辑，避免未完成 stage1 转换时误展示可生成状态。
- **文档与回归**：补齐回归与文档口径，减少试用误解与踩坑。

### 自部署

与 beta.1 相同，将 `APP_IMAGE` 设为：

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
```

或钉死 digest / 版本 tag（需自行核对 GHCR 是否已发布对应 manifest）。

从 **beta.1** 升级：拉取新镜像并重启 Compose 即可；短链数据卷可保留，无需改配置格式。

### Beta 说明

仍属预发布；安全与部署注意同 beta.1（见下文「Beta 说明」与 [SECURITY.md](SECURITY.md)）。

---

## v3.0.0-beta.1

**Tag:** `v3.0.0-beta.1`  
**日期:** 2026-05-24  
**镜像:** `ghcr.io/slackworker/chain-subconverter:v3.0.0-beta.1`（`beta` 分支滚动标签 `beta-latest` 指向同期构建）

### 概述

3.0 首个 Beta：默认 `/` 入口 + 自部署短链/反向解析；更偏向 Mihomo 链式代理与端口转发场景。

### 在线体验

公网预览（仅供体验 UI 与流程，**请勿填入真实节点**）：

<https://chain-subconverter.koyeb.app/>

假节点示例数据见根目录 `README.md`（在线预览仅体验流程，请勿填真实节点）。

### 自部署

1. 按 [deploy/README.md](deploy/README.md) 执行第三方设备单段 Compose 命令。
2. 将头部 `APP_IMAGE` 设为本次 Beta 镜像，例如：

   ```bash
   APP_IMAGE="ghcr.io/slackworker/chain-subconverter:v3.0.0-beta.1"
   ```

   也可使用滚动标签 `ghcr.io/slackworker/chain-subconverter:beta-latest`（便于跟进 Beta 线修复，但需在升级时自行核对变更）。

3. 浏览器打开 `http://<设备 IP>:<端口>/`，按页面完成落地 / 中转配置并生成结果。

### 与 2.x 的差异（用户向）

| 方面 | 2.x | 3.0 Beta |
|------|-----|----------|
| 配置携带 | 主要靠 URL 查询参数传递，后端无状态 | 支持短链持久化（需挂载数据卷）与反向解析 |
| 部署 | 单容器后端为主 | 默认一体化 Compose（`app` + `subconverter`） |
| 产品焦点 | 通用订阅转换 + 自动配对 | Mihomo 链式代理、端口转发 relay、中转订阅拉取 |
| 入口 | 单套 UI | 默认 `/`；`/ui/b`、`/ui/c` 为实验方案 |

从 2.x 升级：停止旧容器，按 [deploy/README.md](deploy/README.md) 重新部署 3.0 镜像并在新界面中重新配置；2.x 的 URL 规则与 3.0 不兼容，无法直接迁移旧链接。

### Beta 说明

本版本为**预发布**，适合愿意自行部署、接受偶发问题的用户试用与反馈。

- **推荐用法**：在可信网络中**自部署**；不要把当前版本当作面向公网的匿名多用户服务。
- **接口**：默认无登录；能访问你实例入口的人即可使用生成、短链、订阅读取等能力。
- **界面**：默认入口 `/` 为 Beta 验收基线；`/ui/b1|b2|c1|c2` 为探索入口，体验可能不一致。
- **设备**：未针对手机浏览器专门优化。
- **HTTPS / 反代**：若前面有 HTTPS 终止或固定域名，请按 [deploy/README.md](deploy/README.md) 设置 `CHAIN_SUBCONVERTER_USER_FACING_BASE_URL`，避免生成错误链接。

运维与安全细节见 [SECURITY.md](SECURITY.md)；第三方设备回归结论见 [docs/testing/deployments.md](docs/testing/deployments.md)（2026-06-01 vps-01/02 内网与公网一体化 **beta.4** / `beta-latest` **通过**；2026-05-29 beta.3；2026-05-25 beta.2；2026-05-23 双 Docker 分离形态 **通过**）。

### 反馈

问题与建议请通过 GitHub Issue 提交；涉及安全的问题请勿在公开 Issue 中贴出可利用细节（见 [SECURITY.md](SECURITY.md) 报告方式）。
