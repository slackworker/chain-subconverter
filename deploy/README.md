# deploy

本目录承载当前阶段的最小部署清单，以及与部署直接相关的手工 smoke 资产。

## 当前范围

- 已提供 `docker-compose.yml`，用于编排 `app + subconverter`
- 该清单只覆盖 **API-only** 最小链路，不代表完整 `Phase 4`
- 当前 **不包含**：`web/` 前端、SQLite、短链、反向代理、正式单入口 Web UI

## 目录职责

- `docker-compose.yml`
  - API-only 最小运行栈
  - 只对宿主机暴露 `app:11200`
  - `subconverter` 仅在 Compose 内部网络可达
- `smoke/3pass-ss2022-test-subscription/`
  - 手工 smoke 验证用的中转订阅样例与同步脚本
  - 不作为自动化测试 golden 真相源

相关边界：

- `docs/testing/3pass-ss2022-test-subscription.md`
  - 当前默认基线的权威说明
- `testdata/subconverter/3pass-ss2022-test-subscription/`
  - 机器可读的 request / response / YAML golden

## 启动

在仓库根目录执行：

```bash
docker compose -f deploy/docker-compose.yml up --build -d
```

说明：

- `app` 使用当前仓库本地 `Dockerfile` 构建
- `subconverter` 默认直接拉取远程镜像 `ghcr.io/slackworker/subconverter:integration-chain-subconverter`
- `https://github.com/slackworker/subconverter` 是源码仓库地址，不是 Compose `image:` 可用值

检查状态：

```bash
docker compose -f deploy/docker-compose.yml ps
curl http://localhost:11200/healthz
```

## 环境变量与 Compose 变量

`docker-compose.yml` 当前同时涉及两类配置：

- 传给 `app` 进程的运行时环境变量：
  - `CHAIN_SUBCONVERTER_HTTP_ADDRESS=:11200`
  - `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL=http://localhost:11200`
  - `CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL=http://subconverter:25500/sub?`
- 仅由 Compose 在解析 `image:` 时使用的镜像选择变量：
  - `CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE=ghcr.io/slackworker/subconverter:integration-chain-subconverter`

说明：

- `CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE` 不会被 `app` 二进制读取
- 它只影响 Compose 最终拉取哪个 `subconverter` 镜像
- `app` 实际消费的仍是 `CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL`

如需修改对外访问地址，可在 Compose 中覆盖 `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL`。

如需切换 `subconverter` 远程镜像标签，可在启动前覆盖 `CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE`，例如：

```bash
export CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE=ghcr.io/slackworker/subconverter:integration-chain-subconverter
docker compose -f deploy/docker-compose.yml up --build -d
```

当前约定：

- `ghcr.io/slackworker/subconverter:integration-chain-subconverter`
  - 对应 `subconverter` 仓库 `integration/chain-subconverter` 分支
  - 用于当前集成链路与后续 VPS 部署
- `ghcr.io/slackworker/subconverter:latest`
  - 保留给 `subconverter` 仓库 `master` 分支
  - 不作为当前集成默认值

## 手工 Smoke 前置

先在仓库根目录启动一个只读静态文件服务：

```bash
python3 -m http.server 3001 --directory .
```

说明：

- `subconverter` 服务已通过 `host.docker.internal` 映射到宿主机，便于拉取本地样例文件
- `subconverter` 会按 URL 缓存远程订阅；调试时建议为样例 URL 增加 `?v=...` 之类的查询串
- 中转订阅样例位于 `deploy/smoke/3pass-ss2022-test-subscription/`
- 当前只把中转订阅单独落盘成文件；落地输入仍保持单条 URI 直接内联在请求体中，因为它不需要由 `subconverter` 额外发起 HTTP 拉取

如需人工查看或修改中转测试节点：

```bash
bash deploy/smoke/3pass-ss2022-test-subscription/sync-subscription.sh
```

约定：

- 编辑 `transit.subscription.raw.txt`
- 运行同步脚本后生成 `transit.subscription.b64.txt`
- `transit.subscription.b64.txt` 作为真实 `subconverter` 拉取的订阅响应体

