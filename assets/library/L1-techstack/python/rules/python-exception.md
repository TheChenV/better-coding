---
description: Python异常处理规范 - 1. 禁止 Bare Except、2. EAFP 风格优先、3. 异常链（Exception Chaining）、4. 上下文管理器
trigger: glob
glob: **/*.py
---


# Python 异常处理规范

## 核心原则

- **必须**使用具体异常类型，**禁止**使用 bare `except:` 或 `except Exception:`
- **必须**遵循 EAFP（Easier to Ask Forgiveness than Permission）风格
- **必须**使用 `raise ... from e` 保留异常链
- **推荐**使用上下文管理器（`with`）处理资源清理
- **必须**在 except 块中记录日志，**禁止**静默吞掉异常

## 规则详情

### 1. 禁止 Bare Except

```python
# ❌ 错误：bare except 会捕获所有异常（包括 KeyboardInterrupt、SystemExit）
try:
    result = process_data(data)
except:
    pass

# ❌ 错误：过于宽泛的异常捕获
try:
    result = process_data(data)
except Exception:
    logger.error("出错了")

# ✅ 正确：捕获具体异常类型
try:
    result = process_data(data)
except (ValueError, KeyError) as e:
    logger.error("数据处理失败: %s", e, exc_info=True)
    raise DataProcessingError(f"无法处理数据: {e}") from e
```

### 2. EAFP 风格优先

```python
# ❌ 错误：LBYL（Look Before You Leap）风格
if key in my_dict:
    value = my_dict[key]
else:
    value = default

# ✅ 正确：EAFP 风格
try:
    value = my_dict[key]
except KeyError:
    value = default

# ✅ 更推荐：使用 dict.get() 简化
value = my_dict.get(key, default)
```

### 3. 异常链（Exception Chaining）

```python
# ❌ 错误：丢失原始异常信息
try:
    response = requests.get(url, timeout=5)
except requests.RequestException as e:
    raise ServiceUnavailableError("服务不可用")

# ✅ 正确：使用 raise from 保留异常链
try:
    response = requests.get(url, timeout=5)
except requests.RequestException as e:
    raise ServiceUnavailableError(f"服务不可用: {url}") from e
```

### 4. 上下文管理器

```python
# ❌ 错误：手动管理资源
f = open("data.txt", "r")
try:
    content = f.read()
finally:
    f.close()

# ✅ 正确：使用上下文管理器
with open("data.txt", "r", encoding="utf-8") as f:
    content = f.read()

# ✅ 自定义上下文管理器
from contextlib import contextmanager

@contextmanager
def managed_connection(dsn: str):
    conn = create_connection(dsn)
    try:
        yield conn
    except ConnectionError as e:
        logger.warning("连接异常，执行回滚: %s", e)
        conn.rollback()
        raise
    else:
        conn.commit()
    finally:
        conn.close()
```

### 5. 自定义异常层次

```python
# ✅ 推荐：定义项目级异常基类
class AppError(Exception):
    """应用基础异常"""
    def __init__(self, message: str, code: str = "UNKNOWN"):
        super().__init__(message)
        self.code = code

class ValidationError(AppError):
    """数据验证异常"""
    def __init__(self, field: str, message: str):
        super().__init__(f"字段 '{field}' 验证失败: {message}", code="VALIDATION_ERROR")
        self.field = field

class NotFoundError(AppError):
    """资源未找到异常"""
    def __init__(self, resource: str, identifier: str):
        super().__init__(f"{resource} '{identifier}' 不存在", code="NOT_FOUND")
```

### 6. 日志记录规范

```python
import logging

logger = logging.getLogger(__name__)

# ✅ 正确：记录完整堆栈信息
try:
    result = risky_operation()
except SpecificError as e:
    logger.exception("操作失败，参数: %s", param)  # 自动包含 traceback
    raise

# ❌ 错误：仅记录消息，丢失堆栈
try:
    result = risky_operation()
except SpecificError as e:
    logger.error(f"出错了: {e}")  # 缺少 exc_info
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 是否使用具体异常类型 | 必须 |
| 是否保留异常链 | 必须 |
| 是否记录日志含堆栈 | 必须 |
| 是否使用上下文管理器 | 推荐 |
| 是否定义异常层次 | 推荐 |
| 是否存在 bare except | 禁止 |
| 是否存在 pass 吞异常 | 禁止 |