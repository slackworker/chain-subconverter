# chain-subconverter

针对拥有**落地节点**（及**中转节点**）、希望可视化完成 **Mihomo** **链式代理**与**端口转发**配置、并轻量管理节点及配置信息的用户。

## 主要能力

- **轻量、易部署**：在具备 Docker 的环境中，一段命令即可拉完整服务，适用于 NAS、软路由、VPS，资源占用极低。详见 [deploy/README.md](deploy/README.md)。
- **纯 GUI、零代码**：全程网页下拉与表单点选即可完成链式代理与端口转发配置，无需编写 YAML、脚本或手填复杂参数，告别手搓与反复试错。
- **反向解析与轻量管理**： 11 位 short ID（或粘贴长/短链）即可跨设备恢复落地与中转配置，无需单独维护节点清单。自部署数据仅存本机，无隐私外泄风险。

## 快速开始

### 在线体验

公网预览：<https://fantastic-loise-slackers-134ea8cc.koyeb.app/>

仅供体验 UI 与转换流程；请勿提交真实节点或敏感订阅。

以下为示例测试数据（假节点），可粘贴到上述预览站体验完整流程：

**落地 URI（6 条，每行一条）**

```
ss://2022-blake3-aes-256-gcm:alpha-ss-hk-secret@198.51.100.10:443#Alpha-SS-HK
vless://11111111-1111-4111-8111-111111111111@198.51.100.10:8443?encryption=none&security=reality&sni=alpha.example.com&pbk=alpha-public-key&fp=chrome&flow=xtls-rprx-vision&type=tcp#Alpha-Reality-HK-PortForward
vless://11111111-1111-4111-8111-111111111112@198.51.100.10:8443?encryption=none&security=reality&sni=alpha.example.com&pbk=alpha-public-key&fp=chrome&type=tcp#Alpha-Reality-HK-Direct
ss://2022-blake3-aes-256-gcm:beta-ss-jp-secret@198.51.100.11:443#Beta-SS-JP
vless://22222222-2222-4222-8222-222222222221@198.51.100.11:9443?encryption=none&security=reality&sni=beta.example.com&pbk=beta-public-key&fp=chrome&flow=xtls-rprx-vision&type=tcp#Beta-Reality-JP-PortForward
vless://22222222-2222-4222-8222-222222222222@198.51.100.11:9443?encryption=none&security=reality&sni=beta.example.com&pbk=beta-public-key&fp=chrome&type=tcp#Beta-Reality-JP-Direct
```

**手动 SOCKS5（「+ 添加 SOCKS5」表单）**

| 字段 | 值 |
|------|-----|
| 名称 | `Manual-SOCKS5-HK-Fallback` |
| 服务器 | `manual-socks-hk.example.test` |
| 端口 | `1080` |
| 用户名 | `demo-user` |
| 密码 | `demo-pass` |

**中转订阅 URL（2 条，填入「中转」；Base64 / ClashMeta 各一行）**

```
https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-1
https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-2?target=ClashMeta
```

**端口转发 relay（2 条，每行一条）**

```
relay-a.example.com:7443
relay-b.example.com:8443
```

### 自部署

1. 按 [deploy/README.md](deploy/README.md) 的第三方设备单段命令部署。
2. 打开 `http://<device-ip>:<host-port>/`。
3. 按页面流程完成落地节点 / 中转节点配置并生成结果。
4. 按需要使用长链接、短链接或反向解析继续编辑。

## 使用注意

- 默认入口为 `/`；未针对手机浏览器专门优化，小屏体验不保证。
- **隐私与安全**：节点与配置只保存在你自己部署的实例里，不会上传到第三方。在线预览仅供体验界面，请勿填入真实节点；日常使用请[自部署](deploy/README.md)。

## License

MIT
