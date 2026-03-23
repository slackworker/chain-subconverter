# chain-subconverter 规格说明 (Legacy Spec)

> **Spec-driven 开发**：本文档集为 chain-subconverter 的业务逻辑规格，所有实现须依此进行，不得偏离。
>
> **存档说明**：这是之前用于重构的 spec 构想，已归档到 `docs/legacy/`，仅供参考；当前重构准绳将由你后续重新阐述/完善的 `docs/spec/` 内容决定。

## 适用范围

- **目标内核**：仅 [Mihomo (Clash Meta)](https://github.com/MetaCubeX/mihomo) 内核
- **输出格式**：Mihomo 兼容的 YAML 配置

## 文档职责边界（避免重复）

- `01-overview.md`：只放**目标/范围/高层数据流**，不重复列举依赖细节
- `02-generate-complete-config.md`：定义**完整配置生成流程**：前端输入收集、角色元信息保留、统一走模板 + subconverter
- `03-modify-config.md`：定义**修改流程**：链式代理/端口转发（在完整配置基础上）
- `04-output-and-api.md`：只描述**接口与输出契约**，引用 02/03 的业务规则
- `05-review.md`：只记录**差异/风险/待澄清项**

## 文档索引

| 文档 | 说明 |
|------|------|
| [01-overview](01-overview.md) | 项目目标、范围、数据流 |
| [02-generate-complete-config](02-generate-complete-config.md) | **生成完整配置**：角色确认、模板、subconverter、统一生成路径 |
| [03-modify-config](03-modify-config.md) | **修改完整配置**：链式代理 / 端口转发 |
| [04-output-and-api](04-output-and-api.md) | API 设计、输出方式、编码约定 |
| [05-review](05-review.md) | Review 结论：遗漏、逻辑问题、待澄清 |

## 阅读顺序

1. [01-overview](01-overview.md) 了解整体
2. [02-generate-complete-config](02-generate-complete-config.md) 理解“完整配置如何生成”
3. [03-modify-config](03-modify-config.md) 理解“链式/端口转发如何改写”
4. [04-output-and-api](04-output-and-api.md) 理解接口与输出
5. [05-review](05-review.md) 了解待定项与风险

## 旧版历史参考（Archive）

| 文档 | 说明 |
|------|------|
| [Design-Review-Legacy](../archive/Design-Review-Legacy.md) | 旧版架构与设计评审（最老版本） |
| [SSRF-Protection-Legacy](../archive/SSRF-Protection-Legacy.md) | 旧版 SSRF 防护说明（最老版本；策略仍可参考） |
