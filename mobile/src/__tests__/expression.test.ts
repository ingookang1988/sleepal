import { parseNu40Line } from '../ble/protocol';
import {
  expressionForBoardMessage,
  isExpressionTriggerPayload,
} from '../bridge/expression';

describe('expression stimulus protocol', () => {
  it('maps only Button A down to a happy reaction', () => {
    expect(expressionForBoardMessage(parseNu40Line('BTN:A:DOWN'))).toEqual({
      kind: 'happy',
      tone: 0.85,
      source: 'button',
    });
    expect(expressionForBoardMessage(parseNu40Line('BTN:A:UP'))).toBeNull();
    expect(expressionForBoardMessage(parseNu40Line('BTN:B:DOWN'))).toBeNull();
  });

  it('rejects malformed or extended expression payloads', () => {
    expect(isExpressionTriggerPayload({ kind: 'startled', tone: 0.8, source: 'lux' })).toBe(true);
    expect(isExpressionTriggerPayload({ kind: 'angry', tone: 0.8, source: 'lux' })).toBe(false);
    expect(isExpressionTriggerPayload({ kind: 'happy', tone: 2, source: 'button' })).toBe(false);
    expect(isExpressionTriggerPayload({ kind: 'happy', tone: 1, source: 'button', userId: 'x' })).toBe(false);
  });
});
