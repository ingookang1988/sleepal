import { Nu40Message } from '../ble/protocol';

export type ExpressionKind =
  | 'happy'
  | 'curious'
  | 'sad'
  | 'startled'
  | 'relieved'
  | 'note';

export type ExpressionSource = 'play' | 'lux' | 'sound' | 'button' | 'system';

export type ExpressionTriggerPayload = {
  kind: ExpressionKind;
  tone: number;
  source: ExpressionSource;
};

const KINDS = new Set<ExpressionKind>([
  'happy',
  'curious',
  'sad',
  'startled',
  'relieved',
  'note',
]);
const SOURCES = new Set<ExpressionSource>(['play', 'lux', 'sound', 'button', 'system']);

export function isExpressionTriggerPayload(value: unknown): value is ExpressionTriggerPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<ExpressionTriggerPayload> & Record<string, unknown>;
  if (Object.keys(payload).some((key) => !['kind', 'tone', 'source'].includes(key))) return false;
  return (
    KINDS.has(payload.kind as ExpressionKind) &&
    SOURCES.has(payload.source as ExpressionSource) &&
    typeof payload.tone === 'number' &&
    Number.isFinite(payload.tone) &&
    payload.tone >= 0 &&
    payload.tone <= 1
  );
}

export function expressionForBoardMessage(message: Nu40Message): ExpressionTriggerPayload | null {
  if (message.kind !== 'button' || message.button !== 'A' || message.action !== 'DOWN') return null;
  return { kind: 'happy', tone: 0.85, source: 'button' };
}
