import type { ZiweiChart } from '../ziwei/types';
import { INTERPRETATION_SPEC } from './interpretation-spec';

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const STAR_TYPE_LABEL: Record<string, string> = {
  major: '主星',
  minor: '辅星',
  lucky: '吉星',
  sha: '煞星',
};

function describeStar(star: ZiweiChart['palaces'][number]['stars'][number]): string {
  const parts = [star.name];
  if (star.brightnessRaw) parts.push(star.brightnessRaw);
  if (star.siHua) parts.push(`化${star.siHua}`);
  return `${parts.join('')}(${STAR_TYPE_LABEL[star.type] ?? star.type})`;
}

export function buildChartContext(chart: ZiweiChart): string {
  const { birthInfo, lunarInfo } = chart;
  const lines: string[] = [];

  lines.push('【基本信息】');
  lines.push(
    `性别：${birthInfo.gender === 'male' ? '男' : '女'}；` +
      `出生：公历 ${birthInfo.year}-${birthInfo.month}-${birthInfo.day} ${BRANCHES[birthInfo.hour]}时` +
      (birthInfo.city ? `，${birthInfo.province ?? ''}${birthInfo.city}` : ''),
  );
  lines.push(
    `农历：${lunarInfo.lunarYear}年${lunarInfo.isLeapMonth ? '闰' : ''}${Math.abs(lunarInfo.lunarMonth)}月${lunarInfo.lunarDay}日；` +
      `年干支：${STEMS[lunarInfo.yearStem]}${BRANCHES[lunarInfo.yearBranch]}`,
  );
  if (lunarInfo.fourPillars) lines.push(`四柱：${lunarInfo.fourPillars.join(' ')}`);
  lines.push(
    `五行局：${chart.wuxingJuName}；命宫：${BRANCHES[chart.mingGongBranch]}；身宫：${BRANCHES[chart.shenGongBranch]}；` +
      (chart.mingZhu ? `命主：${chart.mingZhu}；` : '') +
      (chart.shenZhu ? `身主：${chart.shenZhu}` : ''),
  );
  lines.push(`当前年龄：${chart.currentAge} 岁`);

  lines.push('');
  lines.push('【十二宫】');
  for (const palace of chart.palaces) {
    const stars = palace.stars.map(describeStar);
    if (palace.isEmpty && palace.borrowedFromName) {
      stars.push(`空宫，借对宫${palace.borrowedFromName}主星${palace.borrowedStars?.join('、') ?? ''}`);
    }
    if (palace.selfSihua?.length) {
      stars.push(`宫干自化：${palace.selfSihua.map((s) => `${s.starName}化${s.siHua}`).join('、')}`);
    }
    const tags = [
      palace.isMingGong ? '命宫' : '',
      palace.isShenGong ? '身宫' : '',
      palace.daXianAge ? `大限${palace.daXianAge[0]}-${palace.daXianAge[1]}` : '',
      palace.isCurrentDaXian ? '当前大限' : '',
    ].filter(Boolean);
    lines.push(
      `${palace.name}（${STEMS[palace.stem]}${BRANCHES[palace.branch]}${tags.length ? '，' + tags.join('，') : ''}）：` +
        (stars.length ? stars.join('、') : '无星'),
    );
  }

  lines.push('');
  lines.push('【大限】');
  lines.push(
    chart.daXians
      .map(
        (d) =>
          `${d.startAge}-${d.endAge}岁 ${d.palaceName}${d.stemName ?? ''}${d.siHua ? `（${d.siHua.lu}禄/${d.siHua.quan}权/${d.siHua.ke}科/${d.siHua.ji}忌）` : ''}`,
      )
      .join('；'),
  );

  return lines.join('\n');
}

export const SYSTEM_PROMPT = INTERPRETATION_SPEC;
