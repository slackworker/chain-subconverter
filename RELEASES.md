# 发布说明

只记录当前 3.x 关键版本；完整历史见 [GitHub Releases](https://github.com/slackworker/chain-subconverter/releases) 与对应 tag。

## 当前发布流水线（2026-06 起）

为避免同一提交在 `beta` 与 `v*` tag 上重复构建镜像，发布流程统一为：

1. 推送到 `dev`：触发 `CI`（门禁回归）。
2. 合并到 `beta`：再次触发 `CI`（发布前门禁）。
3. 打 `v*` tag：触发 `Build and Push Docker Image`（含发布校验与多架构镜像发布）。

说明：

- `CI` 不再在 tag push 上重复执行；`main` 合并后由 `CI` 成功触发 Docker 发布；tag / 手动发布经 `Publish Validation` 一次性校验同 SHA 的 `CI` 已成功。
- `beta-latest` 与版本 tag（如 `v3.3.0-beta.1`）由 tag 发布流程同期产出；建议生产部署固定版本 tag 或 digest。

---

## v3.3.0-beta.3

**Tag:** `v3.3.0-beta.3`  
**日期:** 2026-07-18  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）

### 概述

在 [v3.3.0-beta.2](#v330-beta2) 基础上：**默认模板仓库迁移**至 `slackworker/Custom_OpenClash_Rules`，并修复前端在 runtime-config 失败时仍回退硬编码模板 URL 的行为（空值保持为空）。

### 变更摘要

- **默认模板 URL**：Compose / 后端默认、fixture 与文档中的 `DEFAULT_TEMPLATE_URL` 从旧 `Aethersailor-Custom_OpenClash_Rules` fork 切换到 `Custom_OpenClash_Rules`。
- **前端空模板处理**：`useAppWorkflow` 与各 scheme 在 runtime 配置缺失或为空时不再填入硬编码默认模板，避免陈旧回退 URL。

### 测试

- 2026-07-18：发布前本地自动化基线见本轮 CI / runbook（`go test`、web 单测、`build:default`、`docker compose config`）

### 自部署

将 `APP_IMAGE` 设为：

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
# 或固定版本（镜像 tag 无 v 前缀）
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:3.3.0-beta.3"
```

### 从 v3.3.0-beta.2 升级

1. 拉取新镜像并重启 Compose；短链数据卷可保留。
2. 若设备 compose 仍指向旧 `Aethersailor-Custom_OpenClash_Rules` 模板 URL，请对照 [deploy/docker-compose.yml](deploy/docker-compose.yml) 合并后再 `up --force-recreate app`（仅 `pull` 不会改已有 env）。
3. 行为兼容：长链仍为 `v=5`；已生成链接无需重发。

### Beta 说明

仍属预发布；本轮发版仅更新 `beta` 分支；镜像通过 `v3.3.0-beta.3` tag 发布流程产出（含 `beta-latest`），**不同步 `main`**。

---

## v3.3.0-beta.2

**Tag:** `v3.3.0-beta.2`  
**日期:** 2026-07-17  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）

### 概述

在 [v3.3.0-beta.1](#v330-beta1) 基础上修复 **`resolve-url` / convert hydrate 后聚合组成员丢失**：入站须将 Wire `memberProxyNames[]` 还原为 Client `memberLocalInstanceIds[]`，否则反向解析后实例「入组」勾选为空。

### 变更摘要

- **hydrate 入组映射**：`hydrateInstanceIds` 在补 `instanceId` 的同时，按同 server 内 `proxyName → instanceId` 把 `memberProxyNames` 映射回 `memberLocalInstanceIds`（见 [06 §9](docs/spec/06-stage2-model.md)）。
- **测试 / 文档**：补充单测；spec `02` / `03` / `06` 与 STATUS 契约句同步入站映射约定。

### 测试

- 2026-07-17：`go test ./...`、`cd web && npm run test`、`cd web && npm run build:default`、`docker compose -f deploy/docker-compose.yml config` **通过**；`beta` CI @ `a21c693` **通过**
- 第三方部署：2026-07-17 三种形态 `beta-latest` / `v3.3.0-beta.2` @ `a21c693`（digest `sha256:9f62520b…`）**real-smoke + real-full 通过** — 见 [third-party-deployments.md](docs/testing/third-party-deployments.md)
- 镜像：`3.3.0-beta.2` / `beta-latest` digest `sha256:9f62520b745a9339b4a11ad1d9f1ed287f8ff56ace057c228f2ede0acb1bb3ab`

### 自部署

将 `APP_IMAGE` 设为：

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
# 或固定版本（镜像 tag 无 v 前缀）
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:3.3.0-beta.2"
```

### 从 v3.3.0-beta.1 升级

1. 拉取新镜像并重启 Compose；短链数据卷可保留。
2. 行为兼容：长链仍为 `v=5`；已生成链接无需重发。仅修复反向解析后聚合勾选丢失。

### Beta 说明

仍属预发布；本轮发版仅更新 `beta` 分支；镜像通过 `v3.3.0-beta.2` tag 发布流程产出（含 `beta-latest`），**不同步 `main`**。

---

## v3.3.0-beta.1

**Tag:** `v3.3.0-beta.1`  
**日期:** 2026-07-17  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）

### 概述

在 [v3.2.0-beta.3](#v320-beta3) 基础上，完成 **Stage 2 嵌套树模型**（`servers → sources → instances`）与 **长链接 `statePayload v5`** 硬切；废弃平铺 `rows[]` / `serverAggregationGroups[]` 与 `POST /api/stage2/reset`。**不兼容** 3.2 及更早长链接载荷（v4 及更旧）；已分享链接须用 3.3 重新转换并生成。

### 变更摘要

#### Stage 2 嵌套树（核心）

- **权威形状**：`servers[] → sources[] → instances[]`；UI 平铺仅为 DFS 投影。唯一事实源见 [spec 06](docs/spec/06-stage2-model.md)。
- **Client / Wire 分层**：前端编辑期可用 `instanceId`（`sourceId::iN`）；API / v5 只传业务字段与 `proxyName`；聚合成员 Wire 字段为 `memberProxyNames[]`。
- **废弃**：平铺 `rows[]` + 外挂 `serverAggregationGroups[]`、会话/编码双语义 `rowId`、`POST /api/stage2/reset`。
- **默认 `/` UI**：聚合树 / 平铺表 / 复制改名 / 成员序均按嵌套树与 `proxyName` 工作。

#### 长链接 / 短链

- **长链接 payload `v=5`**（3.2 为 `v=4`）：编码态存嵌套树；规范化规则见 [06 §7](docs/spec/06-stage2-model.md)。
- **`GET /sub` / 短链创建**：非当前版本整包拒绝。
- **`resolve-url` 旧版载荷**：若 `stage1Input` 仍可按现行契约解析，则还原 Stage1，Stage2 为空，并以 `LEGACY_PAYLOAD_VERSION` 进入只读冲突态；不得静默迁移旧 Stage2。

#### 协议切换声明（v4 → v5）

| 层 | 结论 |
|----|------|
| Stage1 输入 | **兼容还原**（`resolve-url` 尽力填回） |
| Convert 及后续（Stage2 / generate / 订阅读取） | **不兼容**旧 `v`（含 v4 平铺行载荷）；须重新转换并生成 |

以后 bump `longURLSchemaVersion` 时，发版说明须同样声明 Stage1 与 Convert 及后续的兼容口径（见 [06 §7](docs/spec/06-stage2-model.md)、[MAINTENANCE.md](docs/MAINTENANCE.md)）。

#### 其他

- **聚合组注入**：收紧向 `select` 策略组注入的成员条件（仅向直接包含该聚合全部成员的 select 注入）。
- **Managed Pass3 / fixture**：`RenderManagedPass3` 与 review fixture 生成对齐嵌套树与双托管语义。
- **默认 `/` 聚合树**：source tone 映射与样式修订。
- **短链默认容量**：`SHORT_LINK_CAPACITY` 默认由 `1000` 下调为 `100`；下调后溢出条目按既有 LRU 裁剪。

### 测试

- 2026-07-17：`go test ./...`、`cd web && npm run test`、`cd web && npm run test:e2e:mock:all`、全 scheme build、`docker compose -f deploy/docker-compose.yml config` **通过**
- 第三方部署：2026-07-17 三种形态 `beta-latest` / `v3.3.0-beta.1` @ `77b6d19`（digest `sha256:5c14d6c7…`）**real-smoke + real-full 通过** — 见 [third-party-deployments.md](docs/testing/third-party-deployments.md)

### 自部署

将 `APP_IMAGE` 设为：

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
# 或固定版本（镜像 tag 无 v 前缀）
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:3.3.0-beta.1"
```

### 从 v3.2.0-beta.3 升级

1. 拉取新镜像并重启 Compose；短链数据卷可保留（默认容量若从更高值下调，溢出条目会按 LRU 裁剪）。
2. **长链接 / 短链**：**3.2 生成的 v4 链接无法完整恢复**；`resolve-url` 最多还原 Stage1 并进入只读冲突态。须在 3.3 界面重新「转换并自动填充」后生成 v5 链接再分享。
3. **API 客户端**：勿再发送平铺 `rows[]` / `serverAggregationGroups[]`，勿调用已删除的 `POST /api/stage2/reset`。
4. 探索性 `/ui/b1|b2|c1|c2` 非发布门禁（见 [runbook](docs/testing/runbook.md)）。

### Beta 说明

仍属预发布；安全与部署注意同 [v3.2.0-beta.3](#v320-beta3) 与 [SECURITY.md](SECURITY.md)。本轮发版仅更新 `beta` 分支；镜像通过 `v3.3.0-beta.1` tag 发布流程产出（含 `beta-latest`），**不同步 `main`**。

---

## v3.2.0-beta.3

**Tag:** `v3.2.0-beta.3`  
**日期:** 2026-07-03  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）

### 概述

**beta 线重整发版**：将 `v3.0.0-beta.4` 之后分散在 dev/beta 上的约 189 条提交重整为干净历史，统一承载 **v3.1 聚合 → v3.2 Pipeline/行身份 → 聚合组注入 → Docker CI 发布** 全量能力。`main` 已快进到 [`v3.0.0-beta.4`](#v300-beta4)（不含 v3.1+ 聚合）；本 tag 为当前推荐 Beta 线。

### 相对 main（v3.0.0-beta.4）新增

- **v3.1**：server 聚合组、`chainProxyTargetGroupSwitchOptimization`、长链 v3、默认 UI 聚合树
- **v3.2**：Pipeline hard-break、长链 v4、`restoreConflicts`、Stage 2 行身份硬切（`rowId` / `proxyName` / `sourceLandingNodeName`）
- **聚合组注入**：将 server 聚合组注入 select 策略组（`server_aggregation_groups.go`）
- **Docker 发布**：`docker-publish.yml` 与 CI 集成、Publish Validation 门禁

### 相对 v3.2.0-beta.2 tag 吸收

- tag 后 dev 上已验证的聚合注入与编码/展示修补（`e792f77` 及后续补丁的功能等价内容）
- Docker 发布 workflow 重构（CI 校验同 SHA、多架构构建）
- **历史 beta.1/beta.2 镜像不再推荐**；请切至本 tag 或 `beta-latest`

### 不兼容与升级

- v2/v3 长链在 3.2 线仍不兼容；含 `landingNodeName` 旧字段快照不兼容 beta.2+
- 从 beta.2 升级：拉取新镜像并重启；旧长链/短链若仍依赖 `landingNodeName` 需重新生成

### 测试

- 2026-07-03（重整后）：`go test ./...`、`cd web && npm run test`、`cd web && npm run test:e2e:mock:all`、全 scheme build、`docker compose -f deploy/docker-compose.yml config` **通过**
- 第三方部署：2026-07-03 三种形态 `dev-latest` @ `78a4477` **real-smoke + real-full 通过** — 见 [third-party-deployments.md](docs/testing/third-party-deployments.md)

### 自部署

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
# 或
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:v3.2.0-beta.3"
```

### Beta 说明

仍属预发布；安全与部署注意同 [v3.2.0-beta.2](#v320-beta2) 与 [SECURITY.md](SECURITY.md)。本轮为 beta 历史重整与镜像滚动收口。

---

## v3.2.0-beta.2

**Tag:** `v3.2.0-beta.2`  
**日期:** 2026-07-02  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）

### 概述

在 [v3.2.0-beta.1](#v320-beta1) 基础上，完成 **Stage 2 行身份硬切**：前后端、长链接/短链编码、恢复校验、fixture 与默认 `/` 交互统一围绕 `rowId` / `proxyName` / `sourceLandingNodeName` 工作；仅含旧字段 `landingNodeName` 的载荷不再兼容。

### 变更摘要

#### Stage 2 行身份（核心）

- **`landingNodeName` 退出快照契约**：`stage2Snapshot.rows[]` 与 `stage2Init.rows[]` 不再接受或输出 `landingNodeName`；每行必须提供 `rowId`、`proxyName`、`sourceLandingNodeName`。
- **恢复与编码口径收紧**：旧 v4 载荷若仍只含 `landingNodeName`，恢复时将视为无效；需在 3.2.0-beta.2 及之后版本重新生成链接。
- **默认 `/` UI 跟随新身份模型**：Stage 2 行编辑、复制/删除、行 key 匹配与目标选择均以 `rowId` / `proxyName` 为准，不再依赖旧字段名。

#### 测试与 fixture

- golden、canonical scenario、mock/real E2E 以及 Stage 2 相关单测已同步到新行身份契约。
- 修复默认 `/` adaptive table 的列宽测量输入，恢复 `build:default` 与 mock E2E 发版门禁。

### 测试

- 2026-07-02：`go test ./...`、`cd web && npm run test`、`cd web && npm run test:e2e:mock:all`、`cd web && npm run build:default && npm run build:b1 && npm run build:b2 && npm run build:c1 && npm run build:c2`、`docker compose -f deploy/docker-compose.yml config` **通过**
- 第三方 `real-smoke` / `real-full` 公开记录仍止于 [v3.2.0-beta.1](#v320-beta1)；若要更新公开部署结论，需按 runbook 重新覆盖 [third-party-deployments.md](docs/testing/third-party-deployments.md)

### 自部署

打 tag 后将 `APP_IMAGE` 设为：

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
# 或
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:v3.2.0-beta.2"
```

### 从 v3.2.0-beta.1 升级

1. 拉取新镜像并重启 Compose；短链数据卷可保留。
2. **长链接 / 短链恢复**：若链接快照仍依赖旧字段 `landingNodeName`，升级后将无法恢复；请在新版页面重新生成。
3. 公开第三方部署结论若仍引用 beta.1，需在新镜像上线后按 runbook 重跑 `real-smoke` / `real-full` 并覆盖 [third-party-deployments.md](docs/testing/third-party-deployments.md)。

### Beta 说明

仍属预发布；安全与部署注意同 [v3.2.0-beta.1](#v320-beta1) 与 [SECURITY.md](SECURITY.md)。本轮版本用于收口 3.2 Beta 线的 Stage 2 行身份契约与相关回归。

---

## v3.2.0-beta.1

**Tag:** `v3.2.0-beta.1`  
**日期:** 2026-07-01  
**镜像:** `ghcr.io/slackworker/chain-subconverter:beta-latest`（版本 tag 与 `beta-latest` 同期；对外部署建议固定 tag/digest）  
**提交:** `a339f86`

### 概述

在 [v3.1.0-beta.1](#v310-beta1) 基础上，引入 **Pipeline hard-break**、**长链接 `statePayload v4`**、**结构化恢复冲突裁决**与 **Stage 2 快照行序保持**。**不兼容** 3.1 及更早长链接载荷（v2/v3）；已分享链接须用 3.2 重新生成。

### 变更摘要

#### Pipeline 与校验（核心）

- **统一 Pipeline（hard-break）**：`convert` 只执行至 `buildStage2Init`；`generate`、`resolve-url` 与 `GET /sub*` 走同一条完整 Pipeline（含双托管 Pass 3 与 `postProcess`）；步骤表见 [spec 04 §1.1.3](docs/spec/04-business-rules.md)。
- **`generate` 内部 dry-run**：返回链接前必须完成至 `postProcess` 的完整内部校验，坏配置在生成阶段即失败（见 [spec 04 §1.1.1 / §1.2](docs/spec/04-business-rules.md)）。
- **`resolve-url` 同口径校验**：不得使用「仅结构校验」降级路径；成功后返回 `replayable` 或 `conflicted`（见 [spec 01](docs/spec/01-overview.md)、[spec 03 §resolve-url](docs/spec/03-backend-api.md)）。

#### 恢复冲突

- **`restoreConflicts[]`**：`restoreStatus = conflicted` 时返回结构化 `reasonCode` / `reasonArgs`；前端进入只读冲突态，不得继续生成（见 [spec 04 §3.2.1](docs/spec/04-business-rules.md)、[spec 02 §恢复](docs/spec/02-frontend-spec.md)）。
- **默认 `/` UI**：`RestoreConflictBanner` 与 `mode-reason` 展示失效原因。

#### 长链接 / 短链

- **长链接 payload `v=4`**（3.1 为 `v=3`）：**仅接受 v4**；v2/v3 及外层 query 状态覆写均不再支持。
- 短链 `canonicalStateKey` 与 v4 快照语义一致；旧短链若指向 v2/v3 载荷，升级后无法恢复。

#### Stage 2 与其他

- **快照行序**：`stage2Snapshot.rows[]` 持久化顺序在阶段 1 重转换时保持；新勾选成员按行序插入（见 [spec 04 §2.1.2](docs/spec/04-business-rules.md)）。
- **托管落地校验**：`generate` / `resolve-url` 在完整 Pipeline 中校验 managed landing 与 postProcess 一致性。
- **Spec / 治理**：`00` 权威顺序与 `01–04` 契约与实现对齐（通知生命周期、入口子集表等）。

#### 测试

- 单测与 mock E2E 覆盖 restore conflict、行序保持、dry-run 失败路径；发版前须完成 runbook 完整检查与第三方 `real-smoke` / `real-full`。

### 自部署

打 tag 后将 `APP_IMAGE` 设为：

```bash
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:beta-latest"
# 或
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:v3.2.0-beta.1"
```

### 从 3.1 升级

1. 拉取新镜像并重启 Compose；短链数据卷可保留。
2. **长链接**：**3.1 生成的 v2/v3 链接无法解码恢复**；须在 3.2 界面重新配置并生成 v4 链接后再分享。
3. **`resolve-url`**：若上游订阅变化导致目标失效，将返回 `conflicted` 与 `restoreConflicts[]`，页面只读展示，不可直接继续生成。
4. 探索性 `/ui/b1|b2|c1|c2` 非发布门禁（见 [runbook](docs/testing/runbook.md)）。

### Beta 说明

仍属预发布；安全与部署注意同 [v3.0.0-beta.1](#v300-beta1) 下文「Beta 说明」与 [SECURITY.md](SECURITY.md)。本轮发版仅更新 `beta` 分支；镜像通过 `v3.2.0-beta.1` tag 发布流程产出（含 `beta-latest`），**不同步 `main`**。

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

仍属预发布；安全与部署注意同 beta.1（见下文「Beta 说明」与 [SECURITY.md](SECURITY.md)）。本轮发版仅更新 `beta` 分支；镜像通过 `v3.1.0-beta.1` tag 发布流程产出（含 `beta-latest`），**不同步 `main`**。

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

运维与安全细节见 [SECURITY.md](SECURITY.md)；第三方设备回归结论见 [docs/testing/third-party-deployments.md](docs/testing/third-party-deployments.md)（2026-07-03 三种形态 `dev-latest` @ `78a4477` **real-smoke + real-full 通过**）。

### 反馈

问题与建议请通过 GitHub Issue 提交；涉及安全的问题请勿在公开 Issue 中贴出可利用细节（见 [SECURITY.md](SECURITY.md) 报告方式）。
