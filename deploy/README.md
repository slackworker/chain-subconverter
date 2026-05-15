# deploy

本目录只承载部署相关内容。

## 当前范围

- 已提供默认一体化 `docker-compose.yml`，用于编排 `app + subconverter`；与下文第三方设备单段命令生成的 Compose 保持同一拉镜像口径
- 默认推荐 `subconverter` 以内网 Compose 服务形式随 `app` 一起部署；如部署方已有独立 Docker 化 `subconverter`，也允许改为双 Docker 分离部署
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
# 公网/HTTPS 反代场景建议同时开启，要求未设置 PUBLIC_BASE_URL 时启动直接失败：
# REQUIRE_PUBLIC_BASE_URL="false"
# 默认会拒绝拉取指向私网/loopback 的模板 URL；只有在可信自部署环境且确实需要内网模板源时，才显式开启：
# TEMPLATE_ALLOW_PRIVATE_NETWORKS="false"
# 默认四个写接口共用 per-IP token bucket；设为 0 可关闭，仅建议本地调试时使用：
# WRITE_REQUESTS_PER_MINUTE="60"
# 推荐在正式记录里同时记下本次实际使用的不可变版本 tag，例如 v3.0.0-alpha.1。
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
    networks:
      - subconverter-backend
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
      # 公网/HTTPS 反代场景建议同时开启，要求未设置 PUBLIC_BASE_URL 时启动失败：
      # CHAIN_SUBCONVERTER_REQUIRE_PUBLIC_BASE_URL: "${REQUIRE_PUBLIC_BASE_URL}"
      # 仅在可信内网环境且模板 URL 需要指向私网/loopback 地址时才开启：
      # CHAIN_SUBCONVERTER_TEMPLATE_ALLOW_PRIVATE_NETWORKS: "${TEMPLATE_ALLOW_PRIVATE_NETWORKS}"
      # 设为 0 可关闭；默认建议保留：
      # CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE: "${WRITE_REQUESTS_PER_MINUTE}"
      CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL: http://app:11200
      CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_URL: "${DEFAULT_TEMPLATE_URL}"
      CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL: 5m
      CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL: http://subconverter:25500/sub?
      CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH: /data/short-links.sqlite3
      CHAIN_SUBCONVERTER_SHORT_LINK_CAPACITY: "${SHORT_LINK_CAPACITY}"
    networks:
      - subconverter-backend
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

networks:
  subconverter-backend:
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
http://<device-ip>:<host-port>/
```

该默认路径中，`subconverter` 只加入私有 Docker 网络 `subconverter-backend`，不对宿主机直接暴露端口；浏览器与其他终端只访问 `app`。

### 双 Docker 分离部署（可选）

若你已经有独立维护的 Docker 化 `subconverter`，或希望把 `app` 与 `subconverter` 放到两个独立 Compose 项目中，也可以这样部署；但当前仍以“同宿主机或同私有 Docker 网络内的内部 HTTP 服务”作为推荐口径。

分离部署时必须同时满足：

- `CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL` 指向 `app` 容器可达的 `subconverter` 内部地址，例如 `http://subconverter:25500/sub` 或同类私有地址
- `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 指向 `subconverter` 可回连的 `app` 地址；若两者共享 Docker 网络，可继续使用 `http://app:11200`，否则必须改成 `subconverter` 侧可访问的宿主机 / 反代 / 内网地址
- `subconverter` 仍不应直接暴露到公网；若确需跨项目通信，优先使用共享 Docker 网络、反代后的内网入口或宿主机防火墙限制后的局域网地址

常见做法：

- 同一台机器、两个 Compose 项目：先创建一个共享 Docker network，再让两个项目都加入该网络，分别使用服务名互访
- 同一台机器、单独容器：把 `CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL` 写成该容器在共享网络中的 DNS 名称
- 不同主机：必须显式设置 `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 为 `subconverter` 能访问到的 `app` 外部地址，并自行承担链路加密、访问控制与 egress 控制

如采用双 Docker 分离部署，建议至少把下列变量写入 `app` 的 Compose：

```yaml
environment:
  CHAIN_SUBCONVERTER_HTTP_ADDRESS: :11200
  CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL: http://app:11200
  CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL: http://subconverter:25500/sub
  CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH: /data/short-links.sqlite3
```

其中 `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 是否还能写成 `http://app:11200`，取决于你的外部 `subconverter` 是否真能解析并访问 `app` 这个服务名；不能时就必须改成其他可达地址。

