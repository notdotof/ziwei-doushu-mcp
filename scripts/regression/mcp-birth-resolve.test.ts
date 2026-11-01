/**
 * 回归：MCP 出生信息解析（mcp/birth-resolve.ts）。
 *
 * MCP 曾手写真太阳时与换日算式，与共享引擎 lib/ziwei/true-solar-time.ts 不一致，
 * 两个跨午夜方向都会把排盘日算错（已修复：改为统一走共享引擎）：
 *   1. 东经 120 以东的深夜（如哈尔滨 23:40）真太阳时落入次日早子时 → 应按次日排盘；
 *   2. 东经 120 以西的凌晨（如乌鲁木齐 00:10）真太阳时退回前一日 → 应按前一日排盘；
 *   3. 晚子时（无经度）→ 按次日排盘（next-day 规则，原行为保留）；
 *   4. 海外时区：utcOffsetMinutes 参与时区中央经线修正。
 */
import { resolveBirth } from '../../mcp/birth-resolve';

let fails = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) fails++;
}

// 1. 哈尔滨（经度 126.53）1990-06-15 23:40 → 真太阳时约次日 00:27 早子时 → 排盘日 = 次日
{
  const r = resolveBirth({ year: 1990, month: 6, day: 15, hour: 23, minute: 40, gender: 'male', province: '黑龙江省', city: '哈尔滨' });
  ok('哈尔滨 23:40 → 真太阳时落入次日早子时，按次日排盘',
    r.info.hour === 0 && r.info.day === 16 && r.note.includes('按次日排盘'));
}

// 2. 乌鲁木齐（经度 87.62）1990-06-15 00:10 → 真太阳时约前一日 22:00 亥时 → 排盘日 = 前一日
{
  const r = resolveBirth({ year: 1990, month: 6, day: 15, hour: 0, minute: 10, gender: 'female', province: '新疆维吾尔自治区', city: '乌鲁木齐' });
  ok('乌鲁木齐 00:10 → 真太阳时退回前一日亥时，按前一日排盘',
    r.info.hour === 11 && r.info.day === 14 && r.note.includes('按前一日排盘'));
}

// 3. 无经度晚子时：1990-06-15 23:30 → 次日子时（next-day 规则，原行为保留）
{
  const r = resolveBirth({ year: 1990, month: 6, day: 15, hour: 23, minute: 30, gender: 'male' });
  ok('无经度 23:30 → 晚子时按次日排盘', r.info.hour === 0 && r.info.day === 16);
}

// 4. 无经度普通时辰：1990-06-15 14:00 → 当日未时，日期不动
{
  const r = resolveBirth({ year: 1990, month: 6, day: 15, hour: 14, gender: 'male' });
  ok('无经度 14:00 → 当日未时', r.info.hour === 7 && r.info.day === 15 && r.note.startsWith('未校正'));
}

// 5. 城市解析照常：梅州 116.1°E，14:00 未时，日期不动
{
  const r = resolveBirth({ year: 1998, month: 12, day: 2, hour: 14, gender: 'male', province: '广东省', city: '梅州' });
  ok('梅州 14:00 → 真太阳时未时（校正后仍在同日）',
    r.info.longitude === 116.1 && r.info.hour === 7 && r.info.day === 2 && r.note.startsWith('真太阳时校正'));
}

// 6. 海外：纽约（经度 -74.0，utcOffsetMinutes=-300，中央经线 -75°）1990-06-15 14:00
//    经度修正 (-74 − (-75)) × 4 = +4 分钟 → 真太阳时 14:04 附近，未时
{
  const r = resolveBirth({ year: 1990, month: 6, day: 15, hour: 14, gender: 'male', longitude: -74.0, utcOffsetMinutes: -300 });
  ok('纽约 14:00（utcOffsetMinutes=-300）→ 未时且日期不动', r.info.hour === 7 && r.info.day === 15);
}

// 7. 同一经度、海外时区与北京时间应得到不同结果（中央经线不同）
//    纽约（utcOffsetMinutes=-300）23:50 → 经度修正 +4 分钟 → 真太阳时 23:54 仍是晚子时 → 按次日排盘
{
  const ny = resolveBirth({ year: 1990, month: 6, day: 15, hour: 23, minute: 50, gender: 'male', longitude: -74.0, utcOffsetMinutes: -300 });
  ok('纽约 23:50 → 真太阳时 23:54 仍是晚子时，按次日排盘', ny.info.hour === 0 && ny.info.day === 16);
}

if (fails > 0) {
  console.error(`\n[mcp-birth-resolve] ${fails} 项断言失败`);
  process.exit(1);
}
console.log('\n[mcp-birth-resolve] 全部断言通过');
