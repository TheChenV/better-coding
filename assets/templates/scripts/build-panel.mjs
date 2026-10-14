#!/usr/bin/env node
/* ============================================================
 * build-panel.mjs — PROJECT-LIVE.html 面板构建脚本（模板 + Mermaid/ELK 引擎拼接）
 *
 * 本文件取代 build-panel.ps1 / build-panel.sh 两份孪生。孪生的代价不是"两份代码"，
 * 而是三类**只在某个载体上写得出**的缺陷：
 *   ① .sh 侧把 JSON/HTML 校验内嵌进 python3 且 `open()` 不带 encoding → 换机器（cp936）
 *      直接 UnicodeDecodeError 崩；缺 python3 则响亮失败但面板构建同时不可用。
 *   ② .ps1 侧的历史事故本体：`powershell -Command` 内联拼接 8MB bundle 时变量在参数解析
 *      阶段被展开进命令行 → MissingExpressionAfterToken。改成独立文件只是绕开，
 *      Node 侧 `process.argv` 结构上不可能把文件内容带进命令行 —— 缺陷类被消除而不是被规避。
 *   ③ 两实现各自维护"最长行"处理策略（PS 用 .NET 字符串法、sh 用 python 字符串法），
 *      校验口径要靠人对齐；单语言后口径只有一份。
 *
 * 参数（kebab 风格，与原 .sh 侧一致）:
 *   --template <路径>      完整拼接必需；内含项目名占位符与引擎 bundle 占位符（见 BUNDLE_MARK）
 *   --bundle <路径>        完整拼接必需。两种载体都收：明文 `.js`（2.9MB）或 brotli 压缩
 *                          `.js.br`（545,624B，随库分发的就是它）。给 .br 时按需膨胀进用户级
 *                          缓存并按 SHA256 校验后复用（落点见 ENGINE_CACHE 说明），
 *                          所以"双击即开"不需要联网、不需要 npm
 *   --out <路径>           完整拼接 = 产物；更新模式 = 待更新的已存在产物
 *   --project-name <名>    完整拼接必需，替换全部 {{PROJECT_NAME}}
 *   --sync-data-file <路径> 【更新模式】给定即不拼接，把文件内容替换进 -Out 的
 *                          SYNC_DATA:BEGIN / SYNC_DATA:END 之间。文件内容 = 标记之间的
 *                          完整内层（含 <script>...</script>），**不含**标记行本身
 *                          （标记由本脚本保留，误带入的标记行会被防御性剥离）。
 *
 * 自验 V1-V7（全部用字符串方法；严禁行式工具检测超长行 —— bundle 最长行实测 327,608 字符，
 *   ripgrep/Grep 类整批跳行、假阴性极高，这是一条已记入 incident 的教训）：
 *   V1 引擎注入成功     标记出现 ≥2 次（模板取用 1 + 引擎定义 ≥1）且产物 ≥ 引擎体积。
 *                       ⚠️ 不能只判"含不含"：模板自身就含 1 次 __mermaidElk，那样引擎缺失也为真（活体负例实测）
 *   （v9.0.0 已删）V2 占位符对账：要求 产物内标记次数 == bundle 内次数，而 bundle 内可为 0 → 恒真
 *                       M == N+1 → 模板占位符未被替换；M < N → 内容被截断
 *   V3 项目名占位符消失 产物不含 PROJECT_NAME
 *   V4 项目名已写入     产物含 --project-name 值
 *   （v9.0.0 已删）V5 体积合理：产物字节 ≈ 模板+bundle（±5%）——比的是自己刚写出的文件，构造即成立
 *                       更新模式: 产物字节 ≈ 原产物字节（±5%）且 > 1MB
 *   V6 SYNC_DATA 成对   BEGIN 与 END 各恰好 1 次且 BEGIN 在 END 之前
 *   V7 无 BOM           产物前 3 字节不是 EF BB BF
 *   更新模式下 V3/V4 不适用 → 跳过并在报告中说明（V2/V5 已于 v9.0.0 删除）。
 *   V8 数据块 lint（v9.3.0 新增，仅更新模式）：对 AI 手写的 DIAGRAMS 源码查 7 项——
 *   反引号/单引号配对、subgraph 与 end 等数、classDef 禁 rgba() 逗号色值、节点 id 唯一、
 *   :::类名 ∈ 色板键、data-status ∈ {todo,doing,done,bug}、.nsub 单行 ≤40 CJK。
 *   动机：V1/V3/V4/V6/V7 全是字符串级检查、不执行 JS，Mermaid 语法错会渲染成错误框却全绿。
 *   首发为 WARNING（打印明细、不改退出码）；连续一轮实测零误报后升 FAIL 并计入退出码。
 *
 * 退出码: 0 = 成功且全部自验通过；1 = 参数错误/文件不存在；2 = 自验失败或读写异常
 * 幂等: 重复执行结果一致（覆盖写入）
 * ============================================================ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import z from 'node:zlib';
import crypto from 'node:crypto';

const BEGIN = 'SYNC_DATA:BEGIN';
const END = 'SYNC_DATA:END';
const BUNDLE_MARK = '/*__MERMAID_BUNDLE__*/';
const NAME_MARK = '{{PROJECT_NAME}}';
const ENGINE_MARK = '__mermaidElk';
const ONE_MB = 1048576;
/* 随库分发的是 brotli 压缩引擎（545,624B）；未压缩 2,916,204B 会让分发集超 §4.5 的 5MB 预算。
 * 钉值只有一个合法落点：本脚本。闸门 tools/checks/30 每次实跑解压与它比对，所以钉值过期即红。 */
