---
description: Go并发编程规范 - 1. Goroutine 泄漏防护、2. Context 传播、3. Channel vs Mutex 选择、4. sync 包使用
trigger: glob
glob: **/*.go
---


# Go 并发编程规范

## 核心原则

- **必须**防止 goroutine 泄漏（每个 goroutine 必须有退出路径）
- **必须**通过 `context.Context` 传播取消信号和超时
- **推荐**优先使用 channel 通信，共享内存时用 mutex
- **必须**使用 `sync.WaitGroup` 等待并发任务完成
- **禁止**在循环中无限制启动 goroutine

## 规则详情

### 1. Goroutine 泄漏防护

```go
// ❌ 错误：goroutine 泄漏 - 无法退出
func leakyProducer(ch chan<- int) {
    for i := 0; ; i++ {
        ch <- i  // 如果没有消费者，永远阻塞
    }
}

// ✅ 正确：使用 context 控制生命周期
func producer(ctx context.Context, ch chan<- int) error {
    defer close(ch)
    for i := 0; ; i++ {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case ch <- i:
        }
    }
}

// ✅ 正确：使用带缓冲 channel + timeout
func safeWorker(ctx context.Context, tasks <-chan Task, results chan<- Result) {
    defer close(results)
    for {
        select {
        case <-ctx.Done():
            return
        case task, ok := <-tasks:
            if !ok {
                return  // channel 已关闭
            }
            result := process(task)
            select {
            case results <- result:
            case <-ctx.Done():
                return
            }
        }
    }
}
```

### 2. Context 传播

```go
// ✅ 必须：所有 I/O 操作接受 context
func (s *Service) FetchData(ctx context.Context, url string) ([]byte, error) {
    // 设置超时
    ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
    defer cancel()

    req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    if err != nil {
        return nil, fmt.Errorf("创建请求: %w", err)
    }

    resp, err := s.client.Do(req)
    if err != nil {
        return nil, fmt.Errorf("请求 %s: %w", url, err)
    }
    defer resp.Body.Close()

    return io.ReadAll(resp.Body)
}

// ✅ 必须：context 作为第一个参数
func ProcessOrder(ctx context.Context, orderID string) error { ... }

// ❌ 错误：context 不作为第一个参数，或不传递
func ProcessOrder(orderID string, ctx context.Context) error { ... }
func ProcessOrder(orderID string) error { ... }  // 缺少 ctx
```

### 3. Channel vs Mutex 选择

```go
// ✅ 使用 channel：传递数据所有权、fan-in/fan-out、通知
func fanOut(ctx context.Context, tasks []Task, workers int) []Result {
    taskCh := make(chan Task, len(tasks))
    resultCh := make(chan Result, len(tasks))

    // 启动 workers
    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for task := range taskCh {
                resultCh <- process(ctx, task)
            }
        }()
    }

    // 发送任务
    for _, t := range tasks {
        taskCh <- t
    }
    close(taskCh)

    // 等待完成后关闭结果
    go func() {
        wg.Wait()
        close(resultCh)
    }()

    // 收集结果
    var results []Result
    for r := range resultCh {
        results = append(results, r)
    }
    return results
}

// ✅ 使用 mutex：保护共享状态、计数器、缓存
type SafeCache struct {
    mu    sync.RWMutex
    items map[string]any
}

func (c *SafeCache) Get(key string) (any, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    val, ok := c.items[key]
    return val, ok
}

func (c *SafeCache) Set(key string, val any) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.items[key] = val
}
```

### 4. sync 包使用

```go
// ✅ sync.Once：确保初始化只执行一次
var (
    instance *Database
    once     sync.Once
)

func GetDB() *Database {
    once.Do(func() {
        instance = &Database{
            pool: createPool(),
        }
    })
    return instance
}

// ✅ sync.WaitGroup：等待一组 goroutine 完成
func processAll(ctx context.Context, items []Item) error {
    var wg sync.WaitGroup
    errCh := make(chan error, len(items))

    for _, item := range items {
        wg.Add(1)
        go func(it Item) {
            defer wg.Done()
            if err := process(ctx, it); err != nil {
                errCh <- fmt.Errorf("处理 %s: %w", it.ID, err)
            }
        }(item)
    }

    wg.Wait()
    close(errCh)

    // 收集错误
    var errs []error
    for err := range errCh {
        errs = append(errs, err)
    }
    return errors.Join(errs...)
}

// ✅ sync.Pool：复用临时对象
var bufPool = sync.Pool{
    New: func() any {
        return new(bytes.Buffer)
    },
}

func process(data []byte) string {
    buf := bufPool.Get().(*bytes.Buffer)
    defer func() {
        buf.Reset()
        bufPool.Put(buf)
    }()
    // 使用 buf...
    return buf.String()
}
```

### 5. 并发安全模式

```go
// ✅ 推荐：使用 errgroup 管理并发任务
import "golang.org/x/sync/errgroup"

func fetchAll(ctx context.Context, urls []string) ([]Response, error) {
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(10)  // 限制并发数

    results := make([]Response, len(urls))
    for i, url := range urls {
        i, url := i, url
        g.Go(func() error {
            resp, err := fetch(ctx, url)
            if err != nil {
                return fmt.Errorf("获取 %s: %w", url, err)
            }
            results[i] = resp
            return nil
        })
    }

    if err := g.Wait(); err != nil {
        return nil, err
    }
    return results, nil
}

// ❌ 禁止：无限制启动 goroutine
func bad(urls []string) {
    for _, url := range urls {
        go fetch(url)  // 10000 个 URL = 10000 个 goroutine
    }
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| goroutine 是否有退出路径 | 必须 |
| 是否通过 context 传播取消 | 必须 |
| 是否限制并发数量 | 必须 |
| channel 是否有 close 时机 | 必须 |
| 共享状态是否加锁 | 必须 |
| 是否使用 errgroup 管理任务组 | 推荐 |
| 是否存在无限制 goroutine | 禁止 |
| 是否存在 channel 死锁风险 | 禁止 |