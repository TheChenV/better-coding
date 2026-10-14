---
description: Python类型注解规范 - 1. 函数签名类型注解、2. 使用现代类型语法（Python 3.10+）、3. TypeVar 与 Generic、4. Protocol（结构化子类型）
trigger: glob
glob: **/*.py
---


# Python 类型注解规范

## 核心原则

- **必须**为所有公开函数（public API）添加完整类型注解
- **必须**使用 `typing` 模块中的高级类型（Python 3.10+ 可用内置泛型）
- **推荐**使用 `Protocol` 定义结构化子类型（鸭子类型的静态版本）
- **必须**通过 `mypy --strict` 检查，零错误
- **禁止**使用 `Any` 类型逃避检查（除非有充分注释说明原因）

## 规则详情

### 1. 函数签名类型注解

```python
from typing import Optional
from collections.abc import Sequence, Mapping

# ❌ 错误：缺少类型注解
def process_users(users, limit=None):
    results = []
    for user in users[:limit]:
        results.append(user.name)
    return results

# ✅ 正确：完整类型注解
def process_users(
    users: Sequence[User],
    limit: Optional[int] = None,
) -> list[str]:
    """处理用户列表，返回用户名。"""
    results: list[str] = []
    for user in users[:limit]:
        results.append(user.name)
    return results
```

### 2. 使用现代类型语法（Python 3.10+）

```python
from typing import TypeAlias

# ✅ Python 3.10+ 推荐写法
UserId: TypeAlias = int | str
JsonDict: TypeAlias = dict[str, "JsonValue"]
JsonValue: TypeAlias = str | int | float | bool | None | list["JsonValue"] | JsonDict

def get_user(user_id: UserId) -> User | None:
    ...

# ❌ 避免：旧式写法（除非需兼容 3.9）
from typing import Union, Optional
def get_user(user_id: Union[int, str]) -> Optional[User]:
    ...
```

### 3. TypeVar 与 Generic

```python
from typing import TypeVar, Generic
from collections.abc import Callable

T = TypeVar("T")
S = TypeVar("S")

# ✅ 泛型容器
class Repository(Generic[T]):
    def __init__(self, model_class: type[T]) -> None:
        self._model = model_class
        self._store: dict[int, T] = {}

    def get(self, id: int) -> T | None:
        return self._store.get(id)

    def save(self, id: int, entity: T) -> T:
        self._store[id] = entity
        return entity

# ✅ 有界 TypeVar
Numeric = TypeVar("Numeric", int, float)

def add(a: Numeric, b: Numeric) -> Numeric:
    return a + b
```

### 4. Protocol（结构化子类型）

```python
from typing import Protocol, runtime_checkable

# ✅ 推荐：使用 Protocol 定义接口
@runtime_checkable
class Serializable(Protocol):
    def to_dict(self) -> dict[str, object]:
        ...

    def to_json(self) -> str:
        ...

class Renderable(Protocol):
    def render(self, template: str) -> str:
        ...

# 无需显式继承，只要实现了方法即满足 Protocol
class User:
    def to_dict(self) -> dict[str, object]:
        return {"name": self.name, "email": self.email}

    def to_json(self) -> str:
        import json
        return json.dumps(self.to_dict())

def export(entity: Serializable) -> str:
    return entity.to_json()

# User 自动满足 Serializable Protocol
export(User())  # ✅ 类型检查通过
```

### 5. Callable 与高阶函数

```python
from collections.abc import Callable, Awaitable

# ✅ 回调函数类型
def retry(
    func: Callable[..., T],
    max_attempts: int = 3,
    on_failure: Callable[[Exception], None] | None = None,
) -> Callable[..., T]:
    ...

# ✅ 异步函数类型
async def fetch_all(
    urls: list[str],
    processor: Callable[[str], Awaitable[bytes]],
) -> list[bytes]:
    ...
```

### 6. mypy 严格模式配置

```toml
# pyproject.toml
[tool.mypy]
python_version = "3.11"
strict = true
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
show_error_codes = true

[[tool.mypy.overrides]]
module = ["tests.*"]
disallow_untyped_defs = false
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 公开函数是否有完整类型注解 | 必须 |
| 返回值是否标注 | 必须 |
| 是否通过 mypy --strict | 必须 |
| 是否滥用 Any 类型 | 禁止 |
| 是否使用 Protocol 定义接口 | 推荐 |
| 复杂类型是否使用 TypeAlias | 推荐 |
| 泛型是否使用 TypeVar/Generic | 推荐 |