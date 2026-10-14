---
name: go-test
description: Go测试流程. Manual-trigger skill. Source: Harness component library.
---


# Go 测试流程

## 概述

本技能定义了 Go 项目完整的测试执行流程，包括单元测试、集成测试、覆盖率分析、竞态检测和性能基准测试。

## 前置条件

- Go 1.22+ 已安装
- 测试依赖已安装（testify 等）
- 集成测试所需服务可用（数据库、Redis 等）

## 执行步骤

### Step 1: 单元测试

```bash
# 运行所有单元测试
go test ./... -v -short

# 参数说明：
# -v      详细输出
# -short  跳过长时间测试

# 运行特定包
go test ./internal/service/... -v

# 运行匹配名称的测试
go test ./... -run "TestUserService" -v

# 并行执行
go test ./... -parallel 4

# 失败时显示完整输出
go test ./... -v -count=1  # -count=1 禁用缓存
```

**失败处理**：单元测试失败必须立即修复，不得跳过。

### Step 2: 集成测试

```bash
# 使用 build tag 隔离集成测试
# 文件头部: //go:build integration

# 运行集成测试
go test ./... -tags=integration -v

# 使用 Docker Compose 启动依赖
docker compose -f docker-compose.test.yml up -d
sleep 5  # 等待服务就绪

# 设置测试环境变量
export DATABASE_URL="postgres://test:test@localhost:5432/testdb"
export REDIS_URL="redis://localhost:6379"

go test ./... -tags=integration -v -timeout=120s

# 清理
docker compose -f docker-compose.test.yml down -v
```

### Step 3: 覆盖率分析

```bash
# 生成覆盖率报告
go test ./... -coverprofile=coverage.out -covermode=atomic

# 查看总覆盖率
go tool cover -func=coverage.out | tail -1
# 输出: total: (statements) 85.3%

# 查看各包覆盖率
go tool cover -func=coverage.out

# 生成 HTML 报告
go tool cover -html=coverage.out -o coverage.html

# 检查覆盖率阈值
COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | tr -d '%')
echo "覆盖率: ${COVERAGE}%"
if (( $(echo "$COVERAGE < 80" | bc -l) )); then
    echo "ERROR: 覆盖率低于 80%"
    exit 1
fi
```

### Step 4: 竞态检测

```bash
# ✅ 必须：使用 -race 检测数据竞争
go test ./... -race -v

# 仅对并发相关包运行
go test ./internal/worker/... -race -v
go test ./internal/cache/... -race -v

# 竞态检测 + 覆盖率
go test ./... -race -coverprofile=coverage.out
```

**竞态问题修复**：
1. 使用 `sync.Mutex` / `sync.RWMutex` 保护共享状态
2. 使用 channel 传递数据所有权
3. 使用 `sync/atomic` 进行原子操作
4. 避免在 goroutine 间共享可变状态

### Step 5: Benchmark

```bash
# 运行所有 benchmark
go test ./... -bench=. -benchmem -run=^$

# 参数说明：
# -bench=.    运行所有 benchmark
# -benchmem   显示内存分配
# -run=^$     不运行普通测试

# 运行特定 benchmark
go test ./internal/service/ -bench=BenchmarkHash -benchmem

# 多次运行取平均
go test ./... -bench=. -benchmem -count=5

# 对比两次结果（需要 benchstat）
go test ./... -bench=. -benchmem -count=10 > old.txt
# 修改代码后
go test ./... -bench=. -benchmem -count=10 > new.txt
benchstat old.txt new.txt
```

**输出示例**：
```
BenchmarkHashPassword-8       50    22456789 ns/op    2048 B/op    12 allocs/op
BenchmarkValidateEmail-8  10000000       125 ns/op      64 B/op     2 allocs/op
```

## 完整 CI 脚本

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: testdb
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"
      - name: Unit Tests
        run: go test ./... -v -short -race -coverprofile=coverage.out
      - name: Integration Tests
        run: go test ./... -tags=integration -v
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/testdb
      - name: Coverage Check
        run: |
          COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | tr -d '%')
          echo "Coverage: ${COVERAGE}%"
      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          file: coverage.out
```

## 测试质量指标

| 指标 | 目标 | 命令 |
|------|------|------|
| 语句覆盖率 | ≥ 80% | `-coverprofile` |
| 竞态检测 | 0 race | `-race` |
| 测试通过率 | 100% | 全部 PASS |
| 单测执行时间 | < 60s | `-timeout` |
| Benchmark 回归 | < 10% | `benchstat` |