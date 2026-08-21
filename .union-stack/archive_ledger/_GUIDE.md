# archive_ledger/ — inert store for rotated ledger entries ([PRO-18])

> **Why:** the ledger is append-only and therefore only grows. It crossed the 30KB soft cap on
> 2026-08-20 (42.9KB / ~10,000 tok — 2.5× the entire bootstrap budget), and until [PRO-18] the
> declared remedy was **unexecutable**: rotation moves lines out, and `permission-guard` Check A
> rejected any line leaving an append-only file.
> Same shape as `sprint/archived/` — this is tidiness, not a lifecycle stage.

## Rules
- **One-way and inert.** Move the **oldest contiguous `ADR-*` block** out of `archive_ledger.md`,
  verbatim. Not a summary, not a digest — a **move**. (Summarising old entries is the direction
  [ADR-12] blocked; rotation deliberately stays on this side of that line.)
- **Verbatim is machine-enforced.** Check A now permits a removal only when the same line is added
  to another append-only path **in the same commit** (conservation check). Lose one line and the
  commit is REJECTed — the guard verifies, it does not trust.
- **When:** at **session end** (batch), triggered by `health`'s file-size WARN on the ledger.
  Rotate until the head is at **≤ 60%** of the cap — stopping just under the line means the next
  session trips it again.
- **File name is the order.** `ADR-<first>_<last>.md`. `scripts/ledger.js` sorts shards by the first
  number, so the name *is* the sequence; the head file is always last (= newest).
- **Nothing is deleted, and every `[ADR-N]` still resolves.** Consumers read head + shards through
  `scripts/ledger.js`. That resolvability is the whole point of keeping them — do not delete.
  Measured consequence of skipping it: 24 ghost references and the re-proposal block list going
  **6 → 0**, after which a routine `blocks-index --write` overwrites the AGENTS.md ⛔ block.
- **Shards are append-only too.** `permission-guard` classifies `archive_ledger/ADR-*_*.md` as
  append-only, so a rotated entry is exactly as protected as it was in the head. Files here that do
  not match that name (like this guide) are not entry stores and are not append-only.

## Files
- `ADR-<first>_<last>.md` — rotated blocks, oldest first. Empty in the template until the first rotation.
