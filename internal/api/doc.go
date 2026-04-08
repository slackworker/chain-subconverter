// Package api implements HTTP handlers for the chain-subconverter API.
//
// 职责边界（Phase 2.5）：
//   - 注册路由，解析 JSON/query，调用 internal/service 中基于 ConversionSource 的 *FromSource 入口；
//   - 将业务错误与 subconverter 不可用映射为 HTTP 状态码与 JSON 响应（含 blockingErrors）；
//   - 不包含业务规则推导、YAML 内容生成或 subconverter HTTP 细节（见 internal/service、internal/subconverter）。
//
// 验收基线：internal/api/server_test.go 与 review/cases/3pass-ss2022-test-subscription/ 对齐。
package api
