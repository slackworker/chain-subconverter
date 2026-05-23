# deploy

本目录只承载部署相关内容。

## 范围

- 默认一体化 `docker-compose.yml`（`app + subconverter`），与下文第三方单段命令生成的 Compose 保持同一镜像口径与 `TRUSTED_PROXY_CIDRS` 等默认值
- 推荐 `subconverter` 随 `app` 同 Compose 部署；已有独立 Docker 化 `subconverter` 时可改双 Docker 分离部署
- SQLite 短链接索引经命名卷 `short-link-data` 持久化
- 默认镜像 `ghcr.io/slackworker/chain-subconverter:latest`；预发布 tag 见 [GitHub Releases](https://github.com/slackworker/chain-subconverter/releases)

## 第三方设备 / 局域网

首次部署，或改端口/镜像/顶部变量/Compose 编排：改 bash 头部后整段执行。**仅换镜像 tag**：用「仅更新镜像」，勿重跑 heredoc（命名卷保留）。

### 部署 / 重建 Compose

```bash
# --- 常改 ---
APP_DIR="$HOME/chain-subconverter"
HOST_PORT="11200"
APP_IMAGE="ghcr.io/slackworker/chain-subconverter:latest"
SUBCONVERTER_IMAGE="ghcr.io/slackworker/subconverter:integration-chain-subconverter"
DEFAULT_TEMPLATE_URL="https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini"
TRUSTED_PROXY_CIDRS="172.16.0.0/12"
SHORT_LINK_CAPACITY="1000"
# --- 可选（默认注释；见下方环境变量表）---
# USER_FACING_BASE_URL=""
# TEMPLATE_ALLOW_PRIVATE_NETWORKS="false"
# WRITE_REQUESTS_PER_MINUTE="60"

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
      # 可选：取消注释并填值（见环境变量表）
      # CHAIN_SUBCONVERTER_USER_FACING_BASE_URL: "${USER_FACING_BASE_URL}"
      # CHAIN_SUBCONVERTER_TEMPLATE_ALLOW_PRIVATE_NETWORKS: "${TEMPLATE_ALLOW_PRIVATE_NETWORKS}"
      # CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE: "${WRITE_REQUESTS_PER_MINUTE}"
      CHAIN_SUBCONVERTER_TRUSTED_PROXY_CIDRS: "${TRUSTED_PROXY_CIDRS}"
      CHAIN_SUBCONVERTER_SUBCONVERTER_FACING_BASE_URL: http://app:11200
      CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_URL: "${DEFAULT_TEMPLATE_URL}"
      CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL: 5m
      CHAIN_SUBCONVERTER_SUBCONVERTER_UPSTREAM_BASE_URL: http://subconverter:25500/sub?
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

### 仅更新镜像

```bash
cd "${APP_DIR:-$HOME/chain-subconverter}"
docker compose pull
docker compose up -d
docker compose ps
curl "http://127.0.0.1:${HOST_PORT:-11200}/healthz"
```

### 验证

```bash
cd "${APP_DIR:-$HOME/chain-subconverter}"
docker compose ps
curl "http://127.0.0.1:${HOST_PORT:-11200}/healthz"
```

局域网访问：`http://<device-ip>:<host-port>/`（`subconverter` 仅在私有网络 `subconverter-backend` 内，不对宿主机暴露端口）。

Playwright 冒烟：`CHAIN_SUBCONVERTER_E2E_BASE_URL=http://<device-ip>:<port> ./scripts/third-party-smoke.sh`。

## 部署场景速查

| 场景 | 建议 |
|------|------|
| 局域网直连 `:11200` | 默认即可 |
| 宿主机 Nginx/Caddy HTTPS 反代 | 默认 `TRUSTED_PROXY_CIDRS`；反代 peer 不在 `172.16.0.0/12` 时改 CIDR（如 `127.0.0.1/32`） |
| 固定公网域名 / 多入口 | 设 `USER_FACING_BASE_URL`，不要依赖自动推断 |
| 仅换镜像 tag | 「仅更新镜像」四行 |
| 改端口、镜像或任意 env | 重跑整段 bash |

## 双 Docker 分离部署（可选）

指 `app` 与 `subconverter` 分属两台设备/两套网络（或一方为既有独立 `subconverter`）。两端可同在局域网、各自内网，或各自公网可达——不限定必须内网；关键是 `UPSTREAM` / `FACING` 填成双方 **app↔subconverter** 实际能 HTTP 互访的地址。`app` 至少配置：

```yaml
environment:
  CHAIN_SUBCONVERTER_HTTP_ADDRESS: :11200
  CHAIN_SUBCONVERTER_TRUSTED_PROXY_CIDRS: "172.16.0.0/12"
  CHAIN_SUBCONVERTER_SUBCONVERTER_UPSTREAM_BASE_URL: http://subconverter:25500/sub
  CHAIN_SUBCONVERTER_SUBCONVERTER_FACING_BASE_URL: http://app:11200
  CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH: /data/short-links.sqlite3
```

`UPSTREAM` = app→subconverter；`FACING` = subconverter→app（勿与 `USER_FACING` 混用）。同机两项目：共享 Docker network + 服务名互访；跨机时填对端 IP/域名与端口。建议仍避免把 `subconverter` 作为面向用户的公开入口（见 [SECURITY](../SECURITY.md)）。

## 仓库内 Compose 预览

日常联调 `./scripts/dev-up.sh <scheme>`；本地未发布镜像亦走 `dev-up` 或 `docker build` 后改 `app.image`。

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d --force-recreate
docker compose -f deploy/docker-compose.yml ps
curl http://localhost:11200/healthz
```

同步 compose/镜像：`git pull` 后 `docker compose -f deploy/docker-compose.yml pull && up -d`。

## 环境变量

顶部 bash 变量写入生成的 `docker-compose.yml`；`CHAIN_*` 为 `app` 运行时名。

| bash 变量 | Compose 环境变量 | 默认 | 何时改 | 说明 |
|-----------|------------------|------|--------|------|
| `APP_DIR` | — | `$HOME/chain-subconverter` | 自定义安装路径 | Compose 文件目录 |
| `HOST_PORT` | `ports` | `11200` | 端口冲突 | 宿主机对外端口 |
| `APP_IMAGE` | `app.image` | `…/chain-subconverter:latest` | 换 tag/版本 | `dev-latest` 仅开发；`beta-latest` 为 Beta |
| `SUBCONVERTER_IMAGE` | `subconverter.image` | `…/subconverter:integration-…` | 锁定版本 | 集成 subconverter 镜像 |
| `DEFAULT_TEMPLATE_URL` | `CHAIN_…_DEFAULT_TEMPLATE_URL` | Aethersailor Raw | 自托管模板 | 阶段 1 默认模板；经 `/api/runtime-config` 下发 |
| `TRUSTED_PROXY_CIDRS` | `CHAIN_…_TRUSTED_PROXY_CIDRS` | `172.16.0.0/12` | 反代 peer 网段不同 | 命中后方信任 `X-Forwarded-*`；HTTPS 推断与限速分桶 |
| `SHORT_LINK_CAPACITY` | `CHAIN_…_SHORT_LINK_CAPACITY` | `1000` | 容量需求 | 短链索引上限 |
| `USER_FACING_BASE_URL` | `CHAIN_…_USER_FACING_BASE_URL` | 空 | 固定域名/多入口 | 浏览器与最终链接；勿填 `http://app:11200` |
| `TEMPLATE_ALLOW_PRIVATE_NETWORKS` | `CHAIN_…_TEMPLATE_ALLOW_*` | `false` | 可信内网模板源 | 允许拉取私网模板 URL（SSRF 边界见 SECURITY） |
| `WRITE_REQUESTS_PER_MINUTE` | `CHAIN_…_WRITE_*` | `60` | 调试 | 四写接口共享 per-IP 限速；`0` 关闭 |
| — | `CHAIN_…_HTTP_ADDRESS` | `:11200` | 极少 | 监听地址 |
| — | `CHAIN_…_SUBCONVERTER_FACING_BASE_URL` | `http://app:11200` | 双 Docker | subconverter 回连 app；非对外入口 |
| — | `CHAIN_…_SUBCONVERTER_UPSTREAM_BASE_URL` | `http://subconverter:25500/sub?` | 双 Docker | app 访问 subconverter |
| — | `CHAIN_…_DEFAULT_TEMPLATE_FETCH_CACHE_TTL` | `5m` | 高级 | 默认模板抓取缓存 |
| — | `CHAIN_…_SHORT_LINK_DB_PATH` | `/data/short-links.sqlite3` | 高级 | 配合卷 `short-link-data` |

`USER_FACING` ≠ `FACING`。未设前者时按 `Host`/TLS 或受信 `X-Forwarded-*` 推断。SSRF/缓存 TTL 等见 [SECURITY](../SECURITY.md)、[backend-api spec](../docs/spec/03-backend-api.md)。

## 参考

第三方用 GHCR 镜像（默认 `latest`），勿设备上源码构建。双 Docker 确认 `FACING` 可达；公开入口勿关写限速。外网测试订阅：[test-fixtures-worker](test-fixtures-worker/README.md)。本地联调：[local-dev-smoke](../docs/testing/local-dev-smoke.md)。发布回归：[release-runbook](../docs/testing/release-runbook.md)。fixture：`internal/review/testdata/`。