### 仓库内 Compose 预览

在仓库根目录执行：

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d --force-recreate
```

检查状态：

```bash
docker compose -f deploy/docker-compose.yml ps
curl http://localhost:11200/healthz
```

若只是日常前端开发与热更新联调，优先使用仓库根目录的 `./scripts/dev-up.sh <scheme>` 或 VS Code 任务 `dev: up`；Compose 路径继续保留为正式预览 / 集成验证主路径。若需验证未发布到 GHCR 的本地源码构建，请走 `dev-up` 或自行 `docker build` 后改写 `app.image`，不要依赖 Compose 本地构建。

## 更新

### 第三方设备 / 局域网设备

如果只是刷新同一份 `docker-compose.yml` 中引用的镜像 tag，例如 `alpha-latest` 已有新内容，或你已经把 `APP_IMAGE` 固定成某个明确的 `v3.0.0-alpha.N`，可在设备上执行：

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
- `WRITE_REQUESTS_PER_MINUTE`
- `SHORT_LINK_CAPACITY`
- 其他 `app` 环境变量

不要只执行 `docker compose pull`；应回到“首次部署”那段单段命令，先修改顶部变量，再整段重新执行一遍，以重新生成最新的 `docker-compose.yml`，然后再由 Compose 拉取镜像并重建容器。

更新后至少复验：

- `docker compose ps` 中 `app` 与 `subconverter` 为健康状态
- `GET /healthz` 成功
- 浏览器可打开 `http://<device-ip>:<host-port>/`
- 至少跑通一条 `POST /api/stage1/convert` 与最终订阅读取路径

### 仓库内 Compose 预览

如果只是同步仓库内 `deploy/docker-compose.yml` 或远端镜像 tag，在仓库根目录执行：

```bash
git pull
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
curl http://localhost:11200/healthz
```

若本轮要验证未发布到 GHCR 的本地源码或 Dockerfile 变更，请改用 `./scripts/dev-up.sh <scheme>`，或自行 `docker build` 后改写 `app.image` 再启动 Compose。

如果只想同步 `subconverter` 远端镜像，也可以额外先执行：

```bash
docker compose -f deploy/docker-compose.yml pull subconverter
docker compose -f deploy/docker-compose.yml up -d
```

## 环境变量

部署命令顶部变量用于生成最终的 `docker-compose.yml`；若采用双 Docker 分离部署，还需额外关注后文列出的关键运行时环境变量：

- `APP_DIR`：本机保存 Compose 文件的位置
- `HOST_PORT`：宿主机对外暴露的端口
- `PUBLIC_BASE_URL`：**可选**。对浏览器、短链与订阅结果公开的外部地址。未配置时服务端自动按请求来源（`Host` 请求头与 TLS 状态）推断，适用于直连局域网或 DDNS 等单入口部署。**若前端有 Nginx/Caddy 等反代做 HTTPS 终止**，服务端看不到 TLS，自动推断会产生 `http://` 链接，此时必须显式填入 `https://<域名>` 才能生成正确的订阅链接。多入口或固定发布地址场景同理
- `REQUIRE_PUBLIC_BASE_URL`：**默认关闭**。设为 `true` 时，若未显式设置 `PUBLIC_BASE_URL`，服务启动会直接失败。适用于公网、HTTPS 反代或其他不能接受 Host 头自动推断的部署场景
- `APP_IMAGE`：主应用镜像；当前可使用 `alpha-latest` 作为便捷入口，但推荐在正式发布记录和第三方设备回归时固定为明确版本标签，例如 `ghcr.io/slackworker/chain-subconverter:v3.0.0-alpha.1`
- `SUBCONVERTER_IMAGE`：集成 `subconverter` 镜像；按需要锁定版本
- `SHORT_LINK_CAPACITY`：短链接索引容量
- `DEFAULT_TEMPLATE_URL`：阶段 1 模板 URL 输入框的部署默认初始值；默认是推荐的 Aethersailor GitHub Raw 模板，可按部署需要替换为自托管或镜像地址
- `TEMPLATE_ALLOW_PRIVATE_NETWORKS`：**默认关闭**。服务端默认拒绝拉取指向 loopback、link-local、RFC1918/ULA 等私网地址的模板 URL；只有在可信自部署环境且确实需要访问内网模板源时，才显式设为 `true`
- `WRITE_REQUESTS_PER_MINUTE`：**默认 `60`**。四个写接口（`/api/stage1/convert`、`/api/generate`、`/api/short-links`、`/api/resolve-url`）共享的每 IP 限速；设为 `0` 表示关闭，仅建议本地调试或受控验证环境使用
- `TRUSTED_PROXY_CIDRS`：**可选**。仅在入口前存在受信反代时使用；值为逗号分隔的单 IP 或 CIDR。官方 Compose 示例默认填入 `172.16.0.0/12,127.0.0.0/8`，用于覆盖常见 Docker bridge + 宿主机反代场景；若实际反代 peer 不在这些网段，需按部署拓扑改成真实 peer 网段
- `CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL`：`app` 访问 `subconverter` 的内部 HTTP endpoint。默认一体化 Compose 直接使用 `http://subconverter:25500/sub`；若改成双 Docker 分离部署，必须显式改成 `app` 容器可达的地址
- `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL`：`subconverter` 回取托管模板时使用的 `app` 地址。默认一体化 Compose 可用 `http://app:11200`；双 Docker 分离部署若不共享服务名解析，必须显式改成 `subconverter` 可回连的地址

