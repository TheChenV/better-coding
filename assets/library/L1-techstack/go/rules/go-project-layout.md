---
description: Go项目结构规范 - 1. cmd/ 目录规范、2. internal/ 组织原则、3. 包命名规范、4. go.mod 规范
trigger: glob
glob: **/*.go
---


# Go 项目结构规范

## 核心原则

- **必须**遵循 Standard Go Project Layout
- **必须**使用 `cmd/` 存放可执行入口，`internal/` 存放私有包
- **必须**包名使用小写单词，禁止下划线和驼峰
- **推荐**按领域/功能组织 `internal/` 子包
- **禁止**在 `pkg/` 中放置不打算公开的代码

## 标准目录结构

```
my-service/
├── cmd/
│   └── server/
│       └── main.go              # 应用入口
├── internal/
│   ├── config/
│   │   └── config.go            # 配置加载
│   ├── handler/
│   │   ├── health.go            # 健康检查
│   │   └── user.go              # 用户接口
│   ├── service/
│   │   └── user_service.go      # 业务逻辑
│   ├── repository/
│   │   └── user_repo.go         # 数据访问
│   ├── model/
│   │   └── user.go              # 领域模型
│   └── middleware/
│       ├── logging.go
│       └── auth.go
├── pkg/                          # 可被外部引用的公共库（可选）
│   └── validator/
│       └── validator.go
├── api/
│   └── openapi.yaml             # API 规范
├── migrations/
│   ├── 001_create_users.up.sql
│   └── 001_create_users.down.sql
├── deploy/
│   ├── Dockerfile
│   └── docker-compose.yml
├── scripts/
│   └── build.sh
├── go.mod
├── go.sum
├── Makefile
├── .golangci.yml
└── README.md
```

## 规则详情

### 1. cmd/ 目录规范

```go
// cmd/server/main.go
// ✅ 正确：main.go 只做初始化和启动
package main

import (
    "context"
    "log/slog"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/example/my-service/internal/config"
    "github.com/example/my-service/internal/handler"
    "github.com/example/my-service/internal/repository"
    "github.com/example/my-service/internal/service"
)

func main() {
    // 1. 加载配置
    cfg, err := config.Load()
    if err != nil {
        slog.Error("加载配置失败", "error", err)
        os.Exit(1)
    }

    // 2. 初始化依赖
    repo := repository.NewUserRepository(cfg.DatabaseURL)
    svc := service.NewUserService(repo)
    h := handler.NewUserHandler(svc)

    // 3. 配置路由
    mux := http.NewServeMux()
    h.RegisterRoutes(mux)

    // 4. 启动服务
    srv := &http.Server{
        Addr:         cfg.Addr,
        Handler:      mux,
        ReadTimeout:  10 * time.Second,
        WriteTimeout: 10 * time.Second,
    }

    // 5. 优雅关闭
    go func() {
        sigCh := make(chan os.Signal, 1)
        signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
        <-sigCh
        ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
        defer cancel()
        srv.Shutdown(ctx)
    }()

    slog.Info("服务启动", "addr", cfg.Addr)
    if err := srv.ListenAndServe(); err != http.ErrServerClosed {
        slog.Error("服务异常退出", "error", err)
        os.Exit(1)
    }
}
```

### 2. internal/ 组织原则

```go
// ✅ 推荐：按职责分层
// internal/handler/  - HTTP 处理（输入验证、响应格式化）
// internal/service/  - 业务逻辑（编排、规则）
// internal/repository/ - 数据访问（SQL、缓存）
// internal/model/    - 领域模型（纯结构体）

// ❌ 避免：按技术组件大包
// internal/utils/    - 万能工具包（禁止）
// internal/common/   - 公共代码（禁止）

// ✅ 大型项目可按领域划分
// internal/user/
//   ├── handler.go
//   ├── service.go
//   └── repository.go
// internal/order/
//   ├── handler.go
//   ├── service.go
//   └── repository.go
```

### 3. 包命名规范

```go
// ✅ 正确：小写单词，简短有意义
package userservice
package httputil
package dbutil

// ❌ 错误
package user_service   // 禁止下划线
package userService    // 禁止驼峰
package util           // 太泛化
package helpers        // 无意义

// ✅ 包名不与标准库冲突
package httpclient  // 而非 package http
package logutil     // 而非 package log
```

### 4. go.mod 规范

```go
// go.mod
module github.com/your-org/my-service

go 1.22

require (
    github.com/go-chi/chi/v5 v5.0.12
    github.com/jackc/pgx/v5 v5.5.3
    github.com/redis/go-redis/v9 v9.5.1
)

require (
    // indirect dependencies...
)
```

```bash
# ✅ 必须：定期整理依赖
go mod tidy

# ✅ 验证依赖完整性
go mod verify
```

### 5. Makefile

```makefile
.PHONY: build test lint run clean

APP_NAME := my-service
VERSION := $(shell git describe --tags --always)

build:
	go build -ldflags "-X main.version=$(VERSION)" -o bin/$(APP_NAME) ./cmd/server

test:
	go test ./... -v -race -coverprofile=coverage.out

lint:
	golangci-lint run ./...

run:
	go run ./cmd/server

clean:
	rm -rf bin/ coverage.out
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 是否使用 cmd/ 存放入口 | 必须 |
| 私有代码是否在 internal/ | 必须 |
| 包名是否小写无分隔符 | 必须 |
| 是否定期 go mod tidy | 必须 |
| 是否存在 utils/common 包 | 禁止 |
| main.go 是否只做初始化 | 推荐 |
| 是否按领域/职责分包 | 推荐 |