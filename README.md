# chain-subconverter

帮助用户基于已有的**落地节点**和**中转节点**信息，通过 Web 前端完成 **Mihomo** 的**链式代理**与**端口转发**配置生成，并输出可直接消费的长链接和可选短链接。

## 状态

当前项目已进入 **3.0 开发后期与发布整理阶段**。默认入口为 `/`，当前公开滚动镜像为 `ghcr.io/slackworker/chain-subconverter:latest`，由 `main` 分支的 CI 发布；`beta` 分支预留给 Beta 阶段的 `beta-latest` 与后续版本标签，`dev` 分支用于手动快速构建 `dev-latest`。

相对 2.0，3.0 当前基线对用户最重要的变化：

- **前后端单镜像集成**：前端页面与后端服务已收口到同一个 `app` 镜像，单服务入口即可提供 UI 与 API。
- **Docker Compose 联合部署（app + subconverter）**：提供统一 Compose 路径编排 `app` 与 `subconverter`，第三方设备可直接冷启动。
- **可视化下拉菜单配置**：核心配置从手工拼参数转为界面选择，减少手填与试错成本。
- **支持短链**：可把生成结果压缩为短链接，便于在设备间分发和复用。
- **支持反向解析**：可通过已有链接恢复配置状态，便于回看、继续编辑和复用。

当前发布口径、滚动标签与后续 Beta / 正式版标签说明见 [RELEASES.md](RELEASES.md)。

## 快速开始

1. 按 [deploy/README.md](deploy/README.md) 的第三方设备单段命令部署。
2. 打开 `http://<device-ip>:<host-port>/`。
3. 按页面流程完成落地节点 / 中转节点配置并生成结果。
4. 按需要使用长链接、短链接或反向解析继续编辑；如需对照实验方案，再访问 `/ui/a`、`/ui/b`、`/ui/c`。

## 文档

完整文档入口与索引见 [docs/README.md](docs/README.md)。

- 用户部署与访问入口见 [deploy/README.md](deploy/README.md)
- 当前安全边界与部署假设见 [SECURITY.md](SECURITY.md)
- 当前发布与回归说明见 [docs/testing/release-runbook.md](docs/testing/release-runbook.md)
- 当前版本发布说明见 [RELEASES.md](RELEASES.md)
- 历史版本发布说明见 [_legacy/RELEASES.md](_legacy/RELEASES.md)

## 面向开发者

- 开发治理与 spec 入口见 [docs/spec/00-governance.md](docs/spec/00-governance.md)
- 当前实现状态与阶段缺口见 [docs/progress/STATUS.md](docs/progress/STATUS.md)
- 本地开发与联调入口见 [docs/testing/local-dev-smoke.md](docs/testing/local-dev-smoke.md)

当前长期分支口径：

- `dev`：日常开发与快速试验线；允许手动构建 `dev-latest`
- `beta`：预发布收口线；进入 Beta 阶段后承接 `beta-latest` 与可选 Beta 版本标签
- `main`：对外稳定主线；当前公开滚动镜像 `latest` 由该分支 CI 发布

## License

MIT