const ENGINE_SHA256 = '513079b0f88fe8d0195f8461124fa252f15bdcb462943a7afbd61b2a44f608e3';
/* 引擎缓存落点：PANEL_ENGINE_CACHE 覆盖（活体闸门 tools/checks/30 就靠它把取证写在临时目录，
 * 不污染用户 home）；默认用户级共享目录——同一个用户下 N 个项目只膨胀一次。 */
const ENGINE_CACHE = process.env.PANEL_ENGINE_CACHE
  || path.join(os.homedir(), '.qoder-cn', 'cache', 'better-coding');

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
};
const Template = flag('template');
const Bundle = flag('bundle');
const Out = flag('out');
const ProjectName = flag('project-name');
const SyncDataFile = flag('sync-data-file');

const say = s => console.log(s);
const fatal = msg => { say(`[build-panel] ${msg}`); process.exit(1); };
const countOcc = (hay, needle) => (hay && needle ? hay.split(needle).length - 1 : 0);
/* needle 首次出现所在行号（1 起；未找到 0）。只用 indexOf，不碰行式工具。 */
const lineNumber = (content, needle) => {
  const i = content.indexOf(needle);
  return i < 0 ? 0 : content.slice(0, i).split('\n').length;
};
/* 字面量全文替换。**必须** split/join 而不是 String.replaceAll：替换串里的 `$&`、`$1`、
 * `$<name>` 等序列在 replace* 的字符串替换里有特殊含义，而 2.9MB minified bundle 里
 * 出现 `$` 组合是必然的 —— 用 replaceAll 会静默改写引擎字节。 */
const replaceAllLit = (hay, needle, sub) => (needle ? hay.split(needle).join(sub) : hay);
/* 引擎载体归一（Task 5.12③）：明文 .js 与压缩 .js.br **都必须**过钉值哈希对账。
 * 返回 { file, reused, note }，note 逐字进产物报告——活体闸门判"第二次没重新解压"就看它。 */
