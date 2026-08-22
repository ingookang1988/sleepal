import { BridgeSequencer, parseWebEnvelope } from '../bridge/envelope';

describe('WebView bridge envelope', () => {
  it('creates monotonic native envelopes', () => {
    const sequencer = new BridgeSequencer();
    expect(sequencer.create('ble/line', { line: 'LUX:1' }, 1).seq).toBe(0);
    expect(sequencer.create('ble/line', { line: 'LUX:2' }, 2).seq).toBe(1);
  });

  it('accepts only shaped web messages', () => {
    expect(parseWebEnvelope('{"v":1,"type":"web/ready","seq":0,"at":1,"payload":{"bridgeVersion":1}}')?.type).toBe('web/ready');
    expect(parseWebEnvelope('{"v":1,"type":"ble/write","seq":1,"at":1,"payload":{}}')).toBeNull();
    expect(parseWebEnvelope('not-json')).toBeNull();
  });
});
