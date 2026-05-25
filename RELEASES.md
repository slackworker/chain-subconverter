# 发布说明

按版本记录变更。2.x 及更早见 [_legacy/RELEASES.md](_legacy/RELEASES.md)。

---

## v3.0.0-beta.2

**Tag:** `v3.0.0-beta.2`  
**日期:** 2026-05-25  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（digest `sha256:afa71279f0513f51bdda0f503c2629164f4a5c46a70747a54f28f959df438546`；版本 tag 镜像与 `beta-latest` 同期，自部署优先用滚动标签）

### 概述

在 [v3.0.0-beta.1](#v300-beta1) 基础上的第二轮 Beta 修订，侧重默认 `/` 的 Stage 2 体验、状态初始化与测试/文档收口；无破坏性 API 变更。

### 变更摘要

- **Stage 2 表格**：默认 `/` 与 scheme `a` 引入自适应列宽与响应式测量，长节点名/relay 列更易读。
- **Stage 2 状态**：修正初始化逻辑，避免未完成 stage1 转换时误展示可生成状态。
- **回归基线**：`dual-landing-chain-port-forward` 默认 fixture 不再预置 include/exclude；新增 include/exclude 过滤的 Playwright 集成用例（`web/e2e/include-exclude-filter.spec.ts`，发布前本地/容器化 E2E 可选跑）。
- **文档**：README 在线体验指向 [dual-landing-manual-reference](docs/testing/dual-landing-manual-reference.md)；[test-system-review](docs/testing/test-system-review.md) 与发布 runbook 口径同步。

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

3.0 首个 Beta，面向拥有**落地节点**（及可选**中转节点**）、希望通过网页完成 **Mihomo 链式代理**与**端口转发**配置的用户。相较 2.x 的无状态 URL 传参模式，3.0 在自部署场景下支持**短链 / 长链与 11 位 short ID 反向解析**，配置可跨设备恢复编辑，无需单独维护节点清单。

### 主要能力

- **轻量、易部署**：Docker 环境下一键拉起 `app + subconverter` 完整服务，适用于 NAS、软路由、VPS。
- **纯 GUI、零代码**：网页表单与下拉即可完成链式代理与端口转发，无需手写 YAML 或脚本。
- **反向解析与轻量管理**：粘贴长链、短链或 short ID 即可恢复落地与中转配置并继续编辑。
- **隐私**：自部署时节点与配置数据仅存本机（短链索引在持久卷），不会上传到第三方服务。

### 在线体验

公网预览（仅供体验 UI 与流程，**请勿填入真实节点**）：

<https://fantastic-loise-slackers-134ea8cc.koyeb.app/>

README 中附有假节点示例数据，可直接粘贴试用完整流程。

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

运维与安全细节见 [SECURITY.md](SECURITY.md)；第三方设备回归结论见 [docs/testing/third-party-deployments.md](docs/testing/third-party-deployments.md)（2026-05-25 vps-01/02 内网与公网一体化 beta.2 **通过**；2026-05-23 双 Docker 分离形态 **通过**）。

### 反馈

问题与建议请通过 GitHub Issue 提交；涉及安全的问题请勿在公开 Issue 中贴出可利用细节（见 [SECURITY.md](SECURITY.md) 报告方式）。
