---
name: python-fastapi-scaffold
description: FastAPI项目脚手架生成. Manual-trigger skill. Source: Harness component library.
---


# FastAPI 项目脚手架生成

## 概述

本技能定义了使用 FastAPI 创建生产级 API 项目的标准脚手架流程，包含完整的项目结构、路由定义、中间件配置和数据库集成。

## 前置条件

- Python 3.11+ 已安装
- `uv` 已安装
- 确定项目名称和包名

## 跨栈通用门禁

生成前确认模块信息四要素（模块名称 / 职责 / 所属层级 / 依赖模块）、先读 `AGENTS.md` 的分层与编码规范、
「骨架不是空壳」判据（最小可编译可启动）与骨架清单产出，均以 `.qoder/techstack-commands.json` 的
`_skeletonContract` 为唯一规范（跨栈单源，原 L0 skill create-module-skeleton 已下沉到那里）；
本文件只提供本栈的目录结构与代码形态，不重复通用门禁。

## 编号工作流（骨架生成的可执行协议）

本栈 API 骨架不由 AI 现写脚本：src 包结构、pyproject 与 requirements 正文都在 `plans/python.json` 里（与上面 Step 1 的结构同源），按库根 `assets/templates/numbered-workflows`（项目级安装 = `<项目>/.qoder/skills/better-coding/assets/templates/numbered-workflows`）的
七步编号工作流执行，本栈数据取 `plans/python.json`；占位符变量表见 `vars.mjs`，机制与偏离见该目录的 README.md。

1. **段 A 理解目标**：读 `workflows/<编号>/workflow.md` 的「目标 / 输入变量 / 产出物 / 验证方法」
2. **段 B 拼脚本**：`node assets/templates/numbered-workflows/numbered-workflow.mjs compose --stack python --vars <values.json> --workflow <编号> --project <目标项目根>`
3. **段 C 执行**：跑落盘件 `<目标项目>/.scaffold/step<编号>.mjs`（`compose` 换成 `run` 可 B+C+D 一次过）
4. **段 D 验证**：以退出码为准，0 才算过；`buildCmd` 取 `.qoder/techstack-commands.json` 本栈 `build`，不在脚本里发明命令

失败即问：任一段非 0 退出就停下来问用户「重试还是跳过」——不自行继续、不改库内文件、
不覆盖项目既有文件（工作流 02/03 遇到同名不同内容会判冲突并退出 1）。
禁止修改用户已有 .qoder/：引擎按路径段拦，命中即退出码 2。
七步顺序 01-create-directories → 02-write-configs → 03-write-skeleton-code → 04-verify-paths →
05-init-repo → 06-build-verify → 07-append-module（可按需只跑到 04，但 06 的编译验证是「骨架不是空壳」的出口）。

## 执行步骤

### Step 1: 创建项目结构

```bash
PROJECT_NAME="my-api"
PACKAGE_NAME="my_api"

mkdir -p ${PROJECT_NAME}/src/${PACKAGE_NAME}/{api/v1,core,models,schemas,services}
mkdir -p ${PROJECT_NAME}/tests/{unit,integration}
mkdir -p ${PROJECT_NAME}/alembic/versions
cd ${PROJECT_NAME}

# 创建必要的 __init__.py
touch src/${PACKAGE_NAME}/__init__.py
touch src/${PACKAGE_NAME}/api/__init__.py
touch src/${PACKAGE_NAME}/api/v1/__init__.py
touch src/${PACKAGE_NAME}/core/__init__.py
touch src/${PACKAGE_NAME}/models/__init__.py
touch src/${PACKAGE_NAME}/schemas/__init__.py
touch src/${PACKAGE_NAME}/services/__init__.py
touch tests/__init__.py
touch tests/unit/__init__.py
touch tests/integration/__init__.py
```

**目标目录结构**：

```
my-api/
├── src/my_api/
│   ├── __init__.py
│   ├── main.py              # 应用入口
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py          # 依赖注入
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── router.py    # 路由聚合
│   │       └── endpoints/
│   │           ├── health.py
│   │           └── users.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py        # 配置
│   │   └── security.py      # 安全
│   ├── models/
│   │   ├── __init__.py
│   │   └── user.py          # SQLAlchemy 模型
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── user.py          # Pydantic schemas
│   └── services/
│       ├── __init__.py
│       └── user_service.py
├── tests/
├── alembic/
├── pyproject.toml
└── Dockerfile
```

### Step 2: 配置 pyproject.toml

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "my-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.109.0",
    "uvicorn[standard]>=0.27.0",
    "pydantic>=2.5.0",
    "pydantic-settings>=2.1.0",
    "sqlalchemy>=2.0.0",
    "asyncpg>=0.29.0",
    "alembic>=1.13.0",
    "httpx>=0.26.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.23.0",
    "pytest-cov>=4.1.0",
    "ruff>=0.1.9",
    "mypy>=1.8.0",
]

[tool.hatch.build.targets.wheel]
packages = ["src/my_api"]
```

### Step 3: 定义路由

```python
# src/my_api/main.py
from fastapi import FastAPI
from my_api.api.v1.router import api_router
from my_api.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.include_router(api_router, prefix="/api/v1")

# src/my_api/api/v1/router.py
from fastapi import APIRouter
from my_api.api.v1.endpoints import health, users

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(users.router, prefix="/users", tags=["users"])

# src/my_api/api/v1/endpoints/users.py
from fastapi import APIRouter, Depends, HTTPException, status
from my_api.schemas.user import UserCreate, UserResponse
from my_api.services.user_service import UserService
from my_api.api.deps import get_user_service

router = APIRouter()

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    service: UserService = Depends(get_user_service),
) -> UserResponse:
    """创建新用户。"""
    user = await service.create(payload)
    return UserResponse.model_validate(user)

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    service: UserService = Depends(get_user_service),
) -> UserResponse:
    """获取用户详情。"""
    user = await service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return UserResponse.model_validate(user)
```

### Step 4: 添加中间件

```python
# src/my_api/main.py（补充中间件配置）
import time
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 请求耗时日志
class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start
        response.headers["X-Process-Time"] = f"{duration:.4f}"
        return response

app.add_middleware(TimingMiddleware)
```

### Step 5: 配置数据库

```python
# src/my_api/core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "My API"
    version: str = "0.1.0"
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/mydb"
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {"env_file": ".env"}

settings = Settings()

# src/my_api/core/database.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from my_api.core.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
```

### Step 6: 生成 OpenAPI 文档

```bash
# 启动开发服务器
uvicorn my_api.main:app --reload --port 8000

# 访问文档
# Swagger UI: http://localhost:8000/docs
# ReDoc: http://localhost:8000/redoc
# OpenAPI JSON: http://localhost:8000/openapi.json

# 导出 OpenAPI spec
python -c "
import json
from my_api.main import app
spec = app.openapi()
with open('openapi.json', 'w') as f:
    json.dump(spec, f, indent=2)
print('OpenAPI spec exported')
"
```

## 验证清单

| 检查项 | 命令 |
|--------|------|
| 应用启动 | `uvicorn my_api.main:app` |
| 健康检查 | `curl localhost:8000/api/v1/health` |
| API 文档 | 浏览器打开 `/docs` |
| 类型检查 | `mypy src/ --strict` |
| Lint | `ruff check src/` |
| 测试 | `pytest tests/ -v` |