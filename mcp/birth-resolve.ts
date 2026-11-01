/**
 * MCP 层出生信息解析：钟表时间 → 排盘日 + 时辰支。
 *
 * ★ 2026-10-30 修复：不再手写真太阳时与换日算式，统一走共享引擎
 * `lib/ziwei/true-solar-time.ts`（含均时差、海外时区偏移、晚子时规则），
 * 保证 MCP 排盘与站点 / 回归测试完全同口径。
 *
 * 手写版曾有的两个换日 bug（此处已消除）：
 *   1. 东经 120 以东的深夜（如哈尔滨 23:40）真太阳时已过午夜、落入次日早子时，
 *      旧版 `nextDay=false`，日期停在当天；正确应按次日排盘。
 *   2. 东经 120 以西的凌晨（如乌鲁木齐 00:10）真太阳时退回前一日晚戌时，
 *      旧版日期停在当天；正确应按前一日排盘。
 */
import {
  calculateTrueSolarTime,
  resolveZiweiDayOffset,
  shiftGregorianDate,
  formatTrueSolarClock,
} from '../lib/ziwei/true-solar-time';
import type { BirthInfo } from '../lib/ziwei/types';
import { PROVINCES } from '../lib/ziwei/cities';

export const SHICHEN = '子丑寅卯辰巳午未申酉戌亥'.split('');

export interface BirthArgs {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  gender: 'male' | 'female';
  province?: string;
  city?: string;
  longitude?: number;
  /** 出生地时区相对 UTC 的标准偏移（分钟，东正西负）；不传 = 北京时间 480 */
  utcOffsetMinutes?: number;
}

export function findCity(province?: string, city?: string): { longitude: number; label: string } | null {
  if (!province || !city) return null;
  const prov = PROVINCES.find((p) => p.name === province || p.name.startsWith(province));
  const hit = prov?.cities.find((c) => c.name === city || city.includes(c.name) || c.name.includes(city));
  return hit ? { longitude: hit.longitude, label: `${prov!.name}${hit.name}` } : null;
}

export function resolveBirth(args: BirthArgs): { info: BirthInfo; note: string } {
  const minute = args.minute ?? 0;
  const place = findCity(args.province, args.city);
  const longitude = args.longitude ?? place?.longitude;
  const utcOffsetMinutes = args.utcOffsetMinutes ?? 480;

  const solar = calculateTrueSolarTime({
    year: args.year,
    month: args.month,
    day: args.day,
    clockHour: args.hour,
    clockMinute: minute,
    longitude: typeof longitude === 'number' ? longitude : undefined,
    utcOffsetMinutes,
  });

  const dayOffset = resolveZiweiDayOffset(solar, 'next-day');
  const finalDate = shiftGregorianDate({ year: args.year, month: args.month, day: args.day }, dayOffset);

  const clock = `${String(args.hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const rule =
    dayOffset === 1
      ? '（晚子时，按次日排盘）'
      : dayOffset === -1
        ? '（真太阳时退回前一日，按前一日排盘）'
        : dayOffset !== 0
          ? `（真太阳时日期偏移 ${dayOffset} 天）`
          : '';
  const solarClock = formatTrueSolarClock(solar, true);
  const note = solar.corrected
    ? `真太阳时校正：经度 ${longitude}°E，${clock} → 真太阳时 ${solarClock} → ${SHICHEN[solar.branch]}时${rule}`
    : `未校正真太阳时，按北京时间 ${clock} → ${SHICHEN[solar.branch]}时${rule}`;

  return {
    info: {
      year: finalDate.year,
      month: finalDate.month,
      day: finalDate.day,
      hour: solar.branch,
      gender: args.gender,
      province: args.province,
      city: args.city,
      longitude,
    },
    note,
  };
}