const sha256Buf = b => crypto.createHash('sha256').update(b).digest('hex');
const sha256File = p => sha256Buf(fs.readFileSync(p));
/** 哈希对账：不符默认拒绝；只有显式 PANEL_ENGINE_ALLOW_UNPINNED=1 才降级为警告（构建后未改钉值的开发流程） */
function verifyEngine(buf, where) {
  const got = sha256Buf(buf);
  if (got === ENGINE_SHA256) return { ok: true, got };
  if (process.env.PANEL_ENGINE_ALLOW_UNPINNED === '1') {
    say(`  ⚠️ ${where} 哈希 ${got.slice(0, 16)}… ≠ 钉值 ${ENGINE_SHA256.slice(0, 16)}…，`
      + '已按 PANEL_ENGINE_ALLOW_UNPINNED=1 放行（该产物不得入库；改产物后须同步两处钉值）');
    return { ok: false, got };
  }
  fatal(`${where} 哈希不符：实得 ${got}，期望 ${ENGINE_SHA256}`
    + ' —— 引擎与脚本不同代或被改写，拒绝用未验明的引擎拼面板');
  return { ok: false, got };   // 不可达：fatal 已退出
}
function writeAtomic(target, buf) {
  fs.mkdirSync(ENGINE_CACHE, { recursive: true });
  /* 崩溃遗留的 .tmp 不会被复用也不会被覆盖，攒久了就是缓存目录里的隐形垃圾。
   * 🔴 P2-5：但 ENGINE_CACHE 是**用户级共享目录**（多项目、多进程同时可见），无差别删光 .tmp
   * 会把另一个正在写盘的项目的半成品删掉——rename 失败是对方受害。两条限制：
   * ① 只删 mtime 超 1 小时的（崩溃遗留远老于此，正在写的必然新于此）；
   * ② 跳过带本进程 pid 的（自己的 tmp 走完 rename 就没了，正常路径扫不到，防御性留一手）。 */
  const nowMs = Date.now();
  for (const f of fs.readdirSync(ENGINE_CACHE)) {
    if (!f.endsWith('.tmp') || f.includes(`.${process.pid}.`)) continue;
    const stale = path.join(ENGINE_CACHE, f);
    try { if (nowMs - fs.statSync(stale).mtimeMs < 3600_000) continue; } catch { continue; }
    fs.rmSync(stale, { force: true });
  }
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, target);
}
function resolveEngine(p) {
  if (!/\.br$/.test(p)) {
    const raw = fs.readFileSync(p);
    const v = verifyEngine(raw, `明文引擎 ${path.basename(p)}`);
    return { file: p, reused: false, note: `${p}（明文引擎，${v.ok ? '哈希命中钉值' : '未验明，按环境变量放行'}）` };
  }
  const target = path.join(ENGINE_CACHE, `mermaid-elk-${ENGINE_SHA256.slice(0, 12)}.js`);
  if (fs.existsSync(target) && sha256File(target) === ENGINE_SHA256) {
    return { file: target, reused: true, note: `${target}（缓存复用，未重新解压）` };
  }
  const inflated = z.brotliDecompressSync(fs.readFileSync(p));
  const v = verifyEngine(inflated, `${path.basename(p)} 解压`);
  /* 未验明时绝不写进按钉值命名的缓存（那等于把 A 的内容挂上 B 的名字），另存内容寻址文件 */
  const dest = v.ok ? target : path.join(ENGINE_CACHE, `unpinned-${v.got.slice(0, 12)}.js`);
  writeAtomic(dest, inflated);
  return { file: dest, reused: false, note: `${dest}（已从 ${p} 膨胀出 ${inflated.length} bytes）` };
}
/* 读文本并剥 BOM：原 .ps1 走 [IO.File]::ReadAllText(UTF8) 会吞掉 BOM，
 * Node 的 utf8 解码会把它留在串首，不剥就会跟着拼进产物。 */
const readText = p => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');

