---
description: Go命名规范 - 1. 包命名、2. 接口命名、3. Exported vs Unexported、4. Receiver 命名
trigger: glob
glob: **/*.go
---


# Go 命名规范

## 核心原则

- **必须**包名使用小写单词，禁止下划线和驼峰
- **必须**接口名使用 `-er` 后缀（Reader, Writer, Closer）
- **必须**区分 exported（大写开头）和 unexported（小写开头）
- **推荐** receiver 命名使用 1-2 个字母的缩写
- **禁止**使用无意义命名（data, info, temp, obj）

## 规则详情

### 1. 包命名

```go
// ✅ 正确：小写、简短、有意义
package httpclient
package userrepo
package logutil
package middleware

// ❌ 错误
package httpClient    // 禁止驼峰
package http_client   // 禁止下划线
package HTTPClient    // 禁止大写
package util          // 太泛化
package common        // 无意义
package misc          // 无意义

// ✅ 包名与目录名一致
// internal/userrepo/userrepo.go → package userrepo

// ✅ 避免与标准库同名
package httpx     // 而非 package http
package logx      // 而非 package log
```

### 2. 接口命名

```go
// ✅ 正确：单方法接口使用 -er 后缀
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

type Closer interface {
    Close() error
}

// ✅ 组合接口
type ReadWriter interface {
    Reader
    Writer
}

type ReadWriteCloser interface {
    Reader
    Writer
    Closer
}

// ✅ 多方法接口：描述能力
type UserRepository interface {
    FindByID(ctx context.Context, id int64) (*User, error)
    Create(ctx context.Context, user *User) error
    Update(ctx context.Context, user *User) error
    Delete(ctx context.Context, id int64) error
}

// ❌ 错误：接口名加 I 前缀
type IUserService interface { ... }  // Java 风格，禁止

// ❌ 错误：接口名加 Impl 后缀
type ServiceImpl interface { ... }  // 禁止
```

### 3. Exported vs Unexported

```go
package userservice

// ✅ Exported：包外可见
type UserService struct { ... }       // 公开类型
func NewUserService() *UserService { ... }  // 公开构造函数
func (s *UserService) GetUser(id int64) (*User, error) { ... }  // 公开方法

// ✅ Unexported：包内私有
type config struct { ... }           // 私有类型
func parseConfig(path string) (*config, error) { ... }  // 私有函数
func (s *UserService) validate(u *User) error { ... }   // 私有方法

// ✅ 常量命名
const (
    MaxRetryCount = 3          // Exported
    defaultTimeout = 30 * time.Second  // Unexported
)

// ❌ 错误：全部导出
type userService struct { ... }  // 如果外部需要用，应该导出
func (s *UserService) GetUser(...) { ... }  // 外部需要调用，必须导出
```

### 4. Receiver 命名

```go
// ✅ 正确：1-2 字母缩写，保持一致
type UserService struct { ... }
func (s *UserService) GetUser(id int64) (*User, error) { ... }
func (s *UserService) CreateUser(u *User) error { ... }

type HTTPClient struct { ... }
func (c *HTTPClient) Get(url string) (*Response, error) { ... }
func (c *HTTPClient) Post(url string, body any) (*Response, error) { ... }

type Repository struct { ... }
func (r *Repository) Find(id int64) (*Entity, error) { ... }

// ❌ 错误：receiver 命名不一致
func (s *UserService) GetUser(...) { ... }
func (this *UserService) CreateUser(...) { ... }  // 禁止 this/self
func (service *UserService) Delete(...) { ... }   // 太长

// ❌ 错误：同一类型混用值/指针 receiver
func (s UserService) GetUser(...) { ... }    // 值
func (s *UserService) CreateUser(...) { ... } // 指针 - 不一致！
```

### 5. 变量和函数命名

```go
// ✅ 正确：驼峰命名，缩写全大写
var httpClient *http.Client
var dbConn *sql.DB
var userID int64
var httpServer *http.Server

// ✅ 函数命名：动词开头
func GetUser(id int64) (*User, error) { ... }
func ParseConfig(path string) (*Config, error) { ... }
func ValidateEmail(email string) error { ... }
func NewUserService(repo UserRepository) *UserService { ... }

// ✅ 布尔变量：is/has/can/should 前缀
var isActive bool
var hasPermission bool
var canRetry bool

// ❌ 错误命名
var data map[string]any      // 无意义
var info string              // 无意义
var temp int                 // 无意义
var obj *Object              // 无意义
var getUser *User            // 变量不用动词开头
```

### 6. 错误变量和类型命名

```go
// ✅ Sentinel errors：Err 前缀
var ErrNotFound = errors.New("not found")
var ErrUnauthorized = errors.New("unauthorized")
var ErrConflict = errors.New("conflict")

// ✅ 错误类型：Error 后缀
type ValidationError struct {
    Field   string
    Message string
}
func (e *ValidationError) Error() string { ... }

type NotFoundError struct {
    Resource string
    ID       any
}
func (e *NotFoundError) Error() string { ... }

// ❌ 错误
var NotFound = errors.New(...)     // 缺少 Err 前缀
type ValidationErr struct { ... }  // 应使用完整 Error
```

## 命名速查表

| 类别 | 规则 | 示例 |
|------|------|------|
| 包名 | 小写单词 | `httpclient`, `userrepo` |
| 接口 | -er 后缀 | `Reader`, `UserService` |
| 结构体 | 名词/名词短语 | `UserService`, `Config` |
| 函数 | 动词开头 | `GetUser`, `ParseConfig` |
| 方法 | 动词开头 | `s.GetUser()`, `c.Do()` |
| 常量 | 驼峰 | `MaxRetry`, `DefaultTimeout` |
| 错误变量 | Err 前缀 | `ErrNotFound` |
| 错误类型 | Error 后缀 | `ValidationError` |
| Receiver | 1-2 字母 | `s`, `c`, `r` |
| 布尔 | is/has/can | `isActive`, `hasAccess` |