import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { generateChart } from '../lib/ziwei/algorithm';
import { buildChartContext } from '../lib/ai/chart-context';
import { buildKnowledgePack } from '../lib/ai/knowledge-pack';
import { searchTianji, formatTianjiEntry } from '../lib/ai/tianji-corpus';
import { searchClassics } from '../lib/classics';
import { datasetStatus, datasetYears, lookupInterpretation, installDatasetYears, canDecompressNatively, DIM_KEYS, DIM_LABELS, type DimKey } from '../lib/ai/dataset-lookup';
import type { ZiweiChart } from '../lib/ziwei/types';
import { resolveBirth, type BirthArgs } from './birth-resolve';

const birthShape = {
  year: z.number().int().min(1900).max(2100).describe('公历出生年'),
  month: z.number().int().min(1).max(12).describe('公历出生月'),
  day: z.number().int().min(1).max(31).describe('公历出生日'),
  hour: z.number().int().min(0).max(23).describe('出生时钟点（北京时间，0-23）'),
  minute: z.number().int().min(0).max(59).optional().describe('出生分钟，默认 0'),
  gender: z.enum(['male', 'female']).describe('性别'),
  province: z.string().optional().describe('出生省份，如 广东省'),
  city: z.string().optional().describe('出生城市，如 梅州；用于真太阳时校正'),
  longitude: z.number().optional().describe('出生地经度，给了就优先用它做真太阳时校正'),
  utcOffsetMinutes: z.number().int().min(-720).max(840).optional().describe('出生地时区相对 UTC 的标准偏移（分钟，东正西负），海外出生用，如纽约标准时间 -300；不传默认 480（北京时间）'),
};


function makeChart(args: BirthArgs): { chart: ZiweiChart; note: string } {
  const { info, note } = resolveBirth(args);
  const chart = generateChart(info);
  return { chart, note };
}

const server = new McpServer(
  { name: 'ziwei-doushu', version: '1.2.0' },
  { instructions: '紫微斗数排盘与资料检索服务，本身不调用任何模型：排盘用 ziwei_paipan；需要解读时先用 ziwei_interpret 取回解读资料包（固化规范＋命盘＋格局＋天纪原话＋古籍＋名人对照）作答；若用户想要某个人生维度的深度长文解读，用 ziwei_dataset 按 (排盘日，时辰支，性别) 从开源 v4.0 数据集（67.5 万盘 × 13 维）取对应维度全文（默认仅命格总览，用 dims 参数按需取感情/事业/财运/健康等，避免一次性拉入全部 3 万字）；数据集缺年份时用 ziwei_dataset_install 按需下载安装；补充查证用 ziwei_knowledge。' },
);

