# chain-subconverter

帮助用户基于已有的**落地节点**和**中转节点**信息，通过 Web 前端完成 **Mihomo** 的**链式代理**与**端口转发**配置生成，并输出可直接消费的长链接和可选短链接。

## 状态

本项目处于 **spec-driven 彻底重构阶段**。既有 Python 实现已归档至 `_legacy/`，新实现基于 Go + React。

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
├── cmd/server/          # 启动入口
├── internal/
│   ├── api/             # HTTP handlers (Gin)
│   ├── service/         # 业务逻辑
│   ├── store/           # SQLite 短链接索引
│   ├── subconverter/    # subconverter 唯一集成入口
│   └── config/          # 配置管理
├── web/                 # 前端工程 (React + TS + Vite)
├── deploy/              # Docker Compose 部署配置
├── docs/spec/           # 权威 spec
├── testdata/            # 测试夹具
└── _legacy/             # 旧 Python 实现（归档）
```

## 技术栈

Go + Gin · React + TypeScript + Vite + Tailwind CSS · SQLite · Docker Compose · subconverter (内部容器)

## License

MIT
