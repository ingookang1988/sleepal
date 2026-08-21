---
description: Blast Radius — impact set + Verifying lock check before editing/deleting a ZFS node
allowed-tools: Bash(node scripts/blast-radius.js:*)
---
Impact analysis for `$ARGUMENTS`:

!`node scripts/blast-radius.js $ARGUMENTS`

If a Verifying node is in the blast radius, STOP and ask the human (Fail-close).
