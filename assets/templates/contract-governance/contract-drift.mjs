#!/usr/bin/env node
// .qoder/scripts/contract-drift.mjs — 模块间 API 契约版本漂移检测（机械门禁：breaking_drift 退出码 1 阻断构建）
//
// 端口来源：AINative 研发实战 `.qoder案例1/skills/apex-sdd/contract-governance/scripts/drift-detection.py`
//（Python + PyYAML）。比对语义逐条照抄：provider 声明的 api_version（取契约文件 info.version）与 consumer 的
// pinned_version 按 semver 比，major 不同 = breaking_drift、仅 minor/patch 不同 = minor_drift、全等 = aligned。
//
// 为什么端口成 Node（两条都是本环境实测事实，不是风格偏好）：
//   ① 本库脚本层自 v9.0.0 起只有 Node 一种载体（PowerShell/shell 孪生已全部删除，见 references/phase-a-checklist.md
//      的 scripts 维度与 tools/checks/18），再引入第二种语言就是把那条缺陷家族请回来；
//   ② Windows 上 `python3` 是 Microsoft Store 的应用执行别名（实测退出码 49、零输出），`python` 在用户机上
//      可能不存在——一个"跑不起来还报 0 个漂移"的门禁比没有门禁更坏。
//
// ⚠️ 与 Python 原版的差异全部就地标注（D1…D8），没标注的地方按"与原版同语义"读。
//
// 用法：
//   node .qoder/scripts/contract-drift.mjs --all --format text
//   node .qoder/scripts/contract-drift.mjs --module payment-service --format json
//   node .qoder/scripts/contract-drift.mjs --topology --format mermaid
// 退出码：0 = 无破坏性漂移 / 1 = 存在 breaking_drift（阻断）/ 2 = 用法或路径错误

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
/* D1（项目根推导）：原版从 scripts/ 往上回溯 5 层（scripts→contract-governance→apex-sdd→skills→.qoder→根），
 * 那是它自己的目录深度；本库落盘形态固定为 <项目根>/.qoder/scripts/contract-drift.mjs → 回溯 2 层。
 * 推导只作默认值，--project-root 始终优先（与原版一致）。 */
const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

const EXIT_OK = 0;
const EXIT_BREAKING_DRIFT = 1;
const EXIT_FILE_ERROR = 2;

/* ==================== YAML 子集解析（D2：取代 PyYAML.safe_load） ====================
 * 分发件必须零依赖：脚本落进项目的 .qoder/scripts/ 后没有 node_modules，也不能要求用户 npm install。
 * 因此自带一个"够读 deps.yaml 与 OpenAPI 头"的子集解析器，支持：块映射、块序列（含 `- key: value` 内联首键）、
 * 单/双引号标量、null/~/空值、true/false、整数与浮点、空集合 [] 与 {}、# 注释（引号内的 # 不剥）。
 * 原版靠 PyYAML 能读而这里读不出的写法（锚点 &、别名 *、块标量 | 与 >、多文档 ---、非空或跨行的流式 {} []、Tab 缩进）
 * 一律**显式抛错**，走与 yaml.YAMLError 相同的出口：stderr 告警 + 返回 null（即该条目判 error/skipped，不假装 aligned）。
 * 静默把读不懂的文件当"无依赖"才是这类门禁最坏的失败模式。 */
class YamlError extends Error { }

function stripComment(line) {
  let out = '', q = null;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (q) { out += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
    if (ch === '#' && (k === 0 || /\s/.test(line[k - 1]))) break;
    out += ch;
  }
  return out;
}
const unquote = s => {
  const q = s[0];
  return (s.length >= 2 && (q === '"' || q === "'") && s.endsWith(q)) ? s.slice(1, -1) : s;
};
/** 流式集合（`[a, b]` / `{k: v}`）按引号与括号深度感知切分；嵌套流式仍判不支持。 */
function splitTop(s) {
  const out = []; let depth = 0, q = null, cur = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}
