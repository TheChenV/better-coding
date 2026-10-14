import fs from 'node:fs';
import path from 'node:path';

// 工作流 01：创建目录结构（语料 workflows/01-create-directories/script.ps1 的 Node 对位）
// VARS / PLAN 由 numbered-workflow.mjs 在段 B 拼进本文件头部，本正文不 import 引擎。
const R = p => path.join(VARS.targetDir, p);

let count = 0;
for (const d of PLAN.dirs) {
  fs.mkdirSync(R(d), { recursive: true });
  console.log(`  ✓ ${d}`);
  count++;
}
// 运行中间产物目录（语料同样在末尾建 .scaffold）
fs.mkdirSync(R('.scaffold'), { recursive: true });

console.log('');
console.log(`目录结构创建完成，共 ${count} 个目录（另加 .scaffold 运行目录 1 个）`);
