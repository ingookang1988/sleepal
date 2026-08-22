export type PalState = 'AWAKE' | 'DROWSY' | 'ASLEEP';

export type Nu40Message =
  | { kind: 'hello' }
  | { kind: 'lux'; value: number }
  | { kind: 'luxBase'; value: number }
  | { kind: 'state'; value: PalState }
  | { kind: 'sleeping' }
  | { kind: 'button'; button: 'A' | 'B'; action: 'DOWN' | 'UP' }
  | { kind: 'unknown'; line: string };

export function parseNu40Line(line: string): Nu40Message {
  if (line === 'HELLO') return { kind: 'hello' };
  if (line === 'SLEEPING') return { kind: 'sleeping' };

  let match = line.match(/^LUX:(\d+)$/);
  if (match) return { kind: 'lux', value: Number(match[1]) };

  match = line.match(/^LUX:BASE:(\d+)$/);
  if (match) return { kind: 'luxBase', value: Number(match[1]) };

  match = line.match(/^STATE:(AWAKE|DROWSY|ASLEEP)$/);
  if (match) return { kind: 'state', value: match[1] as PalState };

  match = line.match(/^BTN:(A|B):(DOWN|UP)$/);
  if (match) {
    return {
      kind: 'button',
      button: match[1] as 'A' | 'B',
      action: match[2] as 'DOWN' | 'UP',
    };
  }

  return { kind: 'unknown', line };
}

export function isAllowedBoardWrite(line: string): boolean {
  return (
    /^LED:(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])$/.test(line) ||
    /^TILT:-?(?:[0-9]|[1-8][0-9]|90)$/.test(line) ||
    line === 'SHAKE' ||
    line === 'WAKE'
  );
}

export function shouldForwardToFace(message: Nu40Message): boolean {
  return (
    message.kind === 'hello' ||
    message.kind === 'lux' ||
    message.kind === 'luxBase' ||
    message.kind === 'state' ||
    message.kind === 'sleeping'
  );
}
