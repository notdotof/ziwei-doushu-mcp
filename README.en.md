# ziwei-doushu-mcp

A lightweight, local-first **MCP (Model Context Protocol) server** for Zi Wei Dou Shu (Purple Star Astrology), built on the open-source engine [Renhuai123/ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu) (Ni Haixia "Tian Ji" school).

- **Single-file server**: the whole service bundles into one `ziwei-server.mjs` (~2.9 MB); only Node.js ≥ 20 required, no `npm install` needed to run.
- **Fully local**: charting and retrieval run locally; the server never calls any online model — the connected agent interprets the returned material.
- **Optional dataset**: the open interpretation dataset (674,976 charts × 13 dimensions) is installed on demand, to a location you choose (`ZIWEI_DATASET_DIR`).

## Tools

| Tool | Purpose |
|---|---|
| `ziwei_paipan` | Natal chart from Gregorian birth time (12 palaces, Si-hua, major limits) with true solar time correction. |
| `ziwei_interpret` | Chart + interpretation pack (rules, patterns, Tian Ji quotes, classics, celebrity charts) for the agent to interpret. |
| `ziwei_dataset` | Exact lookup of a chart's long-form interpretation from open dataset v4.0 (13 dimensions, ~2k chars each). |
| `ziwei_dataset_install` | Download & install dataset years from upstream release (needs Node ≥ 22.15 for built-in zstd). |
| `ziwei_knowledge` | Search 1,848 Ni Haixia "Tian Ji" quotes (with timestamps & links) and three classics. |

## Quick start

```bash
npm install && npm run build:mcp   # produce agent-server/ziwei-server.mjs
```

```json
{
  "mcpServers": {
    "ziwei-doushu": {
      "command": "node",
      "args": ["<path>/agent-server/ziwei-server.mjs"],
      "env": { "ZIWEI_DATASET_DIR": "<dataset dir of your choice>" }
    }
  }
}
```

Dataset (optional): call `ziwei_dataset_install` from your agent, or run `scripts/get-dataset.ps1` / `scripts/get-dataset.sh`. Full set (1950–2026) is ~56.6 GB uncompressed.

See [README.md](./README.md) (Chinese) for full details, attribution and licenses.
