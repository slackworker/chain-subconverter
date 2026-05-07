# chain-subconverter

[![GHCR](https://img.shields.io/badge/GHCR-chain--subconverter-blue?logo=github)](https://github.com/slackworker/chain-subconverter/pkgs/container/chain-subconverter)
[![GitHub Stars](https://img.shields.io/github/stars/slackworker/chain-subconverter.svg?style=social&label=Star&maxAge=2592000)](https://github.com/slackworker/chain-subconverter/stargazers/)

**链式代理 · 订阅转换器** for Mihomo

一个为 [Mihomo(Clash Meta) 内核](https://github.com/MetaCubeX/mihomo/tree/Meta) 设计的、用于链式代理 (`dialer-proxy`) 配置的订阅转换工具。它包含一个Python后端服务和直观的前端配置界面。

---

## 🤔 项目解决了什么问题？

Mihomo 内核拥有强大的分流功能和完善的规则生态，通过订阅第三方维护的规则模板，我们能以低维护实现高精度分流。但市面上常用的订阅转换服务不支持 `dialer-proxy`（链式代理）字段的配置，并且会将其过滤。 这使得需要使用链式代理并希望保持订阅自动更新的用户，不得不频繁手动编辑 YAML 配置文件，过程繁琐且易出错。

`chain-subconverter` 为解决这一痛点而生，让链式代理的配置和订阅更新变得简单高效。

## ✨ 项目特性

* **🐳 一键 Docker 部署**：提供 Docker 镜像，快速启动后端服务及内建前端。
* **🖥️ 易用 Web 前端**：通过图形化界面轻松配置链式代理规则。
* **🤖 智能节点识别**：支持自动识别满足[《命名规范》](https://github.com/slackworker/chain-subconverter/wiki/Node-Naming-Convention)的落地节点和前置节点/组。
* **🔄 动态应用配置**：生成的订阅链接在每次被客户端请求时，都会将链式配置动态应用于最新的原始订阅内容。

## ✨ 尝鲜预览

您可以通过以下链接在线预览和体验本项目：
[➡️ 点击这里进行在线预览](https://fantastic-loise-slackers-134ea8cc.koyeb.app/)

**⚠️ 重要提醒：**
* 以上仅供项目预览 / 调试，服务器具有超时休眠➡冷启动机制，无法用于生产环境。
* 本项目完全开源，设计上不记录任何用户敏感信息。
* **信别人不如信自己**，永远建议使用自行部署的订阅转换服务。[《部署指南》](https://github.com/slackworker/chain-subconverter/wiki/Deployment-Guide)


## 🚀 快速开始

### 1. 部署 Docker 后端服务

在您的服务器或支持 Docker 的设备上执行以下命令：

```bash
docker run -d \
  --name chain-subconverter \
  -p 11200:11200 \
  --restart unless-stopped \
  ghcr.io/slackworker/chain-subconverter:latest
```
* **重要提示**：某些终端可能不支持使用 `\` (反斜杠) 作为多行命令的连接符！如果遇到问题，请将命令中的 `\` 删除，并将所有内容合并为一行再执行：

```bash
docker run -d --name chain-subconverter -p 11200:11200 --restart unless-stopped ghcr.io/slackworker/chain-subconverter:latest
```

上述命令将在后台启动服务，并将您服务器的 11200 端口映射到容器。您可以修改 -p 参数的第一个 11200 来更改宿主机端口。默认情况下，日志级别为 INFO，SSL 验证为 true，自定义服务根地址为 false。

➡️ **详细部署步骤、参数说明及更新指南，请参阅：[GitHub Wiki - 部署指南](https://github.com/slackworker/chain-subconverter/wiki/Deployment-Guide)**

### (可选) 从源码构建和运行

如果您希望自行构建镜像，或者在本地对代码进行修改和测试，可以使用项目根目录下的 `update.sh` 脚本。

**使用方法：**

1.  克隆本仓库到本地。
2.  确保您已安装 Docker 并且有权限执行脚本。
3.  在项目根目录下运行：

```bash
bash update.sh
```
该脚本会自动完成以下操作：
*   基于当前的 `Dockerfile` 构建一个新的本地 Docker 镜像。
*   停止并移除任何名为 `chain-subconverter` 的旧容器。
*   使用新构建的镜像启动容器，监听 `11200` 端口。

**注意：** 此方法适用于开发和测试。对于生产部署，建议使用从 `ghcr.io` 拉取的官方镜像以确保稳定性。

### 2. 使用前端配置订阅

1.  **访问前端**：部署成功后，在浏览器中打开 `http://<运行Docker设备的IP或域名>:<映射的宿主机端口>/`。
2.  **原订阅链接**：粘贴您的有效 Mihomo/Clash Meta 订阅链接。
3.  **链式配置**：通过“自动识别”功能或“手动添加”，指定落地节点及其对应的前置节点/组。
4.  **生成**：点击“生成”按钮，验证并生成增加链式代理配置的新订阅链接，并应用于您的客户端。

➡️ **完整使用教程、界面说明及节点命名建议，请参阅：[GitHub Wiki - 快速上手与使用教程](https://github.com/slackworker/chain-subconverter/wiki)**

## 🔗 相关链接

* **[📖 项目 Wiki 文档](https://github.com/slackworker/chain-subconverter/wiki)**
* **[📜 版本发布历史](https://github.com/slackworker/chain-subconverter/releases)**
* **[🐛 问题反馈 / ✨ 功能建议](https://github.com/slackworker/chain-subconverter/issues)**
* **[🐱Mihomo `dialer-proxy` 特性 官方文档](https://wiki.metacubex.one/config/proxies/dialer-proxy/)**

## 🚧 未来计划 (Todo List)

* 补充优化自动识别节点规则。
* (可能) 使用 JavaScript 重构整个项目以实现更灵活的部署方式。
* 探索支持更多内核的链式配置功能。
* UI/UX 持续改进。
* 在**自动识别**中增加对前置节点相关关键字识别的功能。
* 持续评估并优化镜像体积与资源占用，力求进一步降低（目前约 150MB 磁盘 / 25MB 内存）。

<!-- ➡️ **更详细的未来计划，请参阅：[GitHub Wiki - 未来计划 (Todo List)](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/wiki/TODO)**  -->

## 🤝 贡献

欢迎各种形式的贡献，包括但不限于：

* 提交 Bug 报告和功能建议。
* 完善文档。
* 提交代码 (Pull Requests)。

<!-- 在提交代码前，请先阅读贡献指南 (如果项目未来提供 `CONTRIBUTING.md`)。 -->

## 📜 许可证

本项目基于 **MIT 许可证** 发布。
