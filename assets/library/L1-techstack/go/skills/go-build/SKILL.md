---
name: go-build
description: Go构建流程. Manual-trigger skill. Source: Harness component library.
---


# Go 构建流程

## 概述

本技能定义了 Go 项目从源码到可执行二进制的完整构建流程，包含静态检查、编译优化和制品验证。

## 前置条件

- Go 1.22+ 已安装
- `golangci-lint` 已安装
- 项目使用 Go Modules

## 执行步骤

### Step 1: 环境检查

```bash
# 验证 Go 版本
go version  # 必须 >= 1.22

# 验证 golangci-lint
golangci-lint --version

# 验证项目结构
test -f go.mod || echo "ERROR: go.mod not found"

# 检查环境变量
echo "GOPATH: $GOPATH"
echo "GOROOT: $(go env GOROOT)"
```

**失败处理**：环境缺失时安装对应工具并报告。

### Step 2: 依赖整理

```bash
# 下载依赖
go mod download

# 整理依赖（移除未使用、添加缺失）
go mod tidy

# 验证依赖完整性
go mod verify

# 检查是否有可更新依赖
go list -u -m all | grep '\[' || echo "所有依赖已是最新"
```

**失败处理**：依赖冲突时检查 `go.mod` 中的 replace 指令。

### Step 3: 静态检查（golangci-lint）

```bash
# 运行全部 linter
golangci-lint run ./...

# 仅检查变更文件（CI 加速）
golangci-lint run --new-from-rev=HEAD~1 ./...

# 显示详细信息
golangci-lint run ./... -v --out-format=colored-line-number
```

**.golangci.yml 配置**：

```yaml
run:
  timeout: 5m
  go: "1.22"

linters:
  enable:
    - errcheck      # 检查未处理的 error
    - gosimple      # 简化代码
    - govet         # go vet 增强
    - ineffassign   # 无效赋值
    - staticcheck   # 静态分析
    - unused        # 未使用代码
    - gosec         # 安全检查
    - revive        # 代码风格
    - bodyclose     # HTTP body 未关闭
    - noctx         # HTTP 请求缺少 context
    - exportloopref # 循环变量引用

linters-settings:
  errcheck:
    check-type-assertions: true
  gosec:
    severity: medium
  revive:
    rules:
      - name: exported
        arguments:
          - "checkPrivateReceivers"

issues:
  exclude-rules:
    - path: _test\.go
      linters:
        - errcheck
        - gosec
```

### Step 4: 编译构建

```bash
# 标准构建
go build -o bin/server ./cmd/server

# 带版本信息的构建
VERSION=$(git describe --tags --always)
COMMIT=$(git rev-parse --short HEAD)
BUILD_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

go build \
  -ldflags " \
    -X main.version=${VERSION} \
    -X main.commit=${COMMIT} \
    -X main.buildTime=${BUILD_TIME} \
    -s -w" \
  -o bin/server \
  ./cmd/server

# 交叉编译（Linux amd64）
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build \
  -ldflags "-s -w" \
  -o bin/server-linux-amd64 \
  ./cmd/server
```

### Step 5: go vet 检查

```bash
# 运行 go vet
go vet ./...

# 检查特定问题
go vet -printf ./...
go vet -shadow ./...
```

### Step 6: 制品验证

```bash
# 验证二进制可执行
./bin/server --version
# 预期输出: version=v1.2.3 commit=abc1234 built=2024-01-01T00:00:00Z

# 检查二进制大小
ls -lh bin/server

# 验证无调试符号（生产构建）
go tool objdump bin/server | head -5  # 应该很少输出

# 运行 smoke test
./bin/server &
SERVER_PID=$!
sleep 2
curl -f http://localhost:8080/health || kill $SERVER_PID
kill $SERVER_PID
```

## 完整 CI 脚本

```yaml
# .github/workflows/build.yml
name: Build
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"
      - run: go mod tidy
      - run: go mod verify
      - name: Lint
        uses: golangci/golangci-lint-action@v4
        with:
          version: latest
      - run: go vet ./...
      - run: go build -o bin/server ./cmd/server
      - run: ./bin/server --version
```

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| 依赖下载超时 | 设置 `GOPROXY=https://goproxy.cn,direct` |
| golangci-lint 超时 | 增加 `run.timeout` 或减少 linter |
| 交叉编译 CGO 错误 | 设置 `CGO_ENABLED=0` |
| 二进制过大 | 添加 `-ldflags "-s -w"` |