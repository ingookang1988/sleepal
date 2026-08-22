export type LineBufferResult = {
  lines: string[];
  droppedLines: number;
};

export class AsciiLineBuffer {
  private buffer = '';
  private discarding = false;

  constructor(private readonly maxBytes: number) {}

  push(chunk: string): LineBufferResult {
    const lines: string[] = [];
    let droppedLines = 0;

    for (const character of chunk) {
      if (character === '\r' || character === '\n') {
        if (this.discarding) droppedLines += 1;
        else {
          const line = this.buffer.trim();
          if (line) lines.push(line);
        }
        this.buffer = '';
        this.discarding = false;
        continue;
      }

      if (this.discarding) continue;
      if (this.buffer.length >= this.maxBytes - 1) {
        this.buffer = '';
        this.discarding = true;
        continue;
      }
      this.buffer += character;
    }

    return { lines, droppedLines };
  }

  reset(): void {
    this.buffer = '';
    this.discarding = false;
  }
}
