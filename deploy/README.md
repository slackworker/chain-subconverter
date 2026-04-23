# deploy

本目录只承载部署相关内容。

## 当前范围

- 已提供 `docker-compose.yml`，用于编排 `app + subconverter`
- SQLite 短链接索引默认通过 Compose 命名卷持久化
- 当前只覆盖本地验证所需的最小运行路径
- 完整阶段状态与缺口统一见 [../docs/progress/STATUS.md](../docs/progress/STATUS.md)

## 启动

在仓库根目录执行：

```bash
docker compose -f deploy/docker-compose.yml up --build -d
```

检查状态：

```bash
docker compose -f deploy/docker-compose.yml ps
curl http://localhost:11200/healthz
```

若只是日常前端开发与热更新联调，优先使用仓库根目录的 `./scripts/dev-up.sh <scheme>` 或 VS Code 任务 `dev: up`；Compose 路径继续保留为正式预览 / 集成验证主路径。

## 环境变量

`docker-compose.yml` 当前涉及两类配置：

- 传给 `app` 的运行时环境变量
  - `CHAIN_SUBCONVERTER_HTTP_ADDRESS=:11200`
  - `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL=http://localhost:11200`
  - `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL=http://app:11200`
  - `CHAIN_SUBCONVERTER_TEMPLATE_FETCH_CACHE_TTL=5m`
  - `CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL=http://subconverter:25500/sub?`
  - `CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH=/data/short-links.sqlite3`
  - `CHAIN_SUBCONVERTER_SHORT_LINK_CAPACITY=1000`
- 仅由 Compose 解析 `image:` 时使用的镜像变量
  - `CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE=ghcr.io/slackworker/subconverter:integration-chain-subconverter`

如需切换镜像标签，可在启动前覆盖 `CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE`。

`app` 服务会把 SQLite 文件写入命名卷 `short-link-data`，用于在容器重建后保留短链接索引。

`CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 默认走 Compose 内部服务地址 `http://app:11200`，供 `subconverter` 在私有网络内回取托管模板；该地址不是对外公开入口。

`CHAIN_SUBCONVERTER_TEMPLATE_FETCH_CACHE_TTL` 控制模板上游抓取缓存的 TTL；留空或设为 `0` 表示关闭缓存，适合个人私有部署。当前 Compose preview 默认设为 `5m`，用于降低公开预览场景下对模板上游的重复请求压力。

`CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL` 推荐显式写成完整 endpoint，例如 `http://subconverter:25500/sub`。当前服务启动时会自动补全缺失的 `http://` 与 `/sub`，因此 `subconverter:25500`、`http://subconverter:25500` 也可接受；若显式提供路径前缀，例如 `http://subconverter:25500/proxy`，则会归一化为 `http://subconverter:25500/proxy/sub`。

若是单容器托管平台且未挂卷，镜像默认会退回到 `/tmp/short-links.sqlite3`，以保证预览环境至少可启动；该路径仅适合无状态预览，不保证重建后保留短链接数据。

## 边界

- 稳定自动化 fixture 位于 `internal/review/testdata/`
- 真实人工验证统一走 Compose 启动后的前端页面、`/api/*` 与订阅路径
- 本地 UI 热更新联调与端口复用策略见 [../docs/testing/local-dev-smoke.md](../docs/testing/local-dev-smoke.md)
- 本 README 只说明 Compose 启动与环境变量；不重复维护阶段状态说明
