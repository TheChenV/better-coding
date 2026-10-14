---
description: Python项目结构规范 - 1. pyproject.toml 配置、2. 包命名规范、3. 模块组织原则、4. 虚拟环境管理
trigger: glob
glob: **/*.py
---


# Python 项目结构规范

## 核心原则

- **必须**使用 `src` layout（`src/` 目录布局）
- **必须**使用 `pyproject.toml` 作为唯一项目配置文件
- **禁止**使用 `setup.py` / `setup.cfg`（已废弃）
- **必须**使用小写+下划线命名包和模块
- **推荐**每个项目使用独立虚拟环境

## 标准目录结构

```
my-project/
├── src/
│   └── my_project/
│       ├── __init__.py
│       ├── py.typed              # PEP 561 类型标记
│       ├── core/
│       │   ├── __init__.py
│       │   ├── models.py
│       │   └── exceptions.py
│       ├── api/
│       │   ├── __init__.py
│       │   ├── routes.py
│       │   └── schemas.py
│       ├── services/
│       │   ├── __init__.py
│       │   └── user_service.py
│       └── utils/
│           ├── __init__.py
│           └── helpers.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── unit/
│   │   ├── __init__.py
│   │   └── test_models.py
│   └── integration/
│       ├── __init__.py
│       └── test_api.py
├── docs/
├── scripts/
├── pyproject.toml
├── README.md
├── LICENSE
├── .gitignore
├── .pre-commit-config.yaml
└── Makefile
```

## 规则详情

### 1. pyproject.toml 配置

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "my-project"
version = "0.1.0"
description = "项目描述"
readme = "README.md"
license = "MIT"
requires-python = ">=3.11"
authors = [
    { name = "Author", email = "author@example.com" },
]
dependencies = [
    "fastapi>=0.104.0",
    "pydantic>=2.5.0",
    "sqlalchemy>=2.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-cov>=4.1.0",
    "mypy>=1.7.0",
    "ruff>=0.1.6",
    "pre-commit>=3.5.0",
]

[tool.hatch.build.targets.wheel]
packages = ["src/my_project"]

[tool.ruff]
target-version = "py311"
line-length = 100
src = ["src", "tests"]

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "B", "SIM"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v --strict-markers --cov=src"

[tool.mypy]
python_version = "3.11"
strict = true
```

### 2. 包命名规范

```python
# ✅ 正确：小写 + 下划线
# my_project/core/models.py
# my_project/api/routes.py

# ❌ 错误：驼峰、连字符、大写
# MyProject/Core/Models.py
# my-project/api/routes.py

# ✅ __init__.py 控制公开 API
# src/my_project/__init__.py
"""My Project - 项目描述."""

from my_project.core.models import User, Order
from my_project.core.exceptions import AppError

__all__ = ["User", "Order", "AppError"]
__version__ = "0.1.0"
```

### 3. 模块组织原则

```python
# ✅ 推荐：单一职责，每个模块不超过 300 行
# services/user_service.py - 用户业务逻辑
# services/order_service.py - 订单业务逻辑

# ❌ 避免：巨型模块
# services.py - 包含所有业务逻辑（1000+ 行）

# ✅ 推荐：循环导入时使用 TYPE_CHECKING
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from my_project.api.schemas import UserResponse

def get_user_response(user_id: int) -> UserResponse:
    ...
```

### 4. 虚拟环境管理

```bash
# ✅ 必须：使用虚拟环境隔离
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate     # Windows

# ✅ 推荐：使用 uv 加速
uv venv .venv
uv pip install -e ".[dev]"

# ❌ 禁止：全局安装项目依赖
pip install fastapi sqlalchemy  # 不要这样做
```

### 5. .gitignore 必备项

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
dist/
build/

# 虚拟环境
.venv/
venv/

# IDE
.idea/
.vscode/

# 测试/覆盖率
.coverage
htmlcov/
.pytest_cache/
.mypy_cache/
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 是否使用 src layout | 必须 |
| 是否使用 pyproject.toml | 必须 |
| 包名是否小写下划线 | 必须 |
| 是否有 py.typed 标记 | 必须 |
| 是否使用虚拟环境 | 必须 |
| 是否存在 setup.py | 禁止 |
| 模块是否超过 300 行 | 推荐拆分 |