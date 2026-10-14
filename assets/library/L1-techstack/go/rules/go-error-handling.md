---
description: Go错误处理规范 - 1. 禁止忽略 Error、2. 错误包装（Error Wrapping）、3. errors.Is / errors.As、4. 自定义 Error 类型
trigger: glob
glob: **/*.go
---


# Go 错误处理规范

## 核心原则

- **必须**使用 `errors.Is()` / `errors.As()` 进行错误判断
- **必须**使用 `fmt.Errorf("...: %w", err)` 包装错误
- **禁止**忽略 error 返回值（`_ = doSomething()`）
- **推荐**定义自定义 error 类型表达业务语义
- **推荐**使用 sentinel errors 表示可预期的错误状态

## 规则详情

### 1. 禁止忽略 Error

```go
// ❌ 错误：忽略 error
data, _ := os.ReadFile("config.yaml")
json.Unmarshal(data, &config)

// ❌ 错误：仅打印不处理
result, err := db.Query("SELECT ...")
if err != nil {
    log.Println(err)  // 然后继续执行，使用零值 result
}

// ✅ 正确：必须处理每个 error
data, err := os.ReadFile("config.yaml")
if err != nil {
    return fmt.Errorf("读取配置文件失败: %w", err)
}

if err := json.Unmarshal(data, &config); err != nil {
    return fmt.Errorf("解析配置失败: %w", err)
}
```

### 2. 错误包装（Error Wrapping）

```go
// ✅ 必须：使用 %w 包装错误，保留错误链
func (s *UserService) GetUser(id int64) (*User, error) {
    user, err := s.repo.FindByID(id)
    if err != nil {
        return nil, fmt.Errorf("获取用户 %d: %w", id, err)
    }
    return user, nil
}

func (h *Handler) GetUserHandler(w http.ResponseWriter, r *http.Request) {
    id := parseID(r)
    user, err := h.userService.GetUser(id)
    if err != nil {
        // 错误链: "处理请求: 获取用户 123: 查询数据库: connection refused"
        http.Error(w, fmt.Errorf("处理请求: %w", err).Error(), 500)
        return
    }
    writeJSON(w, user)
}
```

### 3. errors.Is / errors.As

```go
// ✅ 必须：使用 errors.Is 判断 sentinel error
var ErrNotFound = errors.New("resource not found")

func (s *Service) Get(id string) (*Item, error) {
    item, err := s.repo.Find(id)
    if errors.Is(err, ErrNotFound) {
        // 返回 404
        return nil, &NotFoundError{Resource: "item", ID: id}
    }
    if err != nil {
        return nil, fmt.Errorf("查询 item %s: %w", id, err)
    }
    return item, nil
}

// ✅ 必须：使用 errors.As 提取自定义错误类型
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("字段 %s 验证失败: %s", e.Field, e.Message)
}

func handleCreate(err error) int {
    var valErr *ValidationError
    if errors.As(err, &valErr) {
        log.Printf("验证错误 - 字段: %s, 原因: %s", valErr.Field, valErr.Message)
        return http.StatusBadRequest
    }
    return http.StatusInternalServerError
}
```

### 4. 自定义 Error 类型

```go
// ✅ 推荐：定义业务错误类型
type AppError struct {
    Code    int
    Message string
    Err     error
}

func (e *AppError) Error() string {
    if e.Err != nil {
        return fmt.Sprintf("[%d] %s: %v", e.Code, e.Message, e.Err)
    }
    return fmt.Sprintf("[%d] %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
    return e.Err
}

// 构造函数
func NewNotFoundError(resource string, id any) *AppError {
    return &AppError{
        Code:    404,
        Message: fmt.Sprintf("%s '%v' 不存在", resource, id),
    }
}

func NewConflictError(msg string) *AppError {
    return &AppError{Code: 409, Message: msg}
}
```

### 5. Sentinel Errors

```go
// ✅ 推荐：在包级别定义 sentinel errors
package userservice

import "errors"

var (
    ErrUserNotFound    = errors.New("user not found")
    ErrEmailDuplicate  = errors.New("email already registered")
    ErrInvalidPassword = errors.New("password does not meet requirements")
)

// 使用
func (s *Service) Register(email, password string) error {
    if !isValidPassword(password) {
        return ErrInvalidPassword
    }
    exists, err := s.repo.EmailExists(email)
    if err != nil {
        return fmt.Errorf("检查邮箱: %w", err)
    }
    if exists {
        return fmt.Errorf("注册 %s: %w", email, ErrEmailDuplicate)
    }
    return nil
}
```

### 6. 错误处理最佳实践

```go
// ✅ 只在处理层（handler）记录日志，中间层只包装传递
// 中间层
func (s *Service) Process(orderID string) error {
    if err := s.validate(orderID); err != nil {
        return fmt.Errorf("验证订单 %s: %w", orderID, err)
    }
    if err := s.charge(orderID); err != nil {
        return fmt.Errorf("扣款订单 %s: %w", orderID, err)
    }
    return nil
}

// 处理层（记录日志 + 返回响应）
func (h *Handler) ProcessOrder(w http.ResponseWriter, r *http.Request) {
    orderID := chi.URLParam(r, "id")
    if err := h.svc.Process(orderID); err != nil {
        h.logger.Error("处理订单失败",
            "order_id", orderID,
            "error", err,
        )
        h.writeError(w, err)
        return
    }
    w.WriteHeader(http.StatusOK)
}

// ❌ 禁止：重复记录同一错误
func (s *Service) Bad() error {
    err := s.repo.Save()
    if err != nil {
        log.Error(err)  // 不要在这里记录
        return err      // 也不要返回原始 err，应包装
    }
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 是否处理了所有 error 返回值 | 必须 |
| 是否使用 %w 包装错误 | 必须 |
| 是否使用 errors.Is/As 判断 | 必须 |
| 是否只在处理层记录日志 | 推荐 |
| 是否定义了业务错误类型 | 推荐 |
| 是否存在 `_ =` 忽略 error | 禁止 |
| 是否重复记录同一错误 | 禁止 |