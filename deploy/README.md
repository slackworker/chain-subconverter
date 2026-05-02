# deploy

本目录只承载部署相关内容。

## 当前范围

- 已提供 `docker-compose.yml`，用于编排 `app + subconverter`
- SQLite 短链接索引默认通过 Compose 命名卷持久化
- 当前同时覆盖本机预览与第三方设备部署所需的最小运行路径
- 完整阶段状态与缺口统一见 [../docs/progress/STATUS.md](../docs/progress/STATUS.md)

## 启动

### 第三方设备 / 局域网设备

首次部署时，复制下面整段命令到本地，先按设备实际情况修改顶部变量，再整段粘贴执行即可。

若已部署过，且新版文档中的这段 Compose 命令或服务编排内容发生变化，也按同样方式复制最新整段命令重新执行，以刷新本地 `docker-compose.yml`。

```bash
APP_DIR="$HOME/chain-subconverter"
HOST_PORT="11200"
# PUBLIC_BASE_URL 可选：直连局域网或其他单入口部署通常无需配置，服务端会按请求来源自动推断。
# 仅在 HTTPS 反代/公网域名、多入口或需要固定发布地址时填写，例如 https://example.com；若直接暴露端口，可用 http://<设备IP>:11200。
# PUBLIC_BASE_URL=""
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:alpha-latest"
SUBCONVERTER_IMAGE="ghcr.io/slackworker/subconverter:integration-chain-subconverter"
SHORT_LINK_CAPACITY="1000"
DEFAULT_TEMPLATE_URL="https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini"

mkdir -p "$APP_DIR"
cd "$APP_DIR"

cat > docker-compose.yml <<EOF
services:
  subconverter:
    image: "${SUBCONVERTER_IMAGE}"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:25500/version || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  app:
    image: "${APP_IMAGE}"
    depends_on:
      subconverter:
        condition: service_healthy
    environment:
      CHAIN_SUBCONVERTER_HTTP_ADDRESS: :11200
      # PUBLIC_BASE_URL 可选；直连局域网通常留空，HTTPS 反代/公网域名或多入口场景再显式填写。
      # 若需固定发布地址，取消注释并填入实际可访问地址（例如 https://example.com）：
      # CHAIN_SUBCONVERTER_PUBLIC_BASE_URL: "${PUBLIC_BASE_URL}"
      CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL: http://app:11200
      CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_URL: "${DEFAULT_TEMPLATE_URL}"
      CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL: 5m
      CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL: http://subconverter:25500/sub?
      CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH: /data/short-links.sqlite3
      CHAIN_SUBCONVERTER_SHORT_LINK_CAPACITY: "${SHORT_LINK_CAPACITY}"
    ports:
      - "${HOST_PORT}:11200"
    volumes:
      - short-link-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:11200/healthz || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 5s

volumes:
  short-link-data:
EOF

docker compose pull
docker compose up -d --force-recreate
```

检查状态：

```bash
cd "$HOME/chain-subconverter"
docker compose ps
curl "http://127.0.0.1:${HOST_PORT:-11200}/healthz"
```

局域网内其他终端应访问：

```text
http://<device-ip>:<host-port>/ui/a
```

### 仓库内 Compose 预览

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

## 更新

### 第三方设备 / 局域网设备

如果只是刷新同一份 `docker-compose.yml` 中引用的镜像 tag，例如 `alpha-latest` 已有新内容，可在设备上执行：

```bash
cd "$HOME/chain-subconverter"
docker compose pull
docker compose up -d
docker compose ps
curl "http://127.0.0.1:${HOST_PORT:-11200}/healthz"
```

这会拉取新镜像并按当前 Compose 配置重建容器；命名卷 `short-link-data` 不会因此删除，现有 SQLite 短链接索引会保留。

如果本轮更新同时改了以下任一项：

- `APP_IMAGE`
- `SUBCONVERTER_IMAGE`
- `HOST_PORT`
- `PUBLIC_BASE_URL`
- `SHORT_LINK_CAPACITY`
- 其他 `app` 环境变量

不要只执行 `docker compose pull`；应回到“首次部署”那段单段命令，先修改顶部变量，再整段重新执行一遍，以重新生成最新的 `docker-compose.yml`，然后再由 Compose 拉取镜像并重建容器。

更新后至少复验：

- `docker compose ps` 中 `app` 与 `subconverter` 为健康状态
- `GET /healthz` 成功
- 浏览器可打开 `http://<device-ip>:<host-port>/ui/a`
- 至少跑通一条 `POST /api/stage1/convert` 与最终订阅读取路径

### 仓库内 Compose 预览

如果更新的是仓库源码或 Dockerfile，在仓库根目录执行：

```bash
git pull
docker compose -f deploy/docker-compose.yml up --build -d
docker compose -f deploy/docker-compose.yml ps
curl http://localhost:11200/healthz
```

其中 `--build` 会按当前源码重新构建 `app` 镜像并重建容器。

如果只想同步 `subconverter` 远端镜像，也可以额外先执行：

```bash
docker compose -f deploy/docker-compose.yml pull subconverter
docker compose -f deploy/docker-compose.yml up --build -d
```

## 环境变量

部署命令顶部变量用于生成最终的 `docker-compose.yml`：

