# 01 - 项目概览

## 当前阶段声明：Spec-driven 彻底重构

本项目当前处于 **spec-driven 的彻底重构阶段**：任何既有架构、代码、逻辑、文档与历史决策都可以被质疑；遇到歧义或隐含假设时，必须在 spec 中提出并要求澄清；同时鼓励提出更优实现与最佳实践，并以 spec 的结论作为唯一准绳。

## 项目目标

为 **Mihomo** 配置文件添加**链式代理**和/或**端口转发**配置，打通 Mihomo 中转配置最后一公里。

## 范围限定

- **仅针对 Mihomo 内核**：暂不涉及 Surge、Quantumult X 等其他内核
- **配置结构**：遵循 Mihomo 的 `proxies`、`proxy-groups`、`proxy-providers`、`rules` 等结构

## 核心价值

- 用户提供**配置文件**与**落地节点**（以及可选的端口转发节点）的多种输入形式
- 系统统一解析为 Mihomo 节点格式，并生成链式代理 / 端口转发配置
- 输出完整的 Mihomo YAML 或订阅链接

## 数据流概览

```mermaid
flowchart LR
    subgraph Input [输入]
        C[配置文件]
        L[落地节点]
        F[端口转发节点(选填)]
    end

    subgraph Parse [解析与统一]
        P[解析各源]
        U[统一节点格式]
    end

    subgraph Action [配置动作]
        A1[dialer-proxy]
        A2[端口转发]
    end

    subgraph Output [输出]
        O[Mihomo YAML]
    end

    C --> P
    L --> P
    F --> P
    P --> U
    U --> A1
    U --> A2
    A1 --> O
    A2 --> O
```

## 与前置条件的依赖

输出完整 Mihomo YAML 的**输入依赖**与**约束**统一在 [02-prerequisites](02-prerequisites.md) 维护；本篇仅描述目标、范围与数据流。
