/**
 * Node ≥22.15 的内置 zstd API（@types/node 20 尚未收录，此处最小声明）。
 * 运行时以 canDecompressNatively() 特性检测为准，旧 Node 走外部脚本安装。
 */
declare module 'node:zlib' {
  export function createZstdDecompress(options?: Record<string, unknown>): import('node:stream').Transform;
}
