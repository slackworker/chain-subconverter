# chain-subconverter 规格说明 (Spec)

> **Spec-driven 开发**：本文档集为 chain-subconverter 的业务逻辑规格，所有实现须依此进行，不得偏离。

## 当前阶段声明：Spec-driven 彻底重构

- **彻底重构**：我们正在以 spec 为中心对项目做彻底重构；目标是得到更清晰、更一致、更可维护的系统。
- **可质疑**：任何既有的架构、代码、逻辑、文档与历史决策都**不是前提**，都可以被质疑、推翻或替换。
- **需澄清**：遇到歧义/隐含假设/不一致时，必须在 spec 中提出并要求澄清；未澄清前不应“按旧实现猜测”。
- **最佳实践优先**：允许并鼓励提出更优方案与行业最佳实践（安全、可测试性、可扩展性、可观测性、用户体验等），以 spec 结论为准。

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
