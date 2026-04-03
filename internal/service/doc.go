// Package service implements business logic for the chain-subconverter.
//
// 职责边界（Phase 2.5）：
//   - stage2Init、长链接载荷编解码、完整配置 YAML 渲染、区域与链式候选等业务规则；
//   - 通过 ConversionSource 消费 subconverter 三 pass 结果并解析为 ConversionFixtures；
//   - 不处理 HTTP 路由或响应头；不直接发起对外 HTTP（subconverter 调用由实现 ConversionSource 的包完成，如 cmd/server 中的 Client）。
//
// 验收基线：docs/testing/3pass-ss2022-test-subscription.md 与 testdata/subconverter/3pass-ss2022-test-subscription/。
package service
