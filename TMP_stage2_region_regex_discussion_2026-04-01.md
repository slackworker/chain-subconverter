# 临时讨论记录：stage2 地区正则拉取与识别

日期：2026-04-01
范围：`chain-subconverter`

## 背景

当前实现中，针对远程 `config`，阶段 2 默认填充会在 3-pass 转换之外，额外发起一次独立 HTTP GET 来读取配置文本并提取地区正则。

这会带来两个核心问题：

1. 一致性风险：阶段 2 默认填充依据的规则，可能不是本次 3-pass 实际消费的“生效配置”。
2. 安全面扩大：新增了业务层直接抓取远程 URL 的路径，与已有 SSRF 风险收敛方向冲突。

---

## 代码定位

远程 GET 发起点：

- 文件：`internal/service/stage1_convert.go`
- 函数：`loadRemoteRegionConfig(rawURL string)`
- 关键调用：`client.Get(rawURL)`

调用链：

- `BuildStage2Init(...)`
  - `loadRegionMatchers(stage1Input.AdvancedOptions.Config)`
    - `loadRegionConfig(configValue)`
      - `http/https` -> `loadRemoteRegionConfig(...)`
      - `file` -> `loadLocalRegionConfig(...)`
    - `parseRegionMatchers(rawConfig)`
  - `detectDefaultChainTarget(...)`

---

## 拉取后如何识别地区

### 1) 提取 matcher

`parseRegionMatchers(rawConfig)` 对配置文本逐行扫描，仅处理：

- 以 `custom_proxy_group=` 开头的行
- 且分割后满足：
  - 目标组名属于默认 6 个区域组（`defaultRegionGroupOrder`）
  - 类型字段为 `url-test`
  - 第 3 段作为完整正则 pattern

随后使用 `regexp2.Compile(parts[2], 0)` 编译，形成：

- `regionMatcher{ TargetName, Pattern }`

### 2) 对落地节点做唯一命中

`detectDefaultChainTarget(landingNodeName, matchers, chainTargetNames)`：

- 对每个 matcher 执行 `Pattern.MatchString(landingNodeName)`
- 命中后还要校验该 `TargetName` 存在于当次 `chainTargets`
- 判定规则：
  - 恰好命中 1 个 -> 默认 `mode = chain`，`targetName = 该区域组`
  - 命中 0 个或 >1 个 -> 默认 `mode = none`，`targetName = nil`

---

## 与 spec 的关系（讨论结论）

根据 `docs/spec/04-business-rules.md`：

- 明确要求同一次转换复用同一条 3-pass 管线与同一快照语义；
- 区域识别应以“本次实际生效配置文件”中的规则为准。

spec 中没有明确设计“在 3-pass 之外再发一次独立 HTTP GET 取 config 内容”这一实现路径。

因此当前实现存在：

- 3-pass 与阶段 2 默认填充来源可能分离（时间窗不一致）；
- 新增一条无额外防护的远程抓取路径。

---

## 备注

本文件为临时讨论记录，仅用于本地协作与后续评审引用，不作为正式 spec 或 ADR。
