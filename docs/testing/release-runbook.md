# 发布与回归 Runbook

本文定义当前滚动发布、第三方设备回归与进入 Beta 前的最小记录口径。

## 用途边界

- 本文是当前 runbook，不定义 spec。
- 对外发布说明与相对 2.0 的功能更新摘要统一见 [../../RELEASES.md](../../RELEASES.md)。
- 部署命令与环境变量以 [../../deploy/README.md](../../deploy/README.md) 为准。
- 本地 HMR 联调入口以 [local-dev-smoke](local-dev-smoke.md) 为准。

## 当前发布口径

- `dev`：开发线；仅手动发布 `dev-latest`
- `beta`：预发布线；进入 Beta 阶段后默认发布 `beta-latest`，并可附加 Beta 版本标签
- `main`：当前公开稳定线；默认发布 `latest`
- 默认 UI 基线：`scheme default`
- 默认访问入口：`/`
- `subconverter` 镜像：`ghcr.io/slackworker/subconverter:integration-chain-subconverter`
- 第三方设备部署入口：优先使用 `deploy/README.md` 中的一体化单段 Compose 命令；如确有既有 `subconverter` 生命周期管理，也允许按其中“双 Docker 分离部署”口径接入

仅当存在明确回归结论时，才允许替换默认镜像 tag 或默认入口。

## 发布前冻结项

发布前至少确认以下项不再临时漂移：

- `APP_IMAGE` 与 `SUBCONVERTER_IMAGE`
- 对外访问端口
- 是否显式设置 `USER_FACING_BASE_URL`
- 若有反代，`TRUSTED_PROXY_CIDRS` 是否保持默认示例值或已按 peer 网段改写
- 本轮要求回归的 UI `scheme`；默认固定为 `default`

若本轮使用的是滚动标签（如 `latest`、`beta-latest`、`dev-latest`），仍要记录对应的分支、提交来源和发布时间。

## 发布前检查

按顺序执行：

1. 自动化基线

```bash
go test ./...
cd web && npm run test
cd web && npm run test:e2e -- default-happy-path.spec.ts port-forward-happy-path.spec.ts
cd web && npm run build:default && npm run build:a && npm run build:b && npm run build:c
docker compose -f deploy/docker-compose.yml config
```

其中 `go test ./...` 当前已覆盖：

- Smoke fixture：`3pass-ss2022-test-subscription`
- Comprehensive fixture：`dual-landing-chain-port-forward`

新功能默认先补 `Smoke`；只有明显依赖双落地 / 双中转 / template / port-forward 等复杂拓扑时，才只补 `Comprehensive`。

当前浏览器级 E2E 自动化基线已补上两条 mocked Playwright smoke：默认 `/` 最小 happy path，以及 port-forward 的关键交互 / 恢复路径；其运行时优先复用 `./scripts/dev-up.sh default` 的固定端口。阻断路径与更广 UI 矩阵仍未纳入 blocking baseline。

若当前 WSL 缺少 Playwright 浏览器系统库，可先启动：

```bash
./scripts/dev-up.sh default
```

然后在仓库根目录复用 `http://host.docker.internal:5173` 运行容器化 Playwright：

```bash
docker run --rm --ipc=host --add-host=host.docker.internal:host-gateway \
	--user "$(id -u):$(id -g)" -e HOME=/tmp \
	-e CHAIN_SUBCONVERTER_E2E_BASE_URL=http://host.docker.internal:5173 \
	-e CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 \
	-v "$PWD":/work -w /work/web \
	mcr.microsoft.com/playwright:v1.60.0-noble \
	npm run test:e2e -- default-happy-path.spec.ts port-forward-happy-path.spec.ts
```

2. 本地开发路径 smoke

```bash
./scripts/dev-up.sh default
```

最小确认项：

- `GET /healthz` 成功
- 可打开 `http://localhost:5173/`
- `stage1/convert` 可完成一次“转换并自动填充”
- Stage 3 可执行打开、复制、下载、`resolve-url`、`short-links`
- 页面底部 workflow log 可查看本次会话内的开始/成功/失败历史，不退化为只显示最近一条消息

