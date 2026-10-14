#!/usr/bin/env node
/* assets/templates/numbered-workflows/numbered-workflow.mjs — 编号工作流引擎（语料协议的可执行对位件）
 *
 * 端口来源：AINative 研发实战 `.qoder案例2/agents/scaffold-agent.md` 的「工作流编排 + 执行规范
 * Step 四段（A 至 D）+ 约束」与 `workflows/NN-name/{workflow.md,script.ps1}`。
 *
 * 语料那套东西解决的问题是"骨架类任务靠 AI 现写脚本 → 每次都不一样"。本引擎把它变成
 * **可重放的三段拼接**：库内工作流正文（只在占位符处替换，其余逐字节照搬）+ 解析后的 vars
 * + 解析后的栈计划 = 落盘件 `<项目>/.scaffold/step<id>.mjs`。
 *
 * 端口偏离（与 vars.mjs 的 D 表、README.md 的"端口偏离"一节同批）：
 *   D1 拼接对象从"vars.ps1 正文 + script.ps1 正文"变成"VARS/PLAN 常量 + script.mjs 正文"；
 *      语料 protocol 让 Agent 把 vars 内容与脚本**拼接**，而 vars.ps1 自己的注释却说脚本用
 *      `. "$targetDir\.scaffold\vars.ps1"` 引入——实测 7 个 script.ps1 里 dot-source 出现 0 次，
 *      两份说法只有一份是真。这里只留一种：拼接，且拼接结果落盘可见。
 *   D2 token 替换范围从"只替换 vars.ps1"扩到"vars 模板 + 计划正文一起替换"。语料 02 的脚本正文里
 *      有 46 行 `__TOKEN__`（含表里根本没有的 `__DISPLAY__`），按语料协议永远不会被替换——
 *      残留检查（本文件 substitute）就是把这类静默缺陷变成 exit 2。
 *   D3 校验器从"只打印警告"改成"退出码 1"：语料 05-package-rename 打印 ✗ 之后仍退 0，
 *      于是段 D 的"失败则问重试或跳过"永远不会被触发。
 *   D4 新增同代头 `@generated-from … sha256=`：语料只要求"写入 step{id}.ps1"，没要求能证明
 *      它是哪一版库拼出来的；没有这行，已落盘件与库内源分叉不可检测。
 *   D5 新增写侧守卫 assertWritable：语料的"禁止修改用户已有的 .qoder/"只写在 agent 正文里，
 *      本文件把它变成退出码。
 *
 * 退出码：0 = 通过；1 = 工作流自身校验不过（段 D 失败 → 问用户重试还是跳过）；
 *        2 = 用法/解析/守卫类故障（参数错、token 残留、要写的路径越界）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { VAR_TABLE, VARS_TEMPLATE, TOKEN_RE } from './vars.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB_ROOT = path.resolve(HERE, '..', '..', '..');
const WF_ROOT = path.join(HERE, 'workflows');
const PLAN_ROOT = path.join(HERE, 'plans');
const VARS_SRC = path.join(HERE, 'vars.mjs');
const BAN = '禁止修改用户已有 .qoder/';
const EXIT_OK = 0, EXIT_WORKFLOW = 1, EXIT_USAGE = 2;

const sha12 = buf => createHash('sha256').update(buf).digest('hex').slice(0, 12);
const posix = p => p.split(path.sep).join('/');
const relLib = p => posix(path.relative(LIB_ROOT, p));
function die(msg, code = EXIT_USAGE) { console.error(`✗ ${msg}`); process.exit(code); }
const libVersion = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(LIB_ROOT, 'manifest.json'), 'utf8')).version || '0'; }
  catch { return 'unknown'; }
})();

/** 写侧守卫（D5）：越界即死，不给"先写了再说"的机会。 */
function assertWritable(absRaw, label) {
  const abs = path.resolve(absRaw);
  const p = posix(abs);
  /* 🔴 P2-6：Windows 文件系统大小写不敏感，`.Qoder/`、`d:/…` 这类变体过去能原样穿过字面比较。
   * 只在 win32 上把**比较口径**降为小写；POSIX 上大小写是合法区分，跟着降会把 `.Qoder`
   * 这个真不同的目录误拦。展示用的串仍是原样 `p`，只有判定用 `pCmp`/`segCmp`。 */
  const ci = process.platform === 'win32';
  const pCmp = ci ? p.toLowerCase() : p;
  const segCmp = pCmp.split('/');
  const libCmp = posix(LIB_ROOT);
  const libNorm = ci ? libCmp.toLowerCase() : libCmp;
  if (segCmp.includes('.qoder')) die(`${BAN}（本次要写 ${label} = ${p}）`);
  /* 唯一且刻意的例外：开发侧自测要把靶目录放进库内。只认 tools/out/ 这一层——它被 .gitignore
   * 忽略、被 lib.mjs 的 all() 跳过、不随库分发；tools/ 其余目录（脚本、夹具本体）仍然拒写。 */
  const scratch = posix(path.join(LIB_ROOT, 'tools', 'out')) + '/';
  const scratchCmp = ci ? scratch.toLowerCase() : scratch;
  if (pCmp.startsWith(scratchCmp)) return abs;
  if (pCmp === libNorm || pCmp.startsWith(libNorm + '/'))
    die(`禁止把运行产物写进本库自身目录（${label} = ${p}）→ 库不是靶工程，请用 --project 指定目标项目根`);
  return abs;
}

