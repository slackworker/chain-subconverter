# 发布说明

只记录当前 3.x 关键版本；完整历史见 [GitHub Releases](https://github.com/slackworker/chain-subconverter/releases) 与对应 tag。

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
- **聚合组消费口径（行为说明）**：按 `serverAggregationGroups[]` 生成的 `srv:<server>` 聚合组只写入最终 YAML，设计上不进入 Stage 2 的 `chainTargets` 下拉；链式目标仍以 `stage2Init.chainTargets[]` 为唯一候选来源。
- **文档与测试**：spec、金样与回归记录与上述行为一致；默认 `/` 与 scheme `a` 已覆盖主流程。

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

- **Stage 2 表格**：默认 `/` 与 scheme `a` 引入自适应列宽与响应式测量，长节点名/relay 列更易读。
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

<https://fantastic-loise-slackers-134ea8cc.koyeb.app/>

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
| 入口 | 单套 UI | 默认 `/`；`/ui/a`、`/ui/b`、`/ui/c` 为实验方案 |

从 2.x 升级：停止旧容器，按 [deploy/README.md](deploy/README.md) 重新部署 3.0 镜像并在新界面中重新配置；2.x 的 URL 规则与 3.0 不兼容，无法直接迁移旧链接。

### Beta 说明

本版本为**预发布**，适合愿意自行部署、接受偶发问题的用户试用与反馈。

- **推荐用法**：在可信网络中**自部署**；不要把当前版本当作面向公网的匿名多用户服务。
- **接口**：默认无登录；能访问你实例入口的人即可使用生成、短链、订阅读取等能力。
- **界面**：默认入口 `/` 为 Beta 验收基线；`/ui/a|b|c` 为实验入口，体验可能不一致。
- **设备**：未针对手机浏览器专门优化。
- **HTTPS / 反代**：若前面有 HTTPS 终止或固定域名，请按 [deploy/README.md](deploy/README.md) 设置 `CHAIN_SUBCONVERTER_USER_FACING_BASE_URL`，避免生成错误链接。

运维与安全细节见 [SECURITY.md](SECURITY.md)；第三方设备回归结论见 [docs/testing/third-party-deployments.md](docs/testing/third-party-deployments.md)（2026-05-29 vps-01/02 内网与公网一体化 beta.3 口径 **通过**；2026-05-25 beta.2；2026-05-23 双 Docker 分离形态 **通过**）。

### 反馈

问题与建议请通过 GitHub Issue 提交；涉及安全的问题请勿在公开 Issue 中贴出可利用细节（见 [SECURITY.md](SECURITY.md) 报告方式）。
