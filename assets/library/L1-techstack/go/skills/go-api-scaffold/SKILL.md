---
name: go-api-scaffold
description: Go API项目脚手架. Manual-trigger skill. Source: Harness component library.
---


# Go API 项目脚手架

## 概述

本技能定义了创建生产级 Go API 项目的标准脚手架流程，支持 Gin/Echo/Chi 框架选择，包含完整的路由定义、中间件配置、数据库集成和 Docker 部署。

## 前置条件

- Go 1.22+ 已安装
- 确定项目名称和 module 路径
- 选择 Web 框架（推荐 Chi 或 Gin）

## 跨栈通用门禁

生成前确认模块信息四要素（模块名称 / 职责 / 所属层级 / 依赖模块）、先读 `AGENTS.md` 的分层与编码规范、
「骨架不是空壳」判据（最小可编译可启动）与骨架清单产出，均以 `.qoder/techstack-commands.json` 的
`_skeletonContract` 为唯一规范（跨栈单源，原 L0 skill create-module-skeleton 已下沉到那里）；
本文件只提供本栈的目录结构与代码形态，不重复通用门禁。

## 编号工作流（骨架生成的可执行协议）

本栈服务骨架不由 AI 现写脚本：cmd/internal 目录树与 go.mod 正文都在 `plans/go.json` 里（与上面 Step 1 的目标结构同源），按库根 `assets/templates/numbered-workflows`（项目级安装 = `<项目>/.qoder/skills/better-coding/assets/templates/numbered-workflows`）的
七步编号工作流执行，本栈数据取 `plans/go.json`；占位符变量表见 `vars.mjs`，机制与偏离见该目录的 README.md。

1. **段 A 理解目标**：读 `workflows/<编号>/workflow.md` 的「目标 / 输入变量 / 产出物 / 验证方法」
2. **段 B 拼脚本**：`node assets/templates/numbered-workflows/numbered-workflow.mjs compose --stack go --vars <values.json> --workflow <编号> --project <目标项目根>`
3. **段 C 执行**：跑落盘件 `<目标项目>/.scaffold/step<编号>.mjs`（`compose` 换成 `run` 可 B+C+D 一次过）
4. **段 D 验证**：以退出码为准，0 才算过；`buildCmd` 取 `.qoder/techstack-commands.json` 本栈 `build`，不在脚本里发明命令

失败即问：任一段非 0 退出就停下来问用户「重试还是跳过」——不自行继续、不改库内文件、
不覆盖项目既有文件（工作流 02/03 遇到同名不同内容会判冲突并退出 1）。
禁止修改用户已有 .qoder/：引擎按路径段拦，命中即退出码 2。
七步顺序 01-create-directories → 02-write-configs → 03-write-skeleton-code → 04-verify-paths →
05-init-repo → 06-build-verify → 07-append-module（可按需只跑到 04，但 06 的编译验证是「骨架不是空壳」的出口）。

## 执行步骤

### Step 1: 初始化 Module

```bash
PROJECT_NAME="my-api"
MODULE_PATH="github.com/your-org/${PROJECT_NAME}"

mkdir ${PROJECT_NAME} && cd ${PROJECT_NAME}
go mod init ${MODULE_PATH}

# 创建目录结构
mkdir -p cmd/server
mkdir -p internal/{config,handler,service,repository,model,middleware}
mkdir -p migrations
mkdir -p deploy

# 创建入口文件
touch cmd/server/main.go
```

**目标目录结构**：

```
my-api/
├── cmd/server/
│   └── main.go
├── internal/
│   ├── config/
│   │   └── config.go
│   ├── handler/
│   │   ├── health.go
│   │   └── user.go
│   ├── middleware/
│   │   ├── logging.go
│   │   └── recovery.go
│   ├── model/
│   │   └── user.go
│   ├── repository/
│   │   └── user_repo.go
│   └── service/
│       └── user_service.go
├── migrations/
├── deploy/
│   ├── Dockerfile
│   └── docker-compose.yml
├── go.mod
├── go.sum
├── Makefile
└── .golangci.yml
```

### Step 2: 选择框架并配置路由

**方案 A：Chi（推荐，标准库兼容）**

```bash
go get github.com/go-chi/chi/v5
go get github.com/go-chi/cors
```

