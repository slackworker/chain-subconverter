# Release v2.3.6: 全新前端交互与无状态后端架构

**Tag:** `v2.3.6`
**Date:** 2025-06-05

## 概述 (Overview)

`chain-subconverter` v2.0+ 是一个重要的里程碑版本。本次更新的核心在于引入了一个全新的图形化前端配置界面，并对后端服务进行了无状态化重构。这些变更旨在提升用户体验的便捷性、部署的灵活性以及服务整体的维护性。相较于 [v1.0.0 版本](https://github.com/slackworker/chain-subconverter/releases/tag/v1.0.0)，新版本在交互方式和功能实现上均有显著改进。

您可以通过以下链接在线预览和体验本项目：
[➡️ 点击这里进行在线预览](https://chain-subconverter-latest.onrender.com/)

**⚠️ 重要提醒：**
* 以上仅供项目预览 / 调试，服务器具有超时休眠➡冷启动机制，无法用于生产环境。
* 本项目完全开源，设计上不记录任何用户敏感信息。
* **信别人不如信自己**，永远建议使用自行部署的订阅转换服务。[《部署指南》](https://github.com/slackworker/chain-subconverter/wiki/Deployment-Guide)

## 主要变更 (Key Changes)

* **引入前端用户界面 (Introduction of Frontend User Interface)**:
    * 用户现在可以通过 Web 浏览器访问直观的图形界面来完成所有配置操作，包括输入原始订阅链接、定义落地节点与前置节点/组的对应关系。
    * 支持节点自动识别功能，并允许用户对识别结果进行手动编辑。
    * 操作结果（如成功、失败、警告）及相关的详细日志均可在前端界面清晰展示，便于问题定位。
    * 配置完成后，前端将生成包含所有必要参数的新订阅链接，并提供复制、浏览器打开预览及下载YAML文件等辅助功能。
* **后端服务无状态化 (Stateless Backend Architecture)**:
    * v1.0.0 版本中通过环境变量（如 `REMOTE_URL`, `MANUAL_DIALER_ENABLED`）传递核心配置的方式已被移除。
    * 所有转换所需的配置信息（原始订阅地址、节点配对规则等）均由前端收集，通过URL 参数传递给转换后端。
    * 此架构变更使得后端服务不持有特定用户的会话状态，从而简化了部署和横向扩展（如果需要）。
* **自动配置逻辑重构 (Refinement of Auto-Configuration Logic)**:
    * 对节点名称中区域信息的识别算法进行了优化，提升了其准确性。 
    * 改进了在代理组中移除作为落地节点的成员的逻辑，防止潜在的代理循环。
    * 关于**自动识别**要求的节点命名规范，请参阅项目 Wiki 中的相关文档。

## 其他改进 (Additional Enhancements)

* **Docker 部署简化**: 由于后端配置方式的转变，启动 Docker 容器所需的 `docker run` 命令参数有所减少，不再需要通过环境变量指定转换规则。
* **API 端点更新**:
    * 新增 `/api/validate_configuration` (POST)，用于前端提交用户配置以供后端验证其有效性。
    * 新增 `/api/auto_detect_pairs` (GET)，供前端调用以执行自动节点对识别。
    * `/subscription.yaml` (GET) 端点现通过 URL 查询参数接收所有必要的转换配置。
* **日志系统**: 后端服务继续提供详细的转换处理日志 。前端界面也针对当前用户的操作展示相关的日志信息。
* **Dockerfile 调整**: 对 Dockerfile 进行了相应更新，以适应新的服务架构。

## Docker 部署 (Docker Deployment)

新版本的 Docker 部署命令如下：

```bash
docker run -d \
  --name chain-subconverter \
  -p 11200:11200 \
  --restart unless-stopped \
  ghcr.io/slackworker/chain-subconverter:latest
```

* 某些终端可能不支持使用 `\` (反斜杠) 作为多行命令的连接符！如果遇到问题，请将命令中的 `\` 删除，并将所有内容合并为一行再执行：

```bash
docker run -d --name chain-subconverter -p 11200:11200 --restart unless-stopped ghcr.io/slackworker/chain-subconverter:latest
```

* 注意：v1.0.0 版本中用于配置转换规则的环境变量（如 -e REMOTE_URL=...）已不再需要。 
* 服务启动后，请通过浏览器访问 http://<服务器IP_或_域名>:11200 以使用前端配置界面。

## 从 v1.0.0 升级 (Upgrading from v1.0.0)

由于配置机制的根本性变化，从 v1.0.0 升级到 v2.x 主要涉及替换 Docker 镜像并采用新的配置流程：

1.  停止并移除正在运行的 v1.0.0 版本容器。
2.  使用上一节中提供的 `docker run` 命令部署 v2.x 版本容器。
3.  通过新引入的前端界面重新配置您的订阅转换规则。

## 已知问题与未来展望 (Known Issues & Future Outlook)

* 对于在公网环境中部署本服务，建议用户自行配置反向代理、HTTPS 加密或必要的身份验证机制以增强安全性。 
* 将持续关注用户反馈，以进一步优化用户体验及稳定性。
* 关于 v1.0.0 版本提及的镜像体积问题，可能在新版本中将继续进行评估和优化。 
* 在**自动识别**中增加对前置节点相关关键字识别的功能。

## 致谢与反馈 (Acknowledgements & Feedback)

感谢用户对 `chain-subconverter` 项目的关注与支持。v2.3.6 版本的发布旨在提供一个更为便捷和用户友好的链式代理配置解决方案。

若您在升级或使用过程中遇到任何问题，或有任何功能建议，欢迎通过项目的 GitHub Issues 页面提交。 ([Issues](https://github.com/slackworker/chain-subconverter/issues))