function parseArgs(argv) {
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : '';
  const flags = {};
  for (let i = cmd ? 1 : 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) die(`游离参数 ${a}（除首个子命令外一律要写成 --键 值）`);
    const key = a.slice(2);
    if (key === 'help') { usage(); process.exit(EXIT_OK); }
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) die(`--${key} 缺值`);
    flags[key] = val; i++;
  }
  return { cmd, flags };
}

function usage() {
  console.log([
    '用法：node numbered-workflow.mjs <子命令> [参数]',
    '',
    '  list                                              列出全部编号工作流（段 A 的入口）',
    '  compose --stack <栈> --vars <values.json> --workflow <NN-name> --project <目标项目根>',
    '                                                    段 B：解析 vars + 计划，拼出 .scaffold/step<id>.mjs',
    '  run     （同 compose 的参数）                      段 B + 段 C（执行落盘件）+ 段 D（按退出码判定）',
    '  verify-gen --workflow <NN-name> --project <目标项目根>',
    '                                                    查落盘件的同代头是否还对得上库内源（1 = 旧构建或被手改）',
    '',
    '  --vars-template <file>   用外部 vars 模板替换内置模板（夹具拿它构造"未知 token"负例）',
    '',
    '退出码：0 通过 / 1 工作流校验不过（问用户重试还是跳过）/ 2 用法、token 残留或写侧越界',
    `${BAN}；运行产物只落 <项目>/.scaffold/，随库分发的引擎与本文件都不落盘到项目。`,
  ].join('\n'));
}

const readText = f => fs.readFileSync(f, 'utf8');

