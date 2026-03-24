# 01 - 项目概览

## 当前阶段声明：Spec-driven 彻底重构

本项目当前处于 **spec-driven 的彻底重构阶段**：任何既有架构、代码、逻辑、文档与历史决策都可以被质疑；spec 中遇到歧义或隐含假设时，必须提出澄清要求；同时鼓励提出更优实现与最佳实践，并最终以 spec 的结论作为唯一准绳。

## 项目目标与核心价值

帮助**新手和懒人用户**基于已有的**落地节点**和**中转节点**信息，通过 Web 前端完成 **Mihomo** 的**链式代理**和**端口转发**配置生成与输出。

项目整合 **subconverter + 链式代理/端口转发配置**两部分功能，前后端一体，整合 subconverter 代码。通常用于**内网/公网自行部署**使用。

## 核心设计理念

- **面向新手/懒人用户**：引导式三阶段流程，减少用户操作和理解门槛
- **三阶段流水线 UI**：转换区 → 配置区 → 生成区，分步引导
- **单一生成路径**：统一通过 subconverter 生成完整配置，不做路径分流
- **前后端整合**：单一部署单元，整合 subconverter 代码，前端直接调用后端 API
- **落地与中转分离**：左右双输入区强制分离，不允许同源

## 数据流概览

```mermaid
flowchart LR
  subgraph Input[输入]
    T[中转信息输入<br/>订阅或节点<br/>必选]
    L[落地信息输入<br/>订阅或节点<br/>必选]
    C[转换模板/subconverter参数<br/>可选]
    P[链式代理/端口转发配置<br/>条件可选]
  end

  subgraph Flow[主流程]
    S[调用 subconverter<br/>生成完整配置]
    M[修改阶段<br/>链式代理/端口转发]
  end

  subgraph Output[输出]
    O[完整 Mihomo YAML<br/>长链接<br/>短链接]
  end

  T --> S
  L --> S
  C --> S
  P --> M
  S --> M
  M --> O
```

## 三阶段 UI 流程

```mermaid
flowchart TD
  subgraph Stage1[阶段1：转换区]
    L1[落地节点输入<br/>左侧 + SOCKS5表单]
    T1[中转信息输入<br/>右侧 + 端口转发开关/输入区]
    ADV[高级选项折叠区<br/>客户端/模板/参数]
    BTN1[自动识别按钮]
  end

  subgraph Stage2[阶段2：配置区]
    LIST[配置列表<br/>落地×方式×前置/中转]
    BTN2[生成按钮]
  end

  subgraph Stage3[阶段3：生成区]
    LINK[链接展示 + 短链接选项]
    ACTIONS[打开/复制/下载]
    LOG[可折叠日志]
  end

  Stage1 -->|"自动识别：<br/>调用subconverter<br/>提取落地节点<br/>匹配区域策略组"| Stage2
  Stage2 -->|"生成：<br/>应用链式/转发<br/>输出最终YAML"| Stage3
```

## 关键术语

| 术语 | 定义 |
|------|------|
| 落地节点（Landing Node） | 最终出口节点，流量从此节点离开到达目标。必须由用户从左侧输入区提供 |
| 中转节点（Transit Node） | 流量中继节点，作为落地节点的前置代理。由用户从右侧输入区提供 |
| 端口转发服务（Port Forward Relay） | `server:port` 格式的转发服务地址，用于替换落地节点的连接地址 |
| 链式代理（Chain Proxy） | 通过 Mihomo `dialer-proxy` 实现 中转→落地 的代理链路 |
| 端口转发（Port Forward） | 将落地节点的 `server:port` 替换为端口转发服务地址 |
| 完整配置（CompleteConfig） | subconverter 生成的包含通用配置 + 节点集合的 Mihomo YAML |
| 转换模板（Template） | subconverter 使用的配置模板，决定规则、策略组等结构 |
| 策略组（Proxy Group） | Mihomo 中的 proxy-group，用于分组和选择节点。默认模板生成 6 个区域策略组 |
| 区域策略组 | 由默认模板按区域分类的策略组：香港、美国、日本、新加坡、台湾、韩国 |

## 关键业务约束

- **落地与中转不允许同源**：禁止在左右输入区使用同一份订阅
- **链式代理不支持 reality 协议**：落地节点为 reality 时，给出用户警告提示
- **一个落地节点不能同时应用链式代理和端口转发**：二者互斥
- **默认行为：直接修改原节点**（可选创建新节点副本）
- **节点改名/重命名由用户自定义**，不强制后缀规则
- **国际化**：支持中文 + English

## 文档结构

| 文档 | 说明 |
|------|------|
| [01-overview](01-overview.md) | 本文档 — 项目目标、数据流、术语、约束 |
| [02-frontend-spec](02-frontend-spec.md) | 前端 UI 规格 — 三阶段界面详细设计 |
| 03-backend-api（待补） | 后端 API 契约 |
| 04-business-rules（待补） | 业务规则 — 生成与修改逻辑 |
| 05-tech-stack（待补） | 技术选型与项目结构 |