## 最小基线验证

本节对齐 `docs/testing/3pass-ss2022-test-subscription.md` 的默认基线。

关键约束：

- `transitRawText` 指向中转订阅 URL
- `config` 保持空字符串
- 后端不会显式向 `subconverter` 传 `config` 参数
- 是否回落到默认 ini，以实际集成 `subconverter` 镜像内的默认配置为准

```bash
TRANSIT_URL='http://host.docker.internal:3001/deploy/smoke/3pass-ss2022-test-subscription/transit.subscription.b64.txt?v=1'

curl -sS -X POST http://localhost:11200/api/stage1/convert \
  -H 'Content-Type: application/json' \
  --data-binary @- <<EOF
{
  "stage1Input": {
    "landingRawText": "ss://MjAyMi1ibGFrZTMtYWVzLTI1Ni1nY206MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=@198.51.100.10:8888#SS2022-Test-256-US",
    "transitRawText": "$TRANSIT_URL",
    "forwardRelayRawText": "",
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": false,
      "config": "",
      "include": "",
      "exclude": "",
      "enablePortForward": false
    }
  }
}
EOF
```

```bash
TRANSIT_URL='http://host.docker.internal:3001/deploy/smoke/3pass-ss2022-test-subscription/transit.subscription.b64.txt?v=1'

curl -sS -X POST http://localhost:11200/api/generate \
  -H 'Content-Type: application/json' \
  --data-binary @- <<EOF
{
  "stage1Input": {
    "landingRawText": "ss://MjAyMi1ibGFrZTMtYWVzLTI1Ni1nY206MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=@198.51.100.10:8888#SS2022-Test-256-US",
    "transitRawText": "$TRANSIT_URL",
    "forwardRelayRawText": "",
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": false,
      "config": "",
      "include": "",
      "exclude": "",
      "enablePortForward": false
    }
  },
  "stage2Snapshot": {
    "rows": [
      {
        "landingNodeName": "🇺🇸 SS2022-Test-256-US",
        "mode": "chain",
        "targetName": "🇺🇸 美国节点"
      }
    ]
  }
}
EOF
```

拿到 `longUrl` 后再请求：

```bash
curl -sS 'http://localhost:11200/subscription?data=...'
```

## 兼容性 Smoke

本节不是 spec 默认基线，而是当前真实 `subconverter` 镜像的兼容性验证路径。

适用场景：

- 你需要显式对齐当前归档模板 `Custom_Clash.ini` 的区域组产物
- 你要确认真实镜像在指定模板 URL 时，输出是否与当前预期一致

说明：

- 这里显式传 `config`，只是 workaround
- 它不改变 `docs/testing/3pass-ss2022-test-subscription.md` 中“默认 `config` 留空”的权威基线
- 当前使用的是仓库内归档的 `_legacy/templates/default/Custom_Clash.ini`
- 它与 spec 中默认回落的 `base/config/Aethersailor_Custom_Clash.ini` 不是同一层概念

```bash
TRANSIT_URL='http://host.docker.internal:3001/deploy/smoke/3pass-ss2022-test-subscription/transit.subscription.b64.txt?v=1'
CONFIG_URL='http://host.docker.internal:3001/_legacy/templates/default/Custom_Clash.ini'

curl -sS -X POST http://localhost:11200/api/stage1/convert \
  -H 'Content-Type: application/json' \
  --data-binary @- <<EOF
{
  "stage1Input": {
    "landingRawText": "ss://MjAyMi1ibGFrZTMtYWVzLTI1Ni1nY206MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=@198.51.100.10:8888#SS2022-Test-256-US",
    "transitRawText": "$TRANSIT_URL",
    "forwardRelayRawText": "",
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": false,
      "config": "$CONFIG_URL",
      "include": "",
      "exclude": "",
      "enablePortForward": false
    }
  }
}
EOF
```

## 边界说明

- 当前 Compose 的目标是验证“现有 3 个 API + 真实 `subconverter`”的可运行路径
- 正式的前端接入、SQLite 持久化与完整部署形态仍以后续 `Phase 4` 为准
