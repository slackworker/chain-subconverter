<!--
AUTO-GENERATED from:
- testdata/canonical-scenarios/dual-landing-chain-port-forward.stage1.json
- internal/review/testdata/dual-landing-chain-port-forward/stage1/output/stage1-convert.response.json
- internal/review/testdata/dual-landing-chain-port-forward/stage2/
Do not edit by hand. Refresh:
cd deploy/test-fixtures-worker && npm run sync
-->

# dual-landing 手工测试数据

[在线预览 Demo](https://fantastic-loise-slackers-134ea8cc.koyeb.app/) · [fixture 说明](dual-landing-chain-port-forward.md) · [README](../../README.md)

顺序：**落地 → SOCKS5 → 中转 → 高级（含端口转发）→ 转换**。落地区只贴 URI，勿用 Worker 落地订阅链接。

## Stage1

### 落地节点（6 行）

```
ss://2022-blake3-aes-256-gcm:alpha-ss-hk-secret@198.51.100.10:443#Alpha-SS-HK
vless://11111111-1111-4111-8111-111111111111@198.51.100.10:8443?encryption=none&security=reality&sni=alpha.example.com&pbk=alpha-public-key&fp=chrome&flow=xtls-rprx-vision&type=tcp#Alpha-Reality-HK-PortForward
vless://11111111-1111-4111-8111-111111111112@198.51.100.10:8443?encryption=none&security=reality&sni=alpha.example.com&pbk=alpha-public-key&fp=chrome&type=tcp#Alpha-Reality-HK-Direct
ss://2022-blake3-aes-256-gcm:beta-ss-jp-secret@198.51.100.11:443#Beta-SS-JP
vless://22222222-2222-4222-8222-222222222221@198.51.100.11:9443?encryption=none&security=reality&sni=beta.example.com&pbk=beta-public-key&fp=chrome&flow=xtls-rprx-vision&type=tcp#Beta-Reality-JP-PortForward
vless://22222222-2222-4222-8222-222222222222@198.51.100.11:9443?encryption=none&security=reality&sni=beta.example.com&pbk=beta-public-key&fp=chrome&type=tcp#Beta-Reality-JP-Direct
```

### + 添加 SOCKS5

| 字段 | 值 |
|------|-----|
| 名称 | `Manual-SOCKS5-HK-Fallback` |
| 服务器 | `manual-socks-hk.example.test` |
| 端口 | `1080` |
| 用户名 | `demo-user` |
| 密码 | `demo-pass` |

### 中转信息（2 行）

```
https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-1
https://chain-subconverter-test-fixtures.slackworker.workers.dev/dual-landing/download/Airport-Subscription-2?target=ClashMeta
```

### 端口转发（直接 + 端口转发）

```
relay-a.example.com:7443
relay-b.example.com:8443
```

### 高级选项

- 模板 URL：`https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini`
- emoji：开启
- UDP：开启

## Stage2（转换后 → 按金样改 → 生成）

**转换后默认**

- 🇭🇰 Alpha-SS-HK · 链式 · 🇭🇰 香港节点
- 🇭🇰 Alpha-Reality-HK-PortForward · 链式 · 🇭🇰 香港节点
- 🇭🇰 Alpha-Reality-HK-Direct · 链式 · 🇭🇰 香港节点
- 🇯🇵 Beta-SS-JP · 链式 · 🇯🇵 日本节点
- 🇯🇵 Beta-Reality-JP-PortForward · 链式 · 🇯🇵 日本节点
- 🇯🇵 Beta-Reality-JP-Direct · 链式 · 🇯🇵 日本节点
- 🇭🇰 Manual-SOCKS5-HK-Fallback · 链式 · 🇭🇰 香港节点

**生成前金样**

- 🇭🇰 Alpha-SS-HK · 链式 · 🇭🇰 香港节点
- 🇭🇰 Alpha-Reality-HK-PortForward · 端口转发 · relay-a.example.com:7443
- 🇭🇰 Alpha-Reality-HK-Direct · 无 · —
- 🇯🇵 Beta-SS-JP · 链式 · 🇯🇵 日本节点
- 🇯🇵 Beta-Reality-JP-PortForward · 端口转发 · relay-b.example.com:8443
- 🇯🇵 Beta-Reality-JP-Direct · 无 · —
- 🇭🇰 Manual-SOCKS5-HK-Fallback · 链式 · 🇭🇰 香港节点

## 验收

- short ID 金样：`FPJw27S4ey`（Stage3 反向解析；预览站每次生成 ID 不同，Stage2 组合应一致）
