---
description: Go测试规范 - 1. Table-Driven Tests、2. testify 断言、3. httptest 测试 HTTP Handler、4. Benchmark
trigger: glob
glob: **/*.go
---


# Go 测试规范

## 核心原则

- **必须**使用 table-driven tests 组织测试用例
- **推荐**使用 `testify/assert` 或 `testify/require` 简化断言
- **必须**使用 `httptest` 测试 HTTP handler
- **推荐**为核心路径编写 benchmark
- **必须**测试覆盖率 ≥ 80%

## 规则详情

### 1. Table-Driven Tests

```go
// ✅ 必须：使用表驱动测试
func TestValidateEmail(t *testing.T) {
    tests := []struct {
        name     string
        email    string
        wantErr  bool
    }{
        {
            name:    "valid basic email",
            email:   "user@example.com",
            wantErr: false,
        },
        {
            name:    "valid with plus",
            email:   "user+tag@example.com",
            wantErr: false,
        },
        {
            name:    "missing at sign",
            email:   "userexample.com",
            wantErr: true,
        },
        {
            name:    "empty string",
            email:   "",
            wantErr: true,
        },
        {
            name:    "missing domain",
            email:   "user@",
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := ValidateEmail(tt.email)
            if tt.wantErr {
                if err == nil {
                    t.Errorf("ValidateEmail(%q) = nil, want error", tt.email)
                }
            } else {
                if err != nil {
                    t.Errorf("ValidateEmail(%q) = %v, want nil", tt.email, err)
                }
            }
        })
    }
}
```

### 2. testify 断言

```go
import (
    "testing"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestUserService_Create(t *testing.T) {
    // ✅ require：失败立即终止（前置条件）
    repo := NewMockUserRepo()
    svc := NewUserService(repo)
    require.NotNil(t, svc)

    user, err := svc.Create(context.Background(), CreateUserInput{
        Name:  "张三",
        Email: "zhang@example.com",
    })

    // ✅ assert：失败继续执行（验证结果）
    require.NoError(t, err)
    assert.Equal(t, "张三", user.Name)
    assert.Equal(t, "zhang@example.com", user.Email)
    assert.NotZero(t, user.ID)
    assert.WithinDuration(t, time.Now(), user.CreatedAt, time.Second)
}

func TestUserService_Create_DuplicateEmail(t *testing.T) {
    repo := NewMockUserRepo()
    svc := NewUserService(repo)

    // 先创建一个用户
    _, err := svc.Create(ctx, CreateUserInput{Email: "dup@example.com"})
    require.NoError(t, err)

    // 重复创建应失败
    _, err = svc.Create(ctx, CreateUserInput{Email: "dup@example.com"})
    assert.Error(t, err)
    assert.ErrorIs(t, err, ErrEmailDuplicate)
}
```

### 3. httptest 测试 HTTP Handler

```go
func TestUserHandler_GetUser(t *testing.T) {
    // 准备 mock service
    mockSvc := NewMockUserService()
    mockSvc.On("GetUser", mock.Anything, int64(1)).Return(&User{
        ID:   1,
        Name: "张三",
    }, nil)

    handler := NewUserHandler(mockSvc)
    router := setupRouter(handler)

    tests := []struct {
        name       string
        url        string
        wantStatus int
        wantBody   string
    }{
        {
            name:       "success",
            url:        "/users/1",
            wantStatus: http.StatusOK,
            wantBody:   `{"id":1,"name":"张三"}`,
        },
        {
            name:       "not found",
            url:        "/users/999",
            wantStatus: http.StatusNotFound,
        },
        {
            name:       "invalid id",
            url:        "/users/abc",
            wantStatus: http.StatusBadRequest,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            req := httptest.NewRequest(http.MethodGet, tt.url, nil)
            rec := httptest.NewRecorder()

            router.ServeHTTP(rec, req)

            assert.Equal(t, tt.wantStatus, rec.Code)
            if tt.wantBody != "" {
                assert.JSONEq(t, tt.wantBody, rec.Body.String())
            }
        })
    }
}
```

### 4. Benchmark

```go
// ✅ 推荐：为性能敏感函数编写 benchmark
func BenchmarkHashPassword(b *testing.B) {
    password := "secure-password-123"
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        HashPassword(password)
    }
}

func BenchmarkUserRepo_FindByID(b *testing.B) {
    repo := setupTestRepo(b)
    ctx := context.Background()

    b.ResetTimer()
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            repo.FindByID(ctx, 1)
        }
    })
}

// 运行 benchmark
// go test -bench=. -benchmem -count=5 ./...
```

### 5. 测试辅助函数

```go
// ✅ 推荐：提取测试辅助函数
func setupTestServer(t *testing.T) *httptest.Server {
    t.Helper()

    db := setupTestDB(t)
    repo := NewUserRepository(db)
    svc := NewUserService(repo)
    handler := NewUserHandler(svc)

    server := httptest.NewServer(setupRouter(handler))
    t.Cleanup(server.Close)
    return server
}

func setupTestDB(t *testing.T) *sql.DB {
    t.Helper()

    db, err := sql.Open("sqlite3", ":memory:")
    require.NoError(t, err)
    t.Cleanup(func() { db.Close() })

    _, err = db.Exec(schema)
    require.NoError(t, err)
    return db
}

// ✅ 使用 TestMain 进行全局设置
func TestMain(m *testing.M) {
    // 全局设置
    os.Setenv("APP_ENV", "test")

    code := m.Run()

    // 全局清理
    os.Exit(code)
}
```

### 6. 覆盖率配置

```bash
# 运行测试 + 覆盖率
go test ./... -coverprofile=coverage.out -covermode=atomic

# 查看覆盖率
go tool cover -func=coverage.out

# 生成 HTML 报告
go tool cover -html=coverage.out -o coverage.html

# 设置最低覆盖率（CI 脚本）
COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | tr -d '%')
if (( $(echo "$COVERAGE < 80" | bc -l) )); then
    echo "覆盖率 ${COVERAGE}% 低于 80%"
    exit 1
fi
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 是否使用 table-driven tests | 必须 |
| 测试命名是否描述场景 | 必须 |
| 是否使用 t.Helper() | 必须 |
| 是否测试了错误路径 | 必须 |
| 覆盖率是否 ≥ 80% | 必须 |
| 是否使用 httptest | 推荐 |
| 是否有 benchmark | 推荐 |
| 测试间是否有依赖 | 禁止 |
| 是否 sleep 等待异步 | 禁止 |