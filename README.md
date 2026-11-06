<div align="center">

# ziwei-doushu-mcp

### 紫微斗数 MCP · 通用智能体接入 · 轻量单文件

[![M8ven Score](https://m8ven.ai/badge/mcp/notdotof/ziwei-doushu-mcp)](https://m8ven.ai/mcp/notdotof/ziwei-doushu-mcp?s=readme)

排盘 / 解读资料包 / 数据集深度解读 / 《天纪》与古籍检索 —— 本地运行，不调用任何在线模型

基于开源排盘引擎 [Renhuai123/ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu)（倪海厦《天纪》体系）

</div>

---

## 这是什么

一个**轻量、本地、通用**的 MCP（Model Context Protocol）服务：任何支持 MCP 的智能体客户端（WorkBuddy、Qoder、Claude Desktop、Cursor、Cline 等）接上即可获得紫微斗数能力。

- **轻量**：服务端打包为**单个 `.mjs` 文件**（约 2.9 MB），运行只依赖 Node.js，不需要 `npm install`、不需要克隆源码；
- **本地**：排盘与检索全部在本地完成，服务本身**不调用任何在线模型**（解读由接入的智能体基于返回的资料完成）；
- **数据集可选**：开源解读数据集（67.5 万命盘 × 13 维）不随包分发，安装后**自选存放位置**，支持在对话里让智能体按年下载安装。

## 五个工具

| 工具 | 功能 |
|---|---|
| `ziwei_paipan` | 按公历出生时间排命盘：十二宫星曜、四化、大限。自动真太阳时校正（经度＋均时差），支持全国城市经度与海外时区（`utcOffsetMinutes`）。 |
| `ziwei_interpret` | 排盘并返回解读资料包（固化解读规范＋命盘＋命中格局＋《天纪》原话＋古籍原文＋名人对照），由当前对话模型据此作答。 |
| `ziwei_dataset` | 从开源解读数据集 v4.0（674,976 命盘 × 13 维，上游断语库确定性生成）按出生信息**精确取对应命盘的解读长文**：命格总览/性格/感情/事业/财运/健康/兄弟/子女/迁移/人际/田宅/福德/父母，每维约两千字；默认仅返回总览，`dims` 参数按需取。 |
| `ziwei_dataset_install` | 在线下载安装数据集年份（每压缩包约 2 MB，解压约 0.7 GB/年；用 Node 内置 zstd 解压，需 Node ≥ 22.15）。已装年份自动跳过。 |
| `ziwei_knowledge` | 检索《天纪·紫微斗数》倪师原话（1848 条，含时间码与出处链接）与三部古籍（骨髓赋／紫微斗数全集／紫微斗数全书）。 |

## 快速开始

### 1. 构建服务单文件

```bash
npm install        # 仅构建/开发需要；直接使用可跳过
npm run build:mcp  # 产出 agent-server/ziwei-server.mjs（单文件）
```

（或从 Release 直接下载打包好的 `ziwei-server.mjs`。）

### 2. 接入任意 MCP 客户端

```json
{
  "mcpServers": {
    "ziwei-doushu": {
      "command": "node",
      "args": ["<服务路径>/agent-server/ziwei-server.mjs"],
      "env": { "ZIWEI_DATASET_DIR": "<你选择的数据集目录>" }
    }
  }
}
```

`ZIWEI_DATASET_DIR` 可省略（默认 `<服务路径>/../data/interp-v4`）；数据集装在别处时用环境变量指定即可。

### 3. 安装数据集（可选，`ziwei_dataset` / `ziwei_dataset_install` 需要）

三种方式任选：

```text
① 在对话里直接让智能体调用 ziwei_dataset_install（如「装一下 1990 到 2005 年的数据集」）
② PowerShell: scripts/get-dataset.ps1 [-From 1975] [-To 2005] [-Dest <目录>]
③ POSIX:      sh scripts/get-dataset.sh [起始年] [结束年]
```

全量 77 年（1950–2026）解压后约 56.6 GB（压缩包仅 161 MB），按需选装。装完无需重启，服务按需读取并自动建索引。

## 开发

```bash
npm install
npm test           # 排盘引擎回归（未装数据集时数据集测试自动跳过）
npm run typecheck
npm run build:mcp  # 改完 mcp/ 源码后重新打包单文件
```

### 目录结构

```
mcp/                  MCP 服务源码（工具注册、出生信息解析）
lib/ai/               解读资料包、天纪语料检索、数据集查询与安装
lib/ziwei/            排盘引擎（上游同步：算法/四化/格局/亮度流派/真太阳时/夏令时）
lib/classics/         古籍原典（公版，静态打包）
docs/tianji-ziwei/    《天纪》语料（entries.jsonl，1848 条）
scripts/              回归测试、构建、数据集安装脚本
agent-server/         构建产物（gitignore）：通用单文件服务
data/                 数据集安装位置（gitignore，自选）
```

### 引擎口径

- 真太阳时＝钟表时间＋经度修正＋均时差（NOAA 近似）；晚子时（23:00–23:59）按次日排盘；
- 数据集查询键使用**校正后的排盘日与时辰支**（数据集本身按钟表时辰生成，(日期, 时辰支) 空间一致）；
- 生年四化按农历年干取；星曜亮度流派可切换。

## 来源与许可（重要）

本项目是 [Renhuai123/ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu)（作者：王多鱼AI，线上平台 OURANIC / ouranic.cn）的衍生 MCP 服务，排盘引擎与语料来自上游开源，感谢上游作者。

| 内容 | 许可 |
|---|---|
| 本仓库代码与上游引擎代码 | MIT（保留 [LICENSE](./LICENSE)） |
| 上游解读数据集 v4.0 / v3.0（Releases 下载） | CC BY 4.0（商用需注明来源，见 [DATASET-LICENSE](./DATASET-LICENSE)） |
| 《天纪》倪师原话（`docs/tianji-ziwei/`） | CC BY-NC-SA 4.0（**不可商用**） |
| 古籍原文 | 公有领域 |

引用数据集请标注：

> 本项目使用了 **紫微斗数开源解读数据集 v4.0**（674,976 张命盘 × 13 维）
> 来源：https://github.com/Renhuai123/ziwei-doushu 作者：王多鱼AI

## 免责声明

本项目输出为传统命理内容，仅供文化学习与参考，不构成任何现实决策（医疗、婚姻、投资等）依据。

<div align="center">

English: see [README.en.md](./README.en.md)

</div>
