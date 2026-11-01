/**
 * 回归测试 — 解读资料包（2026-10-30）
 *
 * 目的：MCP 的 ziwei_interpret 不再调用任何模型，改为返回固化资料包。
 * 断言两件事：资料包六节齐全且含本盘事实；MCP 源码里不存在模型调用残留。
 */
import { readFileSync } from 'node:fs';
import { generateChart } from '../../lib/ziwei/algorithm';
import { buildKnowledgePack } from '../../lib/ai/knowledge-pack';
import type { BirthInfo } from '../../lib/ziwei/types';

let failures = 0;
const fail = (m: string) => { console.error(`  ✗ ${m}`); failures++; };
const ok = (m: string) => console.log(`  ✓ ${m}`);

const birth: BirthInfo = { year: 1999, month: 2, day: 11, hour: 9, gender: 'female' };
const chart = generateChart(birth);
const mingStars = chart.palaces.find((p) => p.isMingGong)!.stars.map((s) => s.name);
const pack = buildKnowledgePack(chart, '请做命格总览');

for (const section of ['【一、固化解读规范', '【二、命盘事实', '【三、命中格局', '【四、《天纪》原话参考', '【五、古籍原文参考', '【六、名人命盘对照', '【七、待解读问题】']) {
  if (!pack.includes(section)) fail(`资料包缺少分节：${section}`);
}
if (failures === 0) ok('资料包七节齐全');

for (const star of mingStars) {
  if (!pack.includes(star)) fail(`命盘事实未包含命宫星曜 ${star}`);
}
ok('命盘事实含全部命宫星曜');

if (!pack.includes('三合派')) fail('固化规范未写入三合派口径');
if (!pack.includes('【命格定性】')) fail('固化规范未写入默认五段结构');
ok('固化规范含体系口径与默认结构');

const server = readFileSync('mcp/ziwei-server.mts', 'utf8');
for (const banned of ['/chat/completions', 'AI_API_KEY', 'AI_BASE_URL', 'AbortSignal.timeout']) {
  if (server.includes(banned)) fail(`MCP 源码仍有模型调用残留：${banned}`);
}
if (!server.includes('ziwei_knowledge')) fail('MCP 未注册 ziwei_knowledge 检索工具');
ok('MCP 源码无模型调用，且已注册资料检索工具');

const section = (from: string, to: string) => {
  const a = pack.indexOf(from);
  const b = pack.indexOf(to);
  if (a < 0 || b < 0) return '';
  return pack.slice(a, b);
};
if (section('【四、', '【五、').includes('未检到')) fail('《天纪》原话参考为空');
if (section('【五、', '【六、').includes('未检到')) fail('古籍原文参考为空');
ok('天纪与古籍参考均有命中');

if (failures === 0) {
  console.log('\n✅ 解读资料包回归全过\n');
  process.exit(0);
}
console.error(`\n❌ 解读资料包回归 ${failures} 处失败\n`);
process.exit(1);