生成后的 `docker-compose.yml` 当前涉及两类配置：

- 传给 `app` 的运行时环境变量
  - `CHAIN_SUBCONVERTER_HTTP_ADDRESS=:11200`
  - `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL`：**可选**。对浏览器、短链与订阅结果公开的外部地址。未配置时服务端自动按请求来源推断，适用于直连局域网或 DDNS 等单入口部署。若前端有反代做 HTTPS 终止，或需固定发布地址，按实际可访问地址填入（`https://` 或 `http://`），不要填容器内地址
  - `CHAIN_SUBCONVERTER_REQUIRE_PUBLIC_BASE_URL=false`：设为 `true` 时，要求同时提供 `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL`，否则服务启动失败。建议在公网、固定域名或 HTTPS 反代场景开启
  - `CHAIN_SUBCONVERTER_TEMPLATE_ALLOW_PRIVATE_NETWORKS=false`：默认拒绝指向 loopback、link-local、RFC1918/ULA 等私网地址的模板 URL。仅当部署者明确知道模板源位于可信内网，且接受相应 SSRF 风险边界时才改为 `true`
  - `CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE=60`：四个写接口共享的每 IP token bucket；设为 `0` 表示关闭。当前限速命中时接口返回 `429 RATE_LIMITED`
  - `CHAIN_SUBCONVERTER_TRUSTED_PROXY_CIDRS=172.16.0.0/12,127.0.0.0/8`：trusted proxy peer 列表；仅当直接对端 IP 命中这些单 IP / CIDR 时，服务端才会读取 `X-Forwarded-For`、`X-Forwarded-Proto` 与 `X-Forwarded-Host`。Compose 示例默认值用于覆盖常见 Docker bridge + 本机 Nginx/OpenResty 反代场景；若实际 peer 网段不同，需按部署拓扑改写
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

`CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 默认走 Compose 内部服务地址 `http://app:11200`，供 `subconverter` 在私有网络内回取托管模板；该地址不是对外公开入口。若改为双 Docker 分离部署，必须确保这个地址从 `subconverter` 侧仍可达。

`CHAIN_SUBCONVERTER_PUBLIC_BASE_URL` 与 `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 不是同一个概念：前者给浏览器和最终链接使用，后者只给容器内或私有网络内的 `subconverter` 回连托管模板使用。第三方设备部署时，不要把前者写成 `http://app:11200`；后者只有在 `subconverter` 无法通过 Docker 服务名访问 `app` 时，才应该改成宿主机 IP、反代地址或其他私有可达地址。

若部署环境不允许服务端继续根据请求头自动推断公开地址，应显式同时设置 `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL` 与 `CHAIN_SUBCONVERTER_REQUIRE_PUBLIC_BASE_URL=true`，把错误配置提前暴露在启动阶段，而不是等到生成链接时才发现。

若入口前有受信反代，且希望在未显式设置 `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL` 时仍尽量自动得到正确的 `https://` 链接，或希望写接口限速按真实客户端 IP 分桶，可设置 `CHAIN_SUBCONVERTER_TRUSTED_PROXY_CIDRS`。只有当直接对端 IP 命中受信列表时，服务端才会解析标准 `X-Forwarded-*` 头；否则继续回退到 `RemoteAddr`、`request.TLS` 与 `Host`。这项能力是对自动推断的补充，不替代公网部署显式设置 `CHAIN_SUBCONVERTER_PUBLIC_BASE_URL` 的主方案。

`CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_URL` 必须是 HTTP(S) URL。前端会把它作为普通模板 URL 写入阶段 1 输入快照、生成请求与长链接载荷。当请求中的模板 URL 等于该部署默认值时，模板成功拉取并通过解析后会进入默认模板缓存；后续刷新失败时，服务可使用此前验证通过的缓存继续完成转换，并在支持 `messages[]` 的接口响应中返回 warning。若没有可用缓存，仍会返回 `TEMPLATE_CONFIG_UNAVAILABLE`。

默认情况下，模板 URL 若解析到 loopback、link-local、RFC1918/ULA、多播或未指定地址，会在服务端被直接拒绝，返回输入非法错误；这样可以避免把模板抓取能力直接暴露为私网探测入口。只有在可信自部署环境且模板源本来就位于内网时，才应显式设置 `CHAIN_SUBCONVERTER_TEMPLATE_ALLOW_PRIVATE_NETWORKS=true`。

`CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE` 控制四个写接口共享的每 IP token bucket。默认值 `60` 适合当前 Alpha 自部署场景；若部署在更公开的入口前，建议保留非零值并按实际流量继续下调或配合反代层限速，而不是直接关闭。

`CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL` 控制显式模板 URL 等于部署默认模板 URL 时的上游抓取缓存 TTL；默认即为非零值，用于降低默认路径在公开部署或意外暴露场景下对模板上游的重复请求压力。当前 Compose preview 显式设为 `5m`。

`CHAIN_SUBCONVERTER_TEMPLATE_FETCH_CACHE_TTL` 控制其他模板 URL 的上游抓取缓存 TTL；留空或设为 `0` 表示关闭。若同时设置两个变量，内置默认模板优先使用 `CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL`，其他模板使用 `CHAIN_SUBCONVERTER_TEMPLATE_FETCH_CACHE_TTL`。

`CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL` 推荐显式写成完整 endpoint，例如 `http://subconverter:25500/sub`。当前服务启动时会自动补全缺失的 `http://` 与 `/sub`，因此 `subconverter:25500`、`http://subconverter:25500` 也可接受；若显式提供路径前缀，例如 `http://subconverter:25500/proxy`，则会归一化为 `http://subconverter:25500/proxy/sub`。双 Docker 分离部署时，这个地址必须从 `app` 容器内部可达，而不是仅在宿主机 shell 中可达。

若是单容器托管平台且未挂卷，镜像默认会退回到 `/tmp/short-links.sqlite3`，以保证预览环境至少可启动；该路径仅适合无状态预览，不保证重建后保留短链接数据。

## Alpha 部署建议

- 第三方设备内测优先使用发布到 GHCR 的 `APP_IMAGE`，不要依赖设备本地源码构建；3.0 发布线统一以 `release/3.0` 配合版本 tag 管理
- 优先使用默认一体化 Compose 部署；只有在部署方已独立维护 `subconverter` 生命周期时，才切换到双 Docker 分离部署
- `alpha-latest` 只适合作为便捷入口；每轮正式回归都应记录实际对应的不可变 tag 或 commit 来源
- 每次切换镜像 tag 后，至少复验 `GET /healthz`、`/`、`POST /api/stage1/convert` 与一条最终订阅读取路径；如需对照，再额外验证 `/ui/a`、`/ui/b`、`/ui/c`
- 内测设备建议保留默认命名卷 `short-link-data`，并在容器重启后确认短链仍可恢复
- 若使用双 Docker 分离部署，额外确认 `subconverter` 能回取 `CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL` 指向的模板地址，且 `subconverter` 不对公网开放
- 不要在对外可访问环境里把 `CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE` 设为 `0`；若要提高并发承载，优先结合反代或网关层限速一起调整
- 当前 Alpha 安全边界、匿名访问假设与 SSRF / PUBLIC_BASE_URL 风险说明见 [../SECURITY.md](../SECURITY.md)
- 发布前检查、第三方设备最小回归与反馈记录模板统一见 [../docs/testing/alpha-release.md](../docs/testing/alpha-release.md)

## 边界

- 稳定自动化 fixture 位于 `internal/review/testdata/`
- 真实人工验证统一走 Compose 启动后的前端页面、`/api/*` 与订阅路径
- 本地 UI 热更新联调与端口复用策略见 [../docs/testing/local-dev-smoke.md](../docs/testing/local-dev-smoke.md)
- 本 README 只说明 Compose 启动与环境变量；不重复维护阶段状态说明
