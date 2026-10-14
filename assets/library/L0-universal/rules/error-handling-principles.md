---
description: 错误处理原则 - 三层边界（入口校验/业务层/底层），不吞异常，具体异常类型，统一错误格式（编写错误处理/异常捕获/输入校验等边界逻辑时触发）
trigger: model_decision
---

# 错误处理原则

> 来源：Matt Pocock diagnosing-bugs + Harness 课程 — 错误处理是系统可靠性的基石。

## 三层边界模型

| 边界层 | 职责 | 处理方式 |
|--------|------|---------|
| **入口边界** | 校验所有外部输入 | 参数校验、类型检查、格式验证，失败返回明确错误信息 |
| **业务层** | 处理业务异常 | 用业务异常类型（如 `OrderNotFound`），不用通用 Exception |
| **底层** | 处理系统异常 | 捕获具体异常类型，转换为业务异常向上传播 |

## 强制规则

1. **不吞异常** — `catch (Exception e) {}` 是埋雷，不是错误处理
2. **用具体异常类型** — `catch (OrderNotFoundException e)` 而非 `catch (Exception e)`
3. **错误信息要对人友好** — 包含上下文（什么操作、什么输入、期望什么、实际什么）
4. **不在底层做 UI 错误展示** — 底层只抛异常，展示层负责格式化
5. **全局异常处理器兜底** — 未捕获的异常由全局处理器统一处理

## 各语言要点

| 语言 | 要点 |
|------|------|
| Python | 用具体异常类型，不用裸 `except:`；用 `raise ... from e` 保留链 |
| TypeScript | 用 `unknown` 而非 `any` 捕获；用 type guard 判断错误类型 |
| Java | 区分 checked/unchecked；业务异常用自定义 Exception；不在 Controller 层 catch |
| Go | 错误必须检查（`if err != nil`）；用 `errors.Is/As` 判断类型；用 `fmt.Errorf` 包装上下文 |

## 禁止

- ❌ 裸 `catch (Exception e)` 或 `except Exception`
- ❌ `catch` 后只打印日志不处理
- ❌ 错误信息暴露内部实现细节（堆栈、SQL、路径）
- ❌ 用错误码替代异常（除非语言惯例如此，如 Go）
