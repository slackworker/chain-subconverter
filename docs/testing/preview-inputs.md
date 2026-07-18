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

- 模板 URL：`https://raw.githubusercontent.com/slackworker/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini`
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

- short ID 金样：`KSUKrhiWCIt`（Stage3 反向解析；同一份可见配置应得到一致 short ID）

- long URL payload 金样（`/sub?data=…`；scheme/host 随部署变化，同一份可见配置应得到一致 payload）：

```
/sub?data=H4sIAAAAAAAC_7xWT2_bNhT_KgF3FS3bcbpUgNB1wdZlQZciKnZZgoCiniRWFCmQlP-s8KWXAP0AGwZsyHbYTh3ay4DuAzXbbvkIAympid3YXnKYDjTJx_f4fj_y_ejnSBuSwWBfVLVBwXNEkjERFJLDyjAptJ2iUqQsQwHKjal04PuKTHoZM3kd1xoUlcKAMD0qS19zQouJVAUof6_WRpanhxWIPU50fnpUc9C-glT7OZBE-yVhwqdp1i11y3pMMOQhKOUzhgKjavAQTCmvE0CBqDn3EBMLQ12wag-U-RoUS2fdbJ1UjfvcQ6lUE6KSI-Bktm-g1Cj4Bik7wqQHU1JWHGz-wcej0TbyWlO8YNq1phMPcSISJrIjMnkKU4MCpC0lw_5wiGNOCtjGBDQe7tzDGS0DwqucYK2xzrAGqsB8Mri_29sZ9Ab9fm_QD0aj7Y8eukVRhKNHx2LMwUUctB92zcg2u92w-5Zi2RQfgKBq5g4vFFLAcd3vD-9poLViZhYqIJyZWTsrWOgSvA60MVVx0ZhwVcecUVxA65RWIc2VLNvIKZeTcGq4xqpSUzxmmknRmMysgtDQqsV31GztQK7lLAbjKHtW3UTZwFH2qV0TRfjLJ1eMDdsPu2Zkm91u2H1Loe7fgTGb3s2EucQ38PWeFIeg48TCMFng-1rSQj_QoMagwpKImnDs5nBevN_UgDbtrlKZcNDf7TdDBSVRhQ4fN47R4d5BtIO_OMCfE85jQotmma3aMIFSYttrIxGtmznbQx4yigjNzNU976qf5oQJrOuYSjEGZUBhmxBO2dTUCnTvmgj0mh_dS2DsJzantnz8RE4ElyTxHzJlUeCojjVVzJ0DHhyL_3O74QNDVAYmdAr0GAxBc69RxmEkSKVz6cSxORerHl3_AGYoQAtliDxEskxBRmxs6waCxBySTs20UcRAZh3T9lyQh0ooY1BPlJzOviIlOIm6PD97e3l-9mpruYK2hshbY93-0OrUZcX01hCdWLyyVhRadK6_n6AALfozoY19IJplVZcuClZtWEqr1Mgdo71Wjugrl98vz8_ebP3z2w8Xb1___fLFXy_-RHNvc2BHwIbQjdPFd2_evfz53U-_dNFPbPwP8F2xdxuQC15tOlZDlrKxL9IGVEtn28ayV_W0fb2WEa58v_77Ttu32emG53B-0rK5ohYGa2ohJVzD6lt3JfCbzuP15fnZH1sL6zdcjMbj4vtfL358tepWLMnzLZJYcNpwJ27gb53o353OlS_CJmBNfa5zv0OBW9gnXuPiFO-pc3qkZF1FE2Zobv9-luxbh_Oz6_I599AYBTvzfwMAAP__m8T0lLkKAAA
```
