# 链式代理订阅转换

**节点 → 配置/订阅**：准备落地和中转节点/订阅，通过网页交互完成 **Mihomo** 链式代理的配置，输出完整 YAML 配置或订阅 URL。

> [v3.2.0-beta.3](RELEASES.md#v320-beta3) 已发布（3.2 Beta 线；Stage 2 行身份已切到 `rowId/proxyName/sourceLandingNodeName`）。上一里程碑：[v3.2.0-beta.2](RELEASES.md#v320-beta2)。

## 主要能力

- **部署简单**：Docker 一行拉起（含 subconverter），NAS / 软路由 / VPS 均可，占用极低。详见 [deploy/README.md](deploy/README.md)。
- **可视化配置**：链式代理、端口转发全程表单完成，不用写 YAML、不用反复试错。
- **即用输出**：转换➡️配置➡️生成 一体，输出可直接导入 Mihomo 的完整 YAML 与订阅链接。
- **轻量管理**：11 位 Short ID 跨设备打开同一份配置；**节点副本**可为同一落地搭多套中转线路。

## 快速开始

### 在线体验

公网预览：<https://chain-subconverter.koyeb.app/>（仅体验 UI 与流程；**请勿提交真实节点或敏感订阅**）

假数据参考：按 [docs/testing/preview-inputs.md](docs/testing/preview-inputs.md) 粘贴输入即可走完整流程。

### 自部署

1. 按 [deploy/README.md](deploy/README.md) 的第三方设备单段命令部署。
2. 打开 `http://<device-ip>:<host-port>/`。
3. 按页面流程完成落地节点 / 中转节点配置，生成 Mihomo 配置与订阅链接。
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
