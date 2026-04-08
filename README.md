# chain-subconverter

帮助用户基于已有的**落地节点**和**中转节点**信息，通过 Web 前端完成 **Mihomo** 的**链式代理**与**端口转发**配置生成，并输出可直接消费的长链接和可选短链接。

## 状态

本项目处于 **spec 与开发并行推进阶段**：以已确认 spec 为准推进实现，并保持 spec 与实现同步。治理规则见 [docs/spec/00-governance.md](docs/spec/00-governance.md)。

当前实现状态、阶段结论与已知缺口统一见 [docs/progress/STATUS.md](docs/progress/STATUS.md)。spec 入口见 [docs/README.md](docs/README.md)，后续阶段规划见 [docs/ROADMAP.md](docs/ROADMAP.md)。既有 Python 实现已归档至 `_legacy/`。

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
│   ├── api/             # HTTP 层
│   ├── service/         # 业务逻辑与规则实现
│   ├── store/           # 短链接存储预留目录
│   ├── subconverter/    # subconverter 唯一集成入口（3-pass HTTP）
│   └── config/          # 配置管理
├── web/                 # 前端目录预留
├── deploy/              # 部署清单与本地验证入口
├── review/              # 文件驱动的前端业务 review 场景、任务脚本与辅助 Compose
├── docs/spec/           # 权威 spec
├── internal/review/testdata/
└── _legacy/             # 旧 Python 实现（归档）
```

## 技术栈

当前硬约束与后续实现方向统一见 [docs/spec/05-tech-stack.md](docs/spec/05-tech-stack.md)。当前实现快照仍以 [docs/progress/STATUS.md](docs/progress/STATUS.md) 为准。

## License

MIT
