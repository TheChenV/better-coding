---
description: Python依赖管理规范 - 1. pyproject.toml 依赖声明、2. 版本锁定、3. 虚拟环境隔离、4. 依赖分组策略
trigger: glob
glob: **/*.py
---


# Python 依赖管理规范

## 核心原则

- **必须**使用 `pyproject.toml` 声明所有依赖
- **必须**锁定依赖版本（lock 文件提交到版本控制）
- **必须**使用虚拟环境隔离项目依赖
- **推荐**使用 `uv` 或 `poetry` 管理依赖
- **必须**定期进行安全漏洞扫描

## 规则详情

### 1. pyproject.toml 依赖声明

```toml
[project]
name = "my-project"
version = "1.0.0"
requires-python = ">=3.11"

# ✅ 必须：指定版本范围（兼容范围）
dependencies = [
    "fastapi>=0.104.0,<1.0.0",
    "pydantic>=2.5.0,<3.0.0",
    "sqlalchemy>=2.0.0,<3.0.0",
    "httpx>=0.25.0,<1.0.0",
    "structlog>=23.2.0",
]

# ✅ 开发依赖单独分组
[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-cov>=4.1.0",
    "pytest-asyncio>=0.23.0",
    "mypy>=1.7.0",
    "ruff>=0.1.6",
    "pre-commit>=3.5.0",
]
docs = [
    "mkdocs>=1.5.0",
    "mkdocs-material>=9.4.0",
]

# ❌ 禁止：不指定版本
# dependencies = ["fastapi", "pydantic", "sqlalchemy"]

# ❌ 禁止：使用 == 精确版本（应放在 lock 文件中）
# dependencies = ["fastapi==0.104.1"]
```

### 2. 版本锁定

```bash
# ✅ 方案一：使用 uv（推荐，极速）
uv lock                    # 生成 uv.lock
uv sync                    # 安装锁定版本
uv pip compile pyproject.toml -o requirements.lock

# ✅ 方案二：使用 poetry
poetry lock                # 生成 poetry.lock
poetry install             # 安装锁定版本

# ✅ 方案三：使用 pip-tools
pip-compile pyproject.toml -o requirements.lock
pip-sync requirements.lock

# ❌ 禁止：直接 pip install 不锁定
pip install fastapi  # 每次安装版本可能不同
```

### 3. 虚拟环境隔离

```bash
# ✅ 必须：每个项目独立虚拟环境
# 使用 uv（推荐）
uv venv .venv --python 3.11
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate     # Windows

# 安装项目（editable + dev 依赖）
uv pip install -e ".[dev]"

# ✅ 使用 direnv 自动激活（.envrc）
# layout python .venv

# ❌ 禁止：使用系统 Python 安装项目依赖
sudo pip install fastapi  # 绝对禁止
```

### 4. 依赖分组策略

```toml
# ✅ 推荐：按用途分组
[project.optional-dependencies]
# 生产运行必需
runtime = [
    "uvicorn[standard]>=0.24.0",
    "gunicorn>=21.2.0",
]
# 开发工具
dev = [
    "pytest>=7.4.0",
    "ruff>=0.1.6",
    "mypy>=1.7.0",
]
# 测试专用
test = [
    "pytest>=7.4.0",
    "pytest-cov>=4.1.0",
    "factory-boy>=3.3.0",
    "responses>=0.24.0",
]
```

### 5. 安全扫描

```bash
# ✅ 必须：CI 中集成安全扫描
# 使用 pip-audit
pip-audit --requirement requirements.lock
pip-audit --format json --output audit-report.json

# 使用 safety
safety check --json --output safety-report.json

# ✅ pre-commit 集成
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pypa/pip-audit
    rev: v2.6.1
    hooks:
      - id: pip-audit
        args: ["--requirement", "requirements.lock"]
```

### 6. 依赖更新策略

```bash
# ✅ 推荐：使用 dependabot / renovate 自动更新
# .github/dependabot.yml
# version: 2
# updates:
#   - package-ecosystem: "pip"
#     directory: "/"
#     schedule:
#       interval: "weekly"

# ✅ 手动更新流程
uv lock --upgrade-package fastapi   # 升级单个包
uv lock --upgrade                    # 升级所有包
uv sync                              # 同步安装

# 更新后必须执行
pytest                               # 运行测试
mypy src/                            # 类型检查
```

### 7. 私有源配置

```toml
# ✅ 私有 PyPI 源配置（pyproject.toml 或 pip.conf）
[[tool.uv.index]]
name = "internal"
url = "https://pypi.internal.company.com/simple"

# pip.conf / pip.ini
# [global]
# index-url = https://pypi.internal.company.com/simple
# trusted-host = pypi.internal.company.com
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 依赖是否在 pyproject.toml 声明 | 必须 |
| 是否有 lock 文件 | 必须 |
| lock 文件是否提交到 VCS | 必须 |
| 是否使用虚拟环境 | 必须 |
| 是否定期安全扫描 | 必须 |
| 版本范围是否合理 | 必须 |
| 是否使用系统 pip 安装 | 禁止 |
| 是否存在未声明的隐式依赖 | 禁止 |