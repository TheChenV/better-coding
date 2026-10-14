---
description: Python测试规范 - 1. 测试文件组织、2. Fixture 使用、3. 参数化测试、4. Mock 规范
trigger: glob
glob: **/*.py
---


# Python 测试规范

## 核心原则

- **必须**使用 `pytest` 作为测试框架（禁止 unittest）
- **必须**使用 fixture 管理测试资源和状态
- **推荐**使用参数化（`@pytest.mark.parametrize`）覆盖边界情况
- **必须**mock 外部依赖（网络、数据库、文件系统）
- **必须**测试覆盖率 ≥ 80%，核心模块 ≥ 90%

## 规则详情

### 1. 测试文件组织

```
tests/
├── conftest.py          # 共享 fixture
├── unit/
│   ├── __init__.py
│   ├── test_models.py
│   └── test_services.py
├── integration/
│   ├── __init__.py
│   └── test_api.py
└── fixtures/
    └── sample_data.json
```

```python
# ✅ 测试命名规范
# 文件：test_<module>.py
# 函数：test_<行为>_<条件>_<预期结果>

def test_create_user_with_valid_data_returns_user():
    ...

def test_create_user_with_duplicate_email_raises_validation_error():
    ...

def test_get_user_with_nonexistent_id_returns_none():
    ...
```

### 2. Fixture 使用

```python
# conftest.py
import pytest
from my_project.core.models import User
from my_project.services.user_service import UserService

@pytest.fixture
def sample_user() -> User:
    """创建测试用户。"""
    return User(id=1, name="测试用户", email="test@example.com")

@pytest.fixture
def user_service(tmp_path) -> UserService:
    """创建带临时数据库的服务实例。"""
    db_path = tmp_path / "test.db"
    service = UserService(db_url=f"sqlite:///{db_path}")
    yield service
    service.cleanup()

@pytest.fixture(scope="session")
def api_client():
    """会话级 HTTP 客户端。"""
    from httpx import AsyncClient
    from my_project.api.app import app
    with TestClient(app) as client:
        yield client

# 测试中使用
def test_user_creation(user_service: UserService, sample_user: User):
    result = user_service.create(sample_user)
    assert result.id is not None
    assert result.name == "测试用户"
```

### 3. 参数化测试

```python
import pytest

# ✅ 必须：使用参数化覆盖多种输入
@pytest.mark.parametrize(
    ("email", "expected_valid"),
    [
        ("user@example.com", True),
        ("user.name+tag@example.co.uk", True),
        ("invalid-email", False),
        ("@missing-local.com", False),
        ("missing-domain@", False),
        ("", False),
    ],
    ids=["valid-basic", "valid-complex", "invalid-no-at", "invalid-no-local", "invalid-no-domain", "invalid-empty"],
)
def test_email_validation(email: str, expected_valid: bool):
    result = validate_email(email)
    assert result.is_valid == expected_valid

# ✅ 参数化异常场景
@pytest.mark.parametrize(
    ("input_data", "expected_error"),
    [
        ({}, ValidationError),
        ({"name": ""}, ValidationError),
        ({"name": "x" * 300}, ValidationError),
        (None, TypeError),
    ],
)
def test_user_validation_errors(input_data, expected_error):
    with pytest.raises(expected_error):
        User(**input_data)
```

### 4. Mock 规范

```python
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

# ✅ 正确：mock 外部依赖
@pytest.mark.asyncio
async def test_send_notification_calls_email_service():
    mock_email = AsyncMock()
    mock_email.send.return_value = {"status": "sent"}

    service = NotificationService(email_client=mock_email)
    await service.notify_user(user_id=1, message="欢迎")

    mock_email.send.assert_called_once_with(
        to="user@example.com",
        subject="欢迎",
        body="欢迎",
    )

# ✅ 使用 monkeypatch（pytest 内置）
def test_config_reads_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@localhost/testdb")
    config = load_config()
    assert config.database_url == "postgresql://test:test@localhost/testdb"

# ❌ 错误：mock 被测对象本身
def test_bad_mock():
    with patch("my_project.services.user_service.UserService.create") as mock_create:
        # 这测试的是 mock，不是真实逻辑！
        mock_create.return_value = User(id=1)
        result = user_service.create(data)
        assert result.id == 1
```

### 5. 异步测试

```python
import pytest

# ✅ 异步测试使用 pytest-asyncio
@pytest.mark.asyncio
async def test_fetch_user_returns_data():
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/users/1")
    assert response.status_code == 200
    assert response.json()["name"] == "测试用户"

# ✅ 异步 fixture
@pytest.fixture
async def async_db():
    db = await create_test_database()
    yield db
    await db.close()
```

### 6. 覆盖率配置

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = [
    "-v",
    "--strict-markers",
    "--cov=src/my_project",
    "--cov-report=term-missing",
    "--cov-report=html",
    "--cov-fail-under=80",
]
markers = [
    "slow: 标记慢速测试",
    "integration: 集成测试",
]

[tool.coverage.run]
source = ["src/my_project"]
omit = ["*/tests/*", "*/__init__.py"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.",
]
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 是否使用 pytest | 必须 |
| 测试命名是否清晰 | 必须 |
| 是否使用 fixture 管理资源 | 必须 |
| 外部依赖是否 mock | 必须 |
| 覆盖率是否 ≥ 80% | 必须 |
| 是否使用参数化 | 推荐 |
| 是否测试异常路径 | 必须 |
| 是否存在测试间依赖 | 禁止 |