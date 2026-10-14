---
name: python-test
description: Python测试执行流程. Manual-trigger skill. Source: Harness component library.
---


# Python 测试执行流程

## 概述

本技能定义了 Python 项目完整的测试执行流程，包括单元测试、集成测试、覆盖率分析和失败诊断。

## 前置条件

- 项目已安装 dev 依赖（`uv sync` 或 `pip install -e ".[dev]"`）
- 测试配置在 `pyproject.toml` 中
- 测试目录结构遵循 `tests/unit/` + `tests/integration/`

## 执行步骤

### Step 1: 环境准备

```bash
# 确认虚拟环境激活
source .venv/bin/activate

# 确认 pytest 可用
pytest --version

# 确认测试依赖完整
python -c "import pytest, pytest_cov, pytest_asyncio; print('OK')"

# 设置测试环境变量
export APP_ENV=test
export DATABASE_URL=sqlite:///test.db
```

### Step 2: 单元测试

```bash
# 运行单元测试（快速反馈）
pytest tests/unit/ -v --tb=short -x

# 参数说明：
# -v        详细输出
# --tb=short 简短回溯
# -x        首次失败即停止

# 运行特定模块
pytest tests/unit/test_models.py -v

# 运行匹配关键字的测试
pytest tests/unit/ -k "user and create" -v

# 并行执行（加速）
pytest tests/unit/ -n auto  # 需要 pytest-xdist
```

**失败处理**：单元测试失败必须立即修复，不得跳过。

### Step 3: 集成测试

```bash
# 运行集成测试（可能需要外部服务）
pytest tests/integration/ -v --tb=long

# 使用 Docker 启动依赖服务
docker compose -f docker-compose.test.yml up -d
pytest tests/integration/ -v
docker compose -f docker-compose.test.yml down

# 标记跳过慢速测试
pytest tests/ -m "not slow" -v
```

### Step 4: 覆盖率报告

```bash
# 生成覆盖率报告
pytest tests/ --cov=src/my_project --cov-report=term-missing --cov-report=html

# 检查覆盖率阈值（低于 80% 失败）
pytest tests/ --cov=src/my_project --cov-fail-under=80

# 查看 HTML 报告
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux

# 生成 XML 报告（CI 用）
pytest tests/ --cov=src/my_project --cov-report=xml:coverage.xml
```

### Step 5: 失败分析

```bash
# 重新运行上次失败的测试
pytest --lf -v

# 仅运行上次失败的测试（快速迭代）
pytest --ff -v

# 进入调试器（首次失败时）
pytest tests/unit/test_service.py --pdb

# 显示打印输出
pytest tests/ -s -v

# 生成 JUnit XML 报告
pytest tests/ --junitxml=reports/junit.xml
```

**失败诊断清单**：
1. 查看错误消息和堆栈跟踪
2. 确认是否为环境问题（缺少服务/配置）
3. 单独运行失败测试排除干扰
4. 检查 fixture 是否正确设置/清理
5. 确认 mock 是否匹配实际接口

## 完整 CI 脚本

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.11", "3.12"]
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync --frozen
      - name: Unit Tests
        run: pytest tests/unit/ -v --cov=src/my_project --cov-report=xml
      - name: Integration Tests
        run: pytest tests/integration/ -v
      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          file: coverage.xml
```

## 测试质量指标

| 指标 | 目标 | 命令 |
|------|------|------|
| 行覆盖率 | ≥ 80% | `--cov-fail-under=80` |
| 分支覆盖率 | ≥ 75% | `--cov-branch` |
| 测试通过率 | 100% | 全部通过 |
| 单测执行时间 | < 30s | `--durations=10` |
| 无跳过测试 | 0 skip | 检查 skip 原因 |