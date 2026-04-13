# web

Phase 4 前端工程目录。

当前已初始化 `Vite + React + TypeScript + Tailwind CSS` 的主干公共基线，用于承接共享状态模型、公共组件与后续 A/B/C UI 分支方案。

## 常用命令

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## 部署相关环境变量

- `VITE_CHAIN_SUBCONVERTER_BASE_PATH`: 配置构建产物的静态资源基础路径，例如 `/chain-subconverter/`
- `VITE_CHAIN_SUBCONVERTER_API_BASE`: 配置前端调用 API 的基础前缀，例如 `/chain-subconverter` 或 `https://example.com/chain-subconverter`

若运行时需要覆盖 API 前缀，可在页面加载前注入 `window.__CHAIN_SUBCONVERTER_API_BASE__`。

当前状态见 [../docs/progress/STATUS.md](../docs/progress/STATUS.md)。

Phase 4 的实施顺序见 [../docs/plan/phase-4-breakdown.md](../docs/plan/phase-4-breakdown.md)。
