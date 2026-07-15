<!--
AUTO-GENERATED from:
- testdata/canonical-scenarios/dual-landing-chain-port-forward.stage1.json
- internal/review/testdata/dual-landing-chain-port-forward/stage1/output/stage1-convert.response.json
- internal/review/testdata/dual-landing-chain-port-forward/stage2/
Do not edit by hand. Refresh:
cd deploy/test-fixtures-worker && npm run sync
-->

# 在线预览粘贴数据

[在线预览 Demo](https://chain-subconverter.koyeb.app/) · [Full 场景说明](fixtures.md#full-场景) · [README](../../README.md)

Full 场景手工联调顺序：**落地 → SOCKS5 → 中转 → 高级（含端口转发）→ 转换**。落地区只贴 URI，勿用 Worker 落地订阅链接。

## Stage1

### 落地节点（4 行）

```
ss://2022-blake3-aes-256-gcm:alpha-ss-sg-secret@198.51.100.10:443#Alpha-SS-SG
vless://11111111-1111-4111-8111-111111111111@198.51.100.10:8443?encryption=none&security=reality&sni=alpha.example.com&pbk=alpha-public-key&fp=chrome&flow=xtls-rprx-vision&type=tcp#Alpha-Reality-SG
ss://2022-blake3-aes-256-gcm:beta-ss-jp-secret@198.51.100.11:443#Beta-SS-JP
vless://22222222-2222-4222-8222-222222222222@198.51.100.11:9443?encryption=none&security=reality&sni=beta.example.com&pbk=beta-public-key&fp=chrome&type=tcp#Beta-Reality-JP
```

### + 添加 SOCKS5

| 字段 | 值 |
|------|-----|
| 名称 | `Manual-SOCKS5-HK-Fallback` |
| 服务器 | `manual-socks-hk.example.test` |
| 端口 | `1080` |
| 用户名 | `demo-user` |
| 密码 | `demo-pass` |

SOCKS5 URI 输入（与上表字段二选一）：

```
socks5://demo-user:demo-pass@manual-socks-hk.example.test:1080#Manual-SOCKS5-HK-Fallback
```

添加后应生成并追加同一条 TG URI（用于核对）：

```
tg://socks?server=manual-socks-hk.example.test&port=1080&remarks=Manual-SOCKS5-HK-Fallback&user=demo-user&pass=demo-pass
```

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

- 模板 URL：`https://raw.githubusercontent.com/slackworker/Aethersailor-Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini`
- emoji：开启
- UDP：开启

## Stage2（转换后 → 按金样改 → 生成）

**转换后默认**

- 🇸🇬 Alpha-SS-SG · 链式 · 🇸🇬 新加坡节点
- 🇸🇬 Alpha-Reality-SG · 链式 · 🇸🇬 新加坡节点
- 🇯🇵 Beta-SS-JP · 链式 · 🇯🇵 日本节点
- 🇯🇵 Beta-Reality-JP · 链式 · 🇯🇵 日本节点
- 🇭🇰 Manual-SOCKS5-HK-Fallback · 链式 · 🇭🇰 香港节点

### Stage2 操作要点（先操作，再对照金样）

- 为 `🇸🇬 Alpha-SS-SG` 新建 `1` 个副本：默认实例设为 `链式 -> 🇭🇰 香港节点`，副本设为 `链式 -> 🇸🇬 新加坡节点`。
- 为 `🇸🇬 Alpha-Reality-SG` 新建 `2` 个副本：默认实例设为 `无`，两个副本分别设为 `端口转发 -> relay-a.example.com:7443`、`端口转发 -> relay-b.example.com:8443`。
- `🇯🇵 Beta-SS-JP` 保持 `链式 -> 🇯🇵 日本节点`；`🇯🇵 Beta-Reality-JP` 改为 `无`。
- 开启“线路聚合模式”，并在 `198.51.100.10` 组中勾选入组：`🇸🇬 Alpha-SS-SG`、`🇸🇬 Alpha-SS-SG 2`、`🇸🇬 Alpha-Reality-SG 2`、`🇸🇬 Alpha-Reality-SG 3`（不要勾选 `🇸🇬 Alpha-Reality-SG`）。
- 在 `198.51.100.10` 组的「顺序管理」中拖拽调整 fallback 顺序为：`🇸🇬 Alpha-Reality-SG 2` → `🇸🇬 Alpha-Reality-SG 3` → `🇸🇬 Alpha-SS-SG` → `🇸🇬 Alpha-SS-SG 2`。
- `198.51.100.11` 相关节点不入组聚合；同时开启“目标策略组节点切换优化”。

**生成前金样**

- 🇸🇬 Alpha-SS-SG · 链式 · 🇭🇰 香港节点
- 🇸🇬 Alpha-SS-SG 2 · 链式 · 🇸🇬 新加坡节点
- 🇸🇬 Alpha-Reality-SG · 无 · —
- 🇸🇬 Alpha-Reality-SG 2 · 端口转发 · relay-a.example.com:7443
- 🇸🇬 Alpha-Reality-SG 3 · 端口转发 · relay-b.example.com:8443
- 🇯🇵 Beta-SS-JP · 链式 · 🇯🇵 日本节点
- 🇯🇵 Beta-Reality-JP · 无 · —
- 🇭🇰 Manual-SOCKS5-HK-Fallback · 链式 · 🇭🇰 香港节点

## 验收

- short ID 金样：`D3T4I6bGT6d`（Stage3 反向解析；同一份可见配置应得到一致 short ID）

- long URL payload 金样（`/sub?data=…`；scheme/host 随部署变化，同一份可见配置应得到一致 payload）：

```
/sub?data=H4sIAAAAAAAC_7xWzW7cNhB-FYO9iqvd9Tp1BAiua7Spa6QOrKCX2jAoaiQxokiBpPanwV5yMZAHaFGghdtDe0qRXAqkDxS3vfkRClJS7N14vbUP1YFLcjjD-T5yPu5zpA3JYLAvqtqg4DkiyZgICslhZZgU2k5RKVKWoQDlxlQ68H1FJr2MmbyOaw2KSmFAmB6Vpa85ocVEqgKUvwsmB6UJ41LhvVobWZ4eViD2ONH56VHNQfsKUu3nQBLtl4QJn6aZ3y51y3pMMOQhKOUzhgKjavAQTCmvE0CBqDn3EBMLQ12wag-U-RoUS2fdbJ1UjfvcQ6lUE6KSI-Bktm-g1Cj4Bik7wqQHU1JWHCyY4OPRaBN5rSleMG1b04mHOBEJE9kRmTyFqUEB0pafYX84xDEnBWxiAhoPtx7gjJYB4VVOsNZYZ1gDVWA-GTzc7m0NeoN-vzfoB6PR5ke7blEU4ejRsRhzcBEH7YddM7LNdjfsvqVYNsUdEFTN3EmGQgo4rvv94QMNtFbMzEIFhDMza2cFC12C14E2piouGhOu6pgzigtondIqpLmSZRs55XISTg3XWFVqisdMMykak5lVEBpatfiOmq0dyFs5i8E4yp5VN1E2cJR9atdEEf7yyRVjw_bDrhnZZrsbdt9SqIf3YMymdzNhLvE1fL0nxSHoOLEwTBb4vpa00Dsa1BhUWBJRE47dHM6L95sa0KbdVSoTDvrb_WaooCSq0OHjxjE63DuItvAXB_hzwnlMaNEssyUcJlBKbHttJKJ1M2d7yENGEaGZubrnnRTQnDCBdR1TKcagDChsE8Ipm5page5dU4Re86N7CYz9xObUlo-fyIngkiT-LlMWBY7qWFPF3DngwbH4P7cb7hiiMjChU6DHYAiae41MDiNBKp1Lp5TNuVj16PoHMEMBWihD5CGSZQoyYmNbNxAk5pB0aqaNIgYy65i254I8VEIZg3qi5HT2FSnBSdTl-dnby_OzVxvLFbQxRN4t1s0PrU5dVkxvDNGJxStrRaFF5_r7CQrQoj8T2tjXollWdemiYNWGpbRKjdwx2mvliL5y-f3y_OzNxj-__XDx9vXfL1_89eJPNPfWB3YErAndOF189-bdy5_f_fRLF_3Exv8A3xV7dwG54NWmYzVkKRv7Iq1BtXS2bSx7VU_b12sZ4cr367_vtHmXnW54DucnLZsramFwSy2khGtYfeuuBH7deby-PD_7Y2Nh_ZqL0XhcfP_rxY-vVt2KJXm-QxILTmvuxA383Sb696dz5YuwDlhTn7e536PALewTr3FxivfUOT1Ssq6iCTM0t_9FS_atw_nZdfmce2iMgq35vwEAAP__0WWJKsYKAAA
```
