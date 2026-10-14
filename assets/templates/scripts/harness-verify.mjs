#!/usr/bin/env node
// harness-verify.mjs — better-coding SKILL 确定性校验器（唯一实现）
// 用法：node .qoder/scripts/harness-verify.mjs [--project-root <path>] [--fast]
//   ↑ `--fast` **不是"少判几条"的快档**：带与不带跑的是同一套判据（行集合完全相同），
//     它只是 stop-verify 的调用标记，回显在 verify_duration 行里（详见下方 §V17 说明）。
// 输出：[harness-verify] status: PASS | FAIL + 逐项明细（先 status 行，后明细）
// 退出码：0 = PASS, 1 = FAIL
//
// 本文件取代 harness-verify.ps1 / harness-verify.sh 两份孪生。孪生的代价不是"两份代码"而是
// "同一判据两种口径"：E20 里 .ps1 按字符、.sh 按字节算同一份预算，同一仓库两边结论相反；
// B1 里 .sh 的 `echo "$VAR" | grep -q` 左端在 grep 提前退出后吃到 SIGPIPE(141)，配合
// pipefail 让整脚本死亡 → 3 项假 FAIL；B2 里 JSON 校验把路径内插进 Python 源码。
// 这些写法在 Node 侧结构上不存在（String.includes / readFileSync(path)），因此随孪生消失而关闭。
//
// --fast：由 stop-verify hook 传入（§7.3 去自证）。**它不跳过任何判据** —— 迁移前 .ps1/.sh
// 都不实现该参数（实测两侧 0 处引用），"快"是靠单语言读盘天然拿到的；用它换取跳过检查项，
// 等于把每次 Stop 的自动门禁静默变窄，正是本脚本要消灭的那类缺陷。
// V17 因此把 verify 自身耗时回显出来：若将来真的慢到需要 --fast，判据是这一行的数字，不是猜测。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const T0 = Date.now();

/* ==================== 参数 ==================== */
const argv = process.argv.slice(2);
let projectRoot = process.cwd();
let fast = false;
/* v9.3.0 S7：--brief 只折叠"库一致性"这一组的**呈现**，一条判据都不跳过（与 --fast 同纪律）。 */
let brief = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--project-root' || a === '-ProjectRoot') { projectRoot = String(argv[++i] ?? ''); continue; }
  if (a === '--fast' || a === '-Fast') { fast = true; continue; }
  if (a === '--brief' || a === '-Brief') { brief = true; continue; }
  if (a === '--help' || a === '-h') {
    process.stdout.write('用法: node harness-verify.mjs [--project-root <path>] [--fast]\n      --fast 不跳过任何判据：带与不带是同一套行集合，它只是 stop-verify 的调用标记\n');
    process.exit(0);
  }
  /* 🔴 P2-9：未知旗标过去被静默吞掉，拼错 `--brief` 成 `--bref` 照样输出整表 PASS——
   * 一个"看起来跑了、其实按你想的跑了"的校验器比没有校验器更危险。响亮失败。 */
  process.stderr.write(`未知参数 ${a}（本校验器只认 --project-root / --fast / --brief / --help）\n`);
  process.exit(2);
}
projectRoot = path.resolve(projectRoot);

/* ==================== 小工具 ==================== */
const qoderDir = path.join(projectRoot, '.qoder');
const docsDir = path.join(projectRoot, 'docs');
const panelPath = path.join(docsDir, 'PROJECT-LIVE.html');
const liveDocPath = path.join(docsDir, 'PROJECT-LIVE.md');
const profilePath = path.join(qoderDir, 'harness-profile.json');
const rulesDir = path.join(qoderDir, 'rules');
const logsDir = path.join(qoderDir, 'logs');

const exists = p => { try { return fs.existsSync(p); } catch { return false; } };
const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const listFiles = d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name); } catch { return []; } };
const listDirs = d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; } };
/* v9.11.0：按扩展名递归收集文件。目录存在性判定复用文件上方既有的 isDir，**不另造第二个谓词**
   （同族两个判定必然有一天不一致）。walkFiles 必须带剪枝与深度上限——原型工程下有
   node_modules（数万文件），不剪枝会把校验器自己拖死；不限深度则可能撞上软链成环。 */
const walkFiles = (dir, exts, prune = ['node_modules', 'dist'], maxDepth = 8) => {
  const out = [];
  const walk = (d, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!prune.includes(e.name)) walk(path.join(d, e.name), depth + 1); }
      else if (e.isFile() && exts.includes(path.extname(e.name))) out.push(path.join(d, e.name));
    }
  };
  walk(dir, 0);
  return out;
};
/** 统一读法：剥 BOM + CRLF 归一 LF。两侧孪生各自的编码口径（PS 的 -Encoding UTF8、
 *  sh 的裸 open()）是 B2/E20 的一部分，这里只保留一种。 */
const readText = p => { try { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'); } catch { return null; } };
/** 字符 = 码点。PS 5.1 的 .Length 数 UTF-16 码元，含 emoji 时比码点多（实测高 2）。 */
const chars = s => [...s].length;
const stripFm = s => { const m = s.match(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*\r?\n/); return m ? s.slice(m[0].length) : s; };
const bodyChars = s => chars(stripFm(s));
const fmOf = s => (s.match(/^---[^\S\r\n]*\r?\n([\s\S]*?)\r?\n---/) || [, ''])[1];
const linesOf = s => s.split('\n');
const uniq = a => [...new Set(a)];
const DOT = '\u00B7';        // ·  步骤分隔符（标题里的 "1·1"）
const COLON = '\uFF1A';      // ： 全角冒号
const j = arr => arr.join('、');
const head3 = arr => arr.slice(0, 3).join('；');
/** 应用清单的唯一权威读取口（v9.10.0 S1）：缺键/非数组一律按"尚未产出"处理，不抛错。 */
const appsOf = pr => { const a = pr && pr.project && pr.project.apps; return Array.isArray(a) ? a : []; };
/** v9.10.0 S4：参数「权威值已在场」谓词的**唯一**表。两个消费者共用它——
 *  binding_stale 据此判"该绑未绑"；prompt_params 据此放行"认真绑定后框内不再留占位"的形状
 *  （否则等于惩罚绑定，v9.9.0 S5 那类"认真绑定必红"会换个地方复发）。
 *  键集合必须与骨架『参数绑定表』第 4 格的「机检」行双向对账，见 binding_stale 的 roster 段。 */
function buildReady(prof) {
  const prdF = () => listFiles(path.join(docsDir, 'prd'));
  const archF = () => listFiles(path.join(docsDir, 'arch'));
  const hasApps = () => appsOf(prof).length > 0;
  const appNames = () => j(appsOf(prof).map(a => a && a.name));
  const codename = () => !!(prof && prof.project && String(prof.project.name || '').trim());
  return {
    '项目代号': { by: '1·1', ok: codename, why: () => `profile.project.name=${prof && prof.project ? prof.project.name : ''}` },
    'MRD路径': { by: '1·1', ok: () => prdF().some(f => /^MRD-.*\.md$/i.test(f)), why: () => 'docs/prd/ 已有 MRD 文件' },
    '应用清单': { by: '1·1', ok: hasApps, why: () => `profile.project.apps=[${appNames()}]` },
    '应用': { by: '1·1', ok: hasApps, why: () => `profile.project.apps=[${appNames()}]` },
    '应用名': { by: '1·1', ok: hasApps, why: () => `profile.project.apps=[${appNames()}]` },
    'PRD路径': { by: '1·2', ok: () => prdF().some(f => /^PRD-.*\.md$/i.test(f)), why: () => 'docs/prd/ 已有 PRD 文件' },
    'ARCH路径': { by: '2·1', ok: () => archF().some(f => /^ARCH-.*\.md$/i.test(f)), why: () => 'docs/arch/ 已有 ARCH 文件' },
  };
}

/* 面板 8.x MB：整文件只读一次，所有面板判据复用同一份字符串（V18 单遍流式）。
 * .sh 旧写法 `PANEL=$(cat …)` 再逐条 grep 会把同一个 8.5MB 反复拷进 shell 变量，
 * 每次 Contains 都是 O(n) 且伴随 fork。 */
let _panel = null;
const readPanel = () => { if (_panel === null) _panel = readText(panelPath); return _panel; };

/* ==================== 输出缓冲 ==================== */
const rows = [];
const extra = [];
let overallPass = true;
// 沿用孪生的排版契约："  - {name,-20} {STATUS} ({detail})"；跳过项没有独立令牌，
// 而是 PASS + detail 以 "SKIP: " 开头（消费方是人和 grep，不是解析器，故不新增令牌）。
const row = (name, status, detail) => '  - ' + String(name).padEnd(20) + ' ' + status + ' (' + detail + ')';
const checkRow = (name, pass, detail) => {
  if (!pass) overallPass = false;
  rows.push(row(name, pass ? 'PASS' : 'FAIL', detail));
};
const warnRow = (name, detail) => { rows.push(row(name, 'WARNING', detail)); };

/* ==================== manifest（计数与阈值的唯一事实源，V1/E20/M4） ==================== */
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
/* 统一 SKILL 根解析（P1-4 根因修法）：与 loadManifest 同一条候选链，避免各判据各写一套路径。
   顺序：profile.skillRoot（装机时由 phase-a-init 写入，三形态都记了真值）→ 脚本自身上溯三级 →
   项目级安装位 → 用户级安装位。 */
function skillRootCandidates() {
  const rooted = (() => { try { const r = JSON.parse(readText(path.join(qoderDir, 'harness-profile.json'))).skillRoot; return r ? String(r) : null; } catch { return null; } })();
  return [...(rooted ? [rooted] : []),
    path.resolve(SCRIPT_DIR, '..', '..', '..'),
    path.join(qoderDir, 'skills', 'better-coding'),
    path.join(os.homedir(), '.qoder-cn', 'skills', 'better-coding')];
}
const firstExisting = (rel) => { for (const r of skillRootCandidates()) { const p = path.join(r, ...rel.split('/')); if (isFile(p)) return p; } return null; };
function loadManifest() {
  /* 初始化时把 SKILL 根记进 profile.skillRoot：直跑脚本的形态（非 .qoder/skills 安装）下，
   * 下面三条相对路径全落空会让 component_counts / always_on_budget / version_single_source
   * 集体读不到期望值——而 manifest 恰是这些阈值的唯一源（真实使用模拟实测）。 */
  const rooted = (() => { try { const r = JSON.parse(readText(path.join(qoderDir, 'harness-profile.json'))).skillRoot; return r ? path.join(String(r), 'manifest.json') : null; } catch { return null; } })();
  const cands = [
    ...(rooted ? [rooted] : []),
    path.join(SCRIPT_DIR, '..', '..', '..', 'manifest.json'),
    path.join(qoderDir, 'skills', 'better-coding', 'manifest.json'),
    path.join(os.homedir(), '.qoder-cn', 'skills', 'better-coding', 'manifest.json'),
  ];
  for (const c of cands) {
    if (!isFile(c)) continue;
    try {
      const m = JSON.parse(readText(c));
      if (m.componentCounts || m.contextBudget) return m;
    } catch { /* 换一个候选 */ }
  }
  return null;
}
const manifest = loadManifest();
const counts = (manifest && manifest.componentCounts) || {};
const budget = (manifest && manifest.contextBudget) || null;
const RULE_EXTS = (manifest && manifest.rulesExtensions) || ['.md', '.mdc'];

/* ==================== Check 1: 结构性占位符残留 ==================== */
{
  const targets = [path.join(projectRoot, 'AGENTS.md'), liveDocPath];
  const re = /【__[^】]+__】|\{\{[A-Z_]{3,}\}\}/g;
  let placeholderCount = 0;
  let placeholderDetail = '';
  for (const f of targets) {
    const s = isFile(f) ? readText(f) : null;
    if (s === null) continue;
    const n = (s.match(re) || []).length;
    if (n) { placeholderCount += n; placeholderDetail += `${path.basename(f)}:${n} `; }
  }
  let pendingCount = 0;
  const walkPending = node => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walkPending); return; }
    if (Object.prototype.hasOwnProperty.call(node, 'status') && node.status === 'pending') { pendingCount++; return; }
    Object.values(node).forEach(walkPending);
  };
  if (isFile(profilePath)) {
    try {
      const prof = JSON.parse(readText(profilePath));
      if (prof && prof.pendingPlaceholders) walkPending(prof.pendingPlaceholders);
    } catch { /* Check 3 负责报 JSON 非法 */ }
  }
  const ok = placeholderCount === 0 || (pendingCount > 0 && placeholderCount <= pendingCount);
  checkRow('placeholder_scan', ok,
    `${placeholderCount} 残留${pendingCount > 0 ? `，pending 申报 ${pendingCount} 条` : ''}${placeholderDetail ? '｜' + placeholderDetail.trim() : ''}`);
}

/* ==================== Check 2: 组件落盘计数（期望值只读 manifest，V1） ==================== */
{
  const expected = {
    rules: (counts.L0_rules ?? 0) + (counts.L0_rules_self_maintained ?? 0),
    skills: counts.L0_skills ?? 0,
    agents: counts.L0_agents ?? 0,
    commands: counts.L0_commands ?? 0,
    hooks: counts.L0_hooks ?? 0,
    scripts: counts.scripts ?? 0,
  };
  const actual = {};
  // rules：改名过渡态 .md/.mdc 同时接，并按去扩展名后的 basename 去重（同名双扩展名只计 1 条）
  const ruleBase = new Set();
  for (const f of listFiles(rulesDir)) {
    const ext = path.extname(f);
    if (RULE_EXTS.includes(ext)) ruleBase.add(path.basename(f, ext));
  }
  actual.rules = ruleBase.size;
  actual.skills = listDirs(path.join(qoderDir, 'skills'))
    .filter(d => d !== 'better-coding' && isFile(path.join(qoderDir, 'skills', d, 'SKILL.md'))).length;
  actual.agents = listFiles(path.join(qoderDir, 'agents')).filter(f => f.endsWith('.md')).length;
  actual.commands = listFiles(path.join(qoderDir, 'commands')).filter(f => f.endsWith('.md')).length;
  // hooks：数 settings.json 里注册的 hook 名，不数文件（孪生删除后 .qoder/hooks/ 会退出
  // PowerShell 专属形态；"hook 数 = 注册数"才是跨平台成立的那句话）
  const hookNames = new Set();
  let settingsJson = null;
  const settingsPath = path.join(qoderDir, 'settings.json');
  if (isFile(settingsPath)) {
    try {
      settingsJson = JSON.parse(readText(settingsPath));
      for (const groups of Object.values((settingsJson && settingsJson.hooks) || {})) {
        for (const g of Array.isArray(groups) ? groups : []) {
          for (const h of (g.hooks || [])) {
            const m = String(h.command || '').match(/harness\.mjs\s+hook\s+([a-z0-9-]+)/);
            if (m) hookNames.add(m[1]);
          }
        }
      }
    } catch { /* Check 5 负责报 */ }
  }
  actual.hooks = hookNames.size;
  // scripts：单语言化后脚本层只有 .mjs 一种载体，数文件即等于数能力
  const scriptsDir = path.join(qoderDir, 'scripts');
  const scriptFiles = listFiles(scriptsDir);
  actual.scripts = scriptFiles.filter(f => f.endsWith('.mjs')).length;

  let pass = true;
  let detail = '';
  for (const dir of ['rules', 'skills', 'agents', 'commands', 'hooks', 'scripts']) {
    const ok = dir === 'commands' ? actual[dir] === expected[dir] : actual[dir] >= expected[dir];
    if (!ok) pass = false;
    detail += `${dir}=${actual[dir]}/${expected[dir]} `;
  }
  const legacyResidual = [];
  for (const c of ['arch-check.md', 'run-test.md', 'git-commit-all.md']) {
    if (isFile(path.join(qoderDir, 'commands', c))) legacyResidual.push(`commands/${c}`);
  }
  for (const f of listFiles(path.join(qoderDir, 'hooks'))) {
    if (f.endsWith('.hook.ir.yaml')) legacyResidual.push(`hooks/${f}`);
  }
  for (const f of scriptFiles) {
    if (/\.(ps1|sh)$/.test(f)) legacyResidual.push(`scripts/${f}`);
  }
  if (legacyResidual.length) {
    pass = false;
    detail += `｜残留已删资产: ${legacyResidual.join(',')}（迁移指引：按 SKILL migration-map.json 的 remove/merge 条目删除残留文件后重跑校验）`;
  }
  checkRow('component_counts', pass && !!(manifest), detail.trim() + (manifest ? '' : '｜manifest 未找到，期望值全为 0（不猜数字，请检查安装完整性）')
    /* v9.7.0 S8：新增 L0 规则后，未重跑阶段 A 的老项目会在本判据缺一件而红（期望值读自库内 manifest，
     * 磁盘还是旧集合）。这里只补**处置话术**，判定强度一律不动 —— 缺件仍 FAIL，不放宽成 WARNING。 */
    + (() => {
      /* v9.8.0 S7b：v9.7.0 S8 那句人话处置只覆盖了 rules 缺一件；本批把 L0_hooks 的期望值
       * 10 → 11（新增 hook auto-finalize），缺件同样会红，不能再只留一个裸数字。
       * ⚠️ 判定强度一字未动：缺件仍 FAIL，不放宽成 WARNING。 */
      if (!manifest) return '';
      const fix = [];
      if (actual.rules < expected.rules) fix.push(`.qoder/rules/ 少 ${expected.rules - actual.rules} 条（v9.7.0 起 L0 规则含 harness-runtime-gates.md）：跑一次阶段 A 或 /harness-upgrade 即补齐 —— 该动作受定制保护，不会改写你编辑过的 AGENTS.md`);
      if (actual.hooks < expected.hooks) fix.push(`.qoder/settings.json 注册的 hook 少 ${expected.hooks - actual.hooks} 个（v9.8.0 起含 hook auto-finalize —— 交付物一落盘就按磁盘事实登记定稿事实，缺了它"自动定稿"只剩话术）：重跑一次阶段 A 即按新模板补注册；你编辑过 settings.json 时定制保护会跳过它，请手工把那条加进 PostToolUse`);
      return fix.length ? '｜' + fix.join('｜') : '';
    })());
}

/* ==================== Check 3: profile 合法性 ==================== */
{
  let pass = false, detail = '';
  if (isFile(profilePath)) {
    try {
      const profile = JSON.parse(readText(profilePath));
      const required = ['version', 'skillVersion', 'project', 'maturity', 'sync', 'pendingPlaceholders'];
      const missing = required.filter(k => !Object.prototype.hasOwnProperty.call(profile, k));
      if (missing.length === 0) { pass = true; detail = 'JSON valid, fields complete'; } else { detail = `missing: ${missing.join(',')}`; }
      if (pass && profile.sync) {
        const syncMissing = ['lastSyncAt', 'syncCount'].filter(k => !Object.prototype.hasOwnProperty.call(profile.sync, k));
        if (syncMissing.length) { pass = false; detail = `sync missing: ${syncMissing.join(',')}`; }
      }
    } catch (e) { detail = `JSON parse error: ${e && e.message}`; }
  } else { detail = 'file not found'; }
  checkRow('profile_valid', pass, detail);
}

/* ==================== Check 3b: 承重文件名大小写防漂（v9.9.0 S2，FAIL） ==================== */
{
  /* 立据（真环境）：装机写的是 AGENTS.md（init-report 可查），一小时后磁盘真名成了 agents.md——
   * AI 同步时用小写路径删+建重建了它。而全库 AGENTS 类判据都走 path.join(root,'AGENTS.md')
   * + isFile/exists，NTFS 上小写文件照样打得开 ⇒ agents_fields 一路 PASS、漂移全程隐形；
   * 换到区分大小写的文件系统上则是整套常驻指令静默消失。
   * ⚠️ 本判据只认 readdirSync 返回的磁盘真名字符串逐字比对，禁止用"能不能打开"定案。
   * 名单读自 manifest#loadBearingFiles（v9.9.0 S1：与阶段 A 的必备件清单同一事实源）。 */
  const EXPECT = Array.isArray(manifest && manifest.loadBearingFiles) ? manifest.loadBearingFiles : null;
  if (!EXPECT) {
    checkRow('filename_case', true, 'SKIP: manifest#loadBearingFiles 未找到（不猜名单，请检查安装完整性——名单缺席时本行不得假称已核对）');
  } else {
    const drift = []; let absent = 0;
    for (const expectPath of EXPECT) {
      const segs = String(expectPath).split('/').filter(Boolean);
      const want = segs[segs.length - 1];
      const parent = segs.length > 1 ? path.join(projectRoot, ...segs.slice(0, -1)) : projectRoot;
      let real = null;
      try { real = fs.readdirSync(parent); } catch { absent++; continue; }
      const exact = real.includes(want);
      const wrongName = real.find(x => x !== want && x.toLowerCase() === want.toLowerCase());
      if (!exact && wrongName) {
        drift.push(wrongName + ' → 应为 ' + expectPath + '（纠名办法：重跑一次阶段 A，它在落盘前自动两跳改名且不改一个字节；或手工两跳：' + wrongName + ' → ' + wrongName + '.case.tmp → ' + want + '）');
      } else if (exact && wrongName) {
        drift.push(expectPath + ' 与大小写变体 ' + wrongName + ' 同时存在（区分大小写的卷宗上会双份并存）——保留 ' + want + '，另一份人工处置');
      }
      if (!exact && !wrongName) absent++;
    }
    /* v9.10.0 S0-c：skill 文件名真名核。刻意**不**并入 manifest#loadBearingFiles——那张表另有
     * 一个消费者（phase-a-init.mjs:607 拿它做"落盘必达"对账），而用户级安装形态下
     * `.qoder/skills/better-coding/SKILL.md` 本就合法缺席，入表等于让阶段 A 自己判死。
     * 这里按"目录在才核"，且用 readdirSync 真名：NTFS 上 existsSync('SKILL.md') 对 `skill.md`
     * 返回真，宿主却按字面名找文件 ⇒ 一漂即静默丢整个 skill（与本文件病灶同族）。 */
    const skRoot = isDir(path.join(qoderDir, 'skills')) ? path.join(qoderDir, 'skills') : null;
    let skillChecked = 0;
    if (skRoot) for (const d of listDirs(skRoot)) {
      let names = []; try { names = fs.readdirSync(path.join(skRoot, d)); } catch { continue; }
      const variants = names.filter(x => x !== 'SKILL.md' && x.toLowerCase() === 'skill.md');
      if (!names.includes('SKILL.md') && !variants.length) continue;   // 该目录压根没有 skill 主文件，归 component_counts 说话
      skillChecked++;
      for (const v of variants) drift.push(`${d}/${v} → 应为 ${d}/SKILL.md（宿主按字面名找文件、NTFS 仍打得开 ⇒ 其余判据全程绿灯。两跳改名：${v} → ${v}.case.tmp → SKILL.md，只改名不动一个字节）`);
    }
    checkRow('filename_case', drift.length === 0, drift.length
      ? drift.length + ' 处文件名大小写漂移：' + drift.slice(0, 2).join(' ｜ ') + (drift.length > 2 ? '（共 ' + drift.length + ' 处）' : '')
        + ' —— Windows/macOS 默认卷宗靠文件系统兜住（仍能注入，所以其余判据全绿），换到区分大小写的文件系统上宿主按字面名找不到文件 ⇒ 整套常驻指令静默消失'
      : (EXPECT.length - absent) + '/' + EXPECT.length + ' 个承重文件真名逐字相符（比对方式是 readdirSync 真名，不是能否打开）'
        + (absent ? '；' + absent + ' 项尚未落盘，不计入本判据（缺席归 agents_fields / live_doc_integrity / Check 3）' : '')
        + (skRoot ? `｜+ 项目级 skill ${skillChecked} 个的 SKILL.md 真名逐字相符` : '｜本项目无项目级 skill 目录，skill 真名未核（不假称已核）'));
  }
}