/** 用户输入 → 完整变量对象：未知变量名、缺必填都在这里死掉。 */
function resolveValues(valuesFile, projectFlag, stackFlag) {
  let raw;
  const absVars = path.resolve(valuesFile);
  try { raw = JSON.parse(readText(absVars)); }
  catch (e) { die(`--vars ${absVars} 读不到或不是合法 JSON：${e.message}`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) die(`--vars ${absVars} 必须是键值对象`);
  const values = { ...raw };
  const unknown = Object.keys(values).filter(k => !(k in VAR_TABLE));
  if (unknown.length)
    die(`未知变量名 ${unknown.join('、')}：不在变量表 vars.mjs 里。不在表里的键不会被替换，只会把错值带进产物（拼错一个字母的变量名不该静默通过）`);
  if (projectFlag) {
    const abs = assertWritable(projectFlag, '--project');
    if (values.targetDir && path.resolve(String(values.targetDir)) !== abs)
      die(`targetDir 两处不一致：--project=${posix(abs)} 而 ${absVars} 里写的是 ${values.targetDir}`);
    values.targetDir = posix(abs);
  }
  if (stackFlag) {
    if (values.stack && values.stack !== stackFlag) die(`stack 两处不一致：--stack=${stackFlag} 而 ${absVars} 里写的是 ${values.stack}`);
    values.stack = stackFlag;
  }
  for (const [name, spec] of Object.entries(VAR_TABLE)) {
    if (values[name] === undefined) {
      const d = spec.derive ? spec.derive(values) : spec.constant;
      if (d === undefined) {
        if (spec.required) die(`缺必填变量 ${name}（占位符 ${spec.token}）：${spec.desc}`);
        values[name] = '';
      } else values[name] = d;
    }
    if (typeof values[name] !== 'string') values[name] = String(values[name]);
    if (name === 'targetDir') {
      /* 🔴 必须把归一后的绝对路径**写回** values，不能只 resolve 后拿去断言：段 C 是以
       * `cwd = 项目根` 执行落盘件的，而落盘件里 `R = p => path.join(VARS.targetDir, p)`。
       * 相对值留着，二次解析就变成 `<项目根>/relproj/src`（P1-1 的双层嵌套是这么来的）。 */
      values[name] = posix(assertWritable(path.resolve(values[name] || '.'), 'targetDir'));
    }
  }
  return values;
}

/**
 * token 替换（语料"将 __TOKEN__ 替换为用户输入"的机械版）。
 * 两条响亮失败：表里没有的 token 不替换；替换后仍有残留即 exit 2 点名。
 *
 * 🔴 `carrier` 决定转义口径，不能一把梭：vars 模板是 **JS 单引号字符串**（`'__X__'`），
 * 撇号要转义、反斜杠要翻倍；栈计划是 **JSON**，里面 `'` 本来就是合法字符，反倒是
 * `"` 必须转义、而 JS 口径写出的 `\'` 在 JSON 里是非法 escape —— 后果是含撇号的
 * projectName（如 `Bob's`）在 loadPlan 炸成"栈计划解析失败"，指向完全错误的地方。
 */
function substitute(text, values, origin, carrier = 'js') {
  const byToken = new Map(Object.entries(VAR_TABLE).map(([name, spec]) => [spec.token, name]));
  const unknown = new Set();
  const esc = carrier === 'json'
    ? s => JSON.stringify(String(s)).slice(1, -1)
    : s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const out = text.replace(TOKEN_RE, token => {
    const name = byToken.get(token);
    if (name === undefined) { unknown.add(token); return token; }
    return esc(values[name]);
  });
  const residual = [...new Set(out.match(TOKEN_RE) || [])];
  if (residual.length)
    die(`${origin} 解析后仍残留占位符 ${residual.join('、')}`
      + `${unknown.size ? `（表里没有的 token：${[...unknown].join('、')}）` : ''}`
      + ' —— 双下划线大写名要么是拼错、要么是变量表没登记，两种都不许带着它交付');
  return out;
}

function loadPlan(stack, values) {
  /* 🔴 stack 现在可能来自 values.json（P2-7 之后不再只走旗标），而这里是
   * `path.join(PLAN_ROOT, stack + '.json')`——不校验就等于让用户文件里的
   * `"stack": "../../whatever"` 决定读哪个计划。栈名形态在这里单点收口，
   * 旗标与文件值两条来源共用同一道闸。 */
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(stack || '')))
    die(`栈名形态非法：${JSON.stringify(stack)}（只许小写字母/数字/中划线，且必须等于 plans/<stack>.json 的文件名——不接受路径分隔符与 ..，因为栈名现在也可以来自 values.json）`);
  const file = path.join(PLAN_ROOT, `${stack}.json`);
  if (!fs.existsSync(file)) die(`栈计划缺失：${relLib(file)}（可用计划：${fs.existsSync(PLAN_ROOT) ? fs.readdirSync(PLAN_ROOT).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).join('、') : 'plans/ 目录本身不在'}）`);
  let plan;
  try { plan = JSON.parse(substitute(readText(file), values, relLib(file), 'json')); }
  catch (e) { die(`栈计划 ${relLib(file)} 解析失败：${e.message}`); }
  for (const k of ['dirs', 'configs', 'codeFiles', 'verifyPaths', 'nextSteps'])
    if (!Array.isArray(plan[k]) || !plan[k].length) die(`栈计划 ${relLib(file)} 的 ${k} 缺失或为空（宁缺勿空：空数组等于交付空壳）`);
  return { plan, file };
}

function resolveWorkflowDir(wfFlag) {
  if (!wfFlag) die('缺 --workflow <NN-name>（先跑 `list` 看有哪些）');
  const all = fs.existsSync(WF_ROOT) ? fs.readdirSync(WF_ROOT).filter(d => /^\d{2}-/.test(d) && fs.existsSync(path.join(WF_ROOT, d, 'script.mjs'))).sort() : [];
  const hit = all.find(d => d === wfFlag) || all.filter(d => d.slice(0, 2) === wfFlag || d.replace(/^\d+-/, '') === wfFlag);
  if (typeof hit === 'string') return hit;
  /* v9.12.0：唯一模糊命中此前没有出口 —— find 未命中时 hit 是数组，数组只有 >1 一个分支，
     长度恰为 1 会一路掉进"不存在"，而那句报错还会把命中的目录本身列进"可用"清单里。
     文档教的正是 `--workflow <编号>`（6 份 SKILL.md + README:37），所以 7 个工作流全都起不来。 */
  if (Array.isArray(hit) && hit.length === 1) return hit[0];
  if (Array.isArray(hit) && hit.length > 1) die(`--workflow ${wfFlag} 命中多个：${hit.join('、')}，请写全名`);
  die(`--workflow ${wfFlag} 在 ${posix(relLib(WF_ROOT))}/ 下不存在（可用：${all.join('、') || '无'}）`);
}

