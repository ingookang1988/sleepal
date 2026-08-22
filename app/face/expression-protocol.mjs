// [CON-01b] 순수 표정 payload 정규화 — DOM·센서·렌더 의존성 0.
export const EXPRESSION_KINDS = Object.freeze([
  'happy', 'curious', 'sad', 'startled', 'relieved', 'note',
]);
export const EXPRESSION_SOURCES = Object.freeze([
  'play', 'lux', 'sound', 'button', 'system',
]);
export const LEGACY_TONES = Object.freeze({ soft:0.6, bright:1, drowsy:0.35 });

const KINDS = new Set(EXPRESSION_KINDS);
const SOURCES = new Set(EXPRESSION_SOURCES);
const PAYLOAD_KEYS = new Set(['kind', 'tone', 'source']);

export function normalizeExpressionTrigger(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Object.keys(input).some(function (key) { return !PAYLOAD_KEYS.has(key); })) return null;
  if (!KINDS.has(input.kind) || !SOURCES.has(input.source)) return null;
  let tone = input.tone;
  if (typeof tone === 'string') tone = LEGACY_TONES[tone];
  if (typeof tone !== 'number' || !Number.isFinite(tone) || tone < 0 || tone > 1) return null;
  return { kind: input.kind, tone: tone, source: input.source };
}
