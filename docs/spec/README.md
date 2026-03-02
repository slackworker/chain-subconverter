# chain-subconverter 规格说明 (Spec)

> **Spec-driven 开发**：本文档集为 chain-subconverter 的业务逻辑规格，所有实现须依此进行，不得偏离。

## 适用范围

- **目标内核**：仅 [Mihomo (Clash Meta)](https://github.com/MetaCubeX/mihomo) 内核
- **输出格式**：Mihomo 兼容的 YAML 配置

## 文档索引

| 文档 | 说明 |
|------|------|
| [01-overview](01-overview.md) | 项目目标、范围、数据流 |
| [02-prerequisites](02-prerequisites.md) | **前置条件**：中转节点、落地节点、统一节点格式 |
| [03-config-flow](03-config-flow.md) | 配置来源、落地识别、三种添加方式 |
| [04-api-output](04-api-output.md) | API 设计、输出方式、编码约定 |
| [05-review](05-review.md) | Review 结论：遗漏、逻辑问题、待澄清 |

## 阅读顺序

1. [01-overview](01-overview.md) 了解整体
2. [02-prerequisites](02-prerequisites.md) 理解输入与统一格式
3. [03-config-flow](03-config-flow.md) 理解业务逻辑
4. [04-api-output](04-api-output.md) 理解接口与输出
5. [05-review](05-review.md) 了解待定项与风险