- `APP_DIR`：本机保存 Compose 文件的位置
- `HOST_PORT`：宿主机对外暴露的端口
- `PUBLIC_BASE_URL`：**可选**。对浏览器、短链与订阅结果公开的外部地址。未配置时服务端自动按请求来源（`Host` 请求头与 TLS 状态）推断，适用于直连局域网或 DDNS 等单入口部署。**若前端有 Nginx/Caddy 等反代做 HTTPS 终止**，服务端看不到 TLS，自动推断会产生 `http://` 链接，此时必须显式填入 `https://<域名>` 才能生成正确的订阅链接。多入口或固定发布地址场景同理
- `APP_IMAGE`：主应用镜像；`alpha-latest` 由 `UI-A` 分支 push 自动更新，内测稳定后可改成明确版本标签，例如 `ghcr.io/slackworker/chain-subconverter:0.1.0-alpha.1`
- `SUBCONVERTER_IMAGE`：集成 `subconverter` 镜像；按需要锁定版本
- `SHORT_LINK_CAPACITY`：短链接索引容量
- `DEFAULT_TEMPLATE_URL`：阶段 1 模板 URL 输入框的部署默认初始值；默认是推荐的 Aethersailor GitHub Raw 模板，可按部署需要替换为自托管或镜像地址

生成后的 `docker-compose.yml` 当前涉及两类配置：

- 传给 `app` 的运行时环境变量
  - `CHAIN_SUBCONVERTER_HTTP_ADDRESS=:11200`
  - `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL`：**可选**。对浏览器、短链与订阅结果公开的外部地址。未配置时服务端自动按请求来源推断，适用于直连局域网或 DDNS 等单入口部署。若前端有反代做 HTTPS 终止，或需固定发布地址，按实际可访问地址填入（`https://` 或 `http://`），不要填容器内地址
  - `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL=http://app:11200`
  - `CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_URL`：阶段 1 模板 URL 输入框的部署默认初始值，同时通过 `/api/runtime-config` 供前端填入 `advancedOptions.config`
  - `CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL=5m`
  - `CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL=http://subconverter:25500/sub?`
  - `CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH=/data/short-links.sqlite3`
  - `CHAIN_SUBCONVERTER_SHORT_LINK_CAPACITY=1000`
- 由 Compose 解析的宿主机 / 镜像变量
  - `HOST_PORT=11200`
  - `APP_IMAGE=ghcr.io/slackworker/chain-subconverter:alpha-latest`
  - `SUBCONVERTER_IMAGE=ghcr.io/slackworker/subconverter:integration-chain-subconverter`

如需切换或刷新镜像标签，可修改命令顶部的 `APP_IMAGE` 与 `SUBCONVERTER_IMAGE` 后重新执行；命令会先拉取远端镜像，再启动 Compose。

`app` 服务会把 SQLite 文件写入命名卷 `short-link-data`，用于在容器重建后保留短链接索引。

`CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 默认走 Compose 内部服务地址 `http://app:11200`，供 `subconverter` 在私有网络内回取托管模板；该地址不是对外公开入口。

`CHAIN_SUBCONVERTER_PUBLIC_BASE_URL` 与 `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 不是同一个概念：前者给浏览器和最终链接使用，后者只给容器内的 `subconverter` 回连托管模板使用。第三方设备部署时，不要把前者写成 `http://app:11200`，也不要把后者改成宿主机 IP。

`CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_URL` 必须是 HTTP(S) URL。前端会把它作为普通模板 URL 写入阶段 1 输入快照、生成请求与长链接载荷。当请求中的模板 URL 等于该部署默认值时，模板成功拉取并通过解析后会进入默认模板缓存；后续刷新失败时，服务可使用此前验证通过的缓存继续完成转换，并在支持 `messages[]` 的接口响应中返回 warning。若没有可用缓存，仍会返回 `TEMPLATE_CONFIG_UNAVAILABLE`。

`CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL` 控制显式模板 URL 等于部署默认模板 URL 时的上游抓取缓存 TTL；默认即为非零值，用于降低默认路径在公开部署或意外暴露场景下对模板上游的重复请求压力。当前 Compose preview 显式设为 `5m`。

`CHAIN_SUBCONVERTER_TEMPLATE_FETCH_CACHE_TTL` 控制其他模板 URL 的上游抓取缓存 TTL；留空或设为 `0` 表示关闭。若同时设置两个变量，内置默认模板优先使用 `CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL`，其他模板使用 `CHAIN_SUBCONVERTER_TEMPLATE_FETCH_CACHE_TTL`。

`CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL` 推荐显式写成完整 endpoint，例如 `http://subconverter:25500/sub`。当前服务启动时会自动补全缺失的 `http://` 与 `/sub`，因此 `subconverter:25500`、`http://subconverter:25500` 也可接受；若显式提供路径前缀，例如 `http://subconverter:25500/proxy`，则会归一化为 `http://subconverter:25500/proxy/sub`。

若是单容器托管平台且未挂卷，镜像默认会退回到 `/tmp/short-links.sqlite3`，以保证预览环境至少可启动；该路径仅适合无状态预览，不保证重建后保留短链接数据。

## Alpha 部署建议

- 第三方设备内测优先使用发布到 GHCR 的 `APP_IMAGE`，不要依赖设备本地源码构建；当前默认 `alpha-latest` 对应 `UI-A` 分支最新成功构建
- 每次切换镜像 tag 后，至少复验 `GET /healthz`、`/ui/a`、`POST /api/stage1/convert` 与一条最终订阅读取路径
- 内测设备建议保留默认命名卷 `short-link-data`，并在容器重启后确认短链仍可恢复
- 发布前检查、第三方设备最小回归与反馈记录模板统一见 [../docs/testing/alpha-release.md](../docs/testing/alpha-release.md)

## 边界

- 稳定自动化 fixture 位于 `internal/review/testdata/`
- 真实人工验证统一走 Compose 启动后的前端页面、`/api/*` 与订阅路径
- 本地 UI 热更新联调与端口复用策略见 [../docs/testing/local-dev-smoke.md](../docs/testing/local-dev-smoke.md)
- 本 README 只说明 Compose 启动与环境变量；不重复维护阶段状态说明
