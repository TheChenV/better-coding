import fs from 'node:fs';
import path from 'node:path';

// 工作流 04：路径与声明核对（语料 05-package-rename 的职责——它只做验证，不重命名）
// 语料 D3 偏离：原版打印 ✗ 之后仍退 0，段 D 的"失败则问"因此永不触发；这里校验不过就 exit 1。
const R = p => path.join(VARS.targetDir, p);
const SKIP = new Set(['.scaffold', 'node_modules', '.git', 'dist', 'build', 'target', '.qoder']);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

let okCount = 0;
const missing = [];
for (const p of PLAN.verifyPaths) {
  if (fs.existsSync(R(p))) { okCount++; console.log(`  ✓ ${p}`); }
  else { missing.push(p); console.log(`  ✗ ${p}`); }
}

const total = fs.existsSync(VARS.targetDir) ? walk(VARS.targetDir).length : 0;
console.log('');
console.log(`生成文件总数：${total}`);
console.log(`必产文件：${okCount} / ${PLAN.verifyPaths.length} 验证通过`);

const declFail = [];
for (const c of PLAN.declChecks || []) {
  const abs = R(c.path);
  if (!fs.existsSync(abs)) continue;
  if (!fs.readFileSync(abs, 'utf8').includes(c.mustContain))
    declFail.push(`${c.path} 未出现 ${c.mustContain}`);
}
if (declFail.length) declFail.forEach(x => console.log(`  ✗ ${x}`));

if (missing.length || declFail.length) {
  console.error('警告：部分文件缺失或声明不符，请检查上面的 ✗ 标记（修源后重跑本工作流即可，不必手改落盘件）');
  process.exit(1);
}
console.log('路径与声明核对通过');
