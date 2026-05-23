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
- 在线预览或他人托管实例请自行评估可用性与隐私；生产环境建议自部署。

## 更多

- 部署说明：[deploy/README.md](deploy/README.md)
- 安全说明：[SECURITY.md](SECURITY.md)
- 版本记录：[RELEASES.md](RELEASES.md)

## License

MIT
