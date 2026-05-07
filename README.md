# chain-subconverter

帮助用户基于已有的**落地节点**和**中转节点**信息，通过 Web 前端完成 **Mihomo** 的**链式代理**与**端口转发**配置生成，并输出可直接消费的长链接和可选短链接。

## 状态

当前对外内测线已进入 **3.0 Alpha** 阶段，发布基线固定为 `alpha` 分支：默认镜像标签 `ghcr.io/slackworker/chain-subconverter:alpha-latest`，默认入口仍为 `/ui/a`。

相对 2.0，3.0 Alpha 对用户最重要的变化：

- **前后端单镜像集成**：前端页面与后端服务已收口到同一个 `app` 镜像，单服务入口即可提供 UI 与 API。
- **Docker Compose 联合部署（app + subconverter）**：提供统一 Compose 路径编排 `app` 与 `subconverter`，第三方设备可直接冷启动。
- **可视化下拉菜单配置**：核心配置从手工拼参数转为界面选择，减少手填与试错成本。
- **支持短链**：可把生成结果压缩为短链接，便于在设备间分发和复用。
- **支持反向解析**：可通过已有链接恢复配置状态，便于回看、继续编辑和复用。

本次 3.0 Alpha 的详细发布说明见 [RELEASES.md](RELEASES.md)。

## 快速开始

1. 按 [deploy/README.md](deploy/README.md) 的第三方设备单段命令部署。
2. 打开 `http://<device-ip>:<host-port>/ui/a`。
3. 按页面流程完成落地节点 / 中转节点配置并生成结果。
4. 按需要使用长链接、短链接或反向解析继续编辑。

## 文档

完整文档入口与索引见 [docs/README.md](docs/README.md)。

- 用户部署与访问入口见 [deploy/README.md](deploy/README.md)
- Alpha 发布与回归说明见 [docs/testing/alpha-release.md](docs/testing/alpha-release.md)
- 当前版本发布说明见 [RELEASES.md](RELEASES.md)
- 历史版本发布说明见 [_legacy/RELEASES.md](_legacy/RELEASES.md)

## 面向开发者

- 开发治理与 spec 入口见 [docs/spec/00-governance.md](docs/spec/00-governance.md)
- 当前实现状态与阶段缺口见 [docs/progress/STATUS.md](docs/progress/STATUS.md)
- 本地开发与联调入口见 [docs/testing/local-dev-smoke.md](docs/testing/local-dev-smoke.md)

当前长期分支口径：

- `main`：共享层、后端、脚本、部署、文档等公共改动的稳定主干
- `dev`：A/B/C 三套 UI 实现并存的日常集成线（原 `ui-lab`）
- `alpha`：对外 Alpha 发布线；默认仍以 `/ui/a` 作为回归入口

## License

MIT
