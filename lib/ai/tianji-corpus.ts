import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ZiweiChart } from '../ziwei/types';
import type { Pattern } from '../ziwei/patterns';

export interface TianjiEntry {
  book: string;
  h2: string;
  h3: string;
  quote: string;
  t_hms: string;
  bvid: string;
  part: number;
  note: string;
}

const TOPIC_PALACE: Record<string, string> = {
  感情: '夫妻', 婚姻: '夫妻', 恋爱: '夫妻', 配偶: '夫妻', 桃花: '夫妻',
  事业: '官禄', 工作: '官禄', 职业: '官禄', 升迁: '官禄',
  财: '财帛', 财运: '财帛', 钱: '财帛', 生意: '财帛', 投资: '财帛',
  健康: '疾厄', 身体: '疾厄', 疾病: '疾厄',
  外出: '迁移', 搬家: '迁移', 出国: '迁移',
  子女: '子女', 父母: '父母', 兄弟: '兄弟', 朋友: '仆役', 合伙: '仆役',
  房产: '田宅', 家宅: '田宅', 居住: '田宅',
  心情: '福德', 精神: '福德',
  命格: '命宫', 性格: '命宫', 总览: '命宫', 整体: '命宫',
};

const PRIORITY_H3 = ['定性', '核心定性', '总论', '总格', '个性', '性情', '格局', '入庙', '落陷'];

let cache: TianjiEntry[] | null = null;

/**
 * 解析《天纪》语料路径，兼容两种布局：
 *   · 源码仓库：lib/ai/ → ../../docs/tianji-ziwei/entries.jsonl
 *   · 单文件打包（esbuild bundle 置于 server/ 子目录）：→ ../docs/tianji-ziwei/entries.jsonl
 * 均相对模块自身位置（import.meta.url）解析，与进程工作目录无关。
 */
function corpusFile(): string {
  const candidates = [
    new URL('../../docs/tianji-ziwei/entries.jsonl', import.meta.url),
    new URL('../docs/tianji-ziwei/entries.jsonl', import.meta.url),
  ];
  for (const u of candidates) {
    const p = fileURLToPath(u);
    if (existsSync(p)) return p;
  }
  // 都不存在时按第一个候选读取，报出原始 ENOENT 便于定位
  return fileURLToPath(candidates[0]);
}

function loadCorpus(): TianjiEntry[] {
  if (cache) return cache;
  const raw = readFileSync(corpusFile(), 'utf8');
  cache = raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as TianjiEntry);
  return cache;
}

export function searchTianji(query: string, limit = 12): TianjiEntry[] {
  const q = query.trim();
  if (!q) return [];
  return loadCorpus()
    .filter((e) => e.quote.includes(q) || e.h2.includes(q) || e.h3.includes(q))
    .slice(0, limit);
}

function tianjiLink(e: TianjiEntry): string {
  const [h, m, s] = e.t_hms.split(':').map(Number);
  return `https://www.bilibili.com/video/${e.bvid}?p=${e.part}&t=${h * 3600 + m * 60 + s}`;
}

export function formatTianjiEntry(e: TianjiEntry): string {
  const where = e.h3 ? `${e.h2} · ${e.h3}` : e.h2;
  const note = e.note.split(/[〕〔]/).filter((n) => n && n !== 'cleaned').join('；');
  return `〔${where} ${e.t_hms}〕「${e.quote}」${note ? `（考据：${note}）` : ''}\n  出处：${tianjiLink(e)}`;
}

const EXCLUDED_TOPICS = ['气色与相法', '手相', '罗经', '六壬', '测字', '卦与爻', '家庭角色入宅', '龙脉'];

function isZiwei(e: TianjiEntry): boolean {
  if (['08-yili', '10-divination', '11-fengshui'].includes(e.book)) return false;
  return !EXCLUDED_TOPICS.some((x) => `${e.h2} ${e.h3}`.includes(x));
}

function repetitive(q: string): boolean {
  const seen = new Map<string, number>();
  for (let i = 0; i + 4 <= q.length; i++) {
    const g = q.slice(i, i + 4);
    const n = (seen.get(g) ?? 0) + 1;
    if (n >= 3) return true;
    seen.set(g, n);
  }
  return false;
}

export function tianjiForChart(chart: ZiweiChart, patterns: Pattern[], question: string): TianjiEntry[] {
  const topicPalace = Object.entries(TOPIC_PALACE).find(([k]) => question.includes(k))?.[1];
  const stars = new Set<string>();
  const palaces = new Set<string>(['命宫', '财帛', '官禄', '迁移']);
  if (topicPalace) palaces.add(topicPalace);

  for (const p of chart.palaces) {
    if (!(p.isMingGong || p.isCurrentDaXian || palaces.has(p.name))) continue;
    for (const s of p.stars.filter((x) => x.type === 'major')) stars.add(s.name);
    for (const s of p.borrowedStars ?? []) stars.add(s);
  }

  const terms = [...stars, ...patterns.map((p) => p.name)];
  const scored: { e: TianjiEntry; score: number }[] = [];
  for (const e of loadCorpus()) {
    if (!isZiwei(e)) continue;
    let score = 0;
    const head = `${e.h2} ${e.h3}`;
    for (const star of stars) if (head.includes(star)) score += 3;
    for (const p of patterns) if (head.includes(p.name)) score += 4;
    if (topicPalace && e.h2.includes(topicPalace)) score += 5;
    else for (const palace of palaces) if (e.h2.includes(palace)) score += 2;
    for (const term of terms) if (e.quote.includes(term)) score += 1;
    if (PRIORITY_H3.some((k) => e.h3.includes(k))) score += 2;
    if (e.quote.length <= 60) score += 2;
    else if (e.quote.length > 120) score -= 3;
    if (repetitive(e.quote)) score -= 4;
    if (score > 0) scored.push({ e, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.e);
}