function compose(flags) {
  const valuesFile = flags.vars || die('缺 --vars <values.json>');
  const wf = resolveWorkflowDir(flags.workflow);
  /* 🔴 P2-7：`--stack` 过去是硬门槛，可 values.json 里本来就写了 stack——只填文件不传旗标的人
   * 会撞上"缺 --stack"，被推向一个**自己已经满足**的要求（实测复现过）。
   * 现在两处都接受：旗标优先，缺则取文件值；两处都写了由 resolveValues 的一致性检查把关
   * （不一致即 die），两处都没有则由 VAR_TABLE 的 required 报"缺必填变量 stack"，文案直指占位符。 */
  const values = resolveValues(valuesFile, flags.project, flags.stack);
  const stack = flags.stack || values.stack;
  const { plan, file: planFile } = loadPlan(stack, values);

  const scriptSrc = path.join(WF_ROOT, wf, 'script.mjs');
  const metaSrc = path.join(WF_ROOT, wf, 'workflow.md');
  const scriptBuf = fs.readFileSync(scriptSrc);
  const varsTemplateFile = flags['vars-template'] ? path.resolve(flags['vars-template']) : null;
  const varsTemplate = varsTemplateFile ? readText(varsTemplateFile) : VARS_TEMPLATE;
  const varsText = substitute(varsTemplate, values,
    varsTemplateFile ? `外部 vars 模板 ${varsTemplateFile}` : 'vars.mjs 内置模板');

  const project = path.resolve(values.targetDir);
  const scaffoldDir = path.join(project, '.scaffold');
  assertWritable(scaffoldDir, '.scaffold 目录');
  fs.mkdirSync(scaffoldDir, { recursive: true });

  const varsFile = path.join(scaffoldDir, 'vars.resolved.mjs');
  fs.writeFileSync(varsFile, varsText, 'utf8');

  const header = [
    '#!/usr/bin/env node',
    `// @generated-from: ${relLib(scriptSrc)} sha256=${sha12(scriptBuf)} version=${libVersion}`,
    `// @vars-from: ${relLib(VARS_SRC)} sha256=${sha12(fs.readFileSync(VARS_SRC))} @plan: ${relLib(planFile)} sha256=${sha12(fs.readFileSync(planFile))}`,
    `// @target: ${values.targetDir}`,
    `// 段 B 产物：由 numbered-workflow.mjs 拼接（库内正文 + 解析后的 vars/计划）。`,
    `// 请勿手改本文件；改源后重新 compose，用上面的 sha256 比对是否同代。${BAN}`,
    `const VARS = ${JSON.stringify(values, null, 2)};`,
    `const PLAN = ${JSON.stringify(plan, null, 2)};`,
    '',
  ].join('\n');
  const landed = path.join(scaffoldDir, `step${wf}.mjs`);
  const body = substitute(scriptBuf.toString('utf8'), values, `工作流正文 ${relLib(scriptSrc)}`);
  const composed = header + body;
  /* 落盘前最后一道全文残留检查：产物里不许留下任何双下划线大写名（语料 D2 的病灶就在这） */
  const residual = [...new Set(composed.match(TOKEN_RE) || [])];
  if (residual.length) die(`${landed} 仍残留占位符 ${residual.join('、')} —— 宁可不落盘，也不交一个带未解析 token 的脚本`);
  fs.writeFileSync(landed, composed, 'utf8');
  return { landed, varsFile, wf, project, values, plan, metaSrc };
}

/**
 * 同代校验：落盘件头部记的是"拼它时库内源的 sha"，这里拿库内**当前**源重算比对。
 * 对不上只有两种可能——库改过而没重拼（旧构建还在跑），或落盘件被手改。两种都是分叉。
 */
