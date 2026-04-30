# Alpha 发布与回归

本文定义 Alpha（内测）阶段的发布入口、最小回归顺序与反馈记录口径。

## 用途边界

- 本文是 Alpha runbook，不定义 spec。
- 对外发布说明与相对 2.0 的功能更新摘要统一见 [../../RELEASES.md](../../RELEASES.md)。
- 部署命令与环境变量以 [../../deploy/README.md](../../deploy/README.md) 为准。
- 本地 HMR 联调入口以 [local-dev-smoke](local-dev-smoke.md) 为准。
- live 中间产物审查方法以 [live-review-artifacts](live-review-artifacts.md) 为准。

## 当前 Alpha 口径

- 当前对外版本阶段：`3.0 Alpha`
- Alpha 发布基线：`UI-A`
- 主应用镜像：`ghcr.io/slackworker/chain-subconverter:alpha-latest`
- `subconverter` 镜像：`ghcr.io/slackworker/subconverter:integration-chain-subconverter`
- 第三方设备部署入口：`deploy/README.md` 中的单段 Compose 命令
- 默认 UI 访问入口：`/ui/a`

其中 `alpha-latest` 由 `UI-A` 分支 push 自动刷新；未形成新的明确发布决议前，Alpha 回归、问题收集与对外分发都以 `UI-A` 对应构建为准。

仅当存在明确回归结论时，才允许替换默认镜像 tag 或默认入口。

## 发布前冻结项

发布前至少确认以下项不再临时漂移：

- `APP_IMAGE` 与 `SUBCONVERTER_IMAGE`
- 对外访问端口
- 是否显式设置 `PUBLIC_BASE_URL`
- 本轮要求回归的 UI `scheme`；默认固定为 `a`
- 本轮用于 live smoke 的输入来源

若本轮只是刷新 `alpha-latest`，仍要记录镜像 tag、提交来源和发布时间。

## 发布前检查

按顺序执行：

1. 自动化基线

```bash
go test ./...
cd web && npm run build && npm run build:b && npm run build:c
docker compose -f deploy/docker-compose.yml config
```

2. 本地开发路径 smoke

```bash
./scripts/dev-up.sh a
```

最小确认项：

- `GET /healthz` 成功
- 可打开 `http://localhost:5173/ui/a`
- `stage1/convert` 可完成一次“转换并自动填充”
- Stage 3 可执行打开、复制、下载、`resolve-url`、`short-links`

3. 按需导出 live review 中间产物

```bash
go run ./cmd/frontend-review -case-dir .tmp/review/manual
```

若本轮改动涉及模板回取、自动填充、链式组或订阅读取，必须补这一步。

## 第三方设备发布

1. 在目标设备按 [../../deploy/README.md](../../deploy/README.md) 顶部变量填写 `APP_DIR`、`HOST_PORT`、镜像 tag 与可选 `PUBLIC_BASE_URL`。
2. 执行同文中的单段命令，生成并启动 `docker-compose.yml`。
3. 记录实际访问入口：`http://<device-ip>:<host-port>/ui/a`；如有额外方案验证，再补充其他 `scheme`。

## 发布后最小回归

在目标设备上至少确认：

- `docker compose ps` 中 `app` 与 `subconverter` 均为健康状态
- `GET /healthz` 成功
- 浏览器可打开 `/ui/a`
- `POST /api/stage1/convert` 可跑通一次真实输入
- 可生成 `longUrl`
- `GET /sub?...` 或 `GET /sub/<id>` 至少成功一条

若启用了短链，还要额外确认：

- 创建短链成功
- 容器重启后原短链仍可恢复

## 反馈记录模板

每轮 Alpha 发布或回归至少记录以下字段：

- 日期
- 提交或镜像 tag
- 部署设备
- 访问入口
- 是否设置 `PUBLIC_BASE_URL`
- 回归范围：自动化 / 本地 smoke / 第三方设备 / live review
- 结果：通过 / 失败 / 有风险通过
- 失败点归类：Docker、`subconverter`、backend、frontend、外部模板、外部订阅源
- 后续动作

可直接使用下面模板：

```md
## YYYY-MM-DD Alpha 回归

- 提交或镜像 tag：
- 部署设备：
- 访问入口：
- PUBLIC_BASE_URL：未设置 / 已设置为
- 回归范围：
- 结果：
- 失败点归类：
- 后续动作：
```

## 失败升级条件

出现以下任一情况时，不应继续沿用当前 Alpha 镜像对外分发：

- `GET /healthz` 不稳定
- 默认 `/ui/a` 无法打开主流程
- `stage1/convert`、`generate`、`resolve-url`、`short-links` 中任一主线不可用
- 第三方设备只能依赖开发机环境才能完成部署
- 同一轮回归中出现未归类的结果漂移，无法判断是代码回归还是外部依赖漂移