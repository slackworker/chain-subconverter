# chain-subconverter

帮助用户基于已有的**落地节点**和**中转节点**信息，通过 Web 前端完成 **Mihomo** 的**链式代理**与**端口转发**配置生成，并输出可直接消费的长链接和可选短链接。

## 状态

本项目处于 **spec 与开发并行推进阶段**：以已确认 spec 为准推进实现，并保持 spec 与实现同步。既有 Python 实现已归档至 `_legacy/`，新后端为 **Go**；前端与完整部署按 [docs/ROADMAP.md](docs/ROADMAP.md) 分阶段推进。治理规则见 [docs/spec/00-governance.md](docs/spec/00-governance.md)。

**当前实现（截至 Phase 2.5 收口）**：最小业务闭环与 golden 基线已落地；HTTP 层为标准库 `net/http`；`internal/store` 与短链仍为占位；`web/` 尚未初始化前端工程（计划 Phase 4）。权威规格与进度见 [docs/README.md](docs/README.md)、[docs/progress/STATUS.md](docs/progress/STATUS.md)。

## 文档

入口：[docs/README.md](docs/README.md)

| 文档 | 说明 |
|------|------|
| [spec/00-governance](docs/spec/00-governance.md) | 治理与总则 |
| [spec/01-overview](docs/spec/01-overview.md) | 项目概览 |
| [spec/02-frontend-spec](docs/spec/02-frontend-spec.md) | 前端 UI 规格 |
| [spec/03-backend-api](docs/spec/03-backend-api.md) | 后端 API 契约 |
| [spec/04-business-rules](docs/spec/04-business-rules.md) | 业务规则 |
| [spec/05-tech-stack](docs/spec/05-tech-stack.md) | 技术选型与项目结构 |

## 项目结构

```text
chain-subconverter/
├── cmd/server/          # 启动入口：配置加载、依赖装配、HTTP 监听
├── internal/
│   ├── api/             # HTTP 层：路由、JSON/YAML 编解码、错误映射到响应（当前：标准库 ServeMux）
│   ├── service/         # 业务逻辑：stage2Init、长链接载荷、YAML 渲染、与 subconverter 结果适配
│   ├── store/           # 短链接索引（SQLite）— Phase 3 实现，当前仅占位包
│   ├── subconverter/    # subconverter 唯一集成入口（3-pass HTTP）
│   └── config/          # 配置管理
├── web/                 # 前端工程占位；Phase 4 初始化（见 web/README.md）
├── deploy/              # API-only Compose 与 smoke（完整形态见 ROADMAP Phase 4）
├── docs/spec/           # 权威 spec
├── testdata/            # 机器可读 golden 与测试夹具
└── _legacy/             # 旧 Python 实现（归档）
```

## 技术栈

**目标栈（spec）**：Go + Gin · React + TypeScript + Vite + Tailwind CSS · SQLite · Docker Compose · subconverter（集成容器）。详见 [docs/spec/05-tech-stack.md](docs/spec/05-tech-stack.md)。

**当前仓库已落地**：Go 标准库 HTTP · subconverter 客户端 · Docker Compose（API-only）· 固定 `testdata` golden；Gin、SQLite 短链、前端工程为后续阶段实现。

## License

MIT
