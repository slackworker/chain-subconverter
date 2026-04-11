// Package service implements business logic for the chain-subconverter.
//
// 职责边界（Phase 2.5）：
//   - stage2Init、长链接载荷编解码、完整配置 YAML 渲染、区域与链式候选等业务规则；
//   - 通过 ConversionSource 消费 subconverter 三 pass 结果并解析为 ConversionFixtures；
//   - 定义模板内容暂存接口与阶段 1 转换准备契约；不处理 HTTP 路由或响应头。
//
// 验收基线：docs/testing/3pass-ss2022-test-subscription.md 与 internal/review/testdata/3pass-ss2022-test-subscription/。
package service
