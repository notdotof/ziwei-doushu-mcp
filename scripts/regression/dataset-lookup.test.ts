/**
 * 回归：数据集查询层（lib/ai/dataset-lookup.ts）。
 *
 * 数据集未安装时整组跳过（CI / 新克隆仓库没有 56.6 GB 数据）；
 * 已安装时验证：键格式补零、已知日期精确命中、13 维齐全、索引跨块扫描正确
 * （顺带用边界日期：1 月 1 日 / 12 月 31 日）。
 */
import { existsSync } from 'node:fs';
import { datasetKey, datasetStatus, lookupInterpretation, DIM_KEYS } from '../../lib/ai/dataset-lookup';

let fails = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) fails++;
}

// 键格式：月日两位补零、时辰序号 0-11
ok('键格式补零（1990-01-01-0-male）', datasetKey(1990, 1, 1, 0, 'male') === '1990-01-01-0-male');
ok('键格式两位月份（1999-12-31-11-female）', datasetKey(1999, 12, 31, 11, 'female') === '1999-12-31-11-female');

const { years } = datasetStatus();
if (!years.length) {
  console.log('⏭ 数据集未安装（data/interp-v4 下无 year-YYYY.jsonl），跳过查询断言');
  process.exit(fails ? 1 : 0);
}

const first = years[0];
console.log(`数据集已装年份：${years[0]}–${years[years.length - 1]}（${years.length} 年），用 ${first} 年做断言`);

// 每个年份文件的第一个键：1 月 1 日 子时 男
{
  const r = lookupInterpretation(first, 1, 1, 0, 'male');
  ok(`${first}-01-01 子时男 命中`, r.status === 'ok');
  if (r.status === 'ok') {
    const e = r.entry;
    ok('返回键与查询键一致', e.k === datasetKey(first, 1, 1, 0, 'male'));
    ok('13 维齐全', DIM_KEYS.every((k) => typeof e.c[k] === 'string' && (e.c[k] as string).length > 100));
    ok('含命宫主星字段（ms）', 'ms' in e);
    ok('命格总览非空正文', (e.c.overview as string).length > 500);
  }
}

// 年末边界：12 月 31 日 亥时 女（跨块扫描正确性：大文件尾段）
{
  const r = lookupInterpretation(first, 12, 31, 11, 'female');
  ok(`${first}-12-31 亥时女 命中`, r.status === 'ok');
  if (r.status === 'ok') ok('返回键一致', r.entry.k === datasetKey(first, 12, 31, 11, 'female'));
}

// 未安装年份返回可指引的错误
{
  const missing = years[0] - 1;
  const r = lookupInterpretation(missing, 6, 15, 7, 'male');
  ok(`未安装年份（${missing}）返回 year_not_installed`, r.status === 'year_not_installed');
}

if (fails > 0) {
  console.error(`\n[dataset-lookup] ${fails} 项断言失败`);
  process.exit(1);
}
console.log('\n[dataset-lookup] 全部断言通过');