function parseFlow(s) {
  const isSeq = s.startsWith('[');
  const inner = s.slice(1, -1).trim();
  /* 嵌套流式结构（`{ type: array, items: { $ref: '#/x' } }`）在真 OpenAPI 里是常态写法，
   * splitTop 已按引号与括号深度切分，递归交给 toScalar 即可——早期版本一律抛错会让整份契约读不懂。 */
  if (isSeq) return splitTop(inner).map(x => toScalar(x));
  const obj = {};
  for (const item of splitTop(inner)) {
    const i = firstColonOutside(item);
    if (i < 0) throw new YamlError(`流式映射项缺 ":"：${item}`);
    obj[toScalar(item.slice(0, i))] = toScalar(item.slice(i + 1));
  }
  return obj;
}
/** 第一个"不在引号/括号内"的冒号（URL 值里的 `http://` 不能被当成键值分隔） */
function firstColonOutside(t) {
  let depth = 0, q = null;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

function toScalar(raw) {
  const s = raw.trim();
  if (s === '') return null;
  const q = s[0];
  if (s.length >= 2 && (q === '"' || q === "'") && s.endsWith(q)) return s.slice(1, -1);
  if (/^(~|null|Null|NULL)$/.test(s)) return null;
  if (/^(true|True|TRUE|false|False|FALSE)$/.test(s)) return /^(true|True|TRUE)$/.test(s);
  if (/^[-+]?\d+$/.test(s)) return Number(s);
  if (/^[-+]?\d*\.\d+([eE][-+]?\d+)?$/.test(s)) return Number(s);
  if (s === '[]' || s === '{}') return s === '[]' ? [] : {};   // 空集合是 deps.yaml 的常态写法（`consumes: []`）
  /* 标量流式序列/映射必须能读：`[customer]` 这类写法在契约里极常见，
   * 原版靠 PyYAML 原生支持；一律抛错会把"能读的契约"判成 error（仿真实测 P0）。 */
  if ((/^\[.*\]$/.test(s) || /^\{.*\}$/.test(s))) return parseFlow(s);
  if (/^[{[]/.test(s)) throw new YamlError(`不完整的流式写法：${s}`);
  return s;
}
/* 键可以是引号式，也可以是 OpenAPI 路径式（`/orders:`）——原版靠 PyYAML 两者都读，这里同样不许窄化。 */
const KEY_PAT = '("[^"]*"|\'[^\']*\'|[^:\\s][^:]*)';
const isMapStart = t => new RegExp('^' + KEY_PAT + '\\s*:(\\s|$)').test(t);

function parseYaml(text) {
  /* D3（编码与行尾）：原版 open(encoding='utf-8') 遇到 BOM 会把 \ufeff 留在首行、CRLF 原样进正文。
   * 这里先剥 BOM、再按 \r?\n 切行——库内模板与用户手写文件在 Windows 上都是 CRLF，不该因此读失败。 */
  const lines = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach(raw => {
    if (raw.trim() === '') return;
    if (raw.includes('\t')) throw new YamlError('缩进含 Tab（YAML 禁止）');
    const body = stripComment(raw).replace(/\s+$/, '');
    if (body.trim() === '') return;
    if (/^(---|\.\.\.)\s*$/.test(body.trim())) throw new YamlError('不支持多文档分隔行');
    lines.push({ indent: body.length - body.trimStart().length, text: body.trim() });
  });
  if (!lines.length) return null;

  const parseSeq = (pos, indent) => {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent && /^-(\s|$)/.test(lines[pos].text)) {
      const { indent: i0, text } = lines[pos];
      const rest = text.replace(/^-(\s+|$)/, '');
      const restIndent = i0 + (text.length - rest.length);
      if (rest === '') {
        pos++;
        if (pos < lines.length && lines[pos].indent > i0) { const r = parseAny(pos, lines[pos].indent); arr.push(r.value); pos = r.pos; }
        else arr.push(null);
      } else if (isMapStart(rest)) {
        lines[pos] = { indent: restIndent, text: rest };     // 把 `- key: value` 改写成从 restIndent 起算的映射行
        const r = parseMap(pos, restIndent);
        arr.push(r.value); pos = r.pos;
      } else { arr.push(toScalar(rest)); pos++; }
    }
    return { value: arr, pos };
  };
  const parseMap = (pos, indent) => {
    const obj = {};
    while (pos < lines.length && lines[pos].indent === indent) {
      const t = lines[pos].text;
      if (/^-(\s|$)/.test(t)) break;
      const m = t.match(new RegExp('^' + KEY_PAT + '\\s*:\\s*(.*)$'));
      if (!m) throw new YamlError(`无法解析的行：${t}`);
      const key = unquote(m[1].trim());
      const val = m[2];
      if (val === '' || /^[|>][-+\d]*$/.test(val)) {
        if (val !== '') throw new YamlError(`不支持的块标量：${key}: ${val}`);
        pos++;
        if (pos < lines.length && lines[pos].indent > indent) { const r = parseAny(pos, lines[pos].indent); obj[key] = r.value; pos = r.pos; }
        /* 序列与键同缩进（`consumes:\n- provider: x`）是合法 YAML，原版能读，这里也须能读。 */
        else if (pos < lines.length && lines[pos].indent === indent && /^-(\s|$)/.test(lines[pos].text)) {
          const r = parseSeq(pos, indent); obj[key] = r.value; pos = r.pos;
        } else obj[key] = null;
      } else {
        if (/^[&*]/.test(val.trim())) throw new YamlError(`不支持的锚点/别名：${val}`);
        obj[key] = toScalar(val); pos++;
      }
    }
    return { value: obj, pos };
  };
  const parseAny = (pos, indent) => (/^-(\s|$)/.test(lines[pos].text) ? parseSeq(pos, indent) : parseMap(pos, indent));

  if (/^[&*]/.test(lines[0].text)) throw new YamlError('不支持的锚点/别名写法');
  const r = parseAny(0, lines[0].indent);
  if (r.pos < lines.length) throw new YamlError(`缩进不一致，第 ${r.pos + 1} 行无法归位：${lines[r.pos].text}`);
  return r.value;
}

/* ==================== semver 解析与比较（逐条照抄原版） ==================== */

/** 解析 semver 为 [major, minor, patch]；支持 'v' 前缀；解析失败返回 [0,0,0]。 */
function parseSemver(versionStr) {
  /* D4：原版用 int(parts[i])，"3-beta"/"3.5" 这类会抛 ValueError → 整个版本退 (0,0,0)。
   * Node 的 Number("3-beta") 同得 NaN，但 Number("3.5")=3.5 会被 int() 拒掉，故加 Number.isInteger 才等价。 */
  const s = String(versionStr).trim().replace(/^v+/, '');
  const parts = s.split('.');
  const nums = [0, 1, 2].map(i => {
    if (parts.length <= i) return 0;
    const n = Number(parts[i]);
    return Number.isInteger(n) ? n : NaN;
  });
  return nums.every(Number.isFinite) ? nums : [0, 0, 0];
}

/** pinned 与 actual 比较 → aligned | minor_drift | breaking_drift */
function compareVersions(pinned, actual) {
  const p = parseSemver(pinned), a = parseSemver(actual);
  if (p[0] === a[0] && p[1] === a[1] && p[2] === a[2]) return 'aligned';
  if (p[0] !== a[0]) return 'breaking_drift';
  /* major 相同时，无论 actual 更新（a[1]>p[1] 或同 minor 且 a[2]>p[2]）还是回退（actual < pinned），
   * 原版两条分支都返回 minor_drift——这里合并成一行，语义与原版一致（原版的 if 分支实为空转）。 */
  return 'minor_drift';
}

/* ==================== deps.yaml 与契约文件读取 ==================== */

/** 扫描 <root>/server/<模块>/deps.yaml 与 <root>/web/<模块>/deps.yaml 两层通配（原版用 glob.glob，D5：改成 readdirSync + isDirectory，
 *  差别只在原版会把同名**文件**也算进来——那种形态不是合法 deps.yaml，判不存在更合理）。 */
function findAllDepsFiles(projectRoot) {
  const out = [];
  for (const top of ['server', 'web']) {
    const dir = path.join(projectRoot, top);
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const f = path.join(dir, e.name, 'deps.yaml');
      if (fs.existsSync(f)) out.push(f);
    }
  }
  return out.sort();
}

/** 读 deps.yaml，返回 { data, error }。
 * ⚠️ 过去失败时只往 stderr 写一行就 return null，调用方 `continue` → `--all` 产出 **0 条目 + 退出码 0**，
 * "注册表读不懂"被当成"没有漂移"放行（与 d1b1cc1 修的"契约读不懂谎报 minor"是同一条病灶的另一半）。
 * 现在必须把原因带出去，由调用方落成 error 条目。 */
function loadDepsYaml(filepath) {
  if (!fs.existsSync(filepath)) return { data: null, error: null };   // 真的没有这个文件：合法跳过
  let text;
  try { text = fs.readFileSync(filepath, 'utf8'); }
  catch (e) { return { data: null, error: `读取失败：${e.message}` }; }
  try {
    const data = parseYaml(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) return { data, error: null };
    return { data: null, error: '顶层不是映射（deps.yaml 应以 metadata / provides / consumes 开头的字典）' };
  } catch (e) {
    return { data: null, error: e.message };
  }
}

/** deps.yaml 自己读不懂时的报告条目：结构与 analyzeDrift 同形，让聚合与两种格式化都照常用。 */
function depsUnreadableReport(filepath, reason) {
  return {
    results: [{ provider: '(deps.yaml 解析失败)', pinned_version: 'N/A', actual_version: 'DEPS_PARSE_ERROR', status: 'error', reason }],
    overall_status: 'error',
    module: path.basename(path.dirname(filepath)),
    deps_file: filepath,
  };
}

/** 读 API 契约 YAML 的 info.version（原版 load_api_contract_version）；路径相对项目根。 */
function loadApiContractVersion(contractFile, projectRoot) {
  const fullPath = path.join(projectRoot, contractFile);
  if (!fs.existsSync(fullPath)) return null;
  let text;
  try { text = fs.readFileSync(fullPath, 'utf8'); }
  catch (e) { process.stderr.write(`⚠️ 读取 API 契约失败: ${fullPath} — ${e.message}\n`); return null; }
  try {
    const spec = parseYaml(text);
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
    const info = spec.info;
    return info && typeof info === 'object' ? (info.version ?? null) : null;
  } catch (e) {
    process.stderr.write(`⚠️ 读取 API 契约失败: ${fullPath} — ${e.message}\n`);
    return null;
  }
}

/* ==================== 漂移检测核心 ==================== */

function analyzeDrift(depsData, projectRoot) {
  const results = [];
  let hasBreaking = false, hasMinor = false, hasError = false;

  for (const entry of depsData.consumes || []) {
    if (!entry || typeof entry !== 'object') continue;
    const contractFile = entry.contract_file;
    const pinnedVersion = entry.pinned_version;
    const provider = entry.provider ?? 'unknown';

    // 契约文件未登记（外部服务 / 尚未冻结）时无从比对：记 skipped，不判漂移
    if (!contractFile || contractFile === 'null' || !pinnedVersion || pinnedVersion === 'null') {
      results.push({ provider, pinned_version: pinnedVersion || 'N/A', actual_version: 'N/A', status: 'skipped' });
      continue;
    }
    const actualVersion = loadApiContractVersion(contractFile, projectRoot);
    if (actualVersion === null || actualVersion === undefined) {
      results.push({ provider, pinned_version: pinnedVersion, actual_version: 'READ_ERROR', status: 'error' });
      /* 原版把"读不到契约"降级成 minor（提示级、退 0）。仿真实测证明这是放行：
       * 契约文件路径写错或格式读不懂时，门禁其实什么都没验，却报告"通过"。
       * 现在记 error 并参与退出码——读不懂 ≠ 对齐。 */
      hasError = true;
      continue;
    }
    const status = compareVersions(pinnedVersion, actualVersion);
    results.push({ provider, pinned_version: pinnedVersion, actual_version: actualVersion, status });
    if (status === 'breaking_drift') hasBreaking = true;
    else if (status === 'minor_drift') hasMinor = true;
  }

  /* provider 侧自检（中段探针 P1-4）：过去只有 consumer 的 pinned_version 会被比对，
   * 把 provider 自己契约的 info.version 改掉，没有任何一处会发现"登记单与自身契约不符"。
   * 版本比对复用同一个 compareVersions（不另立第二套口径）；没登记 contract_file 的
   * 项做不到自检，但**必须显式报数**，否则 `overall_status: aligned` 会被读成"都验过了"。 */
  let providesUnverified = 0;
  for (const entry of depsData.provides || []) {
    if (!entry || typeof entry !== 'object') continue;
    const name = entry.name ?? 'unknown';
    const declared = entry.api_version ?? null;
    const contractFile = entry.contract_file ?? null;
    if (!contractFile || contractFile === 'null') { providesUnverified++; continue; }
    const actual = loadApiContractVersion(contractFile, projectRoot);
    if (actual === null || actual === undefined) {
      results.push({ provider: name, pinned_version: declared ?? 'N/A', actual_version: 'READ_ERROR', status: 'error', side: 'provides' });
      hasError = true;
      continue;
    }
    if (!declared) {
      results.push({ provider: name, pinned_version: 'N/A', actual_version: actual, status: 'error', side: 'provides' });
      hasError = true;
      continue;
    }
    const st = compareVersions(declared, actual);
    results.push({ provider: name, pinned_version: declared, actual_version: actual, status: st, side: 'provides' });
    if (st === 'breaking_drift') hasBreaking = true;
    else if (st === 'minor_drift') hasMinor = true;
  }

  return {
    results,
    /* provider 侧未登记 contract_file 的项数：这些接口版本无从自检，报告必须把盲区带出去。 */
    provides_unverified: providesUnverified,
    /* error 必须参与聚合：读不懂 ≠ 对齐。有 breaking 仍优先 breaking，
     * 否则有 error 就报 error——仿真实测它曾被谎报成 minor_drift 并退 0。 */
    overall_status: hasBreaking ? 'breaking_drift' : hasError ? 'error' : hasMinor ? 'minor_drift' : 'aligned',
  };
}

/** 指定模块：按 metadata.module_name 找到它的 deps.yaml */
function checkModuleDrift(moduleName, projectRoot) {
  let target = null;
  const unreadable = [];
  for (const df of findAllDepsFiles(projectRoot)) {
    const { data, error } = loadDepsYaml(df);
    if (error) { unreadable.push([df, error]); continue; }
    if (data && data.metadata && data.metadata.module_name === moduleName) { target = data; break; }
  }
  if (target === null) {
    /* 读不懂 ≠ 未登记：--all 已经会拦，--module 若仍记 aligned 就是同一份坏注册表
     * 在两条调用路径上一边拦一边放（口径分叉）。 */
    if (unreadable.length) {
      const rep = depsUnreadableReport(unreadable[0][0], unreadable[0][1]);
      rep.module = moduleName;
      return rep;
    }
    // 原版同样把"找不到 deps.yaml"记作 aligned + error 字段（未登记 ≠ 漂移），退出码 0；照抄以免两处口径分叉。
    return { module: moduleName, results: [], overall_status: 'aligned', error: `模块 ${moduleName} 未找到 deps.yaml` };
  }
  return { ...analyzeDrift(target, projectRoot), module: moduleName };
}

/** 全量扫描 */
function checkAllDrift(projectRoot) {
  const reports = [];
  for (const df of findAllDepsFiles(projectRoot)) {
    const { data, error } = loadDepsYaml(df);
    if (error) { reports.push(depsUnreadableReport(df, error)); continue; }
    if (data === null) continue;
    const moduleName = (data.metadata && data.metadata.module_name) || path.basename(path.dirname(df));
    const report = analyzeDrift(data, projectRoot);
    report.module = moduleName;
    report.deps_file = df;
    reports.push(report);
  }
  return reports;
}

/* ==================== 依赖拓扑（Mermaid） ==================== */

const DEPENDENCY_TYPE_LABEL_MAP = {
  rest_api: 'REST',
  event_consumer: 'MQ',
  event_publisher: 'MQ',
  external: 'External',
};

function generateTopology(projectRoot) {
  const edges = [];
  for (const df of findAllDepsFiles(projectRoot)) {
    const { data, error } = loadDepsYaml(df);
    /* 拓扑是视图不是门禁，读不懂的文件跳过即可——但仍要出声（警告原本在 loadDepsYaml 内部打印，
     * 现在由本调用点负责，否则跳过就变成彻底静默）。 */
    if (error) { process.stderr.write(`⚠️ 拓扑图跳过读不懂的 deps.yaml: ${df} — ${error}\n`); continue; }
    if (data === null) continue;
    const moduleName = (data.metadata && data.metadata.module_name) || path.basename(path.dirname(df));
    for (const entry of data.consumes || []) {
      if (!entry || typeof entry !== 'object') continue;
      const provider = entry.provider ?? 'unknown';
      const depType = entry.dependency_type ?? 'rest_api';
      edges.push([moduleName, provider, DEPENDENCY_TYPE_LABEL_MAP[depType] ?? depType]);
    }
  }
  /* 节点名不能当裸 id 写：module_name 取的是 metadata，作者写什么就是什么，含 `/`、空格或
     Mermaid 结构字符（[]{}|<>）时整张图在渲染端解析失败——而这段正是要贴进 PROJECT-LIVE 面板的。
     清洗成安全 id 又会引入第二个坑：`a_b` 与 `a/b` 清洗后同名，会在图里塌成一个点。
     所以双写：稳定的安全 id + 引号里的原始名（原名逐字保留，便于与人读的对账）。 */
  const idByName = new Map();
  const idOf = name => {
    if (idByName.has(name)) return idByName.get(name);
    const base = 'n_' + String(name).replace(/[^A-Za-z0-9_]/g, '_');
    let id = base, k = 1;
    while ([...idByName.values()].includes(id)) id = `${base}_${++k}`;
    idByName.set(name, id);
    return id;
  };
  /** 显示文本：剥掉会破坏 Mermaid 节点/边语法的字符，其余（含 `/`、空格、中文）原样保留。 */
  const txt = s => `"${String(s).replace(/["[\]{}|<>]/g, ' ').trim()}"`;
  const lines = ['graph TD'];
  for (const [consumer, provider, label] of edges) {
    lines.push(`    ${idOf(consumer)}[${txt(consumer)}] -->|${txt(label)}| ${idOf(provider)}[${txt(provider)}]`);
  }
  return lines.join('\n');
}

/* ==================== 输出格式化 ==================== */

const formatJsonReport = reports => JSON.stringify(reports, null, 2);   // 原版 ensure_ascii=False → Node 天然保留非 ASCII

/* error = 契约读不懂/找不到：门禁什么都没验成，绝不能显示成"未知状态"让人误读 */
const OVERALL_EMOJI = { aligned: '✅', minor_drift: '⚠️', breaking_drift: '❌', error: '❌' };
const OVERALL_LABEL = { aligned: 'PASS', minor_drift: 'WARN', breaking_drift: 'BLOCK', error: 'ERROR-BLOCK（未验证，退出码 2）' };
const STATUS_STR = {
  aligned: '✅ aligned',
  minor_drift: '⚠️ minor drift',
  breaking_drift: '❌ breaking drift',
  skipped: '⏭️ skipped',
  error: '❗ read error',
};

function formatTextReport(reports) {
  const sections = [];
  for (const report of reports) {
    const module = report.module ?? 'unknown';
    const overall = report.overall_status ?? 'unknown';
    const results = report.results || [];
    const lines = ['## Contract Governance Check', '', `Module: ${module}`,
      `Status: ${OVERALL_LABEL[overall] ?? 'UNKNOWN'}`, ''];

    if (report.error) { lines.push(`Error: ${report.error}`, ''); sections.push(lines.join('\n')); continue; }
    if (!results.length) { lines.push('No dependencies to check.', ''); sections.push(lines.join('\n')); continue; }

    lines.push('| Provider | Pinned | Actual | Status |', '|----------|--------|--------|--------|');
    for (const r of results) {
      lines.push(`| ${r.provider} | ${r.pinned_version} | ${r.actual_version} | ${STATUS_STR[r.status] ?? `? ${r.status}`} |`);
    }
    lines.push('', `Overall: ${OVERALL_EMOJI[overall] ?? '❓'} ${OVERALL_LABEL[overall] ?? 'UNKNOWN'}`, '');
    sections.push(lines.join('\n'));
  }
  return sections.join('\n');
}

/* ==================== 命令行（D6：手写取代 argparse） ====================
 * 原版三个互斥模式必选其一、--format 限定三值、错误由 argparse 以退出码 2 终止；这里保持同一形状，
 * 用法错误同样退 2（不与"检测到破坏性漂移"的 1 混用——1 的含义必须唯一属于门禁本身）。 */
const USAGE = `用法: node contract-drift.mjs (--module <名称> | --all | --topology) [--format json|text|mermaid] [--project-root <路径>] [--output <文件>]

  --module NAME       检测指定模块的契约漂移
  --all               检测所有已登记 deps.yaml 的模块
  --topology          生成 Mermaid 依赖拓扑图
  --format            输出格式（默认 json；topology 模式可用 mermaid/text）
  --project-root      项目根目录（默认：脚本所在位置的上两级）
  --output            写入文件而非 stdout`;

function die(msg) { process.stderr.write(`❌ ${msg}\n`); process.exit(EXIT_FILE_ERROR); }

function parseArgs(argv) {
  const opt = { module: null, all: false, topology: false, format: 'json', projectRoot: null, output: null };
  let modeSet = false;
  const setMode = v => { if (modeSet) die(`模式参数互斥，只能给一个（--module / --all / --topology）\n${USAGE}`); modeSet = true; v(); };
  const need = (flag, val) => { if (val === undefined) die(`${flag} 缺少取值\n${USAGE}`); return val; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') setMode(() => { opt.module = need(a, argv[++i]); });
    else if (a === '--all') setMode(() => { opt.all = true; });
    else if (a === '--topology') setMode(() => { opt.topology = true; });
    else if (a === '--format') {
      opt.format = need(a, argv[++i]);
      if (!['json', 'text', 'mermaid'].includes(opt.format)) die(`--format 只接受 json|text|mermaid，收到 ${opt.format}`);
    }
    else if (a === '--project-root') opt.projectRoot = need(a, argv[++i]);
    else if (a === '--output') opt.output = need(a, argv[++i]);
    else if (a === '--help' || a === '-h') { process.stdout.write(USAGE + '\n'); process.exit(EXIT_OK); }
    else die(`未知参数：${a}\n${USAGE}`);
  }
  if (!modeSet) die(`必须给 --module / --all / --topology 之一\n${USAGE}`);
  return opt;
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(opt.projectRoot || DEFAULT_PROJECT_ROOT);
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    die(`项目根目录不存在: ${projectRoot}`);
  }

  /* D7（写文件）：原版 os.makedirs(dirname, exist_ok=True) + 写文本，Node 用 mkdirSync(recursive) 同效。 */
  const emit = body => {
    if (!opt.output) { console.log(body); return; }
    const dir = path.dirname(path.resolve(opt.output));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(opt.output, body, 'utf8');
    console.log(`✅ 报告已写入: ${opt.output}`);
  };

  if (opt.topology) {
    const mermaid = generateTopology(projectRoot);
    /* D8：原版 topology 模式下 --format json 时把 mermaid 串包进 {"topology":…,"format":"mermaid"}，
     * text/mermaid 直接输出串，其余落回串——照抄这一分支表。 */
    emit(opt.format === 'json' ? JSON.stringify({ topology: mermaid, format: 'mermaid' }, null, 2) : mermaid);
    process.exit(EXIT_OK);
  }

  let reports;
  if (opt.module) {
    const report = { ...checkModuleDrift(opt.module, projectRoot), module: opt.module };
    reports = [report];
  } else {
    reports = checkAllDrift(projectRoot);
  }

  let globalStatus = 'aligned';
  let anyError = false;
  for (const report of reports) {
    if (report.overall_status === 'breaking_drift') { globalStatus = 'breaking_drift'; break; }
    if (report.overall_status === 'minor_drift') globalStatus = 'minor_drift';
    if (report.overall_status === 'error' || (report.results || []).some(r => r.status === 'error')) anyError = true;
  }

  /* 与原版一致：mermaid 只属于 topology 模式，漂移检测里给 mermaid 时降级为 text。 */
  emit(opt.format === 'json' ? formatJsonReport(reports) : formatTextReport(reports));
  /* 退出码三态：breaking=1（契约真的对不上）、error=2（门禁什么都没读到，不能算通过）、其余 0 */
  process.exit(globalStatus === 'breaking_drift' ? EXIT_BREAKING_DRIFT : anyError ? EXIT_FILE_ERROR : EXIT_OK);
}

main();
