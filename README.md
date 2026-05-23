# chain-subconverter

帮助用户基于已有的**落地节点**和**中转节点**信息，通过 Web 前端完成 **Mihomo** 的**链式代理**与**端口转发**配置生成，并输出可直接消费的长链接和可选短链接。

## 主要能力

- **单镜像集成**：前端页面与后端服务打包为同一 `app` 镜像，单入口提供 UI 与 API。
- **Compose 一键部署**：统一编排 `app` 与 `subconverter`，NAS、软路由等设备可直接冷启动。
- **可视化配置**：核心选项为网页下拉与表单，减少手填参数与试错。
- **短链与 short ID**：生成结果可压缩为短链或最多 11 位 short ID，便于跨设备分发。
- **反向解析**：粘贴长链、短链或 short ID 即可恢复配置并继续编辑。

## 快速开始

### 在线体验

公网 demo preview（`app` 与 `subconverter` 双 Docker 分离部署；2026-05-23 回归通过，详见 [docs/testing/third-party-deployments.md](docs/testing/third-party-deployments.md)）：

| 平台 | 入口 |
|------|------|
| Railway | https://chain-subconverter-production.up.railway.app/ |
| Koyeb | https://fantastic-loise-slackers-134ea8cc.koyeb.app/ |

仅供体验 UI 与转换流程；请勿提交真实节点或敏感订阅。

### 自部署

1. 按 [deploy/README.md](deploy/README.md) 的第三方设备单段命令部署。
2. 打开 `http://<device-ip>:<host-port>/`。
3. 按页面流程完成落地节点 / 中转节点配置并生成结果。
4. 按需要使用长链接、短链接或反向解析继续编辑。

## 使用注意

- 默认入口为 `/`；未针对手机浏览器专门优化，小屏体验不保证。
- 在线预览或他人托管实例请自行评估可用性与隐私；生产环境建议自部署。

## 文档

- 部署：[deploy/README.md](deploy/README.md)
- 安全：[SECURITY.md](SECURITY.md)
- 版本发布：[RELEASES.md](RELEASES.md)（2.x 及更早见 [_legacy/RELEASES.md](_legacy/RELEASES.md)）
- 完整索引：[docs/README.md](docs/README.md)

## 面向开发者

- 开发治理与 spec 入口：[docs/spec/00-governance.md](docs/spec/00-governance.md)
- 当前实现状态与阶段缺口：[docs/progress/STATUS.md](docs/progress/STATUS.md)
- 本地开发与联调：[docs/testing/local-dev-smoke.md](docs/testing/local-dev-smoke.md)

## License

MIT