```go
// cmd/server/main.go
package main

import (
    "log/slog"
    "net/http"
    "os"

    "github.com/go-chi/chi/v5"
    chimw "github.com/go-chi/chi/v5/middleware"
    "github.com/go-chi/cors"

    "github.com/your-org/my-api/internal/handler"
)

func main() {
    r := chi.NewRouter()

    // 全局中间件
    r.Use(chimw.RequestID)
    r.Use(chimw.RealIP)
    r.Use(chimw.Logger)
    r.Use(chimw.Recoverer)
    r.Use(chimw.Timeout(30 * time.Second))
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   []string{"*"},
        AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE"},
        AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

    // 路由
    r.Get("/health", handler.Health)

    r.Route("/api/v1", func(r chi.Router) {
        r.Route("/users", func(r chi.Router) {
            r.Get("/", handler.ListUsers)
            r.Post("/", handler.CreateUser)
            r.Get("/{id}", handler.GetUser)
            r.Put("/{id}", handler.UpdateUser)
            r.Delete("/{id}", handler.DeleteUser)
        })
    })

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    slog.Info("服务启动", "port", port)
    if err := http.ListenAndServe(":"+port, r); err != nil {
        slog.Error("服务异常", "error", err)
        os.Exit(1)
    }
}
```

**方案 B：Gin（高性能，生态丰富）**

```bash
go get github.com/gin-gonic/gin
```

```go
// cmd/server/main.go（Gin 版本）
package main

import (
    "github.com/gin-gonic/gin"
    "github.com/your-org/my-api/internal/handler"
)

func main() {
    r := gin.Default()

    // 全局中间件
    r.Use(gin.Recovery())
    r.Use(handler.CORSMiddleware())

    r.GET("/health", handler.Health)

    v1 := r.Group("/api/v1")
    {
        users := v1.Group("/users")
        {
            users.GET("/", handler.ListUsers)
            users.POST("/", handler.CreateUser)
            users.GET("/:id", handler.GetUser)
            users.PUT("/:id", handler.UpdateUser)
            users.DELETE("/:id", handler.DeleteUser)
        }
    }

    r.Run(":8080")
}
```

### Step 3: 中间件配置

```go
// internal/middleware/logging.go
package middleware

import (
    "log/slog"
    "net/http"
    "time"
)

type responseWriter struct {
    http.ResponseWriter
    status int
}

func (w *responseWriter) WriteHeader(code int) {
    w.status = code
    w.ResponseWriter.WriteHeader(code)
}

func Logging(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}

        next.ServeHTTP(rw, r)

        slog.Info("request",
            "method", r.Method,
            "path", r.URL.Path,
            "status", rw.status,
            "duration", time.Since(start).String(),
            "ip", r.RemoteAddr,
        )
    })
}

// internal/middleware/auth.go
func Auth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")
        if token == "" {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        // 验证 token...
        next.ServeHTTP(w, r)
    })
}
```

### Step 4: 数据库集成

```bash
go get github.com/jackc/pgx/v5
go get github.com/golang-migrate/migrate/v4
```

```go
// internal/repository/user_repo.go
package repository

import (
    "context"
    "fmt"

    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/your-org/my-api/internal/model"
)

type UserRepository struct {
    pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
    return &UserRepository{pool: pool}
}

func (r *UserRepository) FindByID(ctx context.Context, id int64) (*model.User, error) {
    var user model.User
    err := r.pool.QueryRow(ctx,
        "SELECT id, name, email, created_at FROM users WHERE id = $1", id,
    ).Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
    if err != nil {
        return nil, fmt.Errorf("查询用户 %d: %w", id, err)
    }
    return &user, nil
}

func (r *UserRepository) Create(ctx context.Context, user *model.User) error {
    err := r.pool.QueryRow(ctx,
        "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, created_at",
        user.Name, user.Email,
    ).Scan(&user.ID, &user.CreatedAt)
    if err != nil {
        return fmt.Errorf("创建用户: %w", err)
    }
    return nil
}
```

### Step 5: Docker 部署

```dockerfile
# deploy/Dockerfile
# 构建阶段
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

# 运行阶段
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server .
EXPOSE 8080
USER nobody
ENTRYPOINT ["./server"]
```

```yaml
# deploy/docker-compose.yml
services:
  api:
    build:
      context: ..
      dockerfile: deploy/Dockerfile
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/mydb
      - PORT=8080
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### Step 6: 验证

```bash
# 启动服务
go run ./cmd/server

# 健康检查
curl http://localhost:8080/health

# 测试 API
curl -X POST http://localhost:8080/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"张三","email":"zhang@example.com"}'

curl http://localhost:8080/api/v1/users/1

# 运行测试
go test ./... -v

# Lint 检查
golangci-lint run ./...
```

## 框架选择指南

| 框架 | 适用场景 | 特点 |
|------|----------|------|
| Chi | 标准库兼容、轻量 API | 零依赖、中间件即函数 |
| Gin | 高性能、丰富生态 | 路由快、绑定验证强 |
| Echo | 简洁、文档好 | 自动绑定、渲染方便 |
| 标准库 | 极简、Go 1.22+ | ServeMux 增强、无依赖 |