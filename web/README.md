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
	- 清理当前工作区遗留的旧 frontend / backend 开发实例
	- 固定端口冲突检查；若被非当前工作区进程占用则直接报错，不再自动跳到相邻端口
	- `.tmp/dev-up/runtime.env` 运行时地址输出
- 若 `5173` 上已有当前工作区的 Vite dev server，脚本会直接复用它，不再额外启动 `5174` / `5175` 等新端口
- 关闭当前任务终端即可结束本次启动脚本拉起的本地 frontend / backend；`subconverter` 容器默认保留以便下次复用

默认从 Windows 宿主机浏览器访问时，也只应打开脚本打印出的固定 `SCHEME_URL`，即 `http://localhost:5173/ui/<scheme>`；不要手工改成相邻端口试探，否则通常只是在访问旧实例。

完整 smoke 顺序见 [../docs/testing/local-dev-smoke.md](../docs/testing/local-dev-smoke.md)。

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
