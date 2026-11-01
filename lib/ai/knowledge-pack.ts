import type { ZiweiChart } from '../ziwei/types';
import { generateChart } from '../ziwei/algorithm';
import { detectPatterns, type Pattern } from '../ziwei/patterns';
import { FAMOUS_PERSONS } from '../ziwei/famous';
import { searchClassics } from '../classics';
import { buildChartContext } from './chart-context';
import { INTERPRETATION_SPEC } from './interpretation-spec';
import { tianjiForChart, formatTianjiEntry } from './tianji-corpus';

const LEVEL_LABEL: Record<Pattern['level'], string> = {
  excellent: '上格',
  good: '中吉',
  neutral: '中性',
  caution: '须防',
};

function palaceOf(chart: ZiweiChart, predicate: (name: string, p: ZiweiChart['palaces'][number]) => boolean) {
  return chart.palaces.find((p) => predicate(p.name, p));
}

function majorStars(palace: ZiweiChart['palaces'][number] | undefined): string[] {
  if (!palace) return [];
  const own = palace.stars.filter((s) => s.type === 'major').map((s) => s.name);
  return own.length ? own : (palace.borrowedStars ?? []);
}

function focusTerms(chart: ZiweiChart, patterns: Pattern[], question: string): string[] {
  const terms: string[] = [];
  const push = (t?: string) => {
    if (t && !terms.includes(t)) terms.push(t);
  };

  push(chart.wuxingJuName);
  for (const p of chart.palaces) {
    if (p.isMingGong || p.isCurrentDaXian || ['财帛', '官禄', '迁移', '夫妻', '疾厄', '福德'].includes(p.name)) {
      for (const s of majorStars(p)) push(s);
    }
  }
  for (const p of patterns) push(p.name);

  const palaceHint = ['感情', '婚姻'].some((k) => question.includes(k))
    ? '夫妻'
    : ['事业', '工作', '职业'].some((k) => question.includes(k))
      ? '官禄'
      : ['财', '钱', '生意'].some((k) => question.includes(k))
        ? '财帛'
        : ['健康', '身体'].some((k) => question.includes(k))
          ? '疾厄'
          : question.includes('大限')
            ? '大限'
            : '命宫';
  push(palaceHint);

  return terms;
}

function classicalExcerpts(terms: string[], limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    for (const hit of searchClassics(term, 3)) {
      if (seen.has(hit.paragraphId)) continue;
      seen.add(hit.paragraphId);
      const text = hit.text.length > 160 ? `${hit.text.slice(0, 160)}…` : hit.text;
      out.push(`- 《${hit.bookTitle}·${hit.chapterTitle}》（命中「${term}」）：${text}`);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function patternLines(patterns: Pattern[]): string[] {
  if (!patterns.length) return ['- 本盘未命中严格古书格局'];
  return patterns.map((p) => {
    const cond = p.conditions
      ? [
          `必须：${p.conditions.required.join('、')}`,
          p.conditions.bonus?.length ? `加分：${p.conditions.bonus.join('、')}` : '',
          p.conditions.breaking?.length ? `破格：${p.conditions.breaking.join('、')}` : '',
        ].filter(Boolean).join('；')
      : '';
    return [
      `- ${p.name}（${LEVEL_LABEL[p.level]}，涉${p.palaces.join('/')}）：${p.description}`,
      cond ? `  条件：${cond}` : '',
      p.source ? `  出处：${p.source}` : '',
    ].filter(Boolean).join('\n');
  });
}

function famousComparisons(chart: ZiweiChart, patterns: Pattern[], limit = 3): string[] {
  const ming = majorStars(palaceOf(chart, (n, p) => p.isMingGong || n === '命宫'));
  const userPatterns = patterns.map((p) => p.name);
  const rows: { label: string; score: number }[] = [];

  for (const f of FAMOUS_PERSONS) {
    const theirs = generateChart(f);
    const theirMing = majorStars(palaceOf(theirs, (n, p) => p.isMingGong || n === '命宫'));
    const theirPatterns = detectPatterns(theirs).map((p) => p.name);
    const sharedStar = ming.filter((s) => theirMing.includes(s));
    const sharedPattern = theirPatterns.filter((n) => userPatterns.includes(n));
    if (!sharedStar.length && !sharedPattern.length) continue;

    const why = [
      sharedStar.length ? `命宫（含借星）同见「${sharedStar.join('/')}」` : '',
      sharedPattern.length ? `同中格局「${sharedPattern.join('/')}」` : '',
    ].filter(Boolean).join('，');
    rows.push({
      score: sharedStar.length * 10 + sharedPattern.length * 6 + (theirs.birthInfo.gender === chart.birthInfo.gender ? 1 : 0),
      label: `- ${f.name}（${f.category}·${f.description}，${f.year}年）：命宫 ${theirMing.join('/') || '空宫'}；${why}。对照要点：${f.notable}`,
    });
  }

  return rows.sort((a, b) => b.score - a.score).slice(0, limit).map((r) => r.label);
}

export function buildKnowledgePack(chart: ZiweiChart, question: string, note?: string): string {
  const patterns = detectPatterns(chart);
  const terms = focusTerms(chart, patterns, question);
  const classics = classicalExcerpts(terms);
  const tianji = tianjiForChart(chart, patterns, question);
  const famous = famousComparisons(chart, patterns);

  return [
    '【紫微斗数解读资料包｜本工具不调用任何模型，请当前对话模型直接依据以下资料作答】',
    '',
    '【一、固化解读规范（必须遵守）】',
    INTERPRETATION_SPEC,
    '',
    '【二、命盘事实】',
    note ? `${note}\n${buildChartContext(chart)}` : buildChartContext(chart),
    '',
    '【三、命中格局（严格古书条件）】',
    ...patternLines(patterns),
    '',
    '【四、《天纪》原话参考】',
    ...(tianji.length ? tianji.map(formatTianjiEntry) : ['- 本次未检到相关原话']),
    '',
    '【五、古籍原文参考】',
    ...(classics.length ? classics : ['- 本次未检到相关原文']),
    '',
    '【六、名人命盘对照（同主星入命或同格局）】',
    ...(famous.length ? famous : ['- 名人库中无同主星入命案例']),
    '',
    '【七、待解读问题】',
    question,
  ].join('\n');
}
