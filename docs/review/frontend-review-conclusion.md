# 前端 review 结论（快速记录）

日期：2026-04-13

概述：当前新增的前端基线代码已通过本地构建与后端测试（`go test ./...` 与 `npm run build`），但存在若干影响交付的缺口，建议在提交合入前处理或明确为后续任务。

- **当前可执行性**：构建通过，但若在带 base-path 的部署下会出现路径与 API 不匹配问题，且若直接发布会导致用户可见但不可操作的 UI 状态。

主要问题（按优先级）：

1. 高 — 主流程按钮未接行为（会误导用户）
   - `恢复` 按钮未绑定行为： [web/src/App.tsx](web/src/App.tsx#L143-L147)
   - `生成链接` 按钮未绑定行为： [web/src/App.tsx](web/src/App.tsx#L263-L263)
   - `打开 / 复制 / 下载` 操作位未实现： [web/src/App.tsx](web/src/App.tsx#L284-L286)

2. 高 — 部署前缀（base path）不兼容
   - `index.html` 在运行时代码将 `window.__CHAIN_SUBCONVERTER_API_BASE__` 设为 `window.location.origin`： [web/index.html](web/index.html#L12)
   - 前端 `api` 客户端通过相对绝对路径拼接 `/api/...`（见 `web/src/lib/api.ts`），且 `vite` 未配置 `base`，构建产物会产出绝对 `/assets/...` 路径，导致当服务挂在非根路径（如 `/base`）时静态资源与 API 请求会走错位置： [web/src/lib/api.ts](web/src/lib/api.ts#L11-L19)

3. 中 — Stage 1 文本输入与规范不一致
   - 文案写明“保留行号和横向滚动”，但组件当前仅为普通 `textarea`，没有 gutter/行号或关闭自动换行的实现，影响长 URI 可读性： [web/src/App.tsx](web/src/App.tsx#L162-L170) 与 [web/src/components/TextAreaField.tsx](web/src/components/TextAreaField.tsx#L17-L22)

已做的验证：
- 运行 `go test ./...`：通过（后端路由与 API 契约未破坏）。
- 运行 `npm run build`（Vite + TS）：成功，产物位于 `web/dist/`，但产物引用绝对路径 `/assets/...`，见 `web/dist/index.html`。

建议的短期可交付修正（优先级顺序）：
1. 临时：把未接行为的按钮改为 `disabled` 或提供最小实现（`resolve-url` 与 `generate` 的 API 调用及错误展示），避免用户误以为可用。
2. 将前端 API 基础路径与静态资源 `base` 支持配置化：
   - 支持在构建或运行时通过环境变量或 `window.__CHAIN_SUBCONVERTER_API_BASE__` 明确指定 `apiBase`，并在 `vite.config.ts` 中配置 `base`，或在后端 `WithFrontendAssets` 中处理好前缀映射。
3. 针对 Stage 1 文本输入，决定是降级文案还是实现行号/横向滚动的编辑控件；若选择实现，建议使用现成轻量行号组件或自定义带 gutter 的 textarea。

下一步（可选）：我可以直接修复第 1 项（禁用/连接按钮）和第 2 项（使 `apiBase` 可配置并将 `vite` base 设置为可变），如果你同意我就开始提交补丁。

文档位置：本结论已保存为本文件（仓库内）。
