# 05 - 技术选型与项目结构

> 本章定义重构版本的技术选型、部署形态与项目结构。接口契约见 [03-backend-api](03-backend-api.md)，`subconverter` 集成边界见 [04-business-rules](04-business-rules.md)。

---

## 1. 选型结论

- 项目统一采用 `Go + Gin + React + TypeScript + Vite + Tailwind CSS + SQLite + Docker Compose`
- `subconverter` 以**同一 Compose 部署内的内部容器**形式集成
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

## 3. 分层选型

| 层 | 选型 | 约束 |
|----|------|------|
| 后端 API | `Go + Gin` | 负责 HTTP API、长短链接、快照编码解码、YAML 改写、`subconverter` 调用与静态资源分发 |
| 前端 | `React + TypeScript + Vite` | 单页应用；负责三阶段表单、状态展示与交互，不做 SSR |
| 前端样式 | `Tailwind CSS` | 仅作为样式与布局层；不引入重量级前端框架 |
| 数据存储 | `SQLite` | 仅承载短链接索引与必要元数据；不引入独立数据库服务 |
| 部署 | `Docker Compose` | 统一编排主应用与 `subconverter`；面向 NAS、软路由与小型服务器 |
| 转换组件 | `subconverter` 官方镜像 | 作为内部 HTTP 服务运行；不直接暴露到宿主机公网端口 |

## 4. 后端实现约束

- Go 是后端唯一实现语言；不再保留 Python 作为正式实现路径
- Web 框架统一选用 `Gin`；不额外叠加更重的后端框架
- 数据访问统一使用 Go 原生 SQL 生态；当前不引入 ORM
- 后端代码按清晰边界组织为：HTTP 层、业务服务层、存储层、外部集成层
- `subconverter` 调用必须封装在独立集成模块内；业务层不得散落拼接其请求细节
- `internal/subconverter` 必须作为唯一的 `subconverter` 访问入口，负责承接 [04-business-rules](04-business-rules.md) 定义的转换契约，并集中管理请求构造、超时/并发/缓存等集成配置
- 前端构建产物必须由后端统一提供；部署时对用户表现为一个主服务入口

## 5. 前端实现约束

- 前端统一使用 `React + TypeScript`
- 构建工具统一使用 `Vite`
- 当前定位为单页应用；不引入 `Next.js`、SSR、服务端组件或全栈 React 框架
- 状态管理以页面局部状态和轻量请求状态为主；不预设 Redux 一类全局状态方案
- 前端只消费后端返回的 `stage2Init`、`messages[]`、`blockingErrors[]` 等权威数据，不复制后端规则

## 6. 部署拓扑

### 6.1 Compose 服务划分

- `app`：主应用容器，对外暴露 Web UI 与 API
- `subconverter`：内部转换服务容器，只在 Compose 内部网络可达

### 6.2 部署规则

- 默认只暴露 `app` 的宿主机端口
- `subconverter` 不对宿主机直接暴露端口
- `app` 与 `subconverter` 必须加入同一私有 Compose 网络
- `app` 必须声明对 `subconverter` 的启动依赖与健康检查依赖
- SQLite 文件必须通过卷挂载持久化，避免容器重建导致短链接索引丢失
- 默认部署不要求额外引入 `nginx`、Redis、消息队列或外部数据库
- 在完整 `Phase 4` 交付前，可提前提供仅包含 `app + subconverter` 的 API-only Compose 作为本地验证路径；该路径不代表前端、SQLite 与正式单入口部署已完成

## 7. `subconverter` 集成与更新策略

- 默认集成方式为：Compose 中直接使用固定版本的 `subconverter` 官方镜像
- 版本固定值必须集中写在 Compose 配置或 `.env` 中，便于手动升级
- 需要同步上游更新时，首选流程是：调整镜像版本 -> 拉取新镜像 -> 重启部署 -> 做兼容性验证
- 当前不将 `subconverter` 源码 vendoring 到本仓库，也不与其源码级强绑定
- 如确有必要，可增加**薄封装**镜像或本地构建覆盖配置，但该路径只作为手动维护选项，不作为默认路径
- 无论采用官方镜像还是薄封装镜像，对主应用暴露的契约都必须保持为“同部署内本地 HTTP 服务”

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
- `internal/store` 负责 SQLite 短链接索引
- `web` 目录只承载前端工程与构建产物
- `deploy` 目录只承载部署清单与相关示例配置



