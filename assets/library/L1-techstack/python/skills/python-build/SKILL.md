---
name: python-build
description: Python构建打包流程. Manual-trigger skill. Source: Harness component library.
---


# Python 构建打包流程

## 概述

本技能定义了 Python 项目从源码到可分发制品的完整构建流程，确保每次构建产出一致、可追溯。

## 前置条件

- Python 3.11+ 已安装
- `uv` 或 `pip` 可用
- 项目使用 `pyproject.toml` + `src` layout

## 执行步骤

### Step 1: 环境检查

```bash
# 验证 Python 版本
python --version  # 必须 >= 3.11

# 验证构建工具
uv --version || pip --version

# 验证项目结构
test -f pyproject.toml || echo "ERROR: pyproject.toml not found"
test -d src || echo "ERROR: src/ directory not found"

# 检查虚拟环境
echo $VIRTUAL_ENV  # 必须非空
```

**失败处理**：如果环境检查失败，停止构建并报告缺失项。

### Step 2: 依赖安装

```bash
# 创建/激活虚拟环境
uv venv .venv --python 3.11
source .venv/bin/activate

# 安装项目及开发依赖（使用 lock 文件）
uv sync --frozen  # 使用锁定版本，确保一致性

# 验证安装
python -c "import my_project; print(my_project.__version__)"
```

**失败处理**：依赖冲突时运行 `uv lock` 重新解析。

### Step 3: 代码质量检查（Lint）

```bash
# Ruff 格式检查
ruff format --check src/ tests/

# Ruff lint 检查
ruff check src/ tests/ --output-format=github

# 自动修复（仅安全修复）
ruff check src/ tests/ --fix --unsafe-fixes=false
```

**失败处理**：lint 错误必须全部修复后才能继续。

### Step 4: 类型检查

```bash
# mypy 严格模式
mypy src/ --strict

# 如果有错误，显示详细信息
mypy src/ --strict --show-error-codes --pretty
```

**失败处理**：类型错误必须全部修复。临时绕过需添加 `# type: ignore[code]` 并附注释。

### Step 5: 构建制品

```bash
# 使用 build 包构建 wheel 和 sdist
python -m build

# 或使用 hatch
hatch build

# 验证产出
ls dist/
# 预期：my_project-1.0.0-py3-none-any.whl
# 预期：my_project-1.0.0.tar.gz
```

### Step 6: 制品验证

```bash
# 使用 twine 检查包元数据
twine check dist/*

# 在干净环境中安装验证
uv venv /tmp/test-install
source /tmp/test-install/bin/activate
uv pip install dist/my_project-1.0.0-py3-none-any.whl

# 验证导入和基本功能
python -c "
import my_project
print(f'Version: {my_project.__version__}')
from my_project.core.models import User
print('Import OK')
"

# 验证入口点（如有）
my-project --version
```

## 完整 CI 脚本

```yaml
# .github/workflows/build.yml
name: Build
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync --frozen
      - run: ruff format --check src/ tests/
      - run: ruff check src/ tests/
      - run: mypy src/ --strict
      - run: python -m build
      - run: twine check dist/*
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
```

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| 依赖解析冲突 | `uv lock --upgrade` 重新解析 |
| mypy 第三方库无类型 | 添加 `[[tool.mypy.overrides]]` ignore |
| wheel 包含多余文件 | 检查 `[tool.hatch.build]` 配置 |
| 构建版本不正确 | 检查 `pyproject.toml` version 字段 |