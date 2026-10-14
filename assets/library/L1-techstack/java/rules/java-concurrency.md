---
description: Java并发规范 - 详见正文
trigger: glob
glob: **/*.java
---


# Java 并发规范

## 概述

并发编程是高性能 Java 应用的基础，也是 bug 的高发区。本规范定义了线程池配置、异步编程和锁使用的标准。

## 必须遵守

- **必须** 使用自定义线程池，禁止使用 `Executors.newXxx()` 工厂方法
- **必须** 线程池设置有意义的名称（便于排查问题）
- **必须** 异步任务使用 `CompletableFuture`，指定线程池
- **必须** `@Async` 方法指定线程池名称
- **推荐** 优先使用并发集合（`ConcurrentHashMap`）而非手动加锁
- **推荐** 使用 `ReentrantLock` 替代 `synchronized`（可超时、可中断）

## 禁止事项

- **禁止** `Executors.newFixedThreadPool()`（无界队列，OOM 风险）
- **禁止** `Executors.newCachedThreadPool()`（无限线程，OOM 风险）
- **禁止** 在循环中创建线程或线程池
- **禁止** 使用 `Thread.sleep()` 做业务等待
- **禁止** 在持有锁的情况下调用外部服务（死锁风险）
- **禁止** `@Async` 不指定线程池（使用默认 SimpleAsyncTaskExecutor）

## 线程池配置

```java
// ✅ 必须：自定义线程池 + 有意义命名
@Configuration
public class ThreadPoolConfig {

    @Bean("orderAsyncPool")
    public ThreadPoolExecutor orderAsyncPool() {
        return new ThreadPoolExecutor(
            4,                          // corePoolSize
            8,                          // maxPoolSize
            60L, TimeUnit.SECONDS,      // keepAliveTime
            new LinkedBlockingQueue<>(200), // 有界队列！
            new ThreadFactoryBuilder()
                .setNameFormat("order-async-%d")
                .setUncaughtExceptionHandler((t, e) ->
                    log.error("Thread {} uncaught exception", t.getName(), e))
                .build(),
            new ThreadPoolExecutor.CallerRunsPolicy() // 拒绝策略
        );
    }

    @Bean("ioIntensivePool")
    public ThreadPoolExecutor ioIntensivePool() {
        int cores = Runtime.getRuntime().availableProcessors();
        return new ThreadPoolExecutor(
            cores * 2,
            cores * 4,
            60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(500),
            new ThreadFactoryBuilder().setNameFormat("io-pool-%d").build(),
            new ThreadPoolExecutor.CallerRunsPolicy()
        );
    }
}
```

## CompletableFuture

```java
// ❌ 错误：使用默认 ForkJoinPool
CompletableFuture.supplyAsync(() -> fetchData()); // 共享池，影响全局

// ✅ 正确：指定自定义线程池
@Service
@RequiredArgsConstructor
public class DashboardService {

    @Qualifier("ioIntensivePool")
    private final ThreadPoolExecutor ioPool;

    public DashboardVO loadDashboard(Long userId) {
        CompletableFuture<UserVO> userFuture =
            CompletableFuture.supplyAsync(() -> userService.getById(userId), ioPool);

        CompletableFuture<List<OrderVO>> ordersFuture =
            CompletableFuture.supplyAsync(() -> orderService.getByUser(userId), ioPool);

        CompletableFuture<StatsVO> statsFuture =
            CompletableFuture.supplyAsync(() -> statsService.getUserStats(userId), ioPool);

        // 等待所有完成
        CompletableFuture.allOf(userFuture, ordersFuture, statsFuture).join();

        return new DashboardVO(
            userFuture.join(),
            ordersFuture.join(),
            statsFuture.join()
        );
    }
}

// ✅ 正确：异常处理
CompletableFuture<OrderVO> future = CompletableFuture
    .supplyAsync(() -> orderService.getById(id), ioPool)
    .exceptionally(ex -> {
        log.error("Failed to load order {}", id, ex);
        return OrderVO.empty(); // 降级
    });
```

## @Async 注意事项

```java
// ❌ 错误：不指定线程池
@Async
public void sendEmail(String to) { ... }

// ✅ 正确：指定线程池 + 异常处理
@Async("orderAsyncPool")
public CompletableFuture<Void> sendOrderEmail(Long orderId) {
    try {
        // 发送邮件逻辑
        return CompletableFuture.completedFuture(null);
    } catch (Exception e) {
        log.error("Failed to send email for order {}", orderId, e);
        return CompletableFuture.failedFuture(e);
    }
}

// ⚠️ 注意：@Async 同类内调用无效（Spring AOP 代理限制）
// ❌ 错误：this.asyncMethod() 不会异步执行
// ✅ 正确：通过注入自身或 ApplicationContext 调用
```

## 锁选择

```java
// ✅ 推荐：ReentrantLock（可超时、可中断、可公平）
private final ReentrantLock lock = new ReentrantLock();

public void transfer(Account from, Account to, BigDecimal amount) {
    boolean acquired = false;
    try {
        acquired = lock.tryLock(5, TimeUnit.SECONDS);
        if (!acquired) {
            throw new BusinessException("LOCK_TIMEOUT", "Operation timeout", 503);
        }
        // 业务逻辑
        from.debit(amount);
        to.credit(amount);
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new BusinessException("INTERRUPTED", "Operation interrupted", 500);
    } finally {
        if (acquired) {
            lock.unlock();
        }
    }
}

// ✅ 推荐：并发集合替代手动锁
private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

// 原子操作
cache.computeIfAbsent(key, k -> loadFromDB(k));
cache.merge(key, newValue, (old, val) -> old.merge(val));
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 自定义线程池（有界队列） | 必须 |
| 线程有命名 | 必须 |
| CompletableFuture 指定线程池 | 必须 |
| @Async 指定线程池 | 必须 |
| 无 Executors.newXxx() | 必须 |
| 锁内不调用外部服务 | 必须 |
| 优先并发集合 | 推荐 |