server.registerTool(
  'ziwei_paipan',
  {
    title: '紫微斗数排盘',
    description: '按公历出生时间排紫微斗数命盘，返回十二宫星曜、四化、大限与基本信息。可自动做真太阳时校正。',
    inputSchema: birthShape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (args) => {
    try {
      const { chart, note } = makeChart(args);
      const top = [`# 命盘（${chart.birthInfo.gender === 'male' ? '男' : '女'}）`, note].join('\n');
      return { content: [{ type: 'text', text: `${top}\n\n${buildChartContext(chart)}` }] };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `排盘失败：${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  'ziwei_interpret',
  {
    title: '紫微斗数解读资料包',
    description:
      '排盘并返回完整解读资料包（固化解读规范＋命盘＋命中格局＋《天纪》原话＋古籍原文＋名人命盘对照）。本工具不调用任何模型：请当前对话模型直接依据资料包作答，适合问命格、感情、事业、财运、健康、某宫位或大限流年。',
    inputSchema: {
      ...birthShape,
      question: z.string().min(2).describe('想解读的问题，例如：看看命格和各宫吉凶'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (args) => {
    try {
      const { chart, note } = makeChart(args);
      return { content: [{ type: 'text', text: buildKnowledgePack(chart, args.question, note) }] };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `资料包生成失败：${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  'ziwei_dataset',
  {
    title: '紫微斗数数据集解读',
    description:
      '从开源解读数据集 v4.0（67.5 万命盘 × 13 维，倪海厦体系断语库确定性生成）按出生信息精确取对应命盘的解读长文。13 个维度：命格总览/性格/感情/事业/财运/健康/兄弟/子女/迁移/人际/田宅/福德/父母，每维约两千余字。默认只返回命格总览，用 dims 参数按需取其它维度（一次别全拿，全文共约 3 万字）。需本地已装数据集年份文件；未安装时会返回安装指引。',
    inputSchema: {
      ...birthShape,
      dims: z.array(z.enum(DIM_KEYS)).min(1).max(13).optional().describe(
        `要返回的维度，默认 ["overview"]。可选：${DIM_KEYS.map((k) => `${k}(${DIM_LABELS[k]})`).join('、')}`),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ dims, ...birth }: BirthArgs & { dims?: DimKey[] }) => {
    try {
      const want = dims && dims.length ? dims : (['overview'] as DimKey[]);
      const { info, note } = resolveBirth(birth);
      const r = lookupInterpretation(info.year, info.month, info.day, info.hour, info.gender);
      if (r.status !== 'ok') {
        const st = datasetStatus();
        const installed = st.years.length
          ? `已安装年份：${st.years[0]}–${st.years[st.years.length - 1]}（共 ${st.years.length} 年）`
          : '尚未安装任何年份';
        const why = r.status === 'year_not_installed'
          ? `该年份（${r.year}）的数据文件不在本地。`
          : `数据集中未找到键 ${r.key}（理论上 1950–2026 每个真实日期都覆盖，若出现请反馈）。`;
        return {
          content: [{ type: 'text', text: [
            '# 数据集解读（未命中）',
            `${why}`,
            `数据集目录：${st.dir}`,
            installed,
            '安装方法：从上游 Release v4.0-13d 下载 year-<年份>.jsonl.zst，用 zstd（--long=27）解压为 year-<年份>.jsonl 放入上述目录即可，无需重启服务。',
          ].join('\n') }],
          isError: true,
        };
      }
      const e = r.entry;
      const ms = e.ms ?? '空宫（借对宫）';
      const lines = [
        `# 数据集解读（${e.k}，命宫主星：${ms}）`,
        note,
        `来源：紫微斗数开源解读数据集 v4.0（13 维断语按倪海厦《天纪》与《紫微斗数全书》校正；数据按钟表时辰生成，此处已按真太阳时校正后的排盘日与时辰支查取）`,
        `本次返回维度：${want.map((k) => DIM_LABELS[k]).join('、')}；其余维度可用 dims 参数按需追加。`,
      ];
      for (const dim of want) {
        const text = e.c[dim];
        lines.push('', `## ${DIM_LABELS[dim]}`, text ?? '（该维度在此盘数据中缺失）');
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `数据集查询失败：${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  'ziwei_dataset_install',
  {
    title: '数据集年份安装',
    description:
      '从上游 Release（v4.0-13d）下载并安装解读数据集的指定年份到本地数据集目录（ZIWEI_DATASET_DIR 或默认位置），装完即可用 ziwei_dataset 查询。每年压缩包约 2MB、解压约 0.7GB。已安装的年份自动跳过。解压用 Node 内置 zstd（需 Node ≥ 22.15；过低会返回替代方案指引）。',
    inputSchema: {
      years: z.array(z.number().int().min(1950).max(2026)).min(1).max(77).describe(
        '要安装的公历年份列表，如 [1990, 1998, 1999]；数据集覆盖 1950–2026'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ years }: { years: number[] }) => {
    if (!canDecompressNatively()) {
      return {
        content: [{ type: 'text', text: [
          '# 数据集安装（当前 Node 版本过低）',
          `内置解压需要 Node ≥ 22.15（当前 ${process.version}）。`,
          '替代方案：升级 Node，或运行项目内 scripts/get-dataset.ps1 / scripts/get-dataset.sh 脚本安装。',
        ].join('\n') }],
        isError: true,
      };
    }
    try {
      const { outcomes, dir } = await installDatasetYears(years);
      const lines = ['# 数据集安装结果', `数据集目录：${dir}`];
      for (const o of outcomes) {
        if (o.status === 'installed') lines.push(`- ${o.year}：已安装（${(o.bytes / 1024 / 1024 / 1024).toFixed(2)} GB）`);
        else if (o.status === 'already') lines.push(`- ${o.year}：已存在，跳过`);
        else lines.push(`- ${o.year}：失败 —— ${o.error}`);
      }
      const okCnt = outcomes.filter((o) => o.status !== 'failed').length;
      return { content: [{ type: 'text', text: lines.join('\n') }], isError: okCnt === 0 };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `数据集安装失败：${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  'ziwei_knowledge',
  {
    title: '紫微斗数资料检索',
    description:
      '按关键词检索本地资料库：《天纪·紫微斗数》倪师原话（含时间码与出处链接）与三部古籍原文（骨髓赋／紫微斗数全集／紫微斗数全书）。用于补充解读依据或做对照查证。',
    inputSchema: {
      query: z.string().min(1).describe('检索词，如 紫微、化忌、夫妻、杀破狼、禄存'),
      limit: z.number().int().min(1).max(30).optional().describe('每类最多返回条数，默认 8'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query, limit = 8 }) => {
    const tianji = searchTianji(query, limit);
    const classics = searchClassics(query, limit);
    const sections = [
      `# 检索「${query}」`,
      `## 《天纪》原话（${tianji.length} 条）`,
      ...(tianji.length ? tianji.map(formatTianjiEntry) : ['- 未命中']),
      `## 古籍原文（${classics.length} 条）`,
      ...(classics.length
        ? classics.map((h) => {
            const text = h.text.length > 200 ? `${h.text.slice(0, 200)}…` : h.text;
            return `- 《${h.bookTitle}·${h.chapterTitle}》：${text}`;
          })
        : ['- 未命中']),
    ];
    return { content: [{ type: 'text', text: sections.join('\n') }] };
  },
);

await server.connect(new StdioServerTransport());
