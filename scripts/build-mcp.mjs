/**
 * 构建通用 MCP 单文件：把 mcp/ziwei-server.mts 及其全部依赖 bundle 成
 * 一个可直接用 node 运行的 ESM 文件，输出到两处：
 *   1. agent-server/ziwei-server.mjs  —— 本机通用智能体入口（各客户端注册用）
 *   2. _mcp_dist/server/ziwei-server.mjs —— 分享包（ziwei-doushu-mcp.zip）内容
 * esbuild 定位：优先 node_modules/esbuild（新装依赖会被提升到顶层），
 * 回退 tsx 的嵌套依赖（本机当前布局）。
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));

let esbuild;
for (const cand of ['esbuild', path.join(root, 'node_modules/tsx/node_modules/esbuild')]) {
  try {
    esbuild = require(cand);
    break;
  } catch {
    /* try next */
  }
}
if (!esbuild) {
  console.error('esbuild 未找到：请先 npm install（tsx 依赖里自带 esbuild），或 npm i -D esbuild');
  process.exit(1);
}

const outfileCandidates = [
  path.join(root, 'agent-server/ziwei-server.mjs'),
  path.join(root, '_mcp_dist/server/ziwei-server.mjs'),
];

for (const outfile of outfileCandidates) {
  await esbuild.build({
    entryPoints: [path.join(root, 'mcp/ziwei-server.mts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outfile,
    logLevel: 'warning',
  });
  console.log('built:', outfile);
}
