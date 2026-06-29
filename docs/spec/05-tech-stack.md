# 05 - 技术选型与项目结构

> 本章只定义技术、分层与部署约束。接口契约见 [03-backend-api](03-backend-api.md)，业务规则见 [04-business-rules](04-business-rules.md)。

---

## 0. 当前硬约束

- 后端当前唯一已确认的正式实现语言是 `Go`；既有 Python 实现仅保留在 `_legacy/` 供追溯参考。
- `subconverter` 必须继续以部署侧私有 HTTP 服务形式集成；默认优先与 `app` 同 Compose 内部署，也允许以独立 Docker 服务形式提供，但都不得把其请求细节散落到业务层。
- 当前允许保留仅含 `app + subconverter` 的 API-only Compose 作为本地验证路径。

## 1. 默认实现方向

在当前收口与微调阶段，默认按以下方向对齐实现与文档；若治理结论调整，以最新确认文档为准。

- 项目统一采用 `Go（net/http）+ React + TypeScript + Vite + Tailwind CSS + SQLite + Docker Compose`
- `subconverter` 默认以**同一 Compose 部署内的内部容器**形式集成；如部署方已有独立 Docker 化实例，也允许通过私有网络地址接入
- 主后端统一提供 API 与前端静态资源；当前不单独引入 `nginx`
- 短链接索引默认使用本地 SQLite 文件持久化
- 整体架构保持**单仓库、单主服务、单内部依赖服务**；不拆分微服务

## 2. 选型原则

- 部署必须以 `docker compose up -d` 为主路径，对新手调用与维护友好
- `subconverter` 必须可独立升级，默认通过镜像版本切换完成手动同步更新
- 技术栈必须主流、文档充分、AI Agent 易理解与易修改
- 方案应匹配本项目的实际负载：表单输入、规则选择、字符串与 YAML 处理、小规模共享访问
- 部署产物必须优先兼容常见自部署环境，至少覆盖 `linux/amd64` 与 `linux/arm64`
- 避免过轻导致后期补洞，也避免过重导致部署、调试和维护成本失控

## 3. 分层方向

| 层 | 选型 | 约束 |
|----|------|------|
| 后端 API | `Go（net/http + ServeMux）` | 对应阶段默认由主后端承接 HTTP API、长短链接、快照编码解码、YAML 改写、`subconverter` 调用与静态资源分发；HTTP 实现在 `internal/api` |
| 前端 | `React + TypeScript + Vite` | 对应阶段默认采用单页应用；负责三阶段表单、状态展示与交互，不做 SSR |
| 前端样式 | `Tailwind CSS` | 仅作为样式与布局层；不引入重量级前端框架 |
| 数据存储 | `SQLite` | 默认承载短链接索引与必要元数据；不引入独立数据库服务 |
| 部署 | `Docker Compose` | 默认统一编排主应用与 `subconverter`；面向 NAS、软路由与小型服务器；允许按需拆成两个 Docker 项目 |
| 转换组件 | `subconverter` 官方镜像 | 作为内部 HTTP 服务运行；不直接暴露到宿主机公网端口；拆分部署时仍应保持私网可达 |

## 4. 后端实现约束

- Go 是后端唯一实现语言；不再保留 Python 作为正式实现路径
- **当前** HTTP 层使用标准库 `net/http` 与 `http.ServeMux`（Go 1.22+ 方法式路由注册）；不引入第三方 Web 框架
- 若未来因路由或中间件复杂度需要引入 Web 框架，默认选用 `Gin`；不额外叠加更重的后端框架
- 数据访问统一使用 Go 原生 SQL 生态；当前不引入 ORM
- 后端代码按清晰边界组织为：HTTP 层、业务服务层、存储层、外部集成层
- `subconverter` 调用必须封装在独立集成模块内；业务层不得散落拼接其请求细节
- `internal/subconverter` 必须作为唯一的 `subconverter` 访问入口，负责承接 [04-business-rules](04-business-rules.md) 定义的转换契约，并集中管理请求构造、超时/并发/缓存等集成配置
- 节点 emoji 处理职责固定在 chain 业务层；`subconverter` 集成层不透传 `emoji`，具体业务规则见 [04 §0.2.3](04-business-rules.md)
- 模板 URL 的上游抓取允许增加运行时可选 TTL 缓存以降低公开部署的重复请求压力；部署默认模板 URL 必须可通过环境变量覆盖，并作为前端模板 URL 输入框的初始值公开；当请求中的显式模板 URL 等于部署默认模板 URL 时，可默认启用独立 TTL 与已验证缓存兜底，其他模板默认保持关闭，公开 preview 或其他共享部署可通过环境变量显式扩大范围
- 完整前端落地后，前端构建产物必须由后端统一提供；部署时对用户表现为一个主服务入口

### 4.1 `subconverter` 运行边界默认值

- 后端对 `subconverter` 的每次调用都必须设置超时；超时值必须可配置，默认 `15s`
- 后端对 `subconverter` 的同时在途请求数必须受控且可配置，默认 `10`
- 达到并发上限时，后端立即失败，不转发、不排队
- 默认部署下，`subconverter` 以“开启订阅/配置/规则集缓存”或等价的重复拉取收敛机制运行
- 业务层默认不对失败的 `subconverter` 调用自动重试
- 若显式启用重试，最多只允许 `1` 次串行重试，且不得并行放大请求
- 后端在转发给 `subconverter` 前先校验参与本次转换的输入边界；超限请求直接拒绝
- 阶段 1 的主预算口径固定为“完整上游请求 URI 长度”；该上限必须可配置，默认 `16384` bytes
- 若阶段 1 支持多 URL 输入，`landingRawText` 与 `transitRawText` 各自承载的输入项数量上限都必须可配置，默认每个字段最多 `32` 条