function verifyGen(flags) {
  const wf = resolveWorkflowDir(flags.workflow);
  const project = path.resolve(flags.project || die('缺 --project <目标项目根>'));
  assertWritable(project, '--project');
  const landed = path.join(project, '.scaffold', `step${wf}.mjs`);
  if (!fs.existsSync(landed)) die(`落盘件不存在：${landed}（段 B 还没跑，先 compose）`);
  const head = fs.readFileSync(landed, 'utf8').split(/\r?\n/).slice(0, 8).join('\n');
  const want = [
    [/@generated-from:\s*(\S+)\s+sha256=([0-9a-f]{12})/, '工作流正文'],
    [/@vars-from:\s*(\S+)\s+sha256=([0-9a-f]{12})/, '变量表'],
    [/@plan:\s*(\S+)\s+sha256=([0-9a-f]{12})/, '栈计划'],
  ];
  const drift = [];
  for (const [re, label] of want) {
    const m = head.match(re);
    if (!m) { drift.push(`${label}：同代头缺失或形状不符`); continue; }
    const src = path.join(LIB_ROOT, ...m[1].split('/'));
    if (!fs.existsSync(src)) { drift.push(`${label}：同代头指向 ${m[1]}，库内已无此文件`); continue; }
    if (sha12(fs.readFileSync(src)) !== m[2]) drift.push(`${label}：库内已改（现 sha ${sha12(fs.readFileSync(src))} ≠ 落盘件记录的 ${m[2]}）`);
  }
  if (drift.length) {
    console.error(`✗ ${wf} 的落盘件与库内源不同代：`);
    drift.forEach(d => console.error(`  - ${d}`));
    console.error('→ 重新跑段 B（compose）再执行；不要手改落盘件。');
    process.exit(EXIT_WORKFLOW);
  }
  console.log(`✓ ${wf} 的落盘件与库内源同代（正文 / 变量表 / 栈计划三处 sha 全等）`);
  process.exit(EXIT_OK);
}

/** 段 A 要读的"本步目标"：workflow.md 的 ## 目标 首行（读不到就退化为文件名，不猜） */
function stageA(metaSrc, wf) {
  if (!fs.existsSync(metaSrc)) return `段 A 理解目标：${wf}（workflow.md 缺失，按 README 的编号表执行）`;
  const t = readText(metaSrc);
  const m = t.match(/##\s*目标\s*\n+([^\n]+)/);
  return `段 A 理解目标：${(m ? m[1] : t.split(/\r?\n/)[0]).trim()}`;
}

function run(flags) {
  const c = compose(flags);
  console.log(stageA(c.metaSrc, c.wf));
  console.log(`段 B 拼脚本：${posix(path.relative(c.project, c.landed))} 与 ${posix(path.relative(c.project, c.varsFile))} 已落盘`);
  const r = spawnSync(process.execPath, [c.landed], { cwd: c.project, encoding: 'utf8', shell: false, windowsHide: true, timeout: 600000 });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) die(`段 C 执行失败：${r.error.message}`);
  if (r.status === EXIT_OK) {
    console.log(`段 D 验证：✓ 工作流 ${c.wf} 完成（退出码 0）`);
    process.exit(EXIT_OK);
  }
  console.error(`段 D 验证：✗ 工作流 ${c.wf} 未通过（退出码 ${r.status}）`);
  console.error('→ 停下来问用户：重试还是跳过？（不自行继续、不改库内文件、不改用户已有 .qoder/）');
  process.exit(r.status === EXIT_USAGE ? EXIT_USAGE : EXIT_WORKFLOW);
}

const { cmd, flags } = parseArgs(process.argv.slice(2));
if (cmd === 'list' || cmd === '') {
  const all = fs.existsSync(WF_ROOT) ? fs.readdirSync(WF_ROOT).filter(d => /^\d{2}-/.test(d)).sort() : [];
  if (!all.length) die(`${relLib(WF_ROOT)}/ 下没有工作流`);
  console.log(`编号工作流 ${all.length} 个（库根 ${posix(relLib(LIB_ROOT)) || '.'}）：`);
  for (const d of all) console.log(`  ${d}  workflow.md + script.mjs`);
  process.exit(EXIT_OK);
}
if (cmd === 'compose') { const c = compose(flags); console.log(`✓ 已拼出 ${c.landed}`); process.exit(EXIT_OK); }
if (cmd === 'verify-gen') verifyGen(flags);
if (cmd === 'run') run(flags);
else die(`未知子命令 ${cmd}`, EXIT_USAGE);
