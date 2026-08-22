import { PWA_BRIDGE_SCRIPT } from '../bridge/pwaBridgeScript';

describe('PWA native bridge bootstrap', () => {
  it('enters the face after the PWA runtime is ready', () => {
    expect(PWA_BRIDGE_SCRIPT).toContain("document.getElementById('bStart')");
    expect(PWA_BRIDGE_SCRIPT).toContain('startButton.click()');
  });

  it('forwards canonical expression envelopes through the PWA API', () => {
    expect(PWA_BRIDGE_SCRIPT).toContain("message.type === 'expr/trigger'");
    expect(PWA_BRIDGE_SCRIPT).toContain('window.SP.emitExpression(message.payload)');
  });
});
