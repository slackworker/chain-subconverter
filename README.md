# chain-subconverter

帮助用户基于已有的**落地节点**和**中转节点**信息，通过 Web 前端完成 **Mihomo** 的**链式代理**与**端口转发**配置生成，并输出可直接消费的长链接和可选短链接。

## 状态

本项目处于 **spec 与开发并行推进阶段**：以已确认 spec 为准推进实现，并保持 spec 与实现同步。治理规则见 [docs/spec/00-governance.md](docs/spec/00-governance.md)。
当前实现状态见 [docs/progress/STATUS.md](docs/progress/STATUS.md)，阶段规划见 [docs/ROADMAP.md](docs/ROADMAP.md)。既有 Python 实现已归档至 `_legacy/`。

## 文档

完整文档入口、阅读顺序与索引统一见 [docs/README.md](docs/README.md)。

## 部署

- 本地开发与联调入口见 [docs/testing/local-dev-smoke.md](docs/testing/local-dev-smoke.md)
- `Docker Compose` 部署入口见 [deploy/README.md](deploy/README.md)
- 第三方设备部署可直接复制 [deploy/README.md](deploy/README.md) 中的单段命令，按需固定 `PUBLIC_BASE_URL`，并修改镜像标签与端口后执行

## License

MIT
