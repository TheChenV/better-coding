#!/usr/bin/env node
/* assets/templates/numbered-workflows/vars.mjs — 编号工作流的公共变量表（唯一变量事实源）
 *
 * 端口来源：AINative 研发实战 `.qoder案例2/agents/scaffold-agent/vars.ps1`（14 个 `__TOKEN__` 占位）。
 * 语料用法：Agent 读这张表 → 把 `__TOKEN__` 换成用户输入 → 写进 `$targetDir\.scaffold\vars.ps1`
 *           → 各 workflow 脚本与已解析的 vars 拼接后执行。本文件把同一件事搬到 Node。
 *
 * 端口偏离（逐条对位，与 checks/34 的断言同源）：
 *   D1 载体 PowerShell → Node：本库脚本层 v9.0.0 起只有 `.mjs` 一种载体（§3.3 消灭孪生），
 *      解析后的 vars 也不再是"可执行脚本"而是 `export const VARS` 常量对象。
 *   D2 删 `__GROUP__`/`__ARTIFACT__`/`__PACKAGE_PATH__`：Java/Maven 专属，落到 `plans/java.json`
 *      的目录与文件正文里；公共表只留"任何栈都要问用户的那几项"。
 *   D3 删 `__DB_NAME__`/`__DB_USERNAME__`/`__DB_PASSWORD__`：语料自带免责声明"测试演示用明文凭证"，
 *      把明文凭据模板化进通用库是负资产；工作流 05 因此也不再做建库动作。
 *   D4 删 `__WEB_PORT__`：前端端口属 react/prototype 计划，不属跨栈公共表。
 *   D5 未移植语料 `02-backend-configs/script.ps1` 里出现的"双下划线 DISPLAY 双下划线"那个 token：
 *      vars.ps1 表里根本没有它（表里是 DISPLAY_NAME 那条），而语料协议只要求替换 vars.ps1 的 token ——
 *      那是一个必然残留的幽灵 token（本行不写成真字形，否则会被工作流 02 的残留检查判死）。
 *      本表由 `numbered-workflow.mjs` 的残留检查兜住：产物里还剩双下划线大写名就 exit 2 并点名，不再靠人眼。
 *   D6 新增 `__STACK__` 与 `__BUILD_CMD__`：前者选栈计划，后者取
 *      `.qoder/techstack-commands.json` 对应栈的 build（期望值单源，不在本表写死命令）。
 */

/** PascalCase → snake_case（语料 `$projectName -replace '([a-z])([A-Z])','$1_$2' | ToLower` 的 Node 对位） */
export const snakeCase = name => String(name).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/**
 * 变量表：键名 = 解析后对象里的字段名，`token` = 模板里的占位写法。
 * `derive` 只允许**从已有输入推导**（语料的 artifactId/packagePath/dbName 全是这一类），不猜测用户意图。
 */
export const VAR_TABLE = {
  targetDir: {
    token: '__TARGET_DIR__', required: true,
    desc: '目标工程根（绝对路径）。禁止修改用户已有 .qoder/——引擎按路径段拦，命中即退出码 2。',
  },
  projectName: {
    token: '__PROJECT_NAME__', required: true,
    desc: '工程名，类名/包名风格（不要中划线），如 Crm。',
  },
  displayName: {
    token: '__DISPLAY_NAME__', required: false, derive: v => v.projectName,
    desc: '页面与标题里显示的名字，如 CRM。缺省 = projectName。',
  },
  stack: {
    token: '__STACK__', required: true,
    desc: '栈名 = plans/<stack>.json 的文件名（typescript/java/python/go/react/prototype）。',
  },
  modulePath: {
    token: '__MODULE_PATH__', required: false, derive: v => snakeCase(v.projectName),
    desc: '模块/包标识。缺省由 projectName 推导（TestCrm → test_crm）。',
  },
  port: {
    token: '__PORT__', required: false, constant: '8080',
    desc: '服务端口，缺省 8080。',
  },
  buildCmd: {
    token: '__BUILD_CMD__', required: true,
    desc: '本栈编译验证命令，取自 .qoder/techstack-commands.json 对应栈的 build（单源，不在此写死）。',
  },
  year: {
    token: '__YEAR__', required: false, derive: () => String(new Date().getFullYear()),
    desc: '版权年份，如 2026。',
  },
  date: {
    token: '__DATE__', required: false, derive: () => new Date().toISOString().slice(0, 10),
    desc: '当天日期，如 2026-09-09。',
  },
};

/** 模板正文：语料 vars.ps1 的 Node 对位件——注释即"每个 token 是什么"，与表同源不另写一份。 */
export const VARS_TEMPLATE = [
  '// 编号工作流 - 公共变量（解析后）',
  '// 由 numbered-workflow.mjs 从 vars.mjs 的模板 + 用户输入拼出，请勿手改。',
  '// 双下划线包裹的大写名即占位符；解析后必须一个不剩（残留即 exit 2）。',
  "export const VARS = Object.freeze({",
  "  targetDir: '__TARGET_DIR__',",
  "  projectName: '__PROJECT_NAME__',",
  "  displayName: '__DISPLAY_NAME__',",
  "  stack: '__STACK__',",
  "  modulePath: '__MODULE_PATH__',",
  "  port: '__PORT__',",
  "  buildCmd: '__BUILD_CMD__',",
  "  year: '__YEAR__',",
  "  date: '__DATE__',",
  '});',
  '',
].join('\n');

/** 占位符的字形：双下划线 + 全大写名（至少两个字符，避免吃掉行内的普通双下划线）。 */
export const TOKEN_RE = /__[A-Z][A-Z0-9_]*__/g;
