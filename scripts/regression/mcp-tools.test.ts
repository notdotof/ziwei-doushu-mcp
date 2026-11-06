/**
 * 回归测试：MCP 五个工具完整性与核心逻辑验证
 *
 * 覆盖工具：
 * 1. ziwei_paipan
 * 2. ziwei_interpret
 * 3. ziwei_dataset
 * 4. ziwei_dataset_install
 * 5. ziwei_knowledge
 *
 * 验证目标：
 * - 源码中 5 个工具注册声明与 annotations 配置完全符合预期规范
 * - 5 个工具背后的核心逻辑脱机运行正常
 */
import { readFileSync } from 'node:fs';
import { resolveBirth } from '../../mcp/birth-resolve';
import { generateChart } from '../../lib/ziwei/algorithm';
import { buildChartContext } from '../../lib/ai/chart-context';
import { buildKnowledgePack } from '../../lib/ai/knowledge-pack';
import { lookupInterpretation, datasetStatus, canDecompressNatively, DIM_KEYS } from '../../lib/ai/dataset-lookup';
import { searchTianji, formatTianjiEntry } from '../../lib/ai/tianji-corpus';
import { searchClassics } from '../../lib/classics';

let failures = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failures++;
}

// ---------------------------------------------------------------------------
// 1. 验证 mcp/ziwei-server.mts 中 5 个工具的注册及 annotations 配置
// ---------------------------------------------------------------------------
const serverSource = readFileSync('mcp/ziwei-server.mts', 'utf8');

