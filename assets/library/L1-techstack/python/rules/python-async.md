---
description: Python异步编程规范 - 1. 异步适用场景、2. 禁止阻塞事件循环、3. 并发控制、4. 超时与取消
trigger: glob
glob: **/*.py
---


# Python 异步编程规范

## 核心原则

- **必须**明确 async/await 的使用场景（I/O 密集型任务）
- **禁止**在异步函数中调用阻塞操作（如 `time.sleep`、同步 `requests`）
- **推荐**使用 `httpx` 或 `aiohttp` 进行异步 HTTP 请求
- **必须**使用 `asyncio.Semaphore` 控制并发数量
- **必须**正确处理异步任务的取消和超时

## 规则详情

### 1. 异步适用场景

```python
# ✅ 正确：I/O 密集型操作使用 async
import asyncio
import httpx

async def fetch_urls(urls: list[str]) -> list[str]:
    """并发获取多个 URL 内容。"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = [client.get(url) for url in urls]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        results = []
        for resp in responses:
            if isinstance(resp, Exception):
                results.append(f"Error: {resp}")
            else:
                results.append(resp.text)
        return results

# ❌ 错误：CPU 密集型操作不应使用 async
async def compute_hashes(data_list: list[bytes]) -> list[str]:
    # 这会阻塞事件循环！应使用 ProcessPoolExecutor
    return [hashlib.sha256(d).hexdigest() for d in data_list]
```

### 2. 禁止阻塞事件循环

```python
import asyncio
from functools import partial

# ❌ 错误：在 async 函数中使用阻塞调用
async def bad_handler():
    time.sleep(5)  # 阻塞整个事件循环！
    result = requests.get("https://api.example.com")  # 同步 HTTP！
    with open("large_file.txt") as f:
        data = f.read()  # 同步文件 I/O！

# ✅ 正确：使用异步替代或线程池
import aiofiles

async def good_handler():
    await asyncio.sleep(5)  # 非阻塞等待

    async with httpx.AsyncClient() as client:
        result = await client.get("https://api.example.com")

    async with aiofiles.open("large_file.txt") as f:
        data = await f.read()

# ✅ CPU 密集型任务使用进程池
async def cpu_intensive(data: list[bytes]) -> list[str]:
    loop = asyncio.get_running_loop()
    with concurrent.futures.ProcessPoolExecutor() as pool:
        results = await loop.run_in_executor(
            pool, partial(compute_hashes_sync, data)
        )
    return results
```

### 3. 并发控制

```python
import asyncio
import httpx

# ✅ 必须：使用 Semaphore 限制并发数
async def fetch_with_limit(
    urls: list[str],
    max_concurrent: int = 10,
) -> list[httpx.Response]:
    """限制并发数量的批量请求。"""
    semaphore = asyncio.Semaphore(max_concurrent)

    async def limited_fetch(client: httpx.AsyncClient, url: str) -> httpx.Response:
        async with semaphore:
            return await client.get(url)

    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [limited_fetch(client, url) for url in urls]
        return await asyncio.gather(*tasks)

# ✅ 推荐：使用 TaskGroup（Python 3.11+）
async def process_tasks():
    async with asyncio.TaskGroup() as tg:
        task1 = tg.create_task(fetch_data("url1"))
        task2 = tg.create_task(fetch_data("url2"))
        task3 = tg.create_task(fetch_data("url3"))
    # 所有任务完成后继续
    print(task1.result(), task2.result(), task3.result())
```

### 4. 超时与取消

```python
# ✅ 必须：为所有外部调用设置超时
async def safe_fetch(url: str) -> str:
    try:
        async with asyncio.timeout(10.0):  # Python 3.11+
            async with httpx.AsyncClient() as client:
                resp = await client.get(url)
                return resp.text
    except TimeoutError:
        logger.warning("请求超时: %s", url)
        raise ServiceTimeoutError(f"请求 {url} 超时") from None
    except asyncio.CancelledError:
        logger.info("任务被取消: %s", url)
        raise  # 必须重新抛出 CancelledError

# ❌ 错误：吞掉 CancelledError
async def bad_task():
    try:
        await long_running_operation()
    except asyncio.CancelledError:
        pass  # 禁止！会破坏任务取消机制
```

### 5. 异步上下文管理器与迭代器

```python
# ✅ 异步上下文管理器
class AsyncDatabaseConnection:
    async def __aenter__(self) -> "AsyncDatabaseConnection":
        self.conn = await create_async_connection()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.conn.close()

async def query_data():
    async with AsyncDatabaseConnection() as db:
        return await db.execute("SELECT * FROM users")

# ✅ 异步生成器
async def stream_records(batch_size: int = 100):
    offset = 0
    while True:
        batch = await fetch_batch(offset, batch_size)
        if not batch:
            break
        for record in batch:
            yield record
        offset += batch_size

async def process_all():
    async for record in stream_records():
        await process(record)
```

### 6. HTTP 客户端选择

| 场景 | 推荐 | 说明 |
|------|------|------|
| 通用异步 HTTP | `httpx` | API 兼容 requests，支持 HTTP/2 |
| 高性能并发 | `aiohttp` | 性能略优，生态成熟 |
| 简单同步请求 | `httpx`（同步模式） | 统一代码风格 |
| WebSocket | `websockets` / `aiohttp` | 按需选择 |

```python
# ✅ 推荐：httpx 异步客户端复用
class APIClient:
    def __init__(self, base_url: str):
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=httpx.Timeout(10.0, connect=5.0),
            limits=httpx.Limits(max_connections=20),
        )

    async def get_user(self, user_id: int) -> dict:
        resp = await self._client.get(f"/users/{user_id}")
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._client.aclose()
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 是否存在阻塞调用在 async 中 | 禁止 |
| 是否设置超时 | 必须 |
| 是否限制并发数 | 必须 |
| 是否正确处理 CancelledError | 必须 |
| 是否复用 HTTP 客户端 | 推荐 |
| CPU 密集任务是否用进程池 | 必须 |