/* ==================== Check 4: AGENTS.md 章节完整性 ==================== */
{
  /* v9.0.0 §5.4：「可用能力」与「Memory 索引」两节已从模板删除（手工镜像内置清单是纯漂移源）。
   * v9.7.0 S3 两处补盲（实测出处：装机产物 133 行 / 46% 零信息行仍报 "10/10 sections present"）：
   * ① 必需节补入「运行时前置」「禁区」——两节自 v9.0.0 起一直在模板里，此前**把安全整节删掉也判不出来**；
   * ② 判定由 `s.includes(x)` 子串匹配改为**标题匹配**：旧写法下「命名规范」只要作为「代码风格」的 bullet
   *    标签出现就算通过，对"节在而内容为空/写成框架说明书"结构性无感。确按设计只存在于 bullet 的项进例外表。 */
  const required = ['运行时前置', '项目简介', '技术栈', '项目结构', '分层规范', '命名规范', '关键约束', '团队规范扩展', '禁区', '自维护状态在哪看'];
  const BULLET_ONLY = ['命名规范'];   // 模板里它是「代码风格」下的 bullet，不是独立标题（新老模板同代，不构成新增红）
  const agentsMdPath = path.join(projectRoot, 'AGENTS.md');
  let pass = false, detail = '';
  if (isFile(agentsMdPath)) {
    const s = readText(agentsMdPath);
    const headings = new Set(), bulletLines = [];
    for (const l of s.split(/\r?\n/)) {
      const m = l.match(/^#{2,4}\s+(.+?)\s*$/);
      if (m) { headings.add(m[1]); continue; }
      if (/^\s*[-*>]\s/.test(l)) bulletLines.push(l);
    }
    const inPlace = x => headings.has(x) || (BULLET_ONLY.includes(x) && bulletLines.some(b => b.includes(x)));
    const missing = required.filter(x => !inPlace(x));
    if (!headings.has('构建与测试命令') && !(headings.has('Setup 命令') && headings.has('测试说明'))) {
      missing.push('构建与测试命令|Setup命令+测试说明');
    }
    const total = required.length + 1;   // +1 = 上面那条构建节别名（数字由数组算出，不再硬写）
    pass = missing.length === 0;
    detail = pass ? `AGENTS.md(根): ${total}/${total} 必需节在位（标题匹配）`
      : `AGENTS.md(根) missing: ${missing.join(',')}（缺失请从模板 better-coding/assets/templates/AGENTS.md.template 重新落盘或重新初始化）`;
  } else {
    detail = 'AGENTS.md(根): file not found（缺失请从模板 better-coding/assets/templates/AGENTS.md.template 重新落盘或重新初始化）';
  }
  checkRow('agents_fields', pass, detail);
}

/* ==================== Check 4b/4c: AGENTS.md 常驻预算 + 命令表代填兑现（v9.7.0 S4） ==================== */
{
  /* 🔴 两条都按**代际标记**门控（裁定 R4＝只管新项目）：只认模板写进文件的机器标记 harness:agents-schema:2。
   * 不得改用 profile.skillVersion 推断——老项目重跑阶段 A 会把 skillVersion 刷成库版（它是库自有字段），
   * 而 AGENTS.md 因定制保护仍是旧版式，按版本推断必然误红。缺标记 → PASS (SKIP)，SKIP 行自动计入
   * 汇总的「判据覆盖：未验证 M」（v9.4.0 S3 既有通道），呈现层不另造。 */
  const p4 = path.join(projectRoot, 'AGENTS.md');
  const aText = isFile(p4) ? readText(p4) : null;
  const gen2 = !!aText && aText.includes('<!-- harness:agents-schema:2 -->');
  const skipDetail = 'SKIP: AGENTS.md 缺失或为 v9.6.1 及更早形态（无 harness:agents-schema:2 标记）——本判据只核新版式';
  if (!gen2) {
    checkRow('agents_context_budget', true, skipDetail);
    checkRow('agents_command_fill', true, skipDetail);
  } else {
    const nonBlank = aText.split(/\r?\n/).filter(l => l.trim()).length;
    const cite = '｜带线出处：Qoder better-harness agents-md-review.md:57-66';
    if (nonBlank > 180) checkRow('agents_context_budget', false,
      `AGENTS.md 非空行 ${nonBlank} > 180 —— 默认过载：须把架构长文、目录清单与本地模块规则移向 .qoder/rules 或嵌套文件${cite}`);
    else if (nonBlank > 80) warnRow('agents_context_budget',
      `非空行 ${nonBlank}（${nonBlank <= 120 ? '81-120 可接受带（多工具/多运行时仓库）' : '121-180 borderline：须给出拆分理由并点名该移走的节'}）${cite}`);
    else checkRow('agents_context_budget', true, `AGENTS.md 非空行 ${nonBlank} ≤ 80（健康带）`);

    /* 代填兑现判据：只在 profile 记 buildCommands=filled（= 脚本判定"本可机械解析并已代填"）时生效。
     * 不可推导项（运行单个测试、覆盖率报告）保持待检测**不算缺陷**，故门槛是 Setup≥3 / 测试≥1，不是整表无待检测。 */
    let filledClaim = false;
    try {
      const pj = JSON.parse(readText(profilePath));
      const b = pj.pendingPlaceholders && pj.pendingPlaceholders['agents.md'] && pj.pendingPlaceholders['agents.md'].buildCommands;
      filledClaim = !!(b && b.status === 'filled');
    } catch { }
    if (!filledClaim) {
      checkRow('agents_command_fill', true, 'profile 未记 buildCommands=filled（无可解析脚手架，或该表已让位给用户定制）→ 保持待检测不算缺陷');
    } else if (aText.indexOf('harness:auto:commands') < 0) {
      warnRow('agents_command_fill', 'profile 记 buildCommands=filled，但两张表的 harness:auto:commands 标记已被改写 → 无法机器核对代填兑现，请人工看一眼（不算 FAIL，因为定制面优先）');
    } else {
      const cells = { setup: 0, test: 0, todo: 0, hazard: 0 };
      let counting = null;
      for (const l of aText.split(/\r?\n/)) {
        if (l.includes('harness:auto:commandsTest')) { counting = 'test'; continue; }
        if (l.includes('harness:auto:commands')) { counting = 'setup'; continue; }
        if (/^#{1,4}\s/.test(l)) counting = null;
        if (!counting || !/^\|/.test(l)) continue;
        const c = l.split('|');
        if (c.length < 4 || /^\s*-+\s*$/.test(c[1]) || c[2].trim() === '用途') continue;
        if (c[1].indexOf('【') >= 0 || c[1].indexOf('{{') >= 0) cells.hazard++;
        if (c[1].trim() === '待检测') cells.todo++;
        else if (c[1].indexOf('`') >= 0) cells[counting]++;
      }
      const bad = cells.hazard > 0 || cells.setup < 3 || cells.test < 1;
      checkRow('agents_command_fill', !bad, bad
        ? `profile 记 buildCommands=filled，而表内实况为 Setup ${cells.setup} 格／测试 ${cells.test} 格／占位残留 ${cells.hazard} 格（期望 Setup≥3、测试≥1、无【__ 或未注入 token）`
        : `Setup ${cells.setup} 格 + 测试 ${cells.test} 格为脚本代填真命令，无【__/token 残留（另有 ${cells.todo} 格待检测属不可推导项）`);
    }
  }
}

/* ==================== Check 5: settings.json hook 绑定 ==================== */
{
  const requiredEvents = ['PreToolUse', 'PostToolUse', 'Stop'];
  let pass = false, detail = '', eventList = [];
  if (isFile(settingsPathOf())) {
    try {
      const settings = JSON.parse(readText(settingsPathOf()));
      if (settings && settings.hooks) {
        eventList = Object.keys(settings.hooks);
        const missing = requiredEvents.filter(e => !eventList.includes(e));
        if (missing.length === 0) {
          /* v9.8.0 S7：本判据此前只看三个事件键在不在，**不数子命令** —— 于是"少注册一个 hook"
           * 完全看不见（settings.json 指错名字、模板改了项目没重跑，都长得一样）。detail 现在把
           * harness.mjs 的子命令列出来，并对承重三件缺席单独出 WARNING（不升 FAIL：缺 hook 属
           * 装配缺口，component_counts 已经在 v9.8.0 起按 >= 判红，这里只补"缺哪个、怎么补"的路标）。 */
          const subs = new Set();
          /* ⚠️ settings.hooks 的形状是 事件 → 【分组数组】→ 每组 {matcher, if, hooks:[{command}]}。
           * 首版写成 for (const g of Object.values(...)) for (const h of (g.hooks||[]))，g 是数组、
           * g.hooks 恒 undefined ⇒ subs 永远是空集，detail 打出 subcommands(0) 且缺注册 WARNING 永不触发
           * （V9 实跑当场抓到）。必须 .flat() 一层再取 grp.hooks。 */
          for (const grp of Object.values(settings.hooks).flat()) for (const h of ((grp && grp.hooks) || [])) {
            const mm = /harness\.mjs\s+(?:hook\s+)?([a-z0-9-]+)/.exec(String(h.command || ''));
            if (mm) subs.add(mm[1]);
          }
          pass = true;
          detail = `events: ${eventList.join(',')}｜subcommands(${subs.size}): ${[...subs].sort().join(',')}`;
          for (const needName of ['sync-detector', 'auto-finalize', 'stop-verify']) {
            if (!subs.has(needName)) warnRow('settings_bind', `缺 ${needName} 注册 —— ${needName === 'auto-finalize' ? 'v9.8.0 的"交付物落盘即自动定稿登记"依赖它' : '3 步同步的漂移提醒/收尾门禁依赖它'}。重跑一次阶段 A 即按新模板补注册；若你编辑过 .qoder/settings.json，阶段 A 会因定制保护跳过它，请把该条手工加进对应事件的 hooks 数组`);
          }
        }
        else { detail = `missing events: ${missing.join(',')}`; }
      } else { detail = 'no hooks section'; }
    } catch { detail = 'JSON parse error'; }
  } else { detail = 'file not found'; }
  checkRow('settings_bind', pass, detail);
  if (eventList.length && !eventList.includes('UserPromptSubmit')) {
    warnRow('settings_bind', '未绑定 UserPromptSubmit；v4.1.0 起用于 sync-detector/session-start-context，存量项目可补绑');
  }
  function settingsPathOf() { return path.join(qoderDir, 'settings.json'); }
}

/* ==================== Check 6 已废除（v6.0.0），编号保留占位 ==================== */

/* ==================== Check 7: PROJECT-LIVE.md + HTML 面板完整性 ==================== */
{
  let pass = false, detail = '';
  const live = isFile(liveDocPath) ? readText(liveDocPath) : null;
  if (live === null) {
    detail = 'file not found（PROJECT-LIVE.md 应由阶段 A 落盘）';
  } else {
    /* v9.0.0 §5.4：telemetry 分区整块删除（权威源是 .qoder/harness-profile.json，历史看 git log），
   * context 拆到 docs/项目交接.md；手册只剩 3 个分区。 */
  const sectionIds = ['workflow', 'snapshot', 'footer'];
    const missingMarkers = [];
    /* includes() 只问"有没有"，重复与错配照样 PASS（实测 11 个 section-end workflow 仍绿）。
     * 分区契约是**恰好一对**，所以按次数判。 */
    const countOf = (re) => (live.match(re) || []).length;
    for (const sid of sectionIds) {
      const o = countOf(new RegExp('<!--\\s*harness:section\\s+' + sid + '\\s+\\S+\\s*-->', 'g'));
      const c = countOf(new RegExp('<!--\\s*harness:section-end\\s+' + sid + '\\s*-->', 'g'));
      if (o !== 1) missingMarkers.push(`${sid}:start×${o}`);
      if (c !== 1) missingMarkers.push(`${sid}:end×${c}`);
    }
    const wf = sliceSection(live, 'workflow');
    const hasMermaid = wf !== null && wf.includes('```mermaid');
    const fenceCount = wf === null ? 0 : (wf.match(/```/g) || []).length;
    // 面板：存在、含 SYNC_DATA 与 __mermaidElk 引擎、无拼接占位残留、无 DASH_DATA 旧契约回潮
    let panelOk = false, panelDetail = '';
    const panel = readPanel();
    if (panel === null) {
      panelDetail = '面板文件缺失 ';
    } else {
      const hasSyncMarks = panel.includes('SYNC_DATA:BEGIN') && panel.includes('SYNC_DATA:END');
      const hasEngine = panel.includes('__mermaidElk');
      const noPlaceholders = !panel.includes('{{PROJECT_NAME}}');
      const noLegacy = !panel.includes('DASH_DATA:BEGIN');
      panelOk = hasSyncMarks && hasEngine && noPlaceholders && noLegacy;
      /* v9.4.0 S10：细则一直写着"无 ARCH 时三图保持带『示意』前缀的最小示意"，但没有任何判据核它
       * （实测：本轮靠临时 node 探针才数出 21 处 / 9 条边）。现升为机器判据。
       * ⚠️ 必须**逐图**判：写成"`示意` 总数 > 0"就是假判据 —— 初态实测 21 处，删掉任意一处仍远大于 0，
       *    永远不会红（与 build-panel 已删的 V2 恒真、V5 自证同一形状）。缺哪段点哪段。
       * ARCH 已产出时不判此条，交由 panel_topo_lag（Check 7a）要求真实连线。 */
      {
        let skipSketchCheck = true;
        try {
          const pj = JSON.parse(readText(profilePath) || '{}');
          const archDone = !!(pj.maturity && pj.maturity.arch);
          const SCAFFOLD = ['package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'pom.xml', 'build.gradle', 'Cargo.toml', 'composer.json'];
          const scaffold = SCAFFOLD.some(f => isFile(path.join(projectRoot, f)));
          skipSketchCheck = archDone || scaffold;   // 有真拓扑依据时本条不适用
        } catch { skipSketchCheck = true; }
        if (!skipSketchCheck) {
          const segOf = key => {
            /* ⚠️ 两个实测坑：① 缩进不固定 —— 成品里 `context:` 是**顶格**写的（紧跟 `const DIAGRAMS = {`
            *      的换行），按两空格去找会永远 miss，于是把正常面板判成"缺段"，制造永久假红；
            *   ② 偏移不要手算 —— 指到开头反引号自己身上会得到空切片，同样假红。 */
            const re = new RegExp('\\n\\s*' + key + ':\\s*`');
            const m = re.exec(panel);
            if (!m) return null;
            const start = m.index + m[0].length;
            const j = panel.indexOf('`', start);
            return j < 0 ? null : panel.slice(start, j);
          };
          for (const key of ['context', 'container', 'component']) {
            const seg = segOf(key);
            if (seg === null) { panelOk = false; panelDetail += `SYNC_DATA 缺 ${key} 段 `; continue; }
            if (!seg.includes('示意')) { panelOk = false; panelDetail += `${key} 图缺『示意』前缀（无 ARCH 时应保持最小示意图） `; }
          }
        }
      }
      if (!hasSyncMarks) panelDetail += '缺 SYNC_DATA 标记 ';
      if (!hasEngine) panelDetail += '缺 Mermaid+ELK 引擎（拼接未注入 bundle） ';
      if (!noPlaceholders) panelDetail += 'PROJECT_NAME 拼接占位符残留 ';
      if (!noLegacy) panelDetail += 'DASH_DATA 旧契约回潮（应迁移至 SYNC_DATA） ';
    }
    if (missingMarkers.length === 0 && hasMermaid && fenceCount >= 2 && fenceCount % 2 === 0 && panelOk) {
      pass = true; detail = `${sectionIds.length}/${sectionIds.length} 分区标记齐全（workflow/snapshot/footer 之外另有独立交接面 docs/项目交接.md），workflow 含 mermaid 进展图与进度表，HTML 衍生视图完整`;
    } else {
      if (missingMarkers.length) detail += `缺标记: ${missingMarkers.join(',')} `;
      if (!hasMermaid) detail += 'workflow 分区缺 mermaid 块 ';
      if (fenceCount < 2 || fenceCount % 2 !== 0) detail += `workflow 分区代码框不完整或未闭合（fence=${fenceCount}，须为偶数且≥2）`;
      if (!panelOk) detail += `docs/PROJECT-LIVE.html：${panelDetail}（应随阶段 A 拼接落盘仓库内）`;
    }
  }
  checkRow('live_doc_integrity', pass, detail.trim());
}

/* ==================== Check 7a: HTML 面板拓扑滞后（FAIL） ==================== */
{
  const archDir = path.join(docsDir, 'arch');
  const archExists = listFiles(archDir).some(f => /^ARCH/i.test(f));
  let pass = true, detail = 'OK';
  if (archExists) {
    const panel = readPanel();
    if (panel === null) {
      pass = false; detail = `docs/arch/ 已有 ARCH 文档但可视化面板缺失（期望路径：${panelPath}）`;
    } else {
      // SYNC_DATA 标记间的数据块（跳过 BEGIN 注释自身的 --> 闭合符，避免误计为边）
      let begin = panel.indexOf('<!-- SYNC_DATA:BEGIN');
      if (begin >= 0) { const close = panel.indexOf('-->', begin); if (close >= 0) begin = close + 3; }
      const end = panel.indexOf('<!-- SYNC_DATA:END -->');
      const scope = (begin >= 0 && end > begin) ? panel.slice(begin, end) : panel;
      const edgeCount = (scope.match(/-->/g) || []).length;
      /* 「示意」是同步规则给占位节点/边强制加的前缀（live-refresh：无 ARCH 时三图为最小示意，
       * 且"禁止只更新其他数据而保留占位图"）。只数箭头会把初态示意图当成真实拓扑证据：
       * 实测 hb1 面板 edges=7、"示意" 19 处，ARCH 一产出本判据就报"含 7 条连线"放行。 */
      const placeholderHits = (scope.match(/示意/g) || []).length;
      if (edgeCount === 0) {
        pass = false;
        detail = 'docs/arch/ 已有 ARCH 文档但 HTML 面板拓扑仍为空（无任何连线，疑仍为占位图）——同步必须按规则重推 DIAGRAMS（执行 /live-refresh）';
      } else if (placeholderHits > 0) {
        pass = false;
        detail = `docs/arch/ 已有 ARCH 文档，但面板 DIAGRAMS 仍含 ${placeholderHits} 处"示意"占位标记（共 ${edgeCount} 条连线）`
          + '——占位图不算已推导拓扑，须按 ARCH 重推三段图（执行 /live-refresh 或 3 步同步）';
      } else { detail = `ARCH 已产出且 HTML 面板拓扑含 ${edgeCount} 条连线（无"示意"占位残留）`; }
    }
  }
  checkRow('panel_topo_lag', pass, detail);
}

/* ==================== Check 7d: 机械字段与 profile 同源一致（FAIL） ==================== */
let profileSync = null;
{
  if (isFile(profilePath)) {
    try {
      const p = JSON.parse(readText(profilePath));
      if (p && p.sync) profileSync = p.sync;
    } catch { /* Check 3 已报 */ }
  }
  const syncDate = profileSync && profileSync.lastSyncAt ? String(profileSync.lastSyncAt) : null;
  const syncCount = profileSync && profileSync.syncCount !== undefined && profileSync.syncCount !== null ? Number(profileSync.syncCount) : null;
  const verifyStatus = profileSync && profileSync.lastVerify && profileSync.lastVerify.status ? String(profileSync.lastVerify.status) : null;

  let pass = true, detail = '';
  const issues = [];
  if (!syncDate && syncCount === null) {
    detail = 'SKIP: profile 无 sync 权威值（存量项目或 profile 未生成，属正常）';
  } else {
    const liveText = isFile(liveDocPath) ? readText(liveDocPath) : '';
    const foot = sliceSection(liveText, 'footer') || '';
    /* v9.0.0 §5.4：telemetry 分区整块删除（权威源本就是 .qoder/harness-profile.json，历史看 git log），
     * 文档侧的机械位只剩 footer 两处：「最后同步」日期与「最近校验」结论。
     * syncCount 不再有文档镜像，故不再判它；日期按前 10 位比，避免 ISO 时间戳与纯日期格式互假红。 */
    if (syncDate && foot && !new RegExp('最后同步[^\\r\\n]*' + esc(String(syncDate).slice(0, 10))).test(foot)) {
      issues.push(`footer 最后同步不含 ${String(syncDate).slice(0, 10)}（profile 已回写，需执行 /live-refresh 把文档机械位刷回权威值）`);
    }
    if (verifyStatus) {
      /* 校验结论的文档镜像只有一处：PROJECT-LIVE footer「最近校验」。AGENTS.md 的自维护状态区
       * 已随 Task 5.9b 整节删除，这里再要求「状态：…」就是在查一个模板里不存在的槽位——
       * 表现为"hook 一回写、7d 就永久 FAIL"（真实项目仿真实测抓到）。 */
      if (foot && !new RegExp('最近校验[^\\r\\n]*' + esc(verifyStatus)).test(foot)) issues.push(`footer 最近校验非 ${verifyStatus}`);
    } else if (/最近校验[^\r\n]*(PASS|FAIL)/.test(foot)) {
      /* 原实现两条对账都包在 `if (verifyStatus)` 里：profile 没这个值就整段跳过 →
       * "footer 自己写 PASS + profile 根本没权威值"反而 PASS（detail 里 lastVerify= 是空的）。
       * 没有权威源可比不等于核对通过，那是自证。 */
      issues.push('footer 已写校验结论，但 profile.sync.lastVerify 为空（结论无权威来源：须由 stop-verify hook 回写或重跑校验）');
    }
    if (issues.length) {
      pass = false;
      detail = issues.join('；') + '——请执行 /live-refresh（或 3 步同步）把文档机械位刷回 profile 权威值';
    } else {
      detail = `同步日期/校验计数/校验结论与 profile 一致（lastSyncAt=${syncDate ?? ''} syncCount=${syncCount === null ? '' : syncCount} lastVerify=${verifyStatus ?? ''}）`;
    }
  }
  checkRow('live_profile_drift', pass, detail);
}

/* ==================== Check 7e: maturity 与 knownDocs 必须有磁盘背衬（FAIL） ==================== */
{
  /* 中段项目探针实跑：把 docs/prd、docs/arch、docs/spec 与代码全部移出，profile 仍写
   * maturity 四项 true + 13 项 knownDocs → 整体 `status: PASS`、31 行零 FAIL。
   * maturity 是 AI 自己写的，不与产物对账 = 进度由声称决定，面板与手册都跟着这个声称走。 */
  let prof = null;
  try { prof = JSON.parse(readText(profilePath)); } catch { /* Check 3 已报，这里不重复 */ }
  if (prof && prof.maturity && typeof prof.maturity === 'object') {
    const m = prof.maturity;
    const need = [];
    const anyIn = (dir, re) => { try { return listFiles(dir).some(f => re.test(f)); } catch { return false; } };
    const prdDir = path.join(docsDir, 'prd');
    if (m.mrd && !anyIn(prdDir, /^MRD/i)) need.push('mrd=true 但 docs/prd/ 无 MRD*');
    if (m.prd && !anyIn(prdDir, /^PRD/i)) need.push('prd=true 但 docs/prd/ 无 PRD*');
    if (m.arch && !anyIn(path.join(docsDir, 'arch'), /^ARCH/i)) need.push('arch=true 但 docs/arch/ 无 ARCH*');
    /* v9.9.0 S9-D9（反向断言）：v9.8.0 起 profile 有两个写者（AI 同步 + hook auto-finalize）。
     * AI 拿旧快照整文件重写 profile 时会把 hook 写好的 true 静默抹回 false，而上面三条只查
     * "标了 true 就得有文件"、看不见反方向 ⇒ 抹掉之后全绿无人知（真环境复验成立）。
     * 安全性：真跑完 3 步同步必然已把它们置 true，本断言不与"同步刚跑完"的合法窗口抢；
     * 长期红只有两种真相——交付物在场而账没记，或 hook 缺注册（V16 形状），两者都该红。 */
    if (!m.mrd && anyIn(prdDir, /^MRD/i)) need.push('docs/prd/ 有 MRD* 但 maturity.mrd=false（交付物在场而进度位没记：多为 profile 被旧快照整文件重写、覆盖了 hook 的登记 —— 重跑 3 步同步即可闭合）');
    if (!m.prd && anyIn(prdDir, /^PRD/i)) need.push('docs/prd/ 有 PRD* 但 maturity.prd=false（同上，方向相反）');
    if (m.techstack) {
      const ts = prof.techstack || {};
      const declared = ['backend', 'frontend', 'database'].some(k => Array.isArray(ts[k]) && ts[k].length > 0) || !!ts.deploy;
      const scaffold = ['package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'pom.xml', 'build.gradle', 'Cargo.toml', 'composer.json']
        .some(f => isFile(path.join(projectRoot, f)));
      if (!declared && !scaffold) need.push('techstack=true 但 profile.techstack 四列皆空、根目录也无脚手架文件');
    }
    const docs = Array.isArray(prof.knownDocs) ? prof.knownDocs : [];
    for (const d of docs) {
      const pth = typeof d === 'string' ? d : String((d && (d.path || d.file || d.name)) || '');
      if (!pth || pth.includes('{') || /^https?:/i.test(pth)) continue;
      if (!exists(path.join(projectRoot, pth))) need.push(`knownDocs 指向不存在的文件：${pth}`);
    }
    const doneCnt = Object.keys(m).filter(k => m[k]).length;
    checkRow('maturity_vs_disk', need.length === 0, need.length
      ? `${uniq(need).slice(0, 5).join('；')}${need.length > 5 ? `（共 ${need.length} 处）` : ''}——声称的进度必须有产物背书，否则回到 3 步同步把 maturity 改回 false`
      : `maturity ${doneCnt} 项与 knownDocs ${docs.length} 项均有磁盘背衬`);
  } else {
    checkRow('maturity_vs_disk', true, 'SKIP: profile 无 maturity 段（Check 3 已就 profile 有效性报过）');
  }
}


/* ==================== Check 7e2: 交付物不能比最后一次同步新（v9.8.0 S4，FAIL） ==================== */
{
  /* 为什么必须新增这一条：7d 比"文档镜像 vs profile 字段"、7e 只判"标了 true 就得有文件"，
   * 两条都是一致性比对，看不见「产出者漏记」。v9.7.0 实测：AI 压住 3 步同步、一个字节都不记，
   * 40 条判据照样全绿 —— 漏记同步是零代价的。本条把代价装上：交付物落盘而未同步 = 当场红，
   * 并由 stop-verify 的 Stop 唤醒把 AI 拽回来（防循环见 harness.mjs「唤醒例外清单」）。
   * ⚠️ 监控清单刻意不含：docs/项目交接.md（4 个中间步按契约「无需同步」）、
   *   docs/PROJECT-LIVE*（框架自身产物，由 live_doc_integrity 管）、docs/harness-templates（模板非交付物）。
   * ⚠️ 粒度：装机注入的 lastSyncAt 是纯日期而 AI 同步写 ISO，两侧无时间分量时同退到「按天比」
   *   （与 live_profile_drift 的「前 10 位比」同口径）。残余窗口如实承认：同一天内「先写文档、
   *   后手动跑校验」这一拍抓不到，由 sync-detector 的 stdout 提醒承接。 */
  let prof2 = null;
  try { prof2 = JSON.parse(readText(profilePath)); } catch { /* Check 3 已报，这里不重复 */ }
  const pad2 = n => String(n).padStart(2, '0');
  const localDay = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const fmtStamp = ms => { const d = new Date(ms); return localDay(ms) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); };
  const walkMd = (dir, re, depth) => {
    const got = [];
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return got; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isFile()) { if (re.test(e.name)) got.push(p); }
      else if (e.isDirectory() && depth > 0) got.push(...walkMd(p, re, depth - 1));
    }
    return got;
  };
  const cand = [
    ...walkMd(path.join(docsDir, 'prd'), /^(MRD|PRD)[^\\/]*\.md$/i, 0),
    ...walkMd(path.join(docsDir, 'arch'), /^ARCH[^\\/]*\.md$/i, 0),
    ...walkMd(path.join(docsDir, 'spec'), /\.(md|sql|ya?ml)$/i, 2),
    ...walkMd(path.join(docsDir, 'test'), /^spec-.*\.md$/i, 0),
    ...walkMd(path.join(docsDir, 'changes', 'archive'), /\.md$/i, 2),
  ];
  const syncRaw = prof2 && prof2.sync ? String(prof2.sync.lastSyncAt || '') : '';
  if (!prof2) checkRow('sync_freshness', true, 'SKIP: profile 不可解析，比对无基准（Check 3 已就 profile 有效性报过）');
  else if (!syncRaw) checkRow('sync_freshness', true, 'SKIP: profile.sync.lastSyncAt 为空，比对无基准（须先跑一次 3 步同步）');
  else if (!cand.length) checkRow('sync_freshness', true, 'SKIP: docs/ 下暂无承重交付物（阶段 A 初态），无「文档 vs 同步」先后可判');
  else {
    let newest = cand[0], nMs = 0;
    for (const p of cand) { try { const t = fs.statSync(p).mtimeMs; if (t > nMs) { nMs = t; newest = p; } } catch { } }
    const hasTime = /\d{2}:\d{2}/.test(syncRaw);
    const sMs = hasTime ? Date.parse(syncRaw) : Number.NaN;
    const exact = Number.isFinite(sMs);
    const red = exact ? nMs > sMs : localDay(nMs) > syncRaw.slice(0, 10);
    const relName = path.relative(projectRoot, newest).replace(/\\/g, '/');
    const fpTag = path.basename(relName) + '@' + Math.floor(nMs / 1000);
    checkRow('sync_freshness', !red, red
      ? '交付物 ' + relName + ' 的落盘时间（' + fmtStamp(nMs) + '）晚于最后一次同步 sync.lastSyncAt=' + syncRaw + '｜fp=' + fpTag
        + ' —— 东西出来了账没改：v9.8.0 起定稿不等待用户口令，请执行 /live-refresh（或按 live-refresh.md 完整跑 3 步同步），粒度=' + (exact ? '按秒' : '按天')
      : cand.length + ' 份承重交付物均不晚于最后一次同步（最新 ' + relName + '=' + fmtStamp(nMs) + '，lastSyncAt=' + syncRaw + '，粒度=' + (exact ? '按秒' : '按天') + '）');
  }
}


