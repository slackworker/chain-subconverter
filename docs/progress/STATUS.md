# 当前状态

> 最近更新：2026-04-01

## Phase 进度

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 0 — 骨架 | 目录、Go module、旧代码归档 | ✅ 完成 |
| Phase 1 — subconverter 集成 | 真实 3-pass HTTP 管线 | ⚠️ 部分完成 |
| Phase 2 — 业务服务层 | stage2Init、校验、改写 | ⚠️ 部分完成 |
| Phase 3 — API + 存储 + 配置 | Gin handlers、SQLite、Config | ⛔ 未开始 |
| Phase 4 — 前端 | React + TS UI | ⛔ 未开始 |

## 已完成

### 基础工程

- Go module 与目录骨架已建立
- `internal/api`、`internal/config`、`internal/store`、`internal/subconverter`、`internal/service` 包路径已固定
- 旧实现已归档至 `_legacy/`

### 测试基线

- `3pass-ss2022-test-subscription` 已扩展为最小完整流程样例
- 已固定 `stage1-convert` / `generate` 请求与成功响应 golden
- 已固定规范长链接编码前载荷与最终订阅 YAML golden

### 服务层原型

- 已能从固定 3-pass 结果推导默认 `stage2Init`
- 已能对固定 `stage2Snapshot` 生成规范长链接
- 已能基于固定 `full-base` 结果渲染默认链式代理订阅

## 已知缺口

### Phase 1

- `internal/subconverter` 只有包说明，无真实 HTTP 客户端
- 超时、并发上限、运行时错误映射未实现
- 3-pass 仍依赖静态测试夹具，不是运行时真实管线

### Phase 2

- 区域识别应基于配置文件正则，当前使用代码内置正则
- 端口转发 `server:port` 严格校验/规范化远未完成
- `restrictedModes`、`blockingErrors[]` 仅具 happy-path 骨架
- 未覆盖 `vless-reality` 限制、冲突检测、恢复冲突等失败场景

### Phase 3

- 未实现 HTTP handler、短链接索引、配置化限制
- `cmd/server/main.go` 仍是占位输出

## 验证

- `go test ./internal/service/...` ✅
- `go test ./...` ✅
