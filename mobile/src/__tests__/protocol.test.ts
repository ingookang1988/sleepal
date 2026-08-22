import {
  isAllowedBoardWrite,
  parseNu40Line,
  shouldForwardToFace,
} from '../ble/protocol';

describe('NU40 protocol', () => {
  it('parses contracted sensor lines', () => {
    expect(parseNu40Line('LUX:37')).toEqual({ kind: 'lux', value: 37 });
    expect(parseNu40Line('LUX:BASE:12')).toEqual({ kind: 'luxBase', value: 12 });
    expect(parseNu40Line('STATE:DROWSY')).toEqual({ kind: 'state', value: 'DROWSY' });
    expect(parseNu40Line('SLEEPING')).toEqual({ kind: 'sleeping' });
  });

  it('keeps unknown lines non-fatal', () => {
    const message = parseNu40Line('MOVE:1,20,300');
    expect(message).toEqual({ kind: 'unknown', line: 'MOVE:1,20,300' });
    expect(shouldForwardToFace(message)).toBe(false);
    expect(shouldForwardToFace(parseNu40Line('LUX:37'))).toBe(true);
  });

  it('allows only contracted board writes', () => {
    expect(isAllowedBoardWrite('LED:255')).toBe(true);
    expect(isAllowedBoardWrite('WAKE')).toBe(true);
    expect(isAllowedBoardWrite('LED:256')).toBe(false);
    expect(isAllowedBoardWrite('FORMAT')).toBe(false);
  });
});
