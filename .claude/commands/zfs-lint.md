---
description: ZFS lint — list naming violations (self-check before writing a new control-plane file)
allowed-tools: Bash(node scripts/query-cli.js:*)
---
ZFS naming violations:

!`node scripts/query-cli.js zfs_lint`

A non-empty list means a filename breaks the convention — fix it before committing.
