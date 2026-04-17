# web

Phase 4 前端工程目录。

当前已初始化 `Vite + React + TypeScript + Tailwind CSS` 的前端公共基线，用于承接共享状态模型、共享业务层接口与后续 A/B/C UI 分支方案。

## 常用命令

- `npm install`
- `npm run dev`
- `npm run dev:plain`
- `npm run build`
- `npm run build:plain`
- `npm run preview`

## 部署相关环境变量

- `VITE_CHAIN_SUBCONVERTER_BASE_PATH`: 配置构建产物的静态资源基础路径，例如 `/chain-subconverter/`
- `VITE_CHAIN_SUBCONVERTER_API_BASE`: 配置前端调用 API 的基础前缀，例如 `/chain-subconverter` 或 `https://example.com/chain-subconverter`
- `VITE_CHAIN_SUBCONVERTER_UI_SCHEME`: 当访问路径未显式指定 scheme 时的默认方案；当前可用 `default`、`plain`、`a`、`b`、`c`

若运行时需要覆盖 API 前缀，可在页面加载前注入 `window.__CHAIN_SUBCONVERTER_API_BASE__`。

本地开发 / 预览时，若 `VITE_CHAIN_SUBCONVERTER_API_BASE` 或运行时覆盖值被设置为 `http://localhost:<port>` / `http://127.0.0.1:<port>` 且与当前页面端口不同，前端会自动回退为同源 `/api` 前缀并走 Vite proxy，避免 preview 模式下的跨端口请求问题。

如需显式指定代理目标，可设置 `VITE_CHAIN_SUBCONVERTER_API_PROXY_TARGET`，默认值为 `http://localhost:11200`。

## 方案路由

- 当前方案入口统一为 `/ui/<scheme>`
- 现有内建方案：`/ui/default`、`/ui/plain`、`/ui/a`、`/ui/b`、`/ui/c`
- `default` 与 `a` 都已清空并回退到 `0 UI` 基线
- `b` / `c` 已拆成独立目录入口，当前仍复用 `plain` 方案承接共享 workflow

## 方案层装配

- 当前提交是 **0 UI 起点里程碑**：仅保留共享 workflow 装配能力与可替换 scheme 骨架，不提供任何业务 UI 完整实现
- A/B/C 方案后续页面实现必须从 `docs/spec/02-frontend-spec.md` 推导，不以本次占位页面作为行为依据
- `src/main.tsx` 只负责按当前路由解析并装配 active scheme，不再提供公共 UI 壳
- `src/App.tsx` 只负责共享 workflow 与浏览器动作桥接，不再持有默认方案页面结构
- `src/scheme/plain` 是当前 `0 UI` 基线页面
- `src/scheme/default` 与 `src/scheme/a` 现在都直接复用 `plain`，避免旧方案内容继续干扰 ABC 开发
- `src/scheme/a`、`src/scheme/b`、`src/scheme/c` 分别承载三个方案自己的页面入口
- `npm run build:plain` 是当前最小可执行的 scheme 可替换性验收命令

当前状态见 [../docs/progress/STATUS.md](../docs/progress/STATUS.md)。

Phase 4 的实施顺序见 [../docs/plan/phase-4-breakdown.md](../docs/plan/phase-4-breakdown.md)。
