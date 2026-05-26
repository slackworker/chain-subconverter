# chain-subconverter

针对拥有**落地节点**（及**中转节点**）、希望可视化完成 **Mihomo** **链式代理**与**端口转发**配置、并轻量管理节点及配置信息的用户。

## 主要能力

- **轻量、易部署**：在具备 Docker 的环境中，一段命令即可拉完整服务，适用于 NAS、软路由、VPS，资源占用极低。详见 [deploy/README.md](deploy/README.md)。
- **纯 GUI、零代码**：全程网页下拉与表单点选即可完成链式代理与端口转发配置，无需编写 YAML、脚本或手填复杂参数，告别手搓与反复试错。
- **反向解析与轻量管理**： 11 位 short ID（或粘贴长/短链）即可跨设备恢复落地与中转配置，无需单独维护节点清单。自部署数据仅存本机，无隐私外泄风险。

## 快速开始

### 在线体验

公网预览：<https://fantastic-loise-slackers-134ea8cc.koyeb.app/>（仅体验 UI 与流程；**请勿提交真实节点或敏感订阅**）

假数据参考：按 [docs/testing/dual-landing-manual-reference.md](docs/testing/dual-landing-manual-reference.md) 粘贴输入即可走完整流程。

### 自部署

1. 按 [deploy/README.md](deploy/README.md) 的第三方设备单段命令部署。
2. 打开 `http://<device-ip>:<host-port>/`。
3. 按页面流程完成落地节点 / 中转节点配置并生成结果。
4. 按需要使用长链接、短链接或反向解析继续编辑。

## 文档入口

- 部署命令、环境变量与场景选择： [deploy/README.md](deploy/README.md)
- 常见部署问题与排障： [deploy/FAQ.md](deploy/FAQ.md)
- 安全边界与非承诺范围： [SECURITY.md](SECURITY.md)
- 版本记录： [RELEASES.md](RELEASES.md)
- 开发者与 AI Agent 内部索引： [docs/README.md](docs/README.md)

## 使用注意

- 默认入口为 `/`；未针对手机浏览器专门优化，小屏体验不保证。
- **隐私与安全**：节点与配置只保存在你自己部署的实例里，不会上传到第三方。在线预览仅供体验界面，请勿填入真实节点；日常使用请[自部署](deploy/README.md)。

## License

MIT
