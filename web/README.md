# web

Phase 4 前端工程目录。

当前已初始化 `Vite + React + TypeScript + Tailwind CSS` 的前端公共基线，用于承接共享状态模型、共享业务层接口与后续 A/B/C UI 分支方案。

## 常用命令

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## 部署相关环境变量

- `VITE_CHAIN_SUBCONVERTER_BASE_PATH`: 配置构建产物的静态资源基础路径，例如 `/chain-subconverter/`
- `VITE_CHAIN_SUBCONVERTER_API_BASE`: 配置前端调用 API 的基础前缀，例如 `/chain-subconverter` 或 `https://example.com/chain-subconverter`
- `VITE_CHAIN_SUBCONVERTER_UI_SCHEME`: 选择前端方案层实现；默认 `default`，当前额外提供 `plain` 作为极简占位方案，用于验证共享入口可替换性

若运行时需要覆盖 API 前缀，可在页面加载前注入 `window.__CHAIN_SUBCONVERTER_API_BASE__`。

## 方案层装配

- 共享入口在 `src/main.tsx` 通过 `UISchemeProvider` 装配方案层实现
- `src/App.tsx` 只消费共享业务层接口，不直接绑定默认方案组件
- `src/scheme/default` 是当前默认方案实现
- `src/scheme/plain` 是极简占位方案，用于证明共享业务层与方案层已解耦

当前状态见 [../docs/progress/STATUS.md](../docs/progress/STATUS.md)。

Phase 4 的实施顺序见 [../docs/plan/phase-4-breakdown.md](../docs/plan/phase-4-breakdown.md)。
