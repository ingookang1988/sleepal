import { AsciiLineBuffer } from '../ble/lineBuffer';

describe('AsciiLineBuffer', () => {
  it('restores a line split across notifications', () => {
    const buffer = new AsciiLineBuffer(64);
    expect(buffer.push('LUX:').lines).toEqual([]);
    expect(buffer.push('37\n').lines).toEqual(['LUX:37']);
  });

  it('emits multiple CRLF lines in order', () => {
    const buffer = new AsciiLineBuffer(64);
    expect(buffer.push('HELLO\r\nSTATE:DROWSY\n').lines).toEqual(['HELLO', 'STATE:DROWSY']);
  });

  it('drops an overlong line without emitting its tail', () => {
    const buffer = new AsciiLineBuffer(8);
    const result = buffer.push('123456789-tail\nLUX:1\n');
    expect(result.droppedLines).toBe(1);
    expect(result.lines).toEqual(['LUX:1']);
  });
});