interface ToolAnnotationExpectation {
  tool: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

const expectedTools: ToolAnnotationExpectation[] = [
  {
    tool: 'ziwei_paipan',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    tool: 'ziwei_interpret',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    tool: 'ziwei_dataset',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    tool: 'ziwei_dataset_install',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    tool: 'ziwei_knowledge',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

for (const { tool, annotations } of expectedTools) {
  ok(`源码中已注册工具: ${tool}`, serverSource.includes(`'${tool}'`) || serverSource.includes(`"${tool}"`));

  // 匹配 tool 配置块中的 annotations
  const toolBlockRegex = new RegExp(`registerTool\\s*\\(\\s*['"]${tool}['"][\\s\\S]*?\\}\\s*,\\s*async`);
  const match = serverSource.match(toolBlockRegex);
  const block = match ? match[0] : '';

  ok(`工具 ${tool} 包含 annotations 配置块`, block.includes('annotations:'));
  ok(`工具 ${tool} annotations.readOnlyHint === ${annotations.readOnlyHint}`,
    block.includes(`readOnlyHint: ${annotations.readOnlyHint}`));
  ok(`工具 ${tool} annotations.destructiveHint === ${annotations.destructiveHint}`,
    block.includes(`destructiveHint: ${annotations.destructiveHint}`));
  ok(`工具 ${tool} annotations.idempotentHint === ${annotations.idempotentHint}`,
    block.includes(`idempotentHint: ${annotations.idempotentHint}`));
  ok(`工具 ${tool} annotations.openWorldHint === ${annotations.openWorldHint}`,
    block.includes(`openWorldHint: ${annotations.openWorldHint}`));
}

// ---------------------------------------------------------------------------
// 2. ziwei_paipan 核心逻辑脱机验证
// ---------------------------------------------------------------------------
{
  const birthArgs = {
    year: 1990,
    month: 6,
    day: 15,
    hour: 14,
    minute: 30,
    gender: 'male' as const,
    province: '广东省',
    city: '广州',
  };
  const { info, note } = resolveBirth(birthArgs);
  const chart = generateChart(info);
  const context = buildChartContext(chart);

  ok('ziwei_paipan: 排盘生成 12 宫', chart.palaces.length === 12);
  ok('ziwei_paipan: 包含命宫与身宫', chart.palaces.some((p) => p.isMingGong) && chart.palaces.some((p) => p.isShenGong));
  ok('ziwei_paipan: 格式化排盘上下文非空且包含基本信息与十二宫',
    typeof context === 'string' && context.includes('【基本信息】') && context.includes('【十二宫】') && context.includes('命宫'));
  ok('ziwei_paipan: 包含真太阳时或出生备注', note.length > 0);
}

// ---------------------------------------------------------------------------
// 3. ziwei_interpret 核心逻辑脱机验证
// ---------------------------------------------------------------------------
{
  const birthArgs = {
    year: 1995,
    month: 8,
    day: 20,
    hour: 8,
    gender: 'female' as const,
  };
  const { info, note } = resolveBirth(birthArgs);
  const chart = generateChart(info);
  const question = '想详细了解事业与财运发展趋势';
  const pack = buildKnowledgePack(chart, question, note);

  ok('ziwei_interpret: 解读资料包包含问题文本', pack.includes(question));
  ok('ziwei_interpret: 解读资料包包含固化解读规范', pack.includes('固化解读规范'));
  ok('ziwei_interpret: 解读资料包包含命盘事实', pack.includes('命盘事实'));
}

// ---------------------------------------------------------------------------
// 4. ziwei_dataset 核心逻辑脱机验证
// ---------------------------------------------------------------------------
{
  ok('ziwei_dataset: 13 维定义完整', DIM_KEYS.length === 13 && DIM_KEYS.includes('overview') && DIM_KEYS.includes('career'));

  // 验证未装年份返回 year_not_installed（错误处理逻辑无异常）
  const missingResult = lookupInterpretation(1948, 5, 20, 3, 'male');
  ok('ziwei_dataset: 未覆盖/未装年份安全返回 year_not_installed 且不崩溃',
    missingResult.status === 'year_not_installed');

  // 若本地已安装年份，验证查询正常
  const st = datasetStatus();
  if (st.years.length > 0) {
    const yr = st.years[0];
    const hit = lookupInterpretation(yr, 1, 1, 0, 'male');
    ok(`ziwei_dataset: 已装年份(${yr})精确查询成功`, hit.status === 'ok' && !!hit.entry.c.overview);
  } else {
    ok('ziwei_dataset: 未安装任何年份时返回有效状态', Array.isArray(st.years));
  }
}

// ---------------------------------------------------------------------------
// 5. ziwei_dataset_install 核心逻辑脱机验证
// ---------------------------------------------------------------------------
{
  const nativeSupport = canDecompressNatively();
  ok('ziwei_dataset_install: 本地原生解压能力检测返回布尔值', typeof nativeSupport === 'boolean');
}

// ---------------------------------------------------------------------------
// 6. ziwei_knowledge 核心逻辑脱机验证
// ---------------------------------------------------------------------------
{
  const tianjiHits = searchTianji('紫微', 3);
  ok('ziwei_knowledge: 《天纪》语料库按关键词检索命中结果', tianjiHits.length > 0);
  if (tianjiHits.length > 0) {
    const formatted = formatTianjiEntry(tianjiHits[0]);
    ok('ziwei_knowledge: 天纪条目格式化输出正常', typeof formatted === 'string' && formatted.includes('出处：') && formatted.includes('bilibili.com'));
  }

  const classicsHits = searchClassics('紫微', 3);
  ok('ziwei_knowledge: 古籍库按关键词检索命中结果', classicsHits.length > 0);
  if (classicsHits.length > 0) {
    ok('ziwei_knowledge: 古籍命中文本结构正常',
      typeof classicsHits[0].bookTitle === 'string' && typeof classicsHits[0].text === 'string');
  }

  const emptyHits = searchTianji('xyz_completely_nonexistent_token_123', 3);
  ok('ziwei_knowledge: 无匹配关键词安全返回空数组', emptyHits.length === 0);
}

// ---------------------------------------------------------------------------
// 汇总输出
// ---------------------------------------------------------------------------
if (failures === 0) {
  console.log('\n[mcp-tools] 全部 5 个 MCP 工具回归验证通过！\n');
  process.exit(0);
} else {
  console.error(`\n[mcp-tools] ${failures} 项断言失败\n`);
  process.exit(1);
}
