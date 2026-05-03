# web

Phase 4 前端工程目录。

当前已初始化 `Vite + React + TypeScript + Tailwind CSS` 的共享业务入口，用于承接共享状态模型、共享业务层接口与后续 A/B/C UI 同仓库并行方案。

## 常用命令

- `npm install`
- `npm run dev`
- `npm run dev:a`
- `npm run dev:b`
- `npm run dev:c`
- `npm run build`
- `npm run build:a`
- `npm run build:b`
- `npm run build:c`
- `npm run preview`

## 本地 UI 开发入口

- 推荐入口：在仓库根目录执行 `./scripts/dev-up.sh <scheme>`，或直接运行 VS Code 任务 `dev: up`
- `<scheme>` 当前支持 `a`、`b`、`c`
- 该脚本会处理：
	- 固定端口 `25500 / 11200 / 5173` 上的 `subconverter`、backend、frontend 复用或拉起
	- VS Code `dev: up` 按 scheme 使用 `a=5173`、`b=5174`、`c=5175`
	- 多 worktree / 多分支并行预览时，VS Code `dev: up` 默认按当前 worktree 自动分配端口 offset；第二个 worktree 默认对应 `25510 / 11210 / 5183-5185`
	- 新 worktree 首次运行若缺少 `web/node_modules`，脚本会先自动执行一次 `npm ci`
	- 清理当前工作区遗留的旧 frontend / backend 开发实例，但不清理当前允许并存的 A/B/C frontend 端口
	- 固定端口冲突检查；若被非当前工作区进程占用则直接报错，不再自动跳到相邻端口
	- `.tmp/dev-up/runtime.env` 运行时地址输出
- 若当前 scheme 对应端口上已有当前工作区且代理目标一致的 Vite dev server，脚本会直接复用它
- 关闭当前任务终端即可结束本次启动脚本拉起的本地 frontend / backend；`subconverter` 容器默认保留以便下次复用
- 如需显式覆盖自动分配，可先设置 `CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET=<n>` 再运行任务或脚本

默认从 Windows 宿主机浏览器访问时，只应打开脚本打印出的 `SCHEME_URL`，例如 `http://localhost:5173/ui/a`、`http://localhost:5174/ui/b` 或带 offset 的 `http://localhost:5185/ui/c`；不要手工改成未由任务分配的相邻端口试探，否则通常只是在访问旧实例。

完整 smoke 顺序见 [../docs/testing/local-dev-smoke.md](../docs/testing/local-dev-smoke.md)。

## 分支工作流

- `main`：公共改动的稳定主干。共享业务层、后端、脚本、部署、文档等不属于单一方案的改动，先提交到这里。
- `ui-lab`：A/B/C 三套方案并存的日常开发分支。`web/src/scheme/a`、`b`、`c` 的实现演进和相互参考都集中在这里。
- `alpha`：对外 Alpha 发布分支。它只承接经过回归确认、准备发出去的快照，默认入口仍是 `/ui/a`。

推荐提交流程：

- 纯公共改动：直接提交到 `main`，然后把 `ui-lab` rebase 到最新 `main`。
- 纯方案改动：直接提交到 `ui-lab`。
- 同一轮同时包含公共改动和方案改动：先把公共部分单独提交到 `main`，同步 `ui-lab` 后，再把方案部分提交到 `ui-lab`；不要把两类改动混成一个提交。
- `alpha` 不作为日常开发分支，也不建议例行 rebase 到 `main`；它只在准备发布或更新 `alpha-latest` 时，从 `ui-lab` 选定快照后更新。

当前仓库已支持在同一分支同时预览三个方案：启动本地开发实例后，可直接同时打开 `/ui/a`、`/ui/b`、`/ui/c`；如果要在多个 worktree 并行跑，再依赖 `dev: up` 的端口 offset。

## 部署相关环境变量

- `VITE_CHAIN_SUBCONVERTER_BASE_PATH`: 配置构建产物的静态资源基础路径，例如 `/chain-subconverter/`
- `VITE_CHAIN_SUBCONVERTER_API_BASE`: 配置前端调用 API 的基础前缀，例如 `/chain-subconverter` 或 `https://example.com/chain-subconverter`
- `VITE_CHAIN_SUBCONVERTER_UI_SCHEME`: 当访问路径未显式指定 scheme 时的默认方案；当前可用 `a`、`b`、`c`

若运行时需要覆盖 API 前缀，可在页面加载前注入 `window.__CHAIN_SUBCONVERTER_API_BASE__`。

本地开发 / 预览时，若 `VITE_CHAIN_SUBCONVERTER_API_BASE` 或运行时覆盖值被设置为 `http://localhost:<port>` / `http://127.0.0.1:<port>` 且与当前页面端口不同，前端会自动回退为同源 `/api` 前缀并走 Vite proxy，避免 preview 模式下的跨端口请求问题。

如需显式指定代理目标，可设置 `VITE_CHAIN_SUBCONVERTER_API_PROXY_TARGET`，默认值为 `http://localhost:11200`。

## 方案路由

- 当前方案入口统一为 `/ui/<scheme>`
- 现有内建方案：`/ui/a`、`/ui/b`、`/ui/c`
- 未显式指定方案时，入口默认回落到 `a`

## 方案层装配

- 当前提交是 **0 UI 起点里程碑**：仅保留共享 workflow 装配能力与可替换 scheme 骨架，不提供任何业务 UI 完整实现
- A/B/C 方案后续页面实现必须从 `docs/spec/02-frontend-spec.md` 推导，不以本次占位页面作为行为依据
- `src/main.tsx` 只负责按当前路由解析并装配 active scheme，不再注入共享全局样式
- `src/App.tsx` 只负责共享 workflow 与浏览器动作桥接，不再持有默认方案页面结构
- `src/scheme/a`、`src/scheme/b`、`src/scheme/c` 分别承载三个方案自己的页面与样式入口
- 共享层不再提供 `index.css` 这类全局 UI baseline；每个方案从自己的 `index.css` 起步
- `npm run build:a`、`npm run build:b`、`npm run build:c` 可用于验证不同方案在同一共享业务层上的可构建性

当前状态见 [../docs/progress/STATUS.md](../docs/progress/STATUS.md)。

Phase 4 的实施顺序见 [../docs/plan/phase-4-breakdown.md](../docs/plan/phase-4-breakdown.md)。