## 第三方设备发布

1. 在目标设备按 [../../deploy/README.md](../../deploy/README.md) 顶部变量填写 `APP_DIR`、`HOST_PORT`、镜像 tag 与可选 `USER_FACING_BASE_URL`；若入口前存在反代，额外确认 Compose 中的 `CHAIN_SUBCONVERTER_TRUSTED_PROXY_CIDRS` 是否覆盖实际反代 peer 网段。
2. 优先执行同文中的一体化单段命令，生成并启动 `docker-compose.yml`；若采用双 Docker 分离部署，则按同文额外设置 `CHAIN_SUBCONVERTER_SUBCONVERTER_UPSTREAM_BASE_URL` 与 `CHAIN_SUBCONVERTER_SUBCONVERTER_FACING_BASE_URL`。
3. 记录实际访问入口：`http://<device-ip>:<host-port>/`；如有额外方案验证，再补充其他 `scheme`（如 `/ui/a`）。

可选 Playwright 冒烟（`scripts/third-party-smoke.sh` → `deployed-smoke.spec.ts`）**必须**显式设置目标部署入口，无仓库内默认内网部署 URL：

```bash
CHAIN_SUBCONVERTER_E2E_BASE_URL="https://<your-public-host>/" ./scripts/third-party-smoke.sh
```

命令与变量说明亦见 [third-party-deployments.md](third-party-deployments.md)、[../../deploy/README.md](../../deploy/README.md)。

## 发布后最小回归

在目标设备上至少确认：

- `docker compose ps` 中 `app` 与 `subconverter` 均为健康状态
- `GET /healthz` 成功
- 浏览器可打开 `/`
- `POST /api/stage1/convert` 可跑通一次真实输入
- 可生成 `longUrl`
- 页面底部 workflow log 可展开，并能看到本轮主流程的动作与结果历史
- `GET /sub?...` 或 `GET /sub/<id>` 至少成功一条
- 若采用双 Docker 分离部署，额外确认 `subconverter` 可回取 `CHAIN_SUBCONVERTER_SUBCONVERTER_FACING_BASE_URL` 指向的托管模板

若启用了短链，还要额外确认：

- 创建短链成功
- 容器重启后原短链仍可恢复

## 反馈记录模板

已落盘的第三方设备回归见 [third-party-deployments.md](third-party-deployments.md)（仓库仅结论；可复测细节写在同目录 `third-party-deployments.local.md`，gitignore；模板见 `third-party-deployments.local.example.md`）。

每轮发布或回归至少记录以下字段：

- 日期
- 分支 / 提交或镜像 tag
- 部署设备
- 访问入口
- 是否设置 `USER_FACING_BASE_URL`
- 回归范围：自动化 / 本地 smoke / 第三方设备
- 结果：通过 / 失败 / 有风险通过
- 失败点归类：Docker、`subconverter`、backend、frontend、外部模板、外部订阅源
- 后续动作

可直接使用下面模板：

```md
## YYYY-MM-DD 发布回归

- 分支 / 提交或镜像 tag：
- 部署设备：
- 访问入口：
- USER_FACING_BASE_URL：未设置 / 已设置为
- TRUSTED_PROXY_CIDRS：默认 / 已改为
- 回归范围：
- 结果：
- 失败点归类：
- 后续动作：
```

## 失败升级条件

出现以下任一情况时，不应继续沿用当前滚动镜像对外分发：

- `GET /healthz` 不稳定
- 默认 `/` 无法打开主流程
- `stage1/convert`、`generate`、`resolve-url`、`short-links` 中任一主线不可用
- 第三方设备只能依赖开发机环境才能完成部署
- 同一轮回归中出现未归类的结果漂移，无法判断是代码回归还是外部依赖漂移

## 进入 Beta 的前置条件

- `beta` 分支与 `beta-latest` 发布路径已稳定可用
- 当前第三方设备回归已形成持续记录
- 默认 `/` 主线在多轮回归中无 P0
- 发布文档、状态页与部署文档对同一套分支/标签口径保持一致