## 5. 前端实现约束

- **`web/` 包管理器为 npm**（`npm ci` / `npm install`）；CI、`scripts/dev-up.sh` 与测试 runbook 均按此路径；不支持 pnpm / yarn（`web/package-lock.json` 为唯一锁文件）
- 前端阶段默认使用 `React + TypeScript`
- 构建工具默认使用 `Vite`
- 当前定位为单页应用；不引入 `Next.js`、SSR、服务端组件或全栈 React 框架
- 状态管理以页面局部状态和轻量请求状态为主；不预设 Redux 一类全局状态方案
- 前端只消费后端返回的 `stage2Init`、`messages[]`、`blockingErrors[]` 等权威数据，不复制后端规则

## 6. 部署拓扑

### 6.1 Compose 服务划分

- `app`：主应用容器；完整前端接入后对外暴露 Web UI 与 API
- `subconverter`：内部转换服务容器；默认只在 Compose 内部网络可达，拆分部署时也应只通过私有 Docker 网络或等价内网地址暴露给 `app`

### 6.2 部署规则

- 默认只暴露 `app` 的宿主机端口
- `subconverter` 不对宿主机直接暴露端口
- 默认一体化 Compose 部署时，`app` 与 `subconverter` 必须加入同一私有 Compose 网络
- 默认一体化 Compose 部署时，`app` 必须声明对 `subconverter` 的启动依赖与健康检查依赖
- 若改为双 Docker 分离部署，`CHAIN_SUBCONVERTER_SUBCONVERTER_UPSTREAM_BASE_URL` 必须指向 `app` 可达的私有地址，`CHAIN_SUBCONVERTER_SUBCONVERTER_FACING_BASE_URL` 必须指向 `subconverter` 可回连的 `app` 地址
- 若引入 SQLite，数据库文件必须通过卷挂载持久化，避免容器重建导致短链接索引丢失
- 默认部署不要求额外引入 `nginx`、Redis、消息队列或外部数据库
- 在完整前端与持久化交付前，可保留仅包含 `app + subconverter` 的 API-only Compose 作为本地验证路径；该路径不代表正式单入口部署已完成

## 7. `subconverter` 集成与更新策略

- 默认集成方式为：Compose 中直接使用固定版本的 `subconverter` 官方镜像
- 版本固定值必须集中写在 Compose 配置或部署命令顶部变量中，便于手动升级
- 需要同步上游更新时，首选流程是：调整镜像版本 -> 拉取新镜像 -> 重启部署 -> 做兼容性验证
- 当前不将 `subconverter` 源码 vendoring 到本仓库，也不与其源码级强绑定
- 如确有必要，可增加**薄封装**镜像或本地构建覆盖配置，但该路径只作为手动维护选项，不作为默认路径
- 若改为双 Docker 分离部署，部署文档必须显式说明 `CHAIN_SUBCONVERTER_SUBCONVERTER_UPSTREAM_BASE_URL` 与 `CHAIN_SUBCONVERTER_SUBCONVERTER_FACING_BASE_URL` 的可达性要求
- 无论采用官方镜像、薄封装镜像还是双 Docker 分离部署，对主应用暴露的契约都必须保持为“部署侧私有 HTTP 服务”

## 8. 推荐项目结构

```text
chain-subconverter/
├── cmd/
│   └── server/
├── internal/
│   ├── api/
│   ├── service/
│   ├── store/
│   ├── subconverter/
│   └── config/
├── web/
│   ├── src/
│   └── dist/
├── deploy/
│   └── docker-compose.yml
├── templates/
└── docs/spec/
```

约束：

- `cmd/server` 只负责启动与装配
- `internal/subconverter` 是唯一的 `subconverter` 访问入口
- `internal/store` 预留给短链接存储实现
- `web` 目录预留给前端工程与构建产物
- `deploy` 目录只承载部署清单与部署说明

## 9. 测试与 CI（当前）

| 层 | 工具 | 范围 |
|----|------|------|
| 后端 | `go test ./...` | 含 `3pass-ss2022`、`dual-landing-chain-port-forward` fixture |
| 前端逻辑 | Vitest（`web`） | `stage1` / `stage2` / `state` / `notices`、`useAppWorkflow` 等纯逻辑 |
| 浏览器 | Playwright（`web`） | mocked 四象限入口（`test:e2e:mock:smoke` / `test:e2e:mock:full`）；本地/容器化，或 CI job `web-e2e-mock-smoke` + `web-e2e-mock-full`（blocking） |
| CI | GitHub Actions（`ci.yml`） | Go test；review / worker fixture freshness；Web 单测；`web-e2e-mock-smoke` + `web-e2e-mock-full`；`build:default`（blocking）；`build:b1`/`b2`/`c1`/`c2`（非 blocking）；compose config |
| 镜像发布校验 | `docker-publish.yml` validate | 等待同 SHA 的 `ci.yml` 成功（含 Vitest、mock E2E、fixture job 等 blocking job）；仅 `workflow_dispatch` 的 `dev-latest` 手动发布跳过 validate |

分层边界、fixture 维护流水线与 CI 缺口详见 [testing/README.md](../testing/README.md)（Vitest / mocked E2E 不读 canonical；`real-smoke` 默认读基础 canonical）。



