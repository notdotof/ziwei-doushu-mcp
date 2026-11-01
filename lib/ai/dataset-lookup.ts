/**
 * 紫微斗数开源解读数据集 v4.0 查询层（Release v4.0-13d）。
 *
 * 数据规格（见上游 README「二·新」）：
 *   - 674,976 张命盘（公历 1950–2026 每个真实日期 × 12 时辰 × 男女）× 13 维 = 8,774,688 段解读；
 *   - 每行一张盘（JSON Lines）：k=「YYYY-MM-DD-时辰序号-性别」、c=13 维解读全文，单行约 3 万字；
 *   - 按时辰序号直接排盘、晚子时按次日排盘（与 resolveBirth 的 next-day 规则一致），
 *     未做真太阳时校正——因此查询键应使用「真太阳时校正后的排盘日与时辰支」，
 *     (日期, 时辰支) 空间与数据集完全一致。
 *
 * 存储：<datasetDir>/year-YYYY.jsonl（由 Release 的 .zst 一次性解压得到）。
 * 首次查询某年时流式扫描建「键 → 字节偏移」索引并落盘缓存（index/year-YYYY.idx.json），
 * 之后查询只读单行，秒回。
 *
 * 目录解析（相对 import.meta.url，与进程 cwd 无关）：
 *   1. 环境变量 ZIWEI_DATASET_DIR（绝对路径，优先）；
 *   2. 源码仓库布局：lib/ai/ → ../../data/interp-v4；
 *   3. 单文件打包布局：server/ → ../data/interp-v4。
 */
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, readSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createZstdDecompress } from 'node:zlib';

export const DIM_KEYS = [
  'overview', 'personality', 'love', 'career', 'wealth', 'health', 'family',
  'children', 'move', 'friends', 'home', 'spirit', 'parents',
] as const;
export type DimKey = (typeof DIM_KEYS)[number];

export const DIM_LABELS: Record<DimKey, string> = {
  overview: '命格总览', personality: '性格', love: '感情', career: '事业',
  wealth: '财运', health: '健康', family: '兄弟', children: '子女',
  move: '迁移', friends: '人际', home: '田宅', spirit: '福德', parents: '父母',
};

export interface DatasetEntry {
  k: string;
  y: number;
  m: number;
  d: number;
  /** 时辰序号 0-11（子=0） */
  h: number;
  g: 'male' | 'female';
  /** 命宫第一颗主星；空宫为 null */
  ms: string | null;
  /** 各维字数 */
  t: Record<string, number>;
  /** 13 维解读全文（Markdown） */
  c: Partial<Record<DimKey, string>>;
}

export type LookupResult =
  | { status: 'ok'; entry: DatasetEntry }
  | { status: 'year_not_installed'; year: number; file: string }
  | { status: 'not_found'; key: string; year: number };

const MALE = 'male', FEMALE = 'female';
const KEY_TAG = '{"k":"';
const INDEX_DIR = 'index';

let resolvedDir: string | null = null;

export function datasetDir(): string {
  if (resolvedDir) return resolvedDir;
  const candidates: string[] = [];
  if (process.env.ZIWEI_DATASET_DIR) candidates.push(process.env.ZIWEI_DATASET_DIR);
  candidates.push(
    fileURLToPath(new URL('../../data/interp-v4', import.meta.url)),
    fileURLToPath(new URL('../data/interp-v4', import.meta.url)),
  );
  resolvedDir = candidates.find((p) => p && existsSync(p)) ?? candidates[candidates.length - 1];
  return resolvedDir;
}

/** 数据集里已就绪的年份（存在对应 year-YYYY.jsonl） */
export function datasetYears(): number[] {
  const dir = datasetDir();
  if (!existsSync(dir)) return [];
  const years: number[] = [];
  for (const name of listDirSafe(dir)) {
    const m = /^year-(\d{4})\.jsonl$/.exec(name);
    if (m) years.push(Number(m[1]));
  }
  return years.sort((a, b) => a - b);
}

function listDirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** 组查询键：YYYY-MM-DD-时辰序号-性别（月日两位补零） */
export function datasetKey(year: number, month: number, day: number, branch: number, gender: 'male' | 'female'): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}-${branch}-${gender}`;
}

type YearIndex = { size: number; offsets: Map<string, number> };
const indexCache = new Map<number, YearIndex>();

function yearFile(year: number): string {
  return `${datasetDir()}/year-${year}.jsonl`;
}

function indexFile(year: number): string {
  return `${datasetDir()}/${INDEX_DIR}/year-${year}.idx.json`;
}

/** 取某年索引：优先读磁盘缓存，失效则全文件流式扫描重建 */
function getYearIndex(year: number): YearIndex | null {
  const file = yearFile(year);
  if (!existsSync(file)) return null;
  const cached = indexCache.get(year);
  if (cached) return cached;

  const size = statSync(file).size;
  const loaded = loadIndexFromDisk(year, size);
  if (loaded) {
    indexCache.set(year, loaded);
    return loaded;
  }
  const built = buildIndex(year, file, size);
  indexCache.set(year, built);
  saveIndexToDisk(year, built);
  return built;
}

function loadIndexFromDisk(year: number, size: number): YearIndex | null {
  const file = indexFile(year);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { size: number; offsets: Record<string, number> };
    if (parsed.size !== size || !parsed.offsets || typeof parsed.offsets !== 'object') return null;
    return { size, offsets: new Map(Object.entries(parsed.offsets)) };
  } catch {
    return null;
  }
}

function saveIndexToDisk(year: number, idx: YearIndex): void {
  try {
    const dir = `${datasetDir()}/${INDEX_DIR}`;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(indexFile(year), JSON.stringify({ size: idx.size, offsets: Object.fromEntries(idx.offsets) }));
  } catch {
    /* 缓存写失败不影响查询 */
  }
}

/**
 * 流式扫描整个 jsonl，记录每行键的字节偏移。
 * 每块 8MB，块尾保留 KEEP 字节并入下一块（KEEP > 键标记+最长键，防跨块截断漏检）；
 * 末块全量扫描。匹配到的偏移即该行行首（数据集每行恒以 {"k":" 开头）。
 */
const KEY_RE = /^\d{4}-\d{2}-\d{2}-\d{1,2}-(male|female)$/;

function buildIndex(year: number, file: string, size: number): YearIndex {
  const offsets = new Map<string, number>();
  const fd = openSync(file, 'r');
  try {
    const CHUNK = 8 * 1024 * 1024;
    const KEEP = 64;
    const rbuf = Buffer.allocUnsafe(CHUNK);
    let leftover = Buffer.alloc(0);
    let workStart = 0; // leftover[0] 对应的文件偏移
    let pos = 0;
    while (pos < size) {
      const n = readSync(fd, rbuf, 0, Math.min(CHUNK, size - pos), pos);
      if (n <= 0) break;
      const work = leftover.length ? Buffer.concat([leftover, rbuf.subarray(0, n)]) : Buffer.from(rbuf.subarray(0, n));
      const isFinal = pos + n >= size;
      const scanEnd = isFinal ? work.length : work.length - KEEP;
      let idx = 0;
      while (idx < scanEnd) {
        const at = work.indexOf(KEY_TAG, idx, 'latin1');
        if (at < 0 || at >= scanEnd) break;
        let end = at + KEY_TAG.length;
        while (end < work.length && work[end] !== 0x22) end++;
        if (end < work.length) {
          const key = work.toString('latin1', at + KEY_TAG.length, end);
          if (KEY_RE.test(key)) offsets.set(key, workStart + at);
          idx = end;
        } else {
          idx = at + 1;
        }
      }
      const keepFrom = isFinal ? work.length : Math.max(0, work.length - KEEP);
      leftover = Buffer.from(work.subarray(keepFrom));
      workStart += keepFrom;
      pos += n;
    }
  } finally {
    closeSync(fd);
  }
  return { size, offsets };
}

/** 在字节偏移处读取完整一行并解析 */
function readLineAt(file: string, offset: number): DatasetEntry | null {
  const fd = openSync(file, 'r');
  try {
    const READ = 512 * 1024;
    const buf = Buffer.alloc(READ);
    const n = readSync(fd, buf, 0, READ, offset);
    if (n <= 0) return null;
    let end = buf.indexOf(0x0a); // \n
    if (end < 0) end = n;
    return JSON.parse(buf.toString('utf8', 0, end)) as DatasetEntry;
  } finally {
    closeSync(fd);
  }
}

/**
 * 精确查询一张盘的解读。
 * 传入的日期/时辰支应为「排盘日」（已按真太阳时与晚子时规则换算，见 mcp/birth-resolve.ts）。
 */
export function lookupInterpretation(
  year: number,
  month: number,
  day: number,
  branch: number,
  gender: 'male' | 'female',
): LookupResult {
  const file = yearFile(year);
  if (!existsSync(file)) return { status: 'year_not_installed', year, file };
  const idx = getYearIndex(year);
  if (!idx) return { status: 'year_not_installed', year, file };
  const key = datasetKey(year, month, day, branch, gender);
  const offset = idx.offsets.get(key);
  if (offset === undefined) return { status: 'not_found', key, year };
  const entry = readLineAt(file, offset);
  if (!entry || entry.k !== key) return { status: 'not_found', key, year };
  return { status: 'ok', entry };
}

/** 数据集状态摘要（供工具在未安装时给出可执行的指引） */
export function datasetStatus(): { dir: string; years: number[] } {
  return { dir: datasetDir(), years: datasetYears() };
}

/* ------------------------------------------------------------------ */
/* 数据集在线安装（上游 Release v4.0-13d）                              */
/* ------------------------------------------------------------------ */

const DATASET_RELEASE_BASE = 'https://github.com/Renhuai123/ziwei-doushu/releases/download/v4.0-13d';
const MIN_YEAR = 1950;
const MAX_YEAR = 2026;
/** 单年解压后约 0.7GB，低于该阈值视为解压不完整 */
const MIN_JSONL_BYTES = 50 * 1024 * 1024;

/** Node 内置 zstd 解压能力（≥22.15）；没有则只能靠外部脚本安装 */
export function canDecompressNatively(): boolean {
  return typeof createZstdDecompress === 'function';
}

export type InstallOutcome =
  | { year: number; status: 'installed'; bytes: number }
  | { year: number; status: 'already' }
  | { year: number; status: 'failed'; error: string };

/**
 * 下载并安装若干年份到当前数据集目录：
 *   1. 拉取 Release 的 year-YYYY.jsonl.zst（每压缩包约 2MB）存到 <dir>/_zst/；
 *   2. 用 Node 内置 zstd 流式解压为 <dir>/year-YYYY.jsonl（长窗口帧）；
 *   3. 已存在同名 jsonl 的年份直接跳过。
 * 索引按需重建：安装后首次查询该年时自动扫描建索引。
 */
export async function installDatasetYears(years: number[]): Promise<{ outcomes: InstallOutcome[]; dir: string }> {
  const dir = datasetDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const zstDir = `${dir}/_zst`;
  if (!existsSync(zstDir)) mkdirSync(zstDir, { recursive: true });

  const outcomes: InstallOutcome[] = [];
  for (const year of years) {
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      outcomes.push({ year, status: 'failed', error: `年份须在 ${MIN_YEAR}–${MAX_YEAR}` });
      continue;
    }
    const jsonl = `${dir}/year-${year}.jsonl`;
    if (existsSync(jsonl) && statSync(jsonl).size > MIN_JSONL_BYTES) {
      outcomes.push({ year, status: 'already' });
      continue;
    }
    try {
      const zstPath = `${zstDir}/year-${year}.jsonl.zst`;
      if (!existsSync(zstPath) || statSync(zstPath).size < 1024 * 1024) {
        const resp = await fetch(`${DATASET_RELEASE_BASE}/year-${year}.jsonl.zst`);
        if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        writeFileSync(zstPath, buf);
      }
      await pipeline(
        Readable.from(readFileSync(zstPath)),
        createZstdDecompress(),
        createWriteStream(jsonl),
      );
      const bytes = statSync(jsonl).size;
      if (bytes < MIN_JSONL_BYTES) throw new Error(`解压结果异常（${bytes} 字节）`);
      outcomes.push({ year, status: 'installed', bytes });
    } catch (e) {
      outcomes.push({ year, status: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { outcomes, dir };
}
