import fs from 'node:fs';
import path from 'node:path';

// 工作流 03：写最小实现代码（语料 03-java-infrastructure + 04-frontend-infrastructure 的合并职责）
// 判据来自 techstack-commands.json#_skeletonContract 第 ③ 条：骨架不是空壳，必须最小可编译可启动。
const R = p => path.join(VARS.targetDir, p);
const norm = s => (s.endsWith('\n') ? s : s + '\n');

let written = 0;
const conflicts = [];
const empty = [];
for (const f of PLAN.codeFiles) {
  if (!String(f.body).trim()) { empty.push(f.path); continue; }
  const abs = R(f.path);
  const want = norm(f.body);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (fs.existsSync(abs)) {
    const cur = fs.readFileSync(abs, 'utf8');
    if (cur === want) { console.log(`  = ${f.path}（与本次生成同代，跳过重写）`); continue; }
    conflicts.push(f.path);
    console.log(`  ! ${f.path} 已存在且内容与本次计划不同 → 不覆盖`);
    continue;
  }
  fs.writeFileSync(abs, want, 'utf8');
  console.log(`  ✓ ${f.path}`);
  written++;
}

console.log('');
console.log(`最小实现写入完成：新建 ${written} 个，冲突 ${conflicts.length} 个`);
if (empty.length) {
  console.error(`警告：计划里有空正文条目（就是空壳）：${empty.join('、')} → 补内容后重试`);
  process.exit(1);
}
if (conflicts.length) {
  console.error('警告：存在文件冲突，请人工确认后再重试');
  process.exit(1);
}
