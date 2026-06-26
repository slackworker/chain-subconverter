# web

`Vite + React + TypeScript + Tailwind` 前端；共享业务层 + `default` / `b1` / `b2` / `c1` / `c2` 方案目录。

包管理器：**npm**（见 [spec 05 §5](../docs/spec/05-tech-stack.md#5-前端实现约束)）；勿使用 pnpm / yarn。

## 常用命令

```bash
npm install
npm run dev          # 或 dev:b1 / dev:b2 / dev:c1 / dev:c2
npm run build        # 或 build:default / build:b1 / …
npm run test         # Vitest
npm run test:e2e:mock:smoke   # PR blocking mocked smoke
npm run test:e2e:mock:full    # PR blocking mocked full
npm run test:e2e:real:smoke   # 发布前 non-blocking 真实部署 smoke
npm run test:e2e:real:full    # 发布前 non-blocking 真实部署 full
npm run test:e2e              # Playwright 全量（调试用）
```

发布前完整检查见 [docs/testing/runbook.md](../docs/testing/runbook.md)。

## 本地开发

在**仓库根**执行：

```bash
./scripts/dev-up.sh <scheme>   # default | b1 | b2 | c1 | c2
```

或 VS Code 任务 `dev: up`（固定 scheme `default`）。端口、多 worktree offset、排障见 [docs/testing/runbook.md](../docs/testing/runbook.md)。

## 方案路由

| 入口 | scheme | 分级 |
|------|--------|------|
| `/` | `default`（发布默认） | `baseline` |
| `/ui/b1` `/ui/b2` `/ui/c1` `/ui/c2` | 探索性交互方案（四变体） | `exploratory` |

探索性方案可脱离 [spec 02](../docs/spec/02-frontend-spec.md) 的交互/风格细节自行设计，但须实现完整业务能力；见 spec 02「方案分级：对照基线与探索性」。

## 提升某个方案为 Default

- 命令行：在仓库根运行 `./scripts/promote-ui-scheme-to-default.sh <b1|b2|c1|c2>`
- VS Code：任务 `ui: promote scheme to default`，选择 `b1`、`b2`、`c1` 或 `c2`
- 脚本将所选 scheme 复制到 `src/scheme/default`，重写 `default/index.ts` 元数据，并执行 `npm run build:default`
- 预览：`./scripts/promote-ui-scheme-to-default.sh <b1|b2|c1|c2> --dry-run`

## 构建环境变量

- `VITE_CHAIN_SUBCONVERTER_BASE_PATH` — 静态资源前缀
- `VITE_CHAIN_SUBCONVERTER_API_BASE` — API 前缀
- `VITE_CHAIN_SUBCONVERTER_UI_SCHEME` — 未指定路由时的默认 scheme

本地跨端口 API 与 `VITE_CHAIN_SUBCONVERTER_API_PROXY_TARGET` 见源码 `vite.config`；分支与提交流程见 [docs/STATUS.md](../docs/STATUS.md#分支与提交流程)；工程分层与 CI 见 [docs/spec/05-tech-stack.md](../docs/spec/05-tech-stack.md)。

## 项目状态

当前状态见 [docs/STATUS.md](../docs/STATUS.md)。