/* ==================== Check 7b: 提示词总表路径过期（WARNING） ==================== */
{
  const live = isFile(liveDocPath) ? readText(liveDocPath) : null;
  if (live !== null) {
    const wf = sliceSection(live, 'workflow');
    if (wf !== null) {
      const stale = [];
      /* v9.0.0 手册形状变了（框内「- 名称：docs/...」），旧的两处扫描都失准：
       *   ① 锚定「- **输入物**」行的标签扫描 → 死检，永不告警；改成按标签名匹配后又贡献了
       *      重复条目（它不走下面的豁免逻辑，`docs/spec/{NNN}` 被截成 `docs/spec/` 照样入表）；
       *   ② 全区路径 token 扫描 → 把「请交付到」里的**未来产出**也拿去判存在性，
       *      本步还没做必然不存在。仿真实测一次报出 96 条噪声，唯一的真陈旧引用被埋掉。
       * 现只保留一份实现：扫「我能提供的材料」段（这条判据的语义 = 输入参数绑定过期）。
       * v9.2.0 形状 B 双视角域换轨：标签改名的同时本处键名必须跟着改，否则 inInput 永不
       * 置真 → 本判据静默变成"零 stale"，看起来通过实则不再扫任何东西。 */
      const inputLines = [];
      {
        let inInput = false;
        for (const l of linesOf(wf)) {
          const t = l.trim();
          if (t.startsWith('我能提供的材料：')) { inInput = true; continue; }
          if (/^(请交付到：|参考格式：|请按下面顺序做|红线（绝对不能做）：|怎样算做完)/.test(t)) inInput = false;
          if (inInput && t) inputLines.push(l);
        }
      }
      /* 同行已经声明"这份材料可以不在"→ 缺失是合法态，不是绑定过期。 */
      const OPTIONAL = /可选|没登记|未登记|没有则|若无|待检测/;
      const pushStale = (raw, line, startIdx) => {
        /* 「（…）」是注释跨度：值后面的括号里是举例与说明（`docs/项目交接.md（可选）`、
         * `参考格式（docs/spec/NNN-slug/SPEC-API.yaml）`），不是参数绑定 → 括号及其后一律切掉。 */
        const x = raw.split('（')[0];
        if (!x || x.includes('{')) return;
        /* 字符类把 `{` 排除在匹配之外 → 模板路径 `docs/prd/MRD-{项目代号}.md` 会被截成
         * `docs/prd/MRD-`，匹配结束紧跟 `{` 就说明这里本该有个占位符，不是真路径。 */
        if (line.slice(startIdx + x.length, startIdx + x.length + 1) === '{') return;
        if (x.endsWith('/')) return;                     // 裸目录引用不是文件
        if (/[*?]/.test(x)) return;                      // glob 写法不是具体路径
        const before = line.slice(0, startIdx);
        if ((before.match(/（/g) || []).length > (before.match(/）/g) || []).length) return;
        if (OPTIONAL.test(line)) return;
        if (!stale.includes(x) && !exists(path.join(projectRoot, x))) stale.push(x);
      };
      for (const line of inputLines) {
        for (const bm of line.matchAll(/(?:docs|references|\.qoder)\/[^\s、，。（）)》"'`{]+/g)) {
          pushStale(bm[0], line, bm.index);
        }
        /* v9.9.0 S6：这里的终止集此前不含顿号，而骨架与手册本来就用顿号并列参数
         * （docs/prd/MRD-ownnote.md、ownnote）⇒ 第二个值被并进路径里，报"路径不存在"的假
         * WARNING，与上一条正则（字符类已排除顿号）口径互相打架。补齐后两条一致。 */
        for (const bm2 of line.matchAll(/(?<![`])((?:docs|references|\.qoder)\/\S+?)(?=\s|$|[,;，；、）)])/g)) {
          pushStale(bm2[1].replace(/`+$/, ''), line, bm2.index);
        }
      }
      if (stale.length) {
        warnRow('prompt_path_stale', `提示词总表引用的路径不存在（共 ${stale.length} 条，前 5 例）: ${stale.slice(0, 5).join(',')}（建议重新同步或 /live-refresh 刷新参数绑定）`);
      }
    }
  }
}

/* ==================== Check 7c: 提示词参数完整性（FAIL） ==================== */
{
  const skelPath = path.join(qoderDir, 'briefing-skeletons.md');
  const live = isFile(liveDocPath) ? readText(liveDocPath) : null;
  if (isFile(skelPath) && live !== null) {
    /* v9.9.0 S5（治 D1）：这份白名单本身就是故障源——它留着 v9.0.0 已退役的 输入物/产出物/
     * 参考模板，却不认识骨架 10 处在用的「前序产出」⇒ 那 10 行整批掉进兜底分支，而兜底唯一的
     * 过判条件是"占位符还在不在"，于是认真绑定必红、占位与真值双写反而绿（真环境：手册写成
     * {MRD路径} docs/prd/MRD-ownnote.md 而本判据 19/19 全绿）。标签改为从骨架动态回溯；本名单
     * 退居"截断值段时识别相邻标签行"，漏认标签的后果由下面的兜底红字自曝，不再静默降级。 */
    const LABELS = ['输入文档', '设计依据', '测试计划', 'API 契约', '用例依据', '组件库偏好', '目标环境', '联调范围', '项目想法', '变更描述', '模块清单', '前序产出'];
    const liveLines = linesOf(live);
    const blocks = parseSkeleton(readText(skelPath));
    const missing = [];
    let checkedCount = 0;
    let stillPlaceholder = 0;
    /* v9.10.0：机检参数交给 binding_stale / apps_single_source 对账。本判据旧规则要求"框内看得见
     * {占位}"，而正确绑定的结果恰恰是占位消失 ⇒ 不解绑就会惩罚认真绑定（v9.9.0 S5 同族）。 */
    let profPP = null;
    try { profPP = JSON.parse(readText(profilePath) || 'null'); } catch { /* Check 3 已报，这里不重复 */ }
    const RDY = buildReady(profPP);
    let machineCovered = 0;
    for (const blk of blocks) {
      if (!blk.checklist.trim()) continue;
      const cm = blk.prompt.match(/^\/(\S+)/);
      if (!cm) continue;
      const cmd = cm[1];
      const params = blk.checklist.split(/[、，]/).map(s => s.trim()).filter(Boolean);
      const stepToken = blk.step ? `${blk.num}${DOT}${blk.step}` : '';
      const blkLabel = blk.step ? `环节${blk.num}·步骤${blk.step}` : `环节${blk.num}`;
      let headingIdx = [];
      if (stepToken) {
        const tokRe = new RegExp('(?<!\\d)' + esc(stepToken) + '(?!\\d)');
        headingIdx = liveLines.map((l, i) => [l, i]).filter(([l]) => /^####/.test(l) && tokRe.test(l)).map(([, i]) => i);
      } else {
        headingIdx = liveLines.map((l, i) => [l, i]).filter(([l]) => /^####/.test(l) && l.includes(cmd)).map(([, i]) => i);
      }
      if (!headingIdx.length) continue;
      for (const hIdx of headingIdx) {
        if (liveLines[hIdx].includes('跳过')) continue;
        const ex = extractFence(liveLines, hIdx);
        if (!ex.ok) { missing.push(`${blkLabel}：代码框缺失/未闭合（提示词 fence 未找到）`); continue; }
        const prompt = ex.body.trim();
        const groups = new Map();
        const unlabeled = [];
        for (const p of params) {
          const pname = trimBraces(p);
          const pIdx = blk.prompt.indexOf('{' + pname + '}');
          let hit = null;
          if (pIdx >= 0) {
            /* 取该参数所在行的行首标签（- 前序产出：… ／ - **设计依据**：…）；
             * 标签名里含 { 的不是标签（那是路径模板本身）。 */
            const seg = blk.prompt.slice(0, pIdx);
            const lm = /(?:^|\n)[ \t]*[-*]?[ \t]*\*{0,2}([^：\n*]{2,12})\*{0,2}[：:][^\n]*$/.exec(seg);
            if (lm && !lm[1].includes('{')) hit = lm[1].trim();
          }
          if (hit) { if (!groups.has(hit)) groups.set(hit, []); groups.get(hit).push(p); } else unlabeled.push(p);
        }
        let rowOk = true;
        for (const [lab, ps] of groups) {
          const expectedN = ps.length;
          const labIdx = prompt.indexOf(lab + COLON);
          if (labIdx < 0) {
            rowOk = false;
            missing.push(`${blkLabel}：标签『${lab}${COLON}』缺失（参数 ${j(ps)} 未渲染）`);
            continue;
          }
          let afterAll = prompt.slice(labIdx + lab.length + 1);
          for (const other of new Set([...LABELS, ...groups.keys()])) {
            const nIdx = other === lab ? -1 : afterAll.indexOf(other + COLON);
            if (nIdx >= 0) afterAll = afterAll.slice(0, nIdx);
          }
          /* 值段宽度沿用原语义（截到下一个标签为止）。曾在 S5 里再加一刀"按换行截断"，
           * 会把跨行值段少算成"既无占位也无真值"而误红——修判据不得新增误判，已撤。 */
          const after = afterAll;
          /* 本次新增的红：同一个参数既以占位符出现、紧跟又一个真值 ⇒ 双写垃圾。分隔符与
           * 注释括号后的举例说明不算真值；纯字符串扫描，不再引入正则转义坑。 */
          for (const p2 of ps) {
            const ph = '{' + trimBraces(p2) + '}';
            let at = prompt.indexOf(ph);
            while (at >= 0) {
              const rest = prompt.slice(at + ph.length).replace(/^[ \t]+/, '');
              /* 正向白名单：紧随其后的若是 ASCII 词字符或路径字符（真值形状）才算双写；
               * 全角括号、顿号、换行、中文说明一律不算——宁可漏判，不可误伤初态模板。 */
              const prev = at > 0 ? prompt[at - 1] : '';
              /* 前置守卫：占位符必须是独立 token。`docs/arch/ARCH-{项目代号}.md` 这类路径模板里
               * 的 {项目代号} 后面紧跟 `.md`，会被真值形状误判成双写（装机初态即误红）。 */
              if (!/[\w.\-\/]/.test(prev) && /^[\w./-]/.test(rest)) {
                rowOk = false;
                missing.push(`${blkLabel}：参数 ${ph} 占位与真值并写（${JSON.stringify(rest.slice(0, 40))}…）—— 要么绑成真实值、要么保留占位并标「待检测」，二者必居其一：删掉多余的占位符`);
                break;
              }
              at = prompt.indexOf(ph, at + 1);
            }
          }
          /* v9.9.0 S5（治 D1）三态判定：占位符全在 = 尚未绑定（合法，装机初态即此态）；
           * 占位符已被替换且值段有真内容 = 绑定成功（旧写法在这一态必红）；两者皆无 = 参数被
           * 静默丢弃（红）。不做"值个数必须等于参数个数"的逐位对账——一个路径里可以内嵌多个
           * 占位（docs/spec/{NNN}-{slug}/），按位对账必然误判；双写另有专门检测。 */
          const stillPh = ps.filter(p2 => after.includes('{' + trimBraces(p2) + '}')).length;
          const valueTokens = after.split(/[，,、；;]/).map(s => s.replace(/[（(].*$/, '').trim())
            .filter(s => s && !/\{[^{}]*\}/.test(s) && s !== '无');
          stillPlaceholder += stillPh;
          if (stillPh === 0 && valueTokens.length === 0) {
            rowOk = false;
            missing.push(`${blkLabel}：『${lab}${COLON}』既无占位也无真值（参数 ${j(ps)} 被整段丢掉——静默丢弃参数视为渲染失败）`);
          }
        }
        for (const p of unlabeled) {
          const pname = trimBraces(p);
          if (prompt.includes('{' + pname + '}')) continue;
          let carrierOk = false;
          if (blk.prompt.includes(`「{${pname}}」`) && prompt.includes('「')) carrierOk = true;
          if (!carrierOk && RDY[pname] && RDY[pname].ok()) { machineCovered++; carrierOk = true; }
          if (!carrierOk) { rowOk = false; missing.push(`${blkLabel}：参数 ${'{' + pname + '}'} 既未绑定也未保留占位（若这一行确实已绑成真实值，那是本判据没认出它的标签——把标签补进上面的 LABELS 或修提取式，不要改手册）`); }
        }
        if (rowOk) checkedCount++;
      }
    }
    const withChecklist = blocks.filter(b => b.checklist.trim());
    if (withChecklist.length === 0) {
      checkRow('prompt_params', true, 'SKIP: 骨架库无参数清单行（旧版本骨架，升级回刷后启用本检查）');
    } else {
      checkRow('prompt_params', missing.length === 0,
        missing.length ? `${head3(missing)}（修复：按骨架替换式重渲该行并逐参数对账，或 /live-refresh）` : `${checkedCount}/${checkedCount} 环节行参数完整（其中 ${stillPlaceholder} 处仍保留占位＝尚未绑定，属合法态，产出后由同步绑上即消失）${machineCovered ? `｜另有 ${machineCovered} 处「机检」参数已绑成真实值、由 binding_stale/apps_single_source 对账` : ''}`);
    }
  }
}

/* ==================== Check 7e/7f/7g: 提示词自包含 / 用户语言 / 多专家并行内联 ==================== */
const STEP_BODIES = new Map();
{
  /* §5.3 模板（形状 B）的强制段：改名 + 新增两段。老标签（输入物/产出物/执行要点/注意事项/自检标准/
   * 完成后）随 v9.0.0 一并退役——本项目是破坏性版本，老项目必须重跑阶段 A 回刷手册，不留双轨。
   * v9.2.0 双视角域（§〇）：代码框是「用户粘给 AI」的正文，标签一律用户口吻；
   * 本数组与 PERSON_BAN 必须与骨架 §一 的字面量同批改，漏一侧就一边锁死错误写法、一边判红正确写法。 */
  const NEED = ['这一步我要拿到' + COLON, '为什么要单独做' + COLON, '我能提供的材料' + COLON, '请交付到' + COLON,
    '请按下面顺序做，每步做完给我看一眼再继续', '红线（绝对不能做）' + COLON, '怎样算做完（请逐条打勾）' + COLON, '做完之后' + COLON];
  /* 框内禁现的 AI 承诺口吻（属框外扫读域）；『说出你的想法』只在首行判，步骤名被引用时合法。 */
  const PERSON_BAN = ['这一步要为你拿到', '我会交付到' + COLON, '我需要提供的材料' + COLON];
  const PERSON_BAN_FIRST = '说出你的想法';
  const BAN = ['profile.', 'step_gate', 'MAX_ITERATIONS', 'STALL_THRESHOLD', '[B] blocked', 'knownDocs', 'persona',
    'fan-out', 'Section4', 'subagent', 'mrdPanel', 'designRoute', 'appType', 'openspec-verify-change',
    'dispatching-parallel-agents', 'Red Line', 'Red Flag', 'harness-profile', 'Phase0', 'Phase1', 'Phase2',
    'Phase3', 'Phase4', 'Phase5', 'Phase6', 'techstack-commands', 'incidents', 'browser-testing-with-devtools',
    'frontend-project-scaffolder', 'frontend-ui-designer', 'ui-to-code agent', '内部协议'];
  const EXPERTS = ['产品专家', '架构专家', '业务专家', '运营专家', '安全专家', '测试专家'];
  /** §5.3「字数带不含专家清单」：按骨架 §五 统一格式识别（引入行「请分配 N 位专家…」+ 紧随的连续 `- ` 行）。
   *  ⚠️ 本行必须与 checks/26 里同名字面**逐字相同**，由 word-band-expert-panel-exemption-single-source 咬住。 */
  const EXPERT_PANEL = /^请分配[^\n]*位专家[^\n]*\n(?:[ \t]*\n)?(?:[-*] [^\n]*(?:\n|$))+/gm;
  const EXPERT_PANEL_RULE = '下限按全量正文判；上限与目标带按剔除清单段后判';
  const TOK_RE = new RegExp('(?<!\\d)(\\d)' + DOT + '(\\d)(?!\\d)');
  const live = isFile(liveDocPath) ? readText(liveDocPath) : null;
  if (live !== null) stepBodies(live, STEP_BODIES, TOK_RE);
  /* §5.3 补的第二条机器校验：禁词射程 = 步骤标题 + 框外粗体扫读字段 + 提示词框。
   * 只扫框内等于对用户看得见的那半页不设防（框外历史上漏过内部编号与 agent 名）。 */
  const OUTSIDE_FIELDS = new Map();
  if (live !== null) {
    let cur = null, inFence = false;
    for (const l of linesOf(live)) {
      const h = l.match(/^####\s+.*?(?<!\d)(\d)·(\d)(?!\d)/);
      if (h) { cur = h[1] + DOT + h[2]; if (!OUTSIDE_FIELDS.has(cur)) OUTSIDE_FIELDS.set(cur, []); inFence = false; continue; }
      if (/^###\s/.test(l)) { cur = null; continue; }
      if (/^```/.test(l.trim())) { inFence = !inFence; continue; }
      if (cur && !inFence && /^\*\*[^*]+\*\*：/.test(l)) OUTSIDE_FIELDS.get(cur).push(l);
    }
  }
  if (STEP_BODIES.size === 0) {
    const why = live === null ? 'SKIP: PROJECT-LIVE.md 不存在' : 'SKIP: 未找到 #### 步骤区块（旧版手册，升级回刷后启用）';
    checkRow('prompt_selfcontained', true, why);
    checkRow('prompt_plain_language', true, 'SKIP: 同上');
    checkRow('expert_panel_inline', true, 'SKIP: 同上');
    checkRow('prompt_length_bounds', true, 'SKIP: 同上');
    checkRow('prompt_person_view', true, 'SKIP: 同上');
  } else {
    const i7e = [], i7f = [], i7g = [], iLen = [], wLen = [], iPerson = [];
    for (const [k, { heading, body }] of STEP_BODIES) {
      if (heading.includes('跳过')) continue;
      if (body === null) { i7e.push(`${k} 提示词代码框缺失或未闭合`); continue; }
      const miss = NEED.filter(x => !body.includes(x));
      if (miss.length) i7e.push(`${k} 缺段: ${miss.join(' ')}`);
      const n = chars(body);
      /* 下限按全量正文判；上限与目标带按剔除清单段后判（见 EXPERT_PANEL_RULE）。 */
      const nb = chars(body.replace(EXPERT_PANEL, ''));
      if (n < 160) i7e.push(`${k} 提示词过短（${n} 字，下限 160）`);
      if (nb > 1200) iLen.push(`${k} 提示词超限（${nb} 字 > 骨架『字数带』硬上限 1200，读不完即静默失效；专家清单段已按 §5.3 剔除）`);
      else if (nb > 900) wLen.push(`${k} ${nb} 字（>目标 900，过程细节应下沉折叠说明）`);
      else if (nb < 300) wLen.push(`${k} ${nb} 字（<目标下限 300，判据可能已被压掉）`);
      const scope = `${heading}\n${(OUTSIDE_FIELDS.get(k) || []).join('\n')}\n${body}`;
      const hit = BAN.filter(x => scope.includes(x));
      if (hit.length) i7f.push(`${k} 命中内部术语: ${hit.join(', ')}（射程=标题+扫读字段+提示词框）`);
      const pHit = PERSON_BAN.filter(x => body.includes(x));
      if (pHit.length) iPerson.push(`${k} 框内残留 AI 承诺口吻: ${pHit.join(' / ')}（该说法属框外扫读域，框内须用户口吻）`);
      else if (body.split('\n')[0].includes(PERSON_BAN_FIRST)) iPerson.push(`${k} 首行要求 AI「${PERSON_BAN_FIRST}」——提示词是用户发给 AI 的，视角反了`);
      if (k === `1${DOT}1`) {
        const noexp = EXPERTS.filter(x => !body.includes(x));
        if (noexp.length && !body.includes('待确认')) i7g.push(`1${DOT}1 缺专家设定: ${noexp.join(' ')}`);
      }
    }
    checkRow('prompt_selfcontained', i7e.length === 0,
      i7e.length ? `${head3(i7e)}（修复: 按 .qoder/briefing-skeletons.md『提示词自包含契约』整段重渲该步，或 /live-refresh）` : `${STEP_BODIES.size} 个步骤提示词六段齐备且不低于字数下限`);
    checkRow('prompt_plain_language', i7f.length === 0,
      i7f.length ? `${head3(i7f)}（改写为用户语言，内部协议留在骨架执行契约；对照禁词表）` : `${STEP_BODIES.size} 个步骤提示词未命中禁词表`);
    checkRow('expert_panel_inline', i7g.length === 0,
      i7g.length ? `${head3(i7g)}（专家设定须内联可见，或标『待确认』）` : `1${DOT}1 6 位专家设定已内联可见`);
    // V14：孪生只校下限 160，上限来自骨架『字数带』却从未机检 → 合并步骤会让单步涨到 1400-1900 字而静默通过
    checkRow('prompt_length_bounds', iLen.length === 0, iLen.length ? head3(iLen)
      /* v9.4.0 S9：把超标计数提到行首 —— 旧写法把"14 个越出目标带"埋在括号中段，
       * 扫读者只看到 PASS 就过去了。判据等级一字未动（目标带仍非失败级，160/1200 硬带照旧）。 */
      : `${wLen.length ? `已披露 ${wLen.length} 项越出目标带（900/300，非失败级）` : '无越出目标带项'}｜${STEP_BODIES.size} 段字数都在 160-1200 硬带内${wLen.length ? `：${wLen.slice(0, 3).join(' | ')}` : ''}`);
    /* 目标带（900/300）只作信息、不单独成行——刻意不发 WARNING 行，免得噪声淹没失败级判据。
     * v9.12.0 P2-10：此处原是一个空的 `if (...) { }` 语句体，承载的正是这条本注释；
     * 空块不执行任何事，留着只会让人以为"下面还有逻辑被删了"。 */
    checkRow('prompt_person_view', iPerson.length === 0,
      iPerson.length ? `${head3(iPerson)}（修复: 按骨架 §〇 双视角域改为用户口吻标签，框外扫读字段才用「你要做的事」式第二人称）`
        : `${STEP_BODIES.size} 个提示词框内均为用户口吻（无 AI 承诺标签，首行未把「${PERSON_BAN_FIRST}」发给 AI）`);
  }
}

/* §5.4 体积预算（2026-09-09 用户裁定改口径）：**整文件 ≤45KB 目标已撤销**——它与"打开手册即可复制
 * 提示词"结构互斥（内联提示词实测占全文约六成），只能二选一，那是产品取舍、不由脚本替用户决定。
 * 保留且升格为硬判据的是**非提示词部分 ≤45KB**：§5.4 授权删除的机器内容（遥测分区、迁移日志、
 * 折叠说明等）全部落在这一部分，它涨了就说明删除没落地。母本实测 27KB / 预算 45KB。
 * ⚠️ 必须排在 STEP_BODIES 填充之后：把它放在声明之前会让整个校验器在空白项目首跑时抛
 *    `ReferenceError: Cannot access 'STEP_BODIES' before initialization`（const 的暂时死区），
 *    连一行 check 都不输出。`node --check` 判不出这种错——它不做作用域与执行顺序分析。 */
{
  const budget = 45 * 1024;
  if (!isFile(liveDocPath)) {
    checkRow('manual_size_budget', true, 'SKIP: 无 docs/PROJECT-LIVE.md，体积无从判（不猜数）');
  } else {
    const liveText = fs.readFileSync(liveDocPath, 'utf8').replace(/\r\n/g, '\n');
    const total = Buffer.byteLength(liveText, 'utf8');
    /* 与库侧 checks/28 ⑦ 用同一条正则剥提示词框，否则两边判据口径分叉 */
    const nonPrompt = Buffer.byteLength(liveText.replace(/```text[\s\S]*?```/g, ''), 'utf8');
    const kb = n => Math.round(n / 1024);
    checkRow('manual_size_budget', nonPrompt <= budget, nonPrompt > budget
      ? `非提示词部分 ${kb(nonPrompt)}KB > 预算 ${kb(budget)}KB：§5.4 授权删除的机器内容没删干净（整文件 ${kb(total)}KB 不设目标，不计入本判据）（修复: 把「执行要点」的过程细节下沉区块折叠说明，或 /live-refresh 重渲）`
      : `非提示词部分 ${kb(nonPrompt)}KB ≤ ${kb(budget)}KB；整文件 ${kb(total)}KB 不设目标（${STEP_BODIES.size} 段内联提示词占 ${Math.round((1 - nonPrompt / total) * 100)}%，旧「整文件 ≤45KB」目标已按裁定撤销）`);
  }
}

/* ==================== Check 8: 常驻预算审计（V6，阈值与单位均来自 manifest） ====================
 * V19 在此有意**不实现**：不设"激活规则 100,000 字符上限"断言 —— 平台侧无此护栏（已证伪）。 */
{
  if (!budget) {
    checkRow('always_on_budget', false, 'manifest#contextBudget 未找到（不猜阈值，请检查安装完整性）');
  } else if (!isDir(rulesDir)) {
    checkRow('always_on_budget', true, '无 .qoder/rules，跳过');
  } else {
    const layer = { L0: 0, 'self-maintained': 0, L1: 0, L2: 0 };
    const grownChars = new Map();
    /* B4-42 披露用（**不改判定**）：本行账的是 body-chars，而常驻成本真正按 token 计。
     * 中日韩与 ASCII 的 token 密度差好几倍，单一换算率必然骗人，所以按字符类分别累加。 */
    const tok = { cjk: 0, other: 0 };
    const exts = budget.extensionsCounted || RULE_EXTS;
    for (const f of listFiles(rulesDir)) {
      if (!exts.includes(path.extname(f))) continue;
      const raw = readText(path.join(rulesDir, f));
      if (raw === null || !/trigger:\s*always_on/.test(raw)) continue;
      const body = stripFm(raw);
      {
        const c = (body.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/g) || []).length;
        tok.cjk += c; tok.other += Math.max(0, chars(body) - c);
      }
      const len = chars(body);
      const n = path.basename(f, path.extname(f));
      // 层级只能靠文件名（落盘后同目录平铺）。project-domain-glossary 是 L0 的名字却会被
      // project-* 前缀误判成 L2，因此先精确点名。
      grownChars.set(n, len);
      const lay = n === 'harness-continuous-sync' ? 'self-maintained'
        : n === 'project-domain-glossary' ? 'L0'
        : n.startsWith('project-') ? 'L2'
        : /^(go|java|python|react|ts)-/.test(n) ? 'L1' : 'L0';
      layer[lay] += len;
      if (budget.perFileWarnChars && len > budget.perFileWarnChars) {
        extra.push(`  ! large_file: ${n} 正文 ${len} 字符 > perFileWarnChars ${budget.perFileWarnChars}`);
      }
    }
    const core = layer.L0 + layer['self-maintained'];
    const total = layer.L0 + layer['self-maintained'] + layer.L1 + layer.L2;
    const cap = budget.alwaysOnBodyChars | 0;
    const pct = cap ? Math.floor(100 * core / cap) : 0;
    /* v9.9.0 S7（治 D3）：项目自长的常驻文件（词汇本）此前与框架自有文本混在同一个总数里，
     * "登记到第 15 条术语才炸"只能靠反复压字数去试（真环境连压 4 次、约 10 分钟）。现在两份
     * 钱分开显示，让人和 AI 都看得见在花哪一份；**判定强度一字未动**（仍是 core <= cap）。 */
    const grownNames = new Set(budget.projectGrownRules || ['project-domain-glossary']);
    const grown = [...grownChars.entries()].filter(x => grownNames.has(x[0])).reduce((a, x) => a + x[1], 0);
    const framework = core - grown;
    const over = core - cap;
    checkRow('always_on_budget', core <= cap,
      '框架自有 ' + framework + ' + 项目自长 ' + grown + '（词汇本等） = ' + core + ' / ' + cap + '（占用 ' + pct + '%）；合计 ' + total
      + '，分层 L0=' + layer.L0 + ' 自维护=' + layer['self-maintained'] + ' L1=' + layer.L1 + ' L2=' + layer.L2
      + '；单位=' + (budget.unit || 'body-chars-lf-normalized')
      /* B4-42：把"字符"翻回"token"给人与 AI 一个可比的量级。估算式 = CJK 字符×1 + 其余×0.35，
       * 对标本库常驻文本的一次实测（6266 字符 ≈ 4.4k token，误差约 ±10%——不同分词器结果不同，
       * 这里只要量级对，不要精确）。**只是披露，绝不进判定**：cap 仍按 body-chars 比。 */
      + '；估算 token≈' + Math.round(tok.cjk * 1 + tok.other * 0.35)
      + '（CJK ' + tok.cjk + ' 字符×1 + 其余 ' + tok.other + ' 字符×0.35，±10%，仅供比对宿主载入量）'
      + (over > 0 ? '；超出 ' + over + ' 字符——处置次序见 .qoder/commands/live-refresh.md「常驻预算顶格处置」：先压词汇本措辞 → 一次性口径移进 MRD 附录/项目交接 → 最后才考虑拆详表到按需加载规则；禁止删列结构省字' : ''));
  }
}

/* ==================== Check 9: migration-map.json 有效性 ==================== */
{
  /* ⚠️ 此前只看 `.qoder/migration-map.json` —— 而阶段 A 把台账随 SKILL 自拷贝落在
   * `.qoder/skills/better-coding/migration-map.json`，正确装配的项目**永远**走"文件不存在"分支
   * 并打成 PASS(SKIP)，即一条永不执行的死检（中段项目探针实跑抓到）。改为与 manifest 同一套候选路径。 */
  const rooted = (() => { try { const r = JSON.parse(readText(profilePath)).skillRoot; return r ? path.join(String(r), 'migration-map.json') : null; } catch { return null; } })();
  const mapCandidates = [
    ...(rooted ? [rooted] : []),
    path.join(qoderDir, 'migration-map.json'),
    path.join(qoderDir, 'skills', 'better-coding', 'migration-map.json'),
    path.join(SCRIPT_DIR, '..', '..', '..', 'migration-map.json'),
  ];
  const mapPath = mapCandidates.find(isFile) || null;
  let pass = true, detail = '';
  if (mapPath && isFile(mapPath)) {
    try {
      const map = JSON.parse(readText(mapPath));
      const missing = ['version', 'migrations'].filter(k => !Object.prototype.hasOwnProperty.call(map, k));
      if (missing.length === 0) {
        const mig = Array.isArray(map.migrations) ? map.migrations : null;
        if (mig && mig.length > 0) { pass = true; detail = `JSON valid, migrations: ${mig.length}（源 ${path.relative(projectRoot, mapPath)}）`; }
        else { pass = false; detail = 'migrations 为空'; }
      } else { pass = false; detail = `missing: ${missing.join(',')}`; }
    } catch (e) { pass = false; detail = `JSON parse error: ${e && e.message}`; }
  } else { detail = 'SKIP: 台账未随库落到已知位置（候选：.qoder/、.qoder/skills/better-coding/、profile.skillRoot）'; }
  checkRow('migration_map', pass, detail);
}

/* ==================== v9.6.1 S3：阶段 A 失败原因的白话覆盖对账（归"库一致性"组） =================
 * 两侧同在 references/phase-a-checklist.md：A.2 的 die() 原因枚举行（取值唯一源）与 A.5-④ 人话对照表
 * （说法唯一源）。新增/删除原因忘了配另一边，这里当场 FAIL。静态对账，不依赖被检运行的产物，
 * 故不属于"判据要求本次运行自己产出证据"那类第一轮闭不上的自锁判据。 */
{
  const rootedRC = (() => { try { const r = JSON.parse(readText(profilePath)).skillRoot; return r ? path.join(String(r), 'references', 'phase-a-checklist.md') : null; } catch { return null; } })();
  const rcCandidates = [
    ...(rootedRC ? [rootedRC] : []),
    path.join(qoderDir, 'skills', 'better-coding', 'references', 'phase-a-checklist.md'),
    path.join(SCRIPT_DIR, '..', '..', '..', 'references', 'phase-a-checklist.md'),
  ];
  const rcPath = rcCandidates.find(isFile) || null;
  const EXTRA_STATES = ['PHASE-A-NO-EXECUTOR', 'PHASE-A-PANEL-FAIL', 'PHASE-A-ROLLED-BACK', '第 0 步门槛未过（发卡）'];
  let rcPass = true, rcDetail = '';
  if (rcPath === null) {
    rcDetail = 'SKIP: 未找到 phase-a-checklist.md（候选：profile.skillRoot、.qoder/skills/better-coding/references/、脚本反推源库）——本轮不判，不等于已通过';
  } else {
    const rcText = readText(rcPath).replace(/\r\n/g, '\n');
    const enumLine = rcText.split('\n').find(l => l.includes('的原因枚举')) || '';
    const enumNames = [...enumLine.matchAll(/`([a-z0-9-]+)`/g)].map(m => m[1]).filter(x => x !== 'PHASE-A-COPY-FAIL:');
    const i4 = rcText.indexOf('### A.5-④ ');
    const i5 = rcText.indexOf('### A.5-⑤ ', i4 + 1);
    const secText = i4 >= 0 ? rcText.slice(i4, i5 > i4 ? i5 : undefined) : '';
    const tableKeys = secText.split('\n')
      .filter(l => /^\|\s*\S/.test(l))
      .map(l => String((l.split('|')[1] || '')).trim().replace(/^`+|`+$/g, ''))
      .filter(c => c && c !== '可观测串' && !/^[-\s|:]+$/.test(c));
    const required = [...enumNames, ...EXTRA_STATES];
    const missing = required.filter(x => !tableKeys.includes(x));
    const orphans = tableKeys.filter(x => !required.includes(x));
    if (enumNames.length === 0) { rcPass = false; rcDetail = '枚举行未找到（A.2 那行「的原因枚举」被改名？）→ 无从对账，按缺陷处理'; }
    else if (i4 < 0) { rcPass = false; rcDetail = `A.5-④ 白话表整节缺失（${enumNames.length} 条原因无人话说法）`; }
    else {
      rcPass = missing.length === 0;
      rcDetail = (rcPass ? `白话覆盖 ${required.length}/${required.length}（枚举 ${enumNames.length} + 非枚举态 ${EXTRA_STATES.length}）`
        : `缺人话的说法: ${missing.join(', ')}（修复：在 A.5-④ 补对应行，取值源仍是 A.2 枚举行）`)
        + (orphans.length ? `｜另有 ${orphans.length} 条白话行已无对应原因（${orphans.join(', ')}）属残留` : '')
        + `（源 ${path.relative(projectRoot, rcPath)}）`;
    }
  }
  checkRow('report_reason_coverage', rcPass, rcDetail);
}

/* ==================== Check 10: frontmatter 合法性抽样 ==================== */
{
  const fmFiles = [];
  for (const f of listFiles(rulesDir)) if (RULE_EXTS.includes(path.extname(f))) fmFiles.push({ name: f, full: path.join(rulesDir, f) });
  const skDir = path.join(qoderDir, 'skills');
  for (const d of listDirs(skDir)) if (isFile(path.join(skDir, d, 'SKILL.md'))) fmFiles.push({ name: `${d}/SKILL.md`, full: path.join(skDir, d, 'SKILL.md') });
  if (fmFiles.length === 0) {
    checkRow('frontmatter_valid', true, 'SKIP: no rule/skill components found');
  } else {
    const bad = [];
    for (const f of fmFiles) {
      /* v9.10.0 S0-b：刻意**不走 readText** —— 它做 `.replace(/\r\n/g,'\n')`（:62），于是 `\r\r\n`
       * 在这条判据眼里恰好被治成合法形状，而宿主拿到的首行是 `---\r`、比对不相等 ⇒ 整段
       * frontmatter 静默消失（真环境 Work009：skill 清单显示 "- better-coding: ---"，本行当时 PASS）。
       * BOM 也不剥：剥了就等于替宿主原谅它，归因交给下面的 byte_hygiene 点名。 */
      let raw = null;
      try { raw = fs.readFileSync(f.full, 'utf8'); } catch { bad.push(`${f.name}(读不到)`); continue; }
      const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      const ok = !!m && (/^\s*name\s*:/m.test(m[1]) || /^\s*description\s*:/m.test(m[1]));
      if (!ok) bad.push(f.name);
    }
    checkRow('frontmatter_valid', bad.length === 0, bad.length === 0
      ? `${fmFiles.length}/${fmFiles.length} frontmatter valid（首行按原始字节严格比对 ---，未做行尾归一）`
      : `${bad.length}/${fmFiles.length} invalid: ${bad.slice(0, 5).join(',')}${bad.length > 5 ? '…' : ''}（首行不是逐字的 --- ：多半是 BOM 或 \\r\\r\\n 双回车，见 byte_hygiene）`);
  }
}

/* ==================== Check 10b: 产物字节体检（v9.10.0 S0-a，FAIL） ====================
 * 为什么单独立一条：判据侧与宿主的**读法**不同，就会出现"判据全绿、宿主整层失效"。
 * v9.9.0 一批补丁把 4 个带 frontmatter 的文件写成每行 0D 0D 0A，全库 42 条判据一条没红，
 * 而 Qoder 把 SKILL.md 解析成了 description="---"。本行是那道"要比宿主更严"的兜底：
 * 一律 Buffer 直读，**禁止**经 readText / fmOf / stripFm。 */
{
  const DCRLF = Buffer.from('\r\r\n', 'latin1');
  const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
  const targets = [];
  const pushDir = (dir, exts) => { for (const f of listFiles(dir)) if (exts.some(x => f.toLowerCase().endsWith(x))) targets.push(path.join(dir, f)); };
  pushDir(rulesDir, ['.md']);
  pushDir(path.join(qoderDir, 'commands'), ['.md']);
  pushDir(path.join(qoderDir, 'agents'), ['.md']);
  pushDir(path.join(qoderDir, 'scripts'), ['.mjs', '.cjs', '.js']);
  for (const d of listDirs(path.join(qoderDir, 'skills'))) targets.push(path.join(qoderDir, 'skills', d, 'SKILL.md'));
  targets.push(path.join(qoderDir, 'settings.json'), profilePath, path.join(qoderDir, 'briefing-skeletons.md'),
    path.join(projectRoot, 'AGENTS.md'), liveDocPath, path.join(docsDir, '项目交接.md'));
  const seen = new Set();
  const dirty = [];
  let n = 0;
  for (const p of targets) {
    if (seen.has(p) || !isFile(p)) continue;
    seen.add(p);
    const buf = fs.readFileSync(p);
    n++;
    const rel = path.relative(projectRoot, p).split(path.sep).join('/');
    let dcrlf = 0; let at = -1;
    while ((at = buf.indexOf(DCRLF, at + 1)) >= 0) dcrlf++;
    const hasBom = buf.length >= 3 && buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2];
    if (dcrlf) dirty.push(`${rel} :: 双回车 ×${dcrlf}（每行 0D 0D 0A）`);
    if (hasBom) dirty.push(`${rel} :: UTF-8 BOM（会挡住宿主的 ^--- 首行比对）`);
    if (!dcrlf && !hasBom && buf.slice(0, 3).toString('utf8') === '---') {
      if (!/^---\r?\n/.test(buf.toString('utf8')) || !/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(buf.toString('utf8'))) {
        dirty.push(`${rel} :: 首行 --- 未严格闭合（宿主会当成没有 frontmatter）`);
      }
    }
  }
  checkRow('byte_hygiene', dirty.length === 0, n === 0
    ? 'SKIP: 装机产物里没有一个可体检的文件（首次装机前属正常，本行是"未验证"）'
    : dirty.length
      ? `${dirty.length}/${n} 件字节层不净：${dirty.slice(0, 3).join(' ｜ ')}${dirty.length > 3 ? `（共 ${dirty.length} 件）` : ''} —— 修法：字节级替换 \\r\\r\\n→\\r\\n（改完断言"抹掉全部 \\r 前后内容逐字节相同"），或重跑阶段 A；**不要**用"删掉重写"（会连带漂名字）`
      : `${n} 件产物字节体检全净（双回车 0｜BOM 0｜frontmatter 首行严格）`);
}

/* ==================== Check 10c: 应用清单单源（v9.10.0 S3，FAIL） ====================
 * 立据（Work009 真环境）：profile 里没有一个装应用清单的格子，AI 只能读 MRD §4.3 即兴组织语言，
 * 于是同一事实在一页里被写四遍、四种措辞（PROJECT-LIVE.md :195/:197/:201/:248），其中两句还各自
 * 下结论（"故本步不跳过"、"参数 {应用} 已绑定为 notehive"）。权威落 profile.project.apps，
 * 提示词只准照抄名字；分类与"做/跳"的结论留在 MRD 那一章。 */
{
  let profA = null;
  try { profA = JSON.parse(readText(profilePath) || 'null'); } catch { /* Check 3 已报 JSON 合法性，这里不重复 */ }
  const apps0 = appsOf(profA);
  if (!profA || !profA.project || !Array.isArray(profA.project.apps)) {
    checkRow('apps_single_source', true, 'SKIP: profile.project.apps 键不存在（v9.10.0 之前装的项目，按裁定不回刷；本行是"未验证"，不是"已通过"）');
  } else if (apps0.length === 0) {
    checkRow('apps_single_source', true, 'SKIP: profile.project.apps 为空＝1·1 Step0 应用分类尚未产出（本行是"未验证"，不是"已通过"）');
  } else {
    const problems = [];
    const TYPES = ['Backend-Only', 'Full-Stack'];
    const names = [];
    apps0.forEach((a2, i) => {
      const nm = String((a2 && a2.name) || '').trim();
      const ty = String((a2 && a2.type) || '').trim();
      const src = String((a2 && a2.source) || '').trim();
      if (!nm) problems.push(`apps[${i}].name 为空`);
      else if (/[\s/\\:*?"<>|]/.test(nm)) problems.push(`apps[${i}].name="${nm}" 含空格或文件名非法字符 → docs/prd/PRD-${nm}.md 会碎`);
      else names.push(nm);
      if (!TYPES.includes(ty)) problems.push(`apps[${i}].type="${ty || '(空)'}" 不在枚举 ${TYPES.join(' / ')}`);
      if (!src) problems.push(`apps[${i}].source 为空（P4：可推导项必须标来源，这里该写 MRD 章号）`);
    });
    const dup = [...new Set(names.filter((x, i) => names.indexOf(x) !== i))];
    if (dup.length) problems.push(`应用名重复：${j(dup)}（两份 PRD 会互相覆盖）`);
    /* A3 派生镜像：单应用场景 appType 必须与 apps[0].type 同源（appType 仍是手册折叠依据，不改它） */
    if (apps0.length === 1 && profA.appType && String(profA.appType) !== String(apps0[0] && apps0[0].type)) {
      problems.push(`appType="${profA.appType}" ≠ apps[0].type="${apps0[0] && apps0[0].type}"（单应用两份钱必须一致，权威在 apps[]）`);
    }
    /* A2 手册值段集合对账 + 括号说明必须逐字等于骨架模板那行的括号（自创注释即第二事实源） */
    const skelF = path.join(qoderDir, 'briefing-skeletons.md');
    const liveF = isFile(liveDocPath) ? readText(liveDocPath) : null;
    const LABS2 = ['本轮应用清单', '应用分类结论'];
    const tmplParen = {};
    if (isFile(skelF)) for (const blk of parseSkeleton(readText(skelF) || '')) for (const ll of linesOf(blk.prompt)) {
      for (const lab of LABS2) {
        const at2 = ll.indexOf(lab + COLON); if (at2 < 0) continue;
        const rest = ll.slice(at2 + lab.length + 1); const pi = rest.indexOf('（');
        if (pi >= 0 && !tmplParen[lab]) tmplParen[lab] = rest.slice(pi);
      }
    }
    let checkedLines = 0;
    if (liveF !== null) {
      const lv = linesOf(liveF);
      const want = new Set(names);
      for (let i = 0; i < lv.length; i++) {
        for (const lab of LABS2) {
          const at2 = lv[i].indexOf(lab + COLON); if (at2 < 0) continue;
          checkedLines++;
          const val = lv[i].slice(at2 + lab.length + 1);
          const pi = val.indexOf('（');
          const head = pi >= 0 ? val.slice(0, pi) : val;
          const paren = pi >= 0 ? val.slice(pi).trim() : '';
          const got = head.split(/[，,、；;]/).map(s => s.trim()).filter(s => s && !/\{[^{}]*\}/.test(s));
          if (!got.length) continue;                       // 未绑定：归 binding_stale 说话，本行不双报
          const miss = [...want].filter(x => !got.includes(x));
          const odd = got.filter(x => !want.has(x));
          if (miss.length || odd.length) problems.push(`『${lab}${COLON}』与 apps 集合不等（行 ${i + 1}：缺 ${j(miss) || '—'}｜清单外 ${j(odd) || '—'}）——权威是 profile.project.apps=${j(names)}，分类结论请写回 MRD`);
          if (tmplParen[lab] && paren !== tmplParen[lab].trim()) problems.push(`『${lab}${COLON}』的括号说明被换成自创句（行 ${i + 1}）：模板是${tmplParen[lab]}，这里写${paren || '（无括号）'}——要补的分类/结论请落进 MRD 那一章`);
        }
      }
    }
    /* A4 逐应用 PRD 在场（只在 maturity.prd=true 后判；大小写不比对，真名核归 filename_case） */
    let prdNote = 'prd 未定稿，未核逐应用在场';
    if (profA.maturity && profA.maturity.prd === true) {
      const have = listFiles(path.join(docsDir, 'prd')).filter(f => /^PRD-.*\.md$/i.test(f));
      const low = have.map(f => f.toLowerCase());
      const missPrd = names.filter(nm => !low.includes(`prd-${nm}.md`.toLowerCase()));
      const stray = have.filter(f => !names.some(nm => f.toLowerCase() === `prd-${nm}.md`.toLowerCase()));
      if (missPrd.length) problems.push(`maturity.prd=true 但清单里的应用缺 PRD：${j(missPrd.map(nm => `docs/prd/PRD-${nm}.md`))}`);
      if (stray.length) problems.push(`docs/prd/ 有应用不在清单里的 PRD：${j(stray)}（文件名里的应用未登记进 profile.project.apps）`);
      prdNote = `逐应用 PRD ${names.length - missPrd.length}/${names.length} 在场${stray.length ? `｜清单外 ${stray.length} 份` : ''}`;
    }
    checkRow('apps_single_source', problems.length === 0, problems.length
      ? `${problems.length} 处 [${head3(problems)}]`
      : `apps=${j(names)}｜手册 ${checkedLines} 处值段同源｜${prdNote}｜type 枚举与 source 标注齐备`);
  }
}

/* ==================== Check 10d: 已可绑参数不得滞留占位（v9.10.0 S4，FAIL） ====================
 * 立据：Work009 里 profile.project.name 早已是用户确认的 notehive（pendingPlaceholders.projectName
 * = filled），手册下游提示词框里却还有 6 处 `{项目代号}` + 1 处 `{MRD路径}` 没回填 —— 用户复制 2·1
 * 那段就得自己填路径。而 prompt_params 把"占位符还在"一律记成合法态，分不清"还没到"与"早该绑了"。
 * 分工：prompt_params 管"参数有没有被静默丢掉"，本行管"已可绑的有没有当轮绑掉"，互不顶替。
 * 只扫提示词**代码框内部** ⇒ 产物表/进度表/环节说明这些"命名模式"行天然豁免，不需要白名单。 */
{
  let profB = null;
  try { profB = JSON.parse(readText(profilePath) || 'null'); } catch { /* Check 3 已报，这里不重复 */ }
  const skelF2 = path.join(qoderDir, 'briefing-skeletons.md');
  const liveF2 = isFile(liveDocPath) ? readText(liveDocPath) : null;
  const READY = buildReady(profB);
  /* 双向 roster：骨架『参数绑定表』第 4 格标「机检」的参数集合，必须与 READY 的键集合相等。
   * 单向核 = 改了表没改代码时没人知道（本库反复在杀的那一类）。 */
  const skelT = isFile(skelF2) ? readText(skelF2) : null;
  const marks = [];
  if (skelT !== null) for (const l of linesOf(skelT)) {
    /* 一格可以点名多个参数（`| {应用名}/{应用} | … |` ⇒ 两行历史遗留合一），
     * 所以取首格里**全部** {名字}，第 4 格对该行的每个参数都生效。 */
    const m = /^\|\s*(\{[^|\n]+\}[^|\n]*)\|([^|]*)\|([^|]*)\|\s*([^|\s][^|]*?)\s*\|\s*$/.exec(l);
    if (!m) continue;
    const cellNames = [...String(m[1]).matchAll(/\{([^{}]+)\}/g)].map(x => x[1].trim());
    if (!cellNames.length) continue;
    for (const cn of cellNames) marks.push({ name: cn, mark: m[4].trim() });
  }
  const hasCol = marks.some(m => m.mark === '机检' || m.mark === '未纳入');
  if (skelT === null || liveF2 === null || !hasCol) {
    checkRow('binding_stale', true, 'SKIP: 骨架『参数绑定表』尚无「机检」列或手册缺失（旧骨架未回刷）——本行是"未验证"，不是"已通过"');
  } else {
    const rosterBad = [];
    const marked = new Set(marks.filter(m => m.mark === '机检').map(m => m.name));
    const coded = new Set(Object.keys(READY));
    const onlyTable = [...marked].filter(x => !coded.has(x));
    const onlyCode = [...coded].filter(x => !marked.has(x));
    if (onlyTable.length) rosterBad.push(`表里标「机检」却无机器谓词：${j(onlyTable)}（改表必须同批改 buildReady，否则这条对账形同虚设）`);
    if (onlyCode.length) rosterBad.push(`READY 里有谓词而表里不是「机检」：${j(onlyCode)}（机器侧私加）`);
    const ordOf = t => { const m = new RegExp('^(\\d+)' + DOT + '(\\d+)$').exec(String(t)); return m ? Number(m[1]) * 100 + Number(m[2]) : -1; };
    let held = 0, exemptN = 0;
    const staleList = [];
    for (const [tok, blkInfo] of STEP_BODIES) {
      const body = blkInfo && blkInfo.body;
      if (!body) continue;
      for (const [name, spec] of Object.entries(READY)) {
        const cnt = (body.match(new RegExp('\\{' + esc(name) + '\\}', 'g')) || []).length;
        if (!cnt) continue;
        held += cnt;
        if (!spec.ok() || ordOf(tok) <= ordOf(spec.by)) { exemptN += cnt; continue; }
        staleList.push({ tok, name, cnt, why: spec.why(), by: spec.by });
      }
    }
    const staleCnt = staleList.reduce((a, s) => a + s.cnt, 0);
    checkRow('binding_stale', rosterBad.length === 0 && staleList.length === 0,
      [
        rosterBad.length ? `谓词表与绑定表脱账：${head3(rosterBad)}` : '',
        staleList.length ? `${staleList.length} 个参数位共 ${staleCnt} 处该绑未绑：${staleList.slice(0, 3).map(s => `{${s.name}}×${s.cnt}@${s.tok}`).join(' ')}${staleList.length > 3 ? `（共 ${staleList.length} 位）` : ''} —— 例：${staleList[0].by} 之后第 ${staleList[0].tok} 步框内仍有 {${staleList[0].name}}，而权威值已在场（${staleList[0].why}）；修复：执行一次 3 步同步回填（产物表里的命名模式不受本行约束）` : '',
      ].filter(Boolean).join(' ｜ ')
      || `${coded.size} 个机检参数：框内占位 ${held} 处，其中权威值未到场或属生产者自身步而豁免 ${exemptN} 处；已可绑的 0 处滞留｜表与机器谓词 ${marked.size}/${coded.size} 双向对账一致`);
  }
}

/* ==================== Check 11/12: WARNING 级文档体检 ==================== */
{
  const live = isFile(liveDocPath) ? readText(liveDocPath) : null;
  if (live !== null) {
    const wf = sliceSection(live, 'workflow');
    if (wf !== null) {
      const n11 = linesOf(wf).filter(l => /^###\s/.test(l) && l.includes('环节')).length;
      if (n11 !== 9) rows.push('  - stage_main_rows      WARNING (环节标题数=' + n11 + '，期望 9；横切 Hooks 不占编号环节)');
      const n12 = (wf.match(/(?<![`~])~(?!`)/g) || []).length;
      if (n12 > 0) rows.push(`  - md_escape_hazard      WARNING (workflow 区含 ${n12} 个裸 ~ 字符，可能导致删除线渲染)`);
    }
  }
}

/* ============================================================
   以下为 Task 3.3 新增断言（V2-V18），孪生里没有对应项
   ============================================================ */

/* V2 规则扩展名：平台加载器只收小写 .md（不 toLowerCase），.mdc / .MD 一律静默不加载 */
{
  const bad = [];
  let md = 0, mdc = 0;
  for (const f of listFiles(rulesDir)) {
    if (f === 'README.md') continue;
    const ext = path.extname(f);
    if (ext === '.mdc') { mdc++; bad.push(`${f}(.mdc 不被加载)`); continue; }
    if (ext === '.md') { md++; continue; }
    if (ext.toLowerCase() === '.md') bad.push(`${f}(扩展名大小写非常形，加载器不 toLowerCase)`);
    else bad.push(`${f}(非 .md 扩展名)`);
  }
  checkRow('rules_extension', bad.length === 0, bad.length
    ? `md=${md} mdc=${mdc} 违规=${bad.length} [${bad.slice(0, 4).join(' | ')}]`
    : `md=${md} mdc=${mdc}：全部为小写 .md（E11/E18 的静默不加载类缺陷已消除）`);
}

/* V3/V4/V5 规则触发契约：缺 trigger 或值未识别 → 回落 always_on（意外常驻）；值合法但必填键缺 → 降 manual（永不注入） */
{
  const TRIG = ['always_on', 'manual', 'glob', 'model_decision'];
  const bad = [];
  let ao = 0, scanned = 0;
  for (const f of uniq(listFiles(rulesDir).filter(x => RULE_EXTS.includes(path.extname(x))))) {
    const s = readText(path.join(rulesDir, f));
    if (s === null) continue;
    scanned++;
    const fm = fmOf(s);
    if (!fm) { bad.push(`${f}: 无 frontmatter → 平台默认 always_on`); continue; }
    const t = (fm.match(/^\s*trigger:\s*(\S+)\s*$/m) || [])[1];
    if (!t) bad.push(`${f}: 缺 trigger: → 回落 always_on`);
    else if (!TRIG.includes(t)) bad.push(`${f}: trigger=${t} 未识别 → 静默常驻`);
    if (/^\s*globs\s*:/m.test(fm)) bad.push(`${f}: 用了 globs: 键 → 降为 manual，永不注入`);
    if (t === 'glob' && !/^\s*(glob|paths)\s*:\s*\S/m.test(fm)) bad.push(`${f}: trigger=glob 但无 glob:/paths: → manual`);
    if (t === 'model_decision' && !/^\s*description:\s*\S/m.test(fm)) bad.push(`${f}: model_decision 无 description → manual`);
    if (t === 'always_on') ao++;
  }
  if (scanned === 0) checkRow('rules_trigger', true, 'SKIP: 无规则文件');
  else checkRow('rules_trigger', bad.length === 0, bad.length
    ? `${bad.length} 处违规 [${bad.slice(0, 3).join(' | ')}]`
    : `${scanned} 个规则 trigger 全部 ∈ 四枚举且必填键齐备（always_on=${ao}）`);
}

/* V7 tools / matcher 名单：白名单不做别名归一化，未知名静默丢弃 = 拿到比声明更少的权限且不报错 */
{
  const KNOWN = ['Read', 'Write', 'Edit', 'NotebookEdit', 'Grep', 'Glob', 'Bash', 'SearchKnowledge',
    'Agent', 'Skill', 'TodoWrite', 'AskUserQuestion'];
  const bad = [];
  for (const f of listFiles(path.join(qoderDir, 'agents'))) {
    if (!f.endsWith('.md')) continue;
    const s = readText(path.join(qoderDir, 'agents', f)) ?? '';
    const line = (linesOf(fmOf(s)).find(l => /^\s*tools:/.test(l)) || '');
    for (const t of line.replace(/^\s*tools:/, '').replace(/[[\]()]/g, '').split(',').map(x => x.trim()).filter(Boolean)) {
      if (!KNOWN.includes(t)) bad.push(`agents/${f}:${t}`);
    }
  }
  const names = [];
  if (isFile(settingsPath2())) {
    try {
      const st = JSON.parse(readText(settingsPath2()));
      for (const groups of Object.values((st && st.hooks) || {})) {
        for (const g of Array.isArray(groups) ? groups : []) {
          const m = String(g.matcher || '');
          if (m) names.push(...m.split('|').map(x => x.trim()).filter(Boolean));
        }
      }
    } catch { /* Check 5 已报 */ }
  }
  const unknownMatchers = uniq(names).filter(n => !KNOWN.includes(n) && n !== '.*');
  const ghosts = [];
  /* 反面教材豁免（与库侧 checks/03 的 DEAD_WORDS 同一判据，改一处必须同步另一处）：
     教模型「别用 X」的句子必然出现 X，一律判 0 会得到永不可绿的断言。
     判据从"整篇"改"逐行"：整篇判会让一句反面举例污染整份文件，而真实故障面只有两种
     ——agent 的 tools: 白名单行与 settings 的 matcher 值，都由另两条断言精确把关。 */
  const GHOST_DEAD = /不存在|静默丢弃|实际只拿到|归一表|不做.{0,6}归一|已删|勿用|不要用|失效/;
  const GHOST_RE = /\bSearchReplace\b|\bSearchCodebase\b|\bMultiEdit\b/;
  for (const dir of [rulesDir, path.join(qoderDir, 'agents'), path.join(qoderDir, 'skills')]) {
    for (const f of walkText(dir, /\.(md|mdc|json)$/)) {
      const hit = linesOf(readText(f) ?? '\n')
        .some(l => GHOST_RE.test(l) && !GHOST_DEAD.test(l));
      if (hit) ghosts.push(path.relative(qoderDir, f));
    }
  }
  checkRow('tool_names', bad.length === 0 && unknownMatchers.length === 0 && ghosts.length === 0,
    `agent tools 未知名=${bad.length} [${bad.slice(0, 3).join(' | ')}]；matcher 未知名=${unknownMatchers.length} [${unknownMatchers.slice(0, 3).join(',')}]；幽灵工具名=${ghosts.length} [${ghosts.slice(0, 2).join(',')}]`);
  function settingsPath2() { return path.join(qoderDir, 'settings.json'); }
}

/* V8 占位桩检测：桩只记日志不拦截，用户以为门禁在生效 = 比没有门禁更危险。
 * D10：桩=0 不等于"每个门禁都拦得动"。已注册 handler 里**代码上不存在阻断出口**的那些
 * 是设计为只记录/只提示的显式放行分支（如 audit-log、post-edit-format）——它们不是桩，
 * 但用户必须看得见有几处、是哪些，否则这一行的 PASS 会被读成"所有门禁都会拦"。 */
{
  const stubRe = /#\s*harness:stub\b/;
  const hits = [];
  for (const f of listFiles(path.join(qoderDir, 'hooks'))) {
    const s = readText(path.join(qoderDir, 'hooks', f)) ?? '';
    if (stubRe.test(s)) hits.push('hooks/' + f);
  }
  for (const f of ['harness.mjs', 'hook-ask-card.mjs']) {
    const s = readText(path.join(qoderDir, 'scripts', f));
    if (s !== null && stubRe.test(s)) hits.push('scripts/' + f);
  }
  const hs = readText(path.join(qoderDir, 'scripts', 'harness.mjs'));
  const passThrough = [];
  if (hs) for (const [, hname, fname] of hs.matchAll(/^\s*'([a-z0-9-]+)':\s*(hook[A-Za-z]+),/gm)) {
    const from = hs.indexOf(`function ${fname}(`);
    if (from < 0) { passThrough.push(`${hname}(找不到实现)`); continue; }
    const to = hs.indexOf('\n}', from);
    if (!/\breturn 2\b/.test(hs.slice(from, to < 0 ? undefined : to))) passThrough.push(hname);
  }
  checkRow('hook_stubs', hits.length === 0,
    hits.length ? `桩 ${hits.length} 个 [${hits.join(', ')}]——这些事件当前只记日志不拦截，真实逻辑按阶段 B 技术栈确定后填充`
      : `门禁桩=0（三平台同口径的磁盘普查）；${hs ? `另有 ${passThrough.length} 个显式放行分支（实现里没有阻断出口，只记录/只提示）: ${passThrough.join(', ') || '无'}` : '放行分支数不可知：未找到 scripts/harness.mjs（不猜 0）'}`);
}

/* V9 面板必须真的选中已打包的 ELK：Mermaid 11 的 flowchart.layout 静默无效，只有顶层 layout 生效 */
{
  const panel = readPanel();
  if (panel === null) { checkRow('panel_elk_layout', false, `面板文件缺失（${panelPath}）`); }
  else {
    const init = panel.match(/mermaid\.initialize\(\s*\{[\s\S]{0,1400}?\}\s*\)/);
    if (!init) { checkRow('panel_elk_layout', false, 'mermaid.initialize 块未找到（拼接未注入引擎配置）'); }
    else {
      const body = init[0].replace(/^\s*mermaid\.initialize\(\s*/, '').replace(/^\s*\/\/.*$/gm, '');
      const topLevel = /(^|[{,])\s*layout\s*:\s*["']elk["']/.test(body);
      const dagreKeys = /nodeSpacing|rankSpacing/.test(body);
      const fenceTrick = /%%\{[^}]*"layout"\s*:\s*"elk"/.test(panel);
      checkRow('panel_elk_layout', topLevel && !dagreKeys && !fenceTrick,
        `顶层 layout:elk=${topLevel} dagreOnlyKeys=${dagreKeys} fenceInitTrick=${fenceTrick}`);
    }
  }
}

/* V10 skill 目录名即解析名：name 与 dirname 不等 → 按目录名解析时拿到的是另一个 skill 或找不到 */
{
  const skDir = path.join(qoderDir, 'skills');
  const globalSkills = new Set(listDirs(path.join(os.homedir(), '.qoder-cn', 'skills')));
  const bad = [];
  let n = 0;
  for (const d of listDirs(skDir)) {
    const p = path.join(skDir, d, 'SKILL.md');
    if (!isFile(p)) continue;
    n++;
    const fm = fmOf(readText(p) ?? '');
    const name = (fm.match(/^\s*name:\s*(\S+)\s*$/m) || [])[1];
    if (!name) bad.push(`${d}: 无 name:`);
    else if (name !== d) bad.push(`${d}: name=${name}（按目录名解析，不等即错装配）`);
    else if (globalSkills.has(d)) bad.push(`${d}: 与 ~/.qoder-cn/skills/${d} 同名 → 遮蔽（会出现两份 SKILL.md）`);
  }
  if (n === 0) checkRow('skill_dirname_match', true, 'SKIP: 无 skill 目录');
  else checkRow('skill_dirname_match', bad.length === 0,
    bad.length ? `${bad.length}/${n} 违规 [${bad.slice(0, 3).join(' | ')}]` : `${n} 个 skill 目录名与 frontmatter name 一致，且不与 ~/.qoder-cn/skills/ 同名（已装 ${globalSkills.size} 个）`);
}

/* V11 选择卡契约防回潮四条（E3/E22/E23） */
{
  const rulePath = path.join(rulesDir, 'ask-card-option-quality.md');
  const rule = readText(rulePath);
  const scripts = ['harness.mjs', 'hook-ask-card.mjs'].map(f => readText(path.join(qoderDir, 'scripts', f))).filter(s => s !== null).join('\n');
  const problems = [];
  const marks = [];
  if (rule === null) { problems.push('规则 ask-card-option-quality.md 缺失'); }
  else {
    if (!rule.includes('契约 v10')) problems.push('规则缺版本标记『契约 v10』');
    marks.push((rule.match(/契约\s*v(\d+)/) || [])[1] || '-');
  }
  const scanTargets = [];
  for (const f of walkText(rulesDir, /\.(md|mdc)$/)) scanTargets.push(f);
  for (const f of walkText(path.join(qoderDir, 'skills'), /\.md$/)) {
    /* 台账件豁免：CHANGELOG.md 里的退役字面量是历史留痕，不是活契约复述（P0-1 搬出物的必然配套）。
       豁免只认这一个文件名，不是通用开关 —— 反证测试见方案门禁 G4。 */
    if (/CHANGELOG\.md$/.test(f)) continue;
    scanTargets.push(f);
  }
  for (const f of walkText(path.join(qoderDir, 'agents'), /\.md$/)) scanTargets.push(f);
  let v9 = 0, recAnchor = 0, labelMark = 0;
  const samples = [];
  // 判据自身不许包含被禁字面量：本脚本会随库落进 .qoder/skills/better-coding/，
  // 写死的 'A · ' 会被自己扫出来（与 checks/02 里"禁止某写法必然提到该写法"同一类陷阱），
  // 因此从码点拼出来。
  const ANCHOR = new RegExp('(?<=^|[\\s`|（(])' + 'A' + '[ \\u00A0]+' + DOT + '[ \\u00A0]+');
  const LABEL_MARK = [/"label"\s*:\s*"[^"]*（推荐）/, /label\s*=\s*"[^"]*（推荐）/];
  // "禁止某写法"的那句话必须写出该写法，一律判 0 会得到永不可绿的断言（checks/02 同款豁免）
  const DEAD = /不得|禁止|不许|不要|已失效|应写作|而非|不写|删除/;
  for (const f of scanTargets) {
    for (const line of linesOf(readText(f) ?? '')) {
      v9 += (line.match(/候选值】|选项：A=/g) || []).length;
      const a = line.match(ANCHOR) || [];
      const l = LABEL_MARK.reduce((n, re) => n + ((line.match(re) || []).length), 0);
      if (!DEAD.test(line)) { recAnchor += a.length; labelMark += l; }
      if ((a.length || l) && DEAD.test(line) && samples.length < 2) samples.push(path.relative(qoderDir, f));
    }
  }
  // 「（推荐）」在散文里出现是必要表述（禁止它的那段话必然包含它），只在真实 label 取值内判 0
  if (v9) problems.push(`四类 v9 字面量中的『候选值】/选项：A=』残留 ${v9} 处（复述契约即第二事实源）`);
  if (labelMark) problems.push(`label 取值内写「（推荐）」${labelMark} 处（徽标由平台硬挂第 1 项，H11）`);
  if (recAnchor) problems.push(`字母锚点「A${DOT} 」形态残留 ${recAnchor} 处（label 已是可见字段，手工编号即冗余锚点）`);
  if (!/H10/.test(scripts) || !/H11/.test(scripts)) problems.push('hook 判据缺 H10/H11');
  if (/\bH8\b|\bH9\b/.test(scripts)) problems.push('hook 判据仍含 H8/H9（v9 集合未更新）');
  marks.push((scripts.match(/契约\s*v(\d+)/) || [])[1] || '-');
  if (marks[0] !== marks[1]) problems.push(`规则与 hook 的契约版本号不等（${marks[0]} vs ${marks[1]}）——改了规则忘改 hook 的形态`);
  checkRow('ask_card_contract', problems.length === 0,
    problems.length ? problems.join(' | ') : `规则含契约 v10；v9 字面量/v9 锚点/label 内推荐标记残留 0；hook 判据含 H10H11 不含 H8H9；规则与 hook 版本号同为 v${marks[0]}`);
}

/* v9.4.0 S3：给两条 stamp 判据的 SKIP 加**期限**。
 * 旧形状：无心跳 → `checkRow(name, true, 'SKIP: …')` 永远为真。宿主 spawn 不到解释器时，全部注册 hook
 * 静默空转（实测退出码 127，而阻断契约只认 2 ⇒ 不阻断、不报错、不留痕），校验器却一行不红——"未验证"与"通过"同色。
 * ⚠️ 期限不用"会话数"：心跳本身就是会话计数的唯一来源，无心跳时无从计数（那正是旧版永久 SKIP 的成因）。
 * 改用**装机时刻距今的时长**：env.probedAt（v9.4.0 起有）→ 回退 history 的 init 日期 → 再回退 settings.json mtime。 */
const STAMP_GRACE_HOURS = 24;
let stampAgeHours = null;
{
  let atMs = NaN;
  try {
    const pj = JSON.parse(readText(profilePath) || '{}');
    atMs = Date.parse((pj && pj.env && pj.env.probedAt) || '')
        || Date.parse(((Array.isArray(pj && pj.history) ? pj.history.find(h => h && h.action === 'init') : null) || {}).date + 'T00:00:00')
        || NaN;
  } catch { }
  if (!Number.isFinite(atMs)) { try { atMs = fs.statSync(path.join(qoderDir, 'settings.json')).mtimeMs; } catch { } }
  if (Number.isFinite(atMs)) stampAgeHours = (Date.now() - atMs) / 3600000;
}
/* v9.9.0 S8（治 D4）：旧文案是一句断言——"解释器很可能不可达 ⇒ 全部注册 hook 零拦截力"，
 * 还直接开处置（查 PATH → 重启 Qoder）。真环境它在装机后 62 分钟就触发，而当时 audit-log
 * 与 auto-finalize 都在正常写（解释器明明可达）⇒ AI 照它向用户误报了一次装机故障。
 * 现在文案只列候选原因；归因由 verify_stamp 分支按 audit 留痕分流后决定给哪一支。 */
const stampRemedy = (ev, aliveElsewhere) => aliveElsewhere
  ? '但同日 audit 显示其它 hook（PostToolUse/UserPromptSubmit）在正常写入 ⇒ 解释器可达：缺的不是环境，而是 ' + ev + ' 这一条——查 .qoder/settings.json 里该事件的注册是否被删改、以及该 hook 是否报错退出。'
  : '候选原因（按证据分流，别当结论）：① 本会话还没发生过 Stop/SessionStart，留痕只可能在事件之后出现；② 宿主执行 hook 的环境里解释器不可达（spawn 失败退出码 127，而阻断契约只认 2 ⇒ 全部注册 hook 零拦截力且不报错）——只有这一种才谈"确认 node 在系统 PATH → 重启 Qoder"；③ .qoder/settings.json 的 ' + ev + ' 注册被删改或 hook 起进程即失败。';

/* V12 rules.stamp 集合差（E11 的机器证明）。前置：先有心跳，否则 stamp 为空无法归因 */
{
  const heartbeat = path.join(logsDir, 'heartbeat.jsonl');
  const stamp = path.join(logsDir, 'rules.stamp');
  if (!isFile(heartbeat)) {
    if (stampAgeHours !== null && stampAgeHours > STAMP_GRACE_HOURS) {
      checkRow('rules_loaded_stamp', false, `装机距今已 ${Math.round(stampAgeHours)} 小时（宽限 ${STAMP_GRACE_HOURS}h）仍无任何 SessionStart/InstructionsLoaded 留痕 → 已不能再归因于"本会话钩子刚注册"。${stampRemedy('SessionStart + InstructionsLoaded')}`);
    } else {
      checkRow('rules_loaded_stamp', true, 'SKIP: 无 SessionStart 心跳（SessionStart/InstructionsLoaded 只在新会话出现，实测 ≥1 轮延迟）。本轮不判，下次会话自动补判——本行是"未验证"，不是"已通过"');
    }
  } else {
    /* ⚠️ 口径修正（活体取证抓到的假红）：平台只在会话启动时注入 `trigger: always_on` 的规则，
     * `model_decision` / `glob` 两类**本来就不该出现在开场戳里**（前者按模型判断、后者按被触碰的文件）。
     * 原来拿"磁盘全部规则"当期望值 → 真实项目第一次真跑 hook 后就永久 FAIL（实测 16 磁盘 / 5 常驻）。 */
    const allRules = uniq(listFiles(rulesDir).filter(f => path.extname(f) === '.md').map(f => path.basename(f, '.md'))).sort();
    const alwaysOn = allRules.filter(n => /trigger:\s*always_on/.test(readText(path.join(rulesDir, n + '.md')) || ''));
    const onDemand = allRules.length - alwaysOn.length;
    if (!isFile(stamp)) {
      checkRow('rules_loaded_stamp', false, `心跳存在但 ${path.relative(projectRoot, stamp)} 缺失 → InstructionsLoaded 通道未发或规则确实一个都没加载`);
    } else {
      const lines = linesOf(readText(stamp) ?? '').filter(Boolean);
      const loaded = new Map();
      for (const l of lines) {
        try {
          const o = JSON.parse(l);
          if (!o.file_path) continue;
          if (String(o.file_path).replace(/\\/g, '/').includes('/.qoder/rules/')) {
            loaded.set(path.basename(String(o.file_path).replace(/\\/g, '/'), '.md'), o);
          }
        } catch { /* 半行忽略 */ }
      }
      const missing = alwaysOn.filter(n => !loaded.has(n));
      const badKeys = [...loaded.values()].filter(o => !o.memory_type || !o.load_reason).length;
      checkRow('rules_loaded_stamp', missing.length === 0 && badKeys === 0,
        missing.length || badKeys
          ? `常驻规则 ${alwaysOn.length} 条 / 已加载戳 ${loaded.size} 条；未加载=[${missing.slice(0, 5).join(', ')}]；键名缺失=${badKeys}（file_path/memory_type/load_reason 任一为空即探针读错键）`
          : `${loaded.size}/${alwaysOn.length} 条常驻规则有加载戳，memory_type/load_reason 均在场（另有 ${onDemand} 条按需类规则不计入：model_decision 按判断加载、glob 按触碰文件加载）`);
    }
  }
}

/* V13 verify.stamp：校验结论必须由 Stop hook 落盘留痕（AI 手写不了的那条路径语义靠时间戳比对） */
{
  const stamp = path.join(logsDir, 'verify.stamp');
  /* 与 rules_loaded_stamp 同口径（v9.3.0 S1）：留痕只在一次 Stop 之后才可能出现，
   * 而 SessionStart 心跳只在新会话注入 —— 所以"本会话连心跳都没有"时缺留痕属无法取证，不是问题。
   * v9.4.0 S3 收紧两格：
   * ① 无心跳不再是永久 SKIP——装机超过宽限期仍无心跳即判 FAIL（旧写法让"宿主 spawn 不到解释器"
   *    这一整类故障永远只表现为一行黄字，甚至黄字都没有）。
   * ② 有心跳却无 verify.stamp 由 WARNING 升 **FAIL**：心跳存在说明装机那个会话已经结束，
   *    它的 Stop 必然跑过一次，留痕仍缺席只能是 stop-verify 真的没跑起来（不是时序问题）。
   *    这是收紧判据，不是放宽——若它日后判红，改代码不改本判据。 */
  if (!isFile(path.join(logsDir, 'heartbeat.jsonl'))) {
    if (stampAgeHours !== null && stampAgeHours > STAMP_GRACE_HOURS) {
      checkRow('verify_stamp', false, `装机距今已 ${Math.round(stampAgeHours)} 小时（宽限 ${STAMP_GRACE_HOURS}h）仍无心跳也无校验留痕。${stampRemedy('Stop + SessionStart')}`);
    } else {
      checkRow('verify_stamp', true, 'SKIP: 无 SessionStart 心跳且无校验留痕（钩子本会话刚注册，留痕只会在一次 Stop 之后出现）。本轮不判，下次会话自动补判——本行是"未验证"，不是"已通过"；与 rules_loaded_stamp 同口径');
    }
  } else if (!isFile(stamp)) {
    /* v9.9.0 S8：先取证再定罪。audit-*.log 是所有 hook 共用的留痕面，从它能区分
     * "Stop 根本没发生过（时序未到）"与"Stop 发生过却没落痕（真故障）"。旧写法把前者当
     * 后者报，还给出重启建议，实测把 AI 带偏去误报装机故障。 */
    const auditText = listFiles(logsDir).filter(f => /^audit-\d{4}-\d{2}-\d{2}\.log$/.test(f)).map(f => readText(path.join(logsDir, f)) || '').join('\n');
    const sawStop = /[|][ ]*Stop[ ]*[|]/.test(auditText);
    const sawOther = /[|][ ]*(PostToolUse|UserPromptSubmit)[ ]*[|]/.test(auditText);
    if (sawStop) {
      checkRow('verify_stamp', false, path.relative(projectRoot, stamp) + ' 缺失——同日 audit 里有 Stop 记录（audit-log 在同一事件上写成功了），stop-verify 却未落痕 ⇒ 该条注册缺失或起进程即失败。' + stampRemedy('Stop', sawOther));
    } else if (sawOther) {
      checkRow('verify_stamp', true, 'SKIP: 有心跳与 PostToolUse 留痕、但 audit 里还没有 Stop 记录 ⇒ 本会话尚未收尾过一轮，verify.stamp 只可能在一次 Stop 之后出现。本行是「未验证」，不是「已通过」，更不是故障（解释器可达已由同日 audit 证明）。');
    } else if (stampAgeHours !== null && stampAgeHours > STAMP_GRACE_HOURS) {
      checkRow('verify_stamp', false, path.relative(projectRoot, stamp) + ' 与 audit 留痕双双缺席，且装机已 ' + Math.round(stampAgeHours) + ' 小时（宽限 ' + STAMP_GRACE_HOURS + 'h）——手跑校验不算留痕。' + stampRemedy('Stop + PostToolUse', sawOther));
    } else {
      checkRow('verify_stamp', true, 'SKIP: 无 Stop 记录也无 audit 留痕（钩子本会话刚注册或尚未收尾）。本轮不判，下次会话自动补判——本行是「未验证」，不是「已通过」；与 rules_loaded_stamp 同口径');
    }
  }
  else {
    const ls = linesOf(readText(stamp) ?? '').filter(Boolean);
    let last = null;
    for (let i = ls.length - 1; i >= 0; i--) { try { last = JSON.parse(ls[i]); break; } catch { /* 继续回溯 */ } }
    if (!last) { warnRow('verify_stamp', 'verify.stamp 无合法 JSON 行'); }
    else {
      const profM = isFile(profilePath) ? fs.statSync(profilePath).mtimeMs : 0;
      const atMs = Date.parse(last.at || '') || (last.at ? NaN : 0);
      const newer = Number.isNaN(atMs) ? false : atMs >= profM - 1000;
      const okSource = last.source === 'stop-verify-hook';
      const pendingStarted = okSource && last.phase === 'started';
      /* 健康态必须是 PASS：本判据此前无条件 warnRow，于是每次校验的告警清单里都躺着一行
       * "其实没事"，真需要处理的归因存疑条目混在里面没人看（真实项目仿真实测实测到）。 */
      const healthy = okSource && newer && last.exit === 0;
      if (pendingStarted) {
        /* v9.5.0 S9：最近一条是**本次 Stop 自己**落的 started 行 ⇒ 留痕在场、收尾行尚未产生。
         * 判 PASS 而不是"未验证"——本判据要证明的就是"Stop hook 起得来进程"，started 行本身就是证据。
         * 收紧未放松：真故障形状（有心跳而 verify.stamp 压根不存在）仍走上面那格 FAIL。
         * 新增可见性：started 长期没有收尾行 = 校验器中途崩或被超时杀（旧实现里它与"hook 没注册"
         * 共用"无 stamp"外观，两者不可分）。 */
        rows.push(row('verify_stamp', 'PASS', `本次 Stop 正在跑校验（最近一条 phase=started at=${last.at}）→ 留痕在场即 hook 已起进程，收尾行随后追加`));
      } else if (healthy) {
        rows.push(row('verify_stamp', 'PASS', `最近一条 source=${last.source} exit=${last.exit} at=${last.at}｜晚于 profile 写入=${newer}`));
      } else {
        warnRow('verify_stamp', `最近一条 source=${last.source} exit=${last.exit} at=${last.at}｜晚于 profile 写入=${newer}`);
        extra.push(`  ! verify_stamp 归因存疑：source=${last.source} 时间序=${newer} exit=${last.exit}（应为 stop-verify-hook 且晚于 profile 改写、exit=0）`);
      }
    }
  }
}

/* ==================== v9.5.0 S4：git_ready（新增时是第 37 行，归"项目状态"组） ====================
 * 为什么必须有这一行：v9.5.0 S3 把 .gitattributes 从"装机无条件写"改成"按需写"，那就必须有一条
 * 判据保证**有仓库就一定有钉**，否则 S3 是削弱保护而不是搬移时机。而在 S4 之前，36 项判据里
 * 与 git 状态有关的是 **0 条**（spec 取证 3）——"承重资产无人核"正是本库反复在杀的那类缺陷。
 * 八格矩阵（无未定义格）：见实施 spec §3 S4 表。 */
{
  const GIT_PIN = ['* -text', 'docs/PROJECT-LIVE.html -diff binary linguist-generated'];
  const pinAt = dir => {
    if (!dir) return false;
    try {
      const L = readText(path.join(dir, '.gitattributes')).split(/\r?\n/).map(s => s.trim());
      return GIT_PIN.every(w => L.includes(w));
    } catch { return false; }
  };
  const gitRootOf = start => {
    for (let cur = start; ;) {
      let st = null;
      try { st = fs.statSync(path.join(cur, '.git')); } catch { }
      if (st && (st.isDirectory() || st.isFile())) return cur;
      const up = path.dirname(cur);
      if (up === cur) return null;
      cur = up;
    }
  };
  const diskRoot = gitRootOf(projectRoot);
  /* 钉可以打在项目根，也可以打在上层仓库根（git 合并祖先目录的 attributes）——只看项目根会误判。 */
  const diskPinned = pinAt(projectRoot) || (!!diskRoot && pinAt(diskRoot));
  let pg = null;
  if (isFile(profilePath)) { try { pg = JSON.parse(readText(profilePath)).git || null; } catch { } }
  const mode = pg && typeof pg.mode === 'string' ? pg.mode : 'pending';
  const MODES = ['pending', 'none', 'local', 'remote'];
  const wantsRepo = mode === 'local' || mode === 'remote';
  const facts = `仓库=${diskRoot ? String(diskRoot).replace(/\\/g, '/') : '无'}｜行尾钉=${diskPinned ? '在场' : '缺席'}｜mode=${mode}`;
  /* 身份只实探一次，且仅在与 git 有关的档里探（--fast 也不跳判据，但别白跑进程）。 */
  let identity = null;
  if (mode !== 'none') {
    try {
      const one = k => { const r = cp.spawnSync('git', ['-C', projectRoot, 'config', '--get', k], { encoding: 'utf8', timeout: 4000, windowsHide: true }); return r.status === 0 ? String(r.stdout || '').trim() : ''; };
      identity = !!(one('user.name') && one('user.email'));
    } catch { identity = null; }
  }
  let level = 'PASS', note = '';
  if (!MODES.includes(mode)) { level = 'FAIL'; note = `mode=${mode} 不在取值域 ${MODES.join('|')} 内（该位只由用户选择写入，脚本与 AI 不得代填）`; }
  else if (diskRoot && !diskPinned) { level = 'FAIL'; note = `仓库在场但 .gitattributes 承重两行缺席 → 本机 core.autocrlf=true 会在 checkout 时把 .qoder/scripts/*.mjs 的 LF 静默改成 CRLF，改写过就还原不了。处置：追加 ${GIT_PIN.join(' + ')}（或直接跑 /branch-workflow Step 0）`; }
  else if (!diskRoot && wantsRepo && !diskPinned) { level = 'WARN'; note = `已选择建仓（mode=${mode}）但尚未钉行尾 → 顺序不可反：先写 .gitattributes 再 git init（/branch-workflow Step 0）`; }
  else if (diskRoot && mode === 'pending') { level = 'WARN'; note = '仓库已在场但 git 方式仍未决策 → 门禁话术与主干名无从按档判定；环节 5 开工前或 /harness-assemble 会问一次'; }
  else if (!diskRoot && mode === 'pending') { level = 'SKIP'; note = '无仓库且 git 方式未定 → 三道 git 门禁本项目零拦截力（未验证不等于已通过）；建仓归 /branch-workflow Step 0'; }
  else if (mode === 'none') { level = 'PASS'; note = '按你的选择（mode=none）本框架不纳管版本库，改档走 /harness-assemble'; }
  else { note = '行尾钉与仓库状态自洽'; }
  /* profile.git 与磁盘实探的漂移显形（S2 说两处 findGitRoot 若漂移会被本判据抓到，就在这里）。 */
  const drift = pg && typeof pg.repo === 'boolean' && pg.repo !== !!diskRoot
    ? `｜⚠️ profile.git.repo=${pg.repo} 与磁盘实探不一致（磁盘=${!!diskRoot}）→ 重跑阶段 A 刷新探测` : '';
  if (identity === false && level !== 'FAIL') {
    if (level === 'SKIP') level = 'WARN';
    note = (note ? note + '；' : '') + 'git 身份未配（user.name / user.email 任一为空）→ 首次 git commit 必失败。两条命令自行执行：git config --global user.name "你的名字" / git config --global user.email 你的邮箱（框架不代配全局身份）';
  }
  const detail = `${facts}${note ? '——' + note : ''}${drift}`;
  if (level === 'FAIL') checkRow('git_ready', false, detail);
  else if (level === 'WARN') warnRow('git_ready', detail);
  else if (level === 'SKIP') checkRow('git_ready', true, `SKIP: ${detail}`);
  else rows.push(row('git_ready', 'PASS', detail));
}

/* V15 判据多重集：骨架步骤与手册步骤必须一一对应，独有判据的宿主不许被合并掉 */
{
  const skelPath = path.join(qoderDir, 'briefing-skeletons.md');
  const live = isFile(liveDocPath) ? readText(liveDocPath) : null;
  if (!isFile(skelPath) || live === null) {
    checkRow('rule_merge_parity', true, 'SKIP: 骨架库或 PROJECT-LIVE.md 不存在');
  } else {
    const skelText = readText(skelPath);
    const skelSteps = uniq([...skelText.matchAll(new RegExp('【环节(\\d)' + DOT + '步骤(\\d+)', 'g'))].map(m => m[1] + DOT + m[2]));
    const headTokRe = new RegExp('(?<!\\d)(\\d)' + DOT + '(\\d)(?!\\d)');
    const liveSteps = uniq(linesOf(live)
      .filter(l => /^####/.test(l))
      .map(l => (l.match(headTokRe) || [])[0])
      .filter(Boolean)
      .map(t => { const m = t.match(headTokRe); return m[1] + DOT + m[2]; }));
    const vanished = skelSteps.filter(s => !liveSteps.includes(s));
    // ③ 对抗复核 / 多专家并行宿主清单从骨架『需内联专家清单的步骤』一行读取，不抄录（抄录即第二事实源）
    const hostLine = (linesOf(skelText).find(l => l.includes('需内联专家清单的步骤')) || '');
    const hosts = uniq([...hostLine.matchAll(new RegExp('(\\d)' + DOT + '(\\d)', 'g'))].map(m => m[1] + DOT + m[2]));
    const lostHosts = hosts.filter(s => !liveSteps.includes(s));
    // ② 仅出现 1 次的独有判据：必须仍在其**宿主步骤**的提示词内（搬到别处即视为丢失——
    //    判据的作用就是约束那一步交付时的行为）
    const UNIQUE = [
      [`5${DOT}1`, /依据指向具体文档与章节/],
      [`7${DOT}1`, /失败用例[^\n]{0,24}全部带进\s*7/],
    ];
    const lostUnique = [];
    for (const [tok, re] of UNIQUE) {
      const host = STEP_BODIES.get(tok);
      if (!host) { lostUnique.push(`${tok} 步骤本身已消失`); continue; }
      if (host.body === null) { lostUnique.push(`${tok} 提示词代码框缺失/未闭合`); continue; }
      if (!re.test(host.body)) lostUnique.push(`${tok} 的独有判据（${re.source}）已不在该步提示词内`);
    }
    const problems = [
      ...vanished.map(s => `骨架步骤 ${s} 在手册中无对应标题（被静默删除或合并）`),
      ...lostHosts.map(s => `多专家并行/对抗复核宿主 ${s} 消失（清单来自骨架，豁免合并）`),
      ...lostUnique,
    ];
    checkRow('rule_merge_parity', problems.length === 0, problems.length
      ? `${problems.length} 处 [${head3(problems)}]`
      : `骨架 ${skelSteps.length} 步 ↔ 手册 ${liveSteps.length} 步无缺失；宿主清单 ${hosts.length} 步全在；独有判据 2/2 在其宿主内`);
  }
}

/* V16 版本号等值（项目侧三处常驻源；migration-map 仅在升级期落盘，在场时纳入） */
{
  const g = (p, re) => { const s = isFile(p) ? readText(p) : null; return s === null ? null : (s.match(re) || [, null])[1]; };
  const mmPath = path.join(qoderDir, 'migration-map.json');
  const v = {
    manifest: manifest ? String(manifest.version ?? '') : null,
    skillMd: (() => { const p = firstExisting('SKILL.md'); return p ? g(p, /^\s*version:\s*"([^"]+)"/m) : null; })(),
    profile: g(profilePath, /"skillVersion":\s*"([^"]+)"/),
  };
  if (isFile(mmPath)) v.migrationMap = g(mmPath, /"version":\s*"([^"]+)"/);
  const base = v.manifest;
  const bad = Object.entries(v).filter(([, x]) => x !== base).map(([k, x]) => `${k}=${x}`);
  checkRow('version_single_source', bad.length === 0 && base !== null,
    bad.length || base === null ? `源=${base} 不一致=[${bad.join(', ')}]`
      : `${Object.keys(v).length} 处版本号同为 v${base}（${Object.keys(v).join('/')}）`);
}

/* V20 artifact 权威源在装好的项目里必须真能读到（Task 5.2 Step 2）
   /harness-next 判 artifact 状态机要读 schemas/sdd-artifacts.yaml，但该文件**不**由 planTree 复制到
   `.qoder/` 顶层——可读位置只有 skill 自身的安装目录，且随安装形态有两种：项目级 `<root>/.qoder/skills/`、
   用户级 `~/.qoder-cn/skills/`。把任一种写死进指令，另一种形态下就是 404（与 B5「场景 2 未定义」同族）。
   可读位置由 skillRootCandidates() 统一给出（profile.skillRoot 实测三形态都记了真值，先前这句是错的）。 */
{
  const rel = ['assets', 'library', 'schemas', 'sdd-artifacts.yaml'];
  const cands = [
    path.join(qoderDir, 'skills', 'better-coding', ...rel),
    path.join(os.homedir(), '.qoder-cn', 'skills', 'better-coding', ...rel),
  ];
  const hit = firstExisting(rel.join('/')) || cands.find(p => isFile(p));
  checkRow('artifact_schema_resolvable', !!hit, hit
    ? `权威源可读=${hit}`
    : `两种安装形态都读不到 ${rel.join('/')}（项目级与用户级候选均缺失）→ /harness-next 的 artifact 判定会静默失效`);
}

/* V22 契约漂移门禁资产在场（Task 6.1）
   环节 3 末登记契约、环节 6 联调前校验漂移，两步都靠 `.qoder/scripts/contract-drift.mjs` 这一条机械出口
   （breaking_drift → 退出码 1）。脚本或 deps 模板没落盘时，这两步会静默退化成"AI 自己说一致"——
   正是本库最反对的那类无证据门禁，所以在场性本身必须是判据。
   期望值取 manifest#componentCounts.contract_drift_scripts / contract_deps_templates（M4 同因：不留第二份字面量）。 */
{
  const driftGot = listFiles(path.join(qoderDir, 'scripts')).filter(f => /^contract-drift\.mjs$/.test(f)).length;
  const tplGot = listFiles(path.join(docsDir, 'harness-templates')).filter(f => /^deps-template\.yaml$/.test(f)).length;
  const wantDrift = counts.contract_drift_scripts ?? 0;
  const wantTpl = counts.contract_deps_templates ?? 0;
  const bad = [];
  if (driftGot < wantDrift) bad.push(`检测器 ${driftGot}/${wantDrift}（.qoder/scripts/contract-drift.mjs 缺失 → 契约漂移无机械出口）`);
  if (tplGot < wantTpl) bad.push(`deps 模板 ${tplGot}/${wantTpl}（docs/harness-templates/deps-template.yaml 缺失 → 环节 3 无处登记契约）`);
  checkRow('contract_drift_assets', bad.length === 0,
    bad.length ? bad.join('；') : `脚本=${driftGot}/${wantDrift} deps 模板=${tplGot}/${wantTpl}（环节 3 登记 / 环节 6 校验的执行面齐备）`);
}

/* V23 预览.html 自包含（G1 的脚本侧判据；此前该判据只存在于 sdd-gates-checklist 的表里，
   脚本侧实测为 0 —— 文档写"脚本 + 人"而脚本那半边是空的）。
   契约来源：ui-design 的「预览.html 契约校验」节与 briefing-skeletons 4·1 的 G1 要求：
   不引 CDN、不 import 外部文件、不发任何网络请求，否则 file:// 双击白屏。
   ⚠️ 未产出 交互原型/预览.html 时报 SKIP 并写明"未验证"——拿"没东西可验"冒充"已核对"
   是本次中段项目探针实跑抓到的四类假 PASS 之一，本检查不得重犯。
   ⚠️ 只把协议开头与协议相对写法算外部引用：相对路径、data: URI、页内 #锚点 都是正当写法，
   误杀它们会让这条判据变成噪声源（与漏判同罪）。
   🔴 v9.11.0 扩射程：本条报错文案写的就是「离线双击会白屏」，但 v9.10.0 及以前**只取文件名为
   预览.html 的那一个文件**，于是原型目录里其它可双击 HTML（实测 Work010 的 index.html 引
   `/src/main.tsx`）完全在射程外——文案说中了症状、扫描对象守错了文件。现扩到原型目录下
   除 node_modules/dist 外的全部 .html，并新增绝对路径引用检测。
   ⚠️ 门控与判定强度一律不动：无 预览.html 仍 SKIP。把"目录已建但 预览.html 还没写"从 SKIP
   改成 FAIL，会让 1·3 做到一半的每个项目当场变红——那是新增误红，不是修复。 */
{
  const prdDir = path.join(docsDir, 'prd');
  const protoDirs = listDirs(prdDir)
    .filter(d => /^PRD-.+交互原型$/.test(d))
    .map(d => path.join(prdDir, d));
  const previews = protoDirs.map(d => path.join(d, '预览.html')).filter(isFile);
  if (previews.length === 0) {
    checkRow('preview_self_contained', true,
      'SKIP: docs/prd 下没有 交互原型/预览.html（Backend-Only 应用或环节 1·3 尚未产出，属正常）——本项未验证，不等于已通过');
  } else {
    const EXTERNAL = /^(?:https?:|\/\/|file:)/i;
    /* 单个 / 开头（不含 // 协议相对）或 file: —— 在 file:// 下会解析到盘符根，双击必白屏。 */
    const ABS = /^(?:\/(?!\/)|file:)/i;
    const hits = [];
    let extN = 0, netN = 0, absN = 0;
    const htmls = protoDirs.flatMap(d => walkFiles(d, ['.html']));
    for (const f of htmls) {
      const rel = path.relative(projectRoot, f).replaceAll('\\', '/');
      const txt = readText(f) || '';
      txt.split('\n').forEach((l, i) => {
        for (const m of l.matchAll(/(?:src|href)\s*=\s*["']([^"']*)["']/g)) {
          const v = m[1].trim();
          if (EXTERNAL.test(v)) { extN++; hits.push(`${rel}:${i + 1} 外部引用 ${v.slice(0, 46)}`); }
          else if (ABS.test(v)) { absN++; hits.push(`${rel}:${i + 1} 绝对路径 ${v.slice(0, 46)}（file:// 下解析到盘符根 → 白屏，改相对路径或让 vite base 取 './'）`); }
        }
        for (const m of l.matchAll(/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bimport\s*\(/g)) {
          netN++; hits.push(`${rel}:${i + 1} 网络调用`);
        }
      });
    }
    checkRow('preview_self_contained', hits.length === 0, hits.length
      ? `外部引用 ${extN} 处 / 绝对路径 ${absN} 处 / 网络调用 ${netN} 处（共扫 ${htmls.length} 个可双击 HTML，其中 ${previews.length} 个 预览.html）：${hits.slice(0, 3).join('；')}${hits.length > 3 ? ` …另有 ${hits.length - 3} 处` : ''}——离线双击会白屏，回 1·3 把资源内联或改相对路径`
      : `${htmls.length} 个可双击 HTML（含 ${previews.length} 个 预览.html）零外部引用、零绝对路径、零网络请求（CSS/JS/假数据全内联，file:// 离线可开）`);
  }
}

/* v9.11.0 S2 原型视觉底线 + 可达性地板（八件机检，一条判据）。
   病灶（真环境实测）：1·3 原型 <svg> 出现 0 次、无图标库依赖，导航图标是字符 ⌂⤴⇅⚙，
   回收站用 ␡(U+2421) 于是渲染成英文字面「DEL」；tokens.css 只有 1 个字号 1 个圆角 1 个阴影；
   正文容器无 max-width（而 预览.html 有 680px，两份自相矛盾）。属主两度判不合格而 45 条判据全绿
   —— 因为**没有一条判据与视觉有关**。
   🔴 本条只判"在场"八件，判不了"好看"：声明 4 个 --text-* 而页面一个不引用也能过，这是"判在场"类
   判据的固有上限。真正的兜底是 ui-design 步骤 P4 的 1·3 视觉收口卡（属主裁定），不得对外宣称本条保证美观。
   🔴 地板两件不是新引入标准，是两份规则库早已写明却无人执行的交集：
     · ui-ux-pro-max 规则优先级 1「可访问性」必备项含"键盘可达"、应避免项含"去掉焦点环"；
     · 上游设计 skill 的质量地板明列 "visible keyboard focus, reduced motion respected"。
   ⚠️ 门控与 preview_self_contained 同形：无 预览.html 即 SKIP 并写明未验证，不得让初态自红。
   ⚠️ 一律 Buffer 直读：readText 会把 \r\n 归一成 \n，编码类问题对它永久隐形（byte_hygiene 同族教训）。
   ⚠️ 地板⑦刻意做成条件式：实测该原型动效声明 0 处，零动效项目被要求 prefers-reduced-motion 是纯误红。 */
{
  const prdDirV = path.join(docsDir, 'prd');
  const protos = listDirs(prdDirV)
    .filter(d => /^PRD-.+交互原型$/.test(d))
    .map(d => path.join(prdDirV, d)).filter(isDir);
  const hasPreview = protos.some(d => isFile(path.join(d, '预览.html')));
  if (!hasPreview) {
    checkRow('prototype_visual_floor', true,
      'SKIP: docs/prd 下没有 交互原型/预览.html（Backend-Only 应用或环节 1·3 尚未产出，属正常）——本项未验证，不等于已通过');
  } else {
    const hits = [];
    /* 本条判据**读的是 AI 产物**（环节 1·3 的 Vite 工程），不是库自有文件。
       v9.12.0 实测定性：全文件 28 处 JSON.parse 里只有这一处没包 try/catch，而它偏偏解析
       最不可信的输入——一个尾逗号的 package.json 就能让 46 条判据全部消失（stdout 零行）、
       让 stop-verify 拿 `tail(res.text)` 把 Node 堆栈当「请修复以下问题」甩出来并 exit 2。
       坏 JSON 记进 notes（行内披露）而不是 hits：「JSON 语法坏」与「视觉底线不达标」是两件事，
       混判会误导用户去改样式。底线①随即退化为只按 <svg> 计数，仍可用。 */
    const pkgNotes = [];
    const SRC_EXT = ['.css', '.tsx', '.jsx', '.vue', '.html'];
    const scale = (text, re) => new Set((text.match(re) || []).map(s => s.toLowerCase()));
    for (const dir of protos) {
      const rel = path.relative(projectRoot, dir).replaceAll('\\', '/');
      const files = walkFiles(dir, SRC_EXT);
      const read = f => { try { return fs.readFileSync(f).toString('utf8'); } catch { return ''; } };
      const text = files.map(read).join('\n');
      let pkg = null;
      if (isFile(path.join(dir, 'package.json'))) {
        try { pkg = JSON.parse(read(path.join(dir, 'package.json'))); }
        catch (e) { pkgNotes.push(`${rel} 的 package.json 不可解析（${String(e.message).slice(0, 60)}）→ 底线①改按 <svg> 计数，图标库依赖这一路看不见`); }
      }

      const iconLib = pkg ? Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) })
        .filter(n => /lucide|heroicons|phosphor|tabler|iconify|feather-icons|react-icons/.test(n)) : [];
      const svgN = (text.match(/<svg[\s>]/g) || []).length;
      if (!iconLib.length && svgN === 0)
        hits.push(`${rel} 底线①图标零 SVG（无图标库依赖且 <svg> 出现 0 次 → 在用 Unicode 字形顶替）`);

      for (const [n, re, min, label] of [
        ['②', /--text-[a-z0-9-]+/gi, 4, '字阶'],
        ['③', /--(?:space|gap|pad|margin)-[a-z0-9-]+/gi, 4, '间距阶'],
        ['④a', /--radius-[a-z0-9-]+/gi, 3, '圆角阶'],
        ['④b', /--shadow-[a-z0-9-]+/gi, 2, '海拔阶'],
      ]) {
        const got = scale(text, re).size;
        if (got < min) hits.push(`${rel} 底线${n}${label}仅 ${got} 档（< ${min}，层级读不出来）`);
      }

      // 底线⑤：正文要有行长上限，且两份交付物必须同宽——实测 Work010 只在 预览.html 设了 680px。
      // 🔴 写法必须三种都认：CSS `max-width`、JSX `maxWidth`、Tailwind `max-w-prose`/`max-w-[68ch]`
      //    （原型默认栈就是 Tailwind，只认 CSS 会把正确做了的项目误判为未做——bench 实跑复现过）。
      const MEASURE = /max-width|maxWidth|max-w-|measure|--measure/;
      const srcHasMeasure = files.filter(f => !/预览\.html$/.test(f))
        .some(f => MEASURE.test(read(f)));
      const previewHasMeasure = isFile(path.join(dir, '预览.html'))
        && MEASURE.test(read(path.join(dir, '预览.html')));
      if (!srcHasMeasure && !previewHasMeasure)
        hits.push(`${rel} 底线⑤全工程无行长上限（max-width / maxWidth / max-w-* 均无 → 正文行长失控=读不下去）`);
      else if (srcHasMeasure !== previewHasMeasure)
        hits.push(`${rel} 底线⑤两份交付物行长约束不一致（Vite 工程 ${srcHasMeasure ? '有' : '无'}、预览.html ${previewHasMeasure ? '有' : '无'}）——同一原型必须同宽`);

      if (!/:focus|focus-visible|focus-within|outline\s*:\s*(?!none)/.test(text))
        hits.push(`${rel} 地板⑥无任何可见焦点样式（键盘用户看不到当前项）`);
      const hasMotion = /transition\s*:|animation\s*:|@keyframes/.test(text);
      if (hasMotion && !/prefers-reduced-motion/.test(text))
        hits.push(`${rel} 地板⑦有动效声明却无 prefers-reduced-motion（条件式：零动效不判）`);
    }
    checkRow('prototype_visual_floor', hits.length === 0, hits.length
      ? `${hits.length} 处缺失：${hits.slice(0, 3).join('；')}${hits.length > 3 ? ` …另有 ${hits.length - 3} 处` : ''}——回 1·3 步骤 P2.5/P3 补齐（是补做，不是放宽阈值）${pkgNotes.length ? `｜另有 ${pkgNotes.length} 条取数降级：${pkgNotes.slice(0, 2).join('；')}` : ''}`
      : `${protos.length} 个原型工程八件齐：真 SVG 图标 + 字阶/间距/圆角/海拔四阶 + 正文行长受控且两份同宽 + 焦点可见 + 动效已尊重 reduced-motion（好看与否由属主裁定）${pkgNotes.length ? `｜⚠️ 本行是「未全部验证」，不是「已通过」：${pkgNotes.join('；')}` : ''}`);
  }
}

/* V24 已退役组件不得残留在项目里。
   为什么必须单独一条：`component_counts` 的对账谓词是 **`>=`**（除 commands 外），那是为阶段 B
   可选装配让的合理设计——但代价是它**结构上看不见陈旧残留**。实测：已退役组件仍装在存量项目的
   .qoder/skills/ 下时，component_counts 照样报 PASS（装着的比期望多不算问题）——
   库删了组件、项目照旧能敲起它，而库内闸门与落盘校验器双双绿。
   名单取 manifest.retiredComponents（唯一事实源，不在这里抄一份）；字段不在时报 SKIP。 */
{
  const retired = manifest && manifest.retiredComponents ? manifest.retiredComponents : null;
  if (!retired) {
    checkRow('retired_component_residue', true, 'SKIP: manifest 无 retiredComponents 字段（旧版库）——本项未验证，不等于已通过');
  } else {
    const spots = { skills: n => path.join(qoderDir, 'skills', n, 'SKILL.md'), agents: n => path.join(qoderDir, 'agents', n + '.md'), rules: n => path.join(qoderDir, 'rules', n + '.md'), commands: n => path.join(qoderDir, 'commands', n + '.md') };
    const residue = [];
    let checked = 0;
    for (const kind of Object.keys(spots)) {
      for (const n of (Array.isArray(retired[kind]) ? retired[kind] : [])) {
        checked++;
        if (isFile(spots[kind](n))) residue.push(`.qoder/${kind}/${n}${kind === 'skills' ? '/' : '.md'}`);
      }
    }
    checkRow('retired_component_residue', residue.length === 0, residue.length
      ? `${residue.length} 个已退役组件仍装在项目里（按 migration-map 的 9.1.0 条目删除后重跑校验）：${residue.join(' | ')}`
      : `已退役组件残留 0/${checked}（名单来自 manifest.retiredComponents；component_counts 的 >= 谓词看不见这类残留，故单列本判据）`);
  }
}

/* V17 verify 自身耗时（B4 降级后的真实收益要有数字可看，而不是"Node 应该够快"） */
{
  const ms = Date.now() - T0;
  if (ms > 30000) warnRow('verify_duration', `本次校验耗时 ${ms}ms > 30s——慢到必须给 --fast 定义跳过集合并把它写在这里`);
  else rows.push(row('verify_duration', 'PASS', `耗时 ${ms}ms（--fast=${fast ? 'on' : 'off'}，阈值 30000ms；超过即触发 V17 告警）`));
}

/* ==================== Check L1: 跨文件字面量同源一致（v9.3.0 S9 的报警器，先于任何"收重复"动作） ==================== */
{
  const problems = [];
  /* ① 台账映射对账。SKILL.md 声称"componentCounts 与 finalCounts 两处必须一致"，但实测两本账的键名不同域：
   * finalCounts 用短键（rules/skills/agents/commands/hooks/specTemplates/scripts），
   * componentCounts 用 L0_ 前缀长键且另含 10 个库侧维度 → 直接比键集会立刻假红，
   * 所以"两处一致"这句话此前**无法机器兑现**。本行按显式映射表比那 7 个共有维度。 */
  const KEY_MAP = { rules: 'L0_rules', skills: 'L0_skills', agents: 'L0_agents', commands: 'L0_commands',
    hooks: 'L0_hooks', specTemplates: 'L0_specTemplates', scripts: 'scripts' };
  const skillCopy = path.dirname(firstExisting('manifest.json') || path.join(qoderDir, 'skills', 'better-coding', 'manifest.json'));
  let cc = null, fc = null;
  try { cc = (manifest && manifest.componentCounts) || null; } catch { cc = null; }
  for (const c of [path.join(skillCopy, 'migration-map.json'), path.join(os.homedir(), '.qoder-cn', 'skills', 'better-coding', 'migration-map.json')]) {
    if (!isFile(c)) continue;
    try { const g = JSON.parse(readText(c)); if (g && g.finalCounts) { fc = g.finalCounts; break; } } catch { /* 换下一候选 */ }
  }
  if (!cc || !fc) problems.push(`台账缺一侧（componentCounts=${cc ? '有' : '无'} / finalCounts=${fc ? '有' : '无'}）——映射对账无从进行`);
  else for (const [short, long] of Object.entries(KEY_MAP))
    if (cc[long] !== fc[short]) problems.push(`${short}: finalCounts=${fc[short]} vs componentCounts.${long}=${cc[long]}`);
  /* ② 面板自验清单字面量对账：脚本已含 V8（更新模式数据块 lint），
   * 任何描述自验集合的文档写 V1/V3/V4/V6/V7 却全篇不提 V8 = 改了一处忘三处。 */
  const bp = path.join(qoderDir, 'scripts', 'build-panel.mjs');
  const hasV8 = isFile(bp) && /vCheck\('V8|V8 数据块 lint/.test(readText(bp) || '');
  if (hasV8) {
    for (const f of ['SKILL.md', path.join('references', 'panel-engine-rebuild.md'), path.join('references', 'phase-a-checklist.md')]) {
      const p = path.join(skillCopy, f);
      if (!isFile(p)) continue;
      const t = readText(p) || '';
      if (/V1\/V3\/V4\/V6\/V7/.test(t) && !/V8/.test(t)) problems.push(`${f} 写了 V1/V3/V4/V6/V7 但全篇无 V8（build-panel 自验已 6 条）`);
    }
  }
  /* ③ 🔴 P2-11：.gitattributes 的承重两行，manifest#gitGovernance.lineEndingPin 自述"只在本文"，
   * 实测却在 harness.mjs / phase-a-init.mjs / 本文件三处各硬编码一份（4 份口径、0 处机检）。
   * 改法取舍：不让钩子热路径去运行时读 manifest——用户级安装形态下 manifest 可以合法缺席，
   * 读不到就 die 会把 pre-commit-lint 变成新的故障源。改为**机检三份字面量与台账是否同值**：
   * 谁改了 manifest 没跟着改脚本，本行即红并点名文件。 */
  const pin = (manifest && manifest.gitGovernance && manifest.gitGovernance.lineEndingPin) || null;
  let pinNote = '行尾钉 3 份字面量未核（manifest 无 lineEndingPin）';
  if (!pin || !Array.isArray(pin.lines) || !pin.lines.length) {
    problems.push('manifest.gitGovernance.lineEndingPin.lines 缺失或非数组 → 承重行失去唯一比对基准（本项未验证，不等于已通过）');
  } else {
    /* 🔴 只判"这段源码里出现过这一行"是不够的：注释、字符串、甚至另一段说明文字都能满足它，
     * 于是三份真常量数组各说各话照样绿（review 时构造出的假绿形状）。
     * 现改成**把各文件里的那个常量数组抠出来、逐元素与台账比**，双向不等即红；
     * 抠不到数组也判红（改名/删除都属"台账失去比对基准"，不能当通过）。 */
    const carriers = [
      ['harness.mjs', /const GIT_PIN_LINES = \[([^\]]*)\]/],
      ['phase-a-init.mjs', /const GIT_PIN_LINES = \[([^\]]*)\]/],
      ['harness-verify.mjs', /const GIT_PIN = \[([^\]]*)\]/],
    ];
    const parseArr = s => [...s.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2]);
    const want = JSON.stringify(pin.lines);
    const drifted = [];
    for (const [name, re] of carriers) {
      const p = path.join(qoderDir, 'scripts', name);
      if (!isFile(p)) { drifted.push(`${name} 不在场（无从核对其行尾钉数组）`); continue; }
      const m = (readText(p) || '').match(re);
      if (!m) { drifted.push(`${name} 找不到行尾钉常量数组（改名或删了？台账失去比对基准）`); continue; }
      const got = JSON.stringify(parseArr(m[1]));
      if (got !== want) drifted.push(`${name} 行尾钉数组≠台账：本文件 ${got} vs manifest ${want}`);
    }
    if (drifted.length) problems.push(...drifted);
    else pinNote = `行尾钉 ${pin.lines.length} 行 × 3 份字面量与台账同值`;
  }
  checkRow('literal_single_source', problems.length === 0,
    problems.length ? problems.slice(0, 6).join(' | ') + (problems.length > 6 ? `（共 ${problems.length} 处）` : '')
      : `台账映射对账 7 维一致（finalCounts 短键 ↔ componentCounts.L0_*）；面板自验字面量含 V8 的文档 ${hasV8 ? '已同步' : '不适用（脚本无 V8）'}；${pinNote}`);
}

/* ==================== 输出汇总 ==================== */
/* v9.3.0 S7：呈现分层 —— 一条判据都不跳，只把"给谁看"分开。
 * 实测全跑 278ms，砍判据是白亏；--fast 也明确不跳任何判据，该诚实在此延续。
 * 硬约束：单行格式 `  - name STATUS (detail)` 逐字节不变 —— stop-verify 钩子按它解析。
 * 分组只作用于"是否打印该行"，绝不作用于行内容。未归类的新判据按"库一致性"计并点名，
 * 防止加了判据却没人给它归组（归组漏了 = --brief 下它会被静默藏进折叠组而不被看见）。 */
const AUDIENCE = {
  project: ['placeholder_scan', 'component_counts', 'profile_valid', 'agents_fields', 'agents_context_budget',
    'agents_command_fill', 'filename_case', 'byte_hygiene', 'apps_single_source', 'settings_bind',
    'live_doc_integrity', 'panel_topo_lag', 'live_profile_drift', 'maturity_vs_disk', 'sync_freshness', 'verify_stamp', 'rules_loaded_stamp',
    'git_ready'],
  artifact: ['prompt_params', 'binding_stale', 'prompt_selfcontained', 'prompt_plain_language', 'expert_panel_inline',
    'prompt_length_bounds', 'prompt_person_view', 'manual_size_budget', 'preview_self_contained', 'prototype_visual_floor',
    /* 🔴 P2-4：这两条一直在跑却从未归组，触发时会掉进"未归类判据"点名里——
     * 归组漏了 = --brief 下它被静默藏进折叠组而没人看见。两者判的都是**交付物**（手册主表 / Markdown 转义）。 */
    'stage_main_rows', 'md_escape_hazard'],
  library: ['migration_map', 'report_reason_coverage', 'frontmatter_valid', 'rules_extension', 'rules_trigger', 'tool_names', 'hook_stubs',
    'panel_elk_layout', 'skill_dirname_match', 'ask_card_contract', 'rule_merge_parity', 'version_single_source',
    'artifact_schema_resolvable', 'contract_drift_assets', 'always_on_budget', 'retired_component_residue',
    'literal_single_source', 'verify_duration'],
};
const nameOf = r => (String(r).match(/^  - ([a-z_0-9]+)/) || [])[1] || '';
const groupOf = n => AUDIENCE.project.includes(n) ? 'project' : AUDIENCE.artifact.includes(n) ? 'artifact' : 'library';
const gCounts = { project: 0, artifact: 0, library: 0 };
const unclassified = [];
for (const r of rows) {
  const n = nameOf(r);
  const g = groupOf(n);
  gCounts[g]++;
  if (n && g === 'library' && !AUDIENCE.library.includes(n)) unclassified.push(n);
}
/* v9.4.0 S3：把"未验证"从 PASS 里摘出来单独显形——判据一条未跳、退出码语义未动，只补呈现。
 * 走既有 extra[] 通道（它在 status 行之前打印）。⚠️ 两条硬约束：
 * ① 不动 checkRow 的单行格式——harness.mjs 的 stop-verify 按 /^\s*-\s+(\S+)\s+FAIL\b/ 抓 FAIL 行（不变式 I4）；
 * ② 本块必须位于 nameOf 定义**之后**，否则 const 箭头函数进 TDZ，脚本起不来（V9.1.1 实测过的同类故障）。 */
{
  const skipNames = rows.map(String).filter(s => /^\s*-\s+\S+\s+PASS \(SKIP/.test(s)).map(s => nameOf(s));
  extra.push(`  ── 判据覆盖：已验 ${rows.length - skipNames.length}｜未验证 ${skipNames.length}`
    + (skipNames.length ? `（${skipNames.join(', ')}）——未验证不等于已通过` : ''));
}
const status = overallPass ? 'PASS' : 'FAIL';
for (const l of extra) process.stdout.write(l + '\n');
process.stdout.write(`[harness-verify] status: ${status}\n`);
for (const r of rows) {
  if (brief && groupOf(nameOf(r)) === 'library') continue;
  process.stdout.write(r + '\n');
}
process.stdout.write(`  ── 呈现分组：项目状态 ${gCounts.project} 项｜文档产物 ${gCounts.artifact} 项｜库一致性 ${gCounts.library} 项`
  + `${brief ? '（--brief 已折叠库一致性组；判据一条未跳，本行两组都会计入）' : ''}`
  + `${unclassified.length ? `｜⚠️ 未归类判据按库一致性计: ${unclassified.join(', ')}（请补进 AUDIENCE 表）` : ''}\n`);
process.exit(overallPass ? 0 : 1);

/* ==================== 共用解析函数 ==================== */
function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function trimBraces(s) { return s.replace(/^[{}]+|[{}]+$/g, ''); }
/** 按注释标记截取分区（与物理位置无关）；缺任一标记返回 null */
function sliceSection(text, id) {
  if (text === null) return null;
  const s = text.indexOf(`<!-- harness:section ${id} managed-dynamic -->`);
  const e = text.indexOf(`<!-- harness:section-end ${id} -->`);
  return (s >= 0 && e > s) ? text.slice(s, e) : null;
}
/** 骨架块解析：【环节N·步骤k】+ 可复制提示词多行块 + 参数清单 */
function parseSkeleton(text) {
  const blocks = [];
  let cur = null, inP = false;
  for (const ln of linesOf(text)) {
    if (ln.startsWith('【')) {
      if (cur) blocks.push(cur);
      const m = ln.match(new RegExp('^【环节(\\d)(?:' + DOT + '步骤(\\d+))?[^】]*】'));
      if (m) { cur = { num: m[1], step: m[2] || '', prompt: '', checklist: '' }; inP = false; }
      else { cur = null; inP = false; }
    }
    if (!cur) continue;
    let m;
    if ((m = ln.match(/^可复制提示词：(.*)$/))) { cur.prompt = m[1]; inP = true; continue; }
    if ((m = ln.match(/^参数清单：(.*)$/))) { cur.checklist = m[1]; inP = false; continue; }
    if (inP) cur.prompt += '\n' + ln;
  }
  if (cur) blocks.push(cur);
  return blocks;
}
/** 从 #### 标题行向下取第一个 ``` fence 对的内容；未找到或未闭合都算不合法（fail-closed） */
function extractFence(lines, hIdx) {
  let body = '', inFence = false, found = false;
  for (let j2 = hIdx + 1; j2 < lines.length; j2++) {
    if (!inFence && /^```(?:text)?/.test(lines[j2])) { inFence = true; found = true; continue; }
    if (inFence && /^```\s*$/.test(lines[j2])) return { ok: true, body };
    if (inFence) { body += lines[j2] + '\n'; continue; }
    if (/^#{3,4}\s/.test(lines[j2])) break;
  }
  return { ok: found && !inFence, body: inFence ? null : body };
}
/** 收集所有 #### 步骤区块的第一个提示词框；键为 1·1 形态的步骤号，无步骤号时用 head-<行号> */
function stepBodies(live, out, tokRe) {
  const lv = linesOf(live);
  let p = 0;
  while (p < lv.length) {
    if (/^####/.test(lv[p])) {
      const m = lv[p].match(tokRe);
      const key = m ? m[1] + DOT + m[2] : `head-${p}`;
      let q = p + 1, fs2 = -1;
      while (q < lv.length) {
        if (/^#{3,4}\s/.test(lv[q])) break;
        if (fs2 < 0) { if (/^```(?:text)?\s*$/.test(lv[q])) fs2 = q; }
        else if (/^```\s*$/.test(lv[q])) break;
        q++;
      }
      if (fs2 >= 0 && q > fs2 && /^```\s*$/.test(lv[q])) out.set(key, { heading: lv[p], body: lv.slice(fs2 + 1, q).join('\n') });
      else if (fs2 >= 0) out.set(key, { heading: lv[p], body: null });
      p = q + 1;
      continue;
    }
    p++;
  }
}
/** 目录内文本文件递归（跳过 out/ 与 node_modules/） */
function walkText(dir, re, acc = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name === 'out' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkText(p, re, acc);
    else if (re.test(e.name)) acc.push(p);
  }
  return acc;
}