const vFailures = [];
function vCheck(name, pass, detail, advice) {
  if (pass) say(`  自验 ${name} ✅ ${detail}`);
  else {
    say(`  自验 ${name} ❌ ${detail}`);
    say(`       诊断建议: ${advice}`);
    vFailures.push(name);
  }
}
const pct = d => `${(d * 100).toFixed(1)}%`;
const sizeOf = p => fs.statSync(p).size;
const hasBom = p => {
  const fd = fs.openSync(p, 'r');
  const b = Buffer.alloc(3);
  const n = fs.readSync(fd, b, 0, 3, 0);
  fs.closeSync(fd);
  return n >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
};
const t0 = Date.now();

try {
  if (!Out || !Out.trim()) fatal('参数错误: 缺少 --out（输出 HTML 路径）');
  const isUpdate = !!(SyncDataFile && SyncDataFile.trim());
  const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };

  if (isUpdate) {
    if (!isFile(Out)) fatal(`参数错误: 更新模式要求 --out 为已存在的产物文件: ${Out}`);
    if (!isFile(SyncDataFile)) fatal(`参数错误: --sync-data-file 不存在: ${SyncDataFile}`);
  } else {
    if (!Template || !Template.trim()) fatal('参数错误: 完整拼接模式缺少 --template（如为数据块更新请传 --sync-data-file）');
    if (!Bundle || !Bundle.trim()) fatal('参数错误: 完整拼接模式缺少 --bundle');
    if (!ProjectName || !ProjectName.trim()) fatal('参数错误: 完整拼接模式缺少 --project-name');
    if (!isFile(Template)) fatal(`参数错误: --template 不存在: ${Template}`);
    if (!isFile(Bundle)) fatal(`参数错误: --bundle 不存在: ${Bundle}`);
  }

  if (isUpdate) {
    /* ===== 更新模式：替换已存在产物中 SYNC_DATA 标记之间的区块 ===== */
    const origSize = sizeOf(Out);
    const outText = readText(Out);
    const syncText = readText(SyncDataFile);

    const cntBegin = countOcc(outText, BEGIN);
    const cntEnd = countOcc(outText, END);
    if (cntBegin !== 1 || cntEnd !== 1) {
      say(`[build-panel] 自验前置失败: 产物中 SYNC_DATA 标记不成对（BEGIN=${cntBegin} 次, END=${cntEnd} 次，应各 1 次）: ${Out}`);
      say('       诊断建议: 产物结构已损坏，请改用完整拼接模式重建（--template + --bundle + --project-name）');
      process.exit(2);
    }
    const bIdx = outText.indexOf(BEGIN);
    const eIdx = outText.indexOf(END);
    if (bIdx >= eIdx) {
      say(`[build-panel] 自验前置失败: 产物中 SYNC_DATA:BEGIN 不在 SYNC_DATA:END 之前，结构损坏: ${Out}`);
      say('       诊断建议: 请改用完整拼接模式重建产物');
      process.exit(2);
    }
    const bLineEnd = outText.indexOf('-->', bIdx);
    if (bLineEnd < 0 || bLineEnd > eIdx) {
      say(`[build-panel] 自验前置失败: 产物中 SYNC_DATA:BEGIN 标记行未正常闭合（缺 -->），结构损坏: ${Out}`);
      process.exit(2);
    }
    const eLineStart = outText.lastIndexOf('<!--', eIdx);
    if (eLineStart < 0 || eLineStart < bLineEnd) {
      say(`[build-panel] 自验前置失败: 产物中 SYNC_DATA:END 标记行缺少 <!-- 行首，结构损坏: ${Out}`);
      process.exit(2);
    }

    /* 防御性剥离：数据块文件误带 BEGIN/END 标记行时剥掉（契约：文件不含标记行）。
     * 与 .ps1 的 Remove($ls + 1, $le - $ls) 逐字节等值：删除区间 = [ls+1, le] 闭区间，
     * 连同行尾换行一起吃掉；找不到前置换行时 ls = -1，于是从第 0 个字符开始删。
     * 这是原实现的既有形状，不"顺手修正"：修它就会让两条腿在同一份输入上产出不同字节，
     * 等价性判据当场失效。 */
    let inner = syncText;
    for (const ln of [BEGIN, END]) {
      const p = inner.indexOf(ln);
      if (p >= 0) {
        const ls = inner.lastIndexOf('\n', p);
        let le = inner.indexOf('\n', p);
        if (le < 0) le = inner.length - 1;
        inner = inner.slice(0, ls + 1) + inner.slice(le + 1);
      }
    }

    /* v9.3.0 S6：V8 数据块 lint —— 只作用于 AI 手写的 DIAGRAMS 源码，且在写产物之前跑（坏图不落盘）。
     * 为什么既有自验兜不住：V1/V3/V4/V6/V7 全是字符串级检查，不执行 JS。一个 rgba() 逗号色值、
     * 一个未闭合 subgraph、一个不在色板里的 :::类名，都会让浏览器把该图渲染成错误框，而五项自验照样全绿。
     * 严重度：v9.3.0 首发为 WARNING（打印明细、不改退出码）；连续一轮实测零误报后升 FAIL 并计入退出码
     * ——判据升级必须有实测依据，不靠猜（同 --fast 那条纪律）。 */
    {
      const PALETTE_KEYS = ['person', 'system', 'external', 'client', 'gateway', 'service', 'data', 'component', 'ui-artifact', 'prototype'];
      const STATUS_OK = ['todo', 'doing', 'done', 'bug'];
      const v8 = [];
      const blocks = [...inner.matchAll(/\b(context|container|component)\s*:\s*`([\s\S]*?)`/g)].map(m => ({ view: m[1], src: m[2] }));
      if (!blocks.length) v8.push('[V8] 数据块里没解析到 context/container/component 任一段 DIAGRAMS 源码（字段名或反引号被改写过？）');
      for (const { view, src } of blocks) {
        const t = `[V8/${view}]`;
        if ((src.match(/`/g) || []).length % 2) v8.push(`${t} 反引号不成对`);
        if ((src.match(/'/g) || []).length % 2) v8.push(`${t} 单引号不成对（节点标签里的 class='…' 最容易漏一只）`);
        const subN = (src.match(/\bsubgraph\b/g) || []).length;
        const endN = (src.match(/^\s*end\s*$/gm) || []).length;
        if (subN !== endN) v8.push(`${t} subgraph=${subN} 与 end=${endN} 数量不等（Mermaid 要求逐对闭合）`);
        if (/classDef[^\n]*rgba\s*\(/.test(src)) v8.push(`${t} classDef 用了 rgba() 逗号色值 —— Mermaid 词法器限制，整图渲染失败`);
        const ids = [...src.matchAll(/^[ \t]*([A-Za-z_][\w-]*)[ \t]*(?:\[|\()/gm)]
          .map(m => m[1]).filter(x => !['subgraph', 'flowchart', 'direction'].includes(x));
        const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
        if (dup.length) v8.push(`${t} 节点 id 重复：${dup.join(', ')}（后者会静默覆盖前者的标签）`);
        for (const c of new Set([...src.matchAll(/:::([\w-]+)/g)].map(m => m[1])))
          if (!PALETTE_KEYS.includes(c)) v8.push(`${t} 未知类名 :::${c}（不在模板色板键内，该节点会无样式）`);
        for (const s of new Set([...src.matchAll(/data-status='([^']*)'/g)].map(m => m[1])))
          if (!STATUS_OK.includes(s)) v8.push(`${t} data-status='${s}' 不在四值枚举 {${STATUS_OK.join(',')}} 内，状态徽标不渲染`);
        for (const m of src.matchAll(/<span class='nsub'>([^<]*)<\/span>/g))
          if ((m[1].match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) || []).length > 40)
            v8.push(`${t} 节点副题超 40 CJK 字符，须用 <br/> 分行：${m[1].slice(0, 20)}…`);
      }
      if (v8.length) {
        say(`  自验 V8 数据块 lint ⚠️ ${v8.length} 项存疑（v9.3.0 首发为警告级，不改退出码；零误报一轮后升 FAIL）`);
        for (const w of v8.slice(0, 12)) say(`       - ${w}`);
        if (v8.length > 12) say(`       ... 共 ${v8.length} 项`);
      } else {
        say(`  自验 V8 数据块 lint ✅ ${blocks.length} 段图源码 × 7 项检查全过`);
      }
    }

    const product = outText.slice(0, bLineEnd + 3) + '\n'
      + inner.replace(/[\r\n]+$/, '') + '\n'
      + outText.slice(eLineStart);
    fs.writeFileSync(Out, product, 'utf8');

    vCheck('V1 引擎注入', countOcc(product, ENGINE_MARK) >= 2,
      `产物含 ${ENGINE_MARK} ${countOcc(product, ENGINE_MARK)} 次（模板取用 1 + 引擎定义 ≥1）`,
      `产物疑非本工具链构建的面板（引擎缺失，只剩模板自身那 1 次引用）——更新模式不注入引擎，请用完整拼接模式重建`);
    const outSize = sizeOf(Out);
    /* V5 体积合理已删（自证）：比的是本工具刚写出的同一个文件，±5% 宽到吞得下真实截断 */
    const pBegin = countOcc(product, BEGIN);
    const pEnd = countOcc(product, END);
    vCheck('V6 SYNC_DATA 成对', pBegin === 1 && pEnd === 1 && product.indexOf(BEGIN) < product.indexOf(END),
      `BEGIN=${pBegin} 次, END=${pEnd} 次, BEGIN 在 END 之前`,
      '数据块结构损坏，后续同步无法定位标记；请检查 --sync-data-file 是否误带标记行，或用完整拼接模式重建');
    vCheck('V7 无 BOM', !hasBom(Out), '产物前 3 字节非 EF BB BF',
      '产物被写入 BOM，会污染 HTML/JS；请确认写入路径使用 UTF8 无 BOM 编码');
    say('  自验 V3/V4 ⏭️ 跳过（更新模式不触及项目名占位符与项目名，不适用）');

    if (vFailures.length) {
      say(`[build-panel] 更新失败: ${vFailures.length} 项自验未通过（${vFailures.join(', ')}）— 产物可能已损坏，请检查后重试或重建`);
      process.exit(2);
    }
    say('[build-panel] SYNC_DATA 更新完成');
    say(`  产物: ${Out} (${outSize} bytes ← 原 ${origSize} bytes)`);
    say(`  数据块: ${SyncDataFile} (${sizeOf(SyncDataFile)} bytes)`);
    say(`  耗时: ${Date.now() - t0} ms`);
    process.exit(0);
  }

  /* ===== 完整拼接模式：模板 + bundle + 项目名 → 自包含单文件面板 ===== */
  const tplSize = sizeOf(Template);
  const srcSize = sizeOf(Bundle);            /* 分发载体体积：.br 时是压缩字节数 */
  const eng = resolveEngine(Bundle);         /* .br → 按需膨胀并校验；明文 .js 原样用 */
  const bndSize = sizeOf(eng.file);          /* 真正拼进产物的明文引擎体积 */
  const tplText = readText(Template);
  const bndText = readText(eng.file);

  const bndLines = bndText.split('\n').length;
  let bndMaxLine = 0;
  for (const ln of bndText.split('\n')) if (ln.length > bndMaxLine) bndMaxLine = ln.length;
  const bndElkLine = lineNumber(bndText, ENGINE_MARK);

  let product = replaceAllLit(tplText, BUNDLE_MARK, bndText);
  product = replaceAllLit(product, NAME_MARK, ProjectName);

  const outDir = path.dirname(Out);
  if (outDir && !fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(Out, product, 'utf8');

  const outSize = sizeOf(Out);
  const outText = readText(Out);

  vCheck('V1 引擎注入', countOcc(outText, ENGINE_MARK) >= 2 && outSize >= bndSize,
    `产物含 ${ENGINE_MARK} ${countOcc(outText, ENGINE_MARK)} 次（模板取用 1 + 引擎定义 ≥1），产物 ${outSize}B ≥ 引擎 ${bndSize}B`,
    `引擎没真的拼进去：模板自身就含 1 次 ${ENGINE_MARK}，只看"含不含"会恒真；检查 --bundle 是否指向真实引擎、模板是否含 ${BUNDLE_MARK} 占位符、写入是否被截断`);
  /* V2 占位符对账已删（恒真）：bundle 内标记次数 N 实测可为 0，M==N 必过，等于没有断言 */
  vCheck('V3 项目名占位符消失', !outText.includes('PROJECT_NAME'), '产物不含 PROJECT_NAME',
    `项目名未替换：检查模板占位符是否恰为 ${NAME_MARK}（双花括号），或 --project-name 是否误传了含 PROJECT_NAME 的值`);
  vCheck('V4 项目名已写入', outText.includes(ProjectName), `产物含项目名「${ProjectName}」`,
    `替换未生效：确认模板中存在 ${NAME_MARK} 占位符`);
  /* V5 体积合理已删（自证）：比的是本工具刚写出去的同一个文件/模板+bundle 之和，
   * ±5%（约 ±146KB）宽到吞得下真实截断；体积判据改由分发侧闸门 tools/checks/30 承担 */
  const cntBegin = countOcc(outText, BEGIN);
  const cntEnd = countOcc(outText, END);
  vCheck('V6 SYNC_DATA 成对', cntBegin === 1 && cntEnd === 1 && outText.indexOf(BEGIN) < outText.indexOf(END),
    `BEGIN=${cntBegin} 次, END=${cntEnd} 次, BEGIN 在 END 之前`,
    '数据块结构损坏，后续同步无法定位标记；检查模板 SYNC_DATA 注释标记是否被改动');
  vCheck('V7 无 BOM', !hasBom(Out), '产物前 3 字节非 EF BB BF',
    '产物被写入 BOM，会污染 HTML/JS；请确认写入路径使用 UTF8 无 BOM 编码');

  if (vFailures.length) {
    say(`[build-panel] 构建失败: ${vFailures.length} 项自验未通过（${vFailures.join(', ')}）— 产物不可用，请按上方诊断建议排查后重跑`);
    process.exit(2);
  }

  say('[build-panel] 拼接完成');
  say(`  模板: ${Template} (${tplSize} bytes)`);
  say(`  引擎载体: ${Bundle} (${srcSize} bytes${/\.br$/.test(Bundle) ? '，brotli 压缩' : ''})`);
  say(`  引擎明文: ${eng.note}`);
  say(`  引擎体积: ${bndSize} bytes, ${bndLines} 行, 最长行 ${bndMaxLine} 字符, ${ENGINE_MARK} 于第 ${bndElkLine} 行`);
  say(`  产物: ${Out} (${outSize} bytes)`);
  say(`  项目名: ${ProjectName}`);
  say('  自验: V1 ✅ / V3 ✅ / V4 ✅ / V6 ✅ / V7 ✅（V2 恒真、V5 自证，v9.0.0 已删，理由见文件头）');
  say('  自验 V8 ⏭️ 跳过（完整拼接模式的数据块是模板初态示意占位，非 AI 手写；V8 只在更新模式 lint 手写图）');
  say(`  耗时: ${Date.now() - t0} ms`);
  process.exit(0);
} catch (e) {
  say(`[build-panel] 异常终止（耗时 ${Date.now() - t0} ms）: ${e && e.message ? e.message : String(e)}`);
  if (e && e.stack) say('  ' + String(e.stack).split('\n').slice(1, 3).join('\n  '));
  process.exit(2);
}
