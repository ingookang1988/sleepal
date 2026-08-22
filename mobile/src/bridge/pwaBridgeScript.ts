export const PWA_BRIDGE_SCRIPT = `
(function () {
  if (window.__sleepPalNativeBridgeInstalled) return true;
  window.__sleepPalNativeBridgeInstalled = true;
  var lastSeq = -1;

  function receive(event) {
    try {
      var raw = typeof event === 'string' ? event : event.data;
      var message = JSON.parse(raw);
      if (message.v !== 1 || typeof message.seq !== 'number' || message.seq <= lastSeq) return;
      lastSeq = message.seq;
      if (message.type === 'ble/line' && window.SP && window.SP.handleLine) {
        window.SP.handleLine(message.payload.line);
      } else if (message.type === 'expr/trigger' && window.SP && window.SP.emitExpression) {
        window.SP.emitExpression(message.payload);
      }
    } catch (_) {}
  }

  window.addEventListener('message', receive);
  document.addEventListener('message', receive);

  var readyTimer = setInterval(function () {
    if (!window.ReactNativeWebView || !window.SP || !window.SP.handleLine || !window.SP.emitExpression) return;
    clearInterval(readyTimer);
    var startButton = document.getElementById('bStart');
    var entryScreen = document.getElementById('entryScreen');
    if (startButton && entryScreen && entryScreen.classList.contains('on')) {
      startButton.click();
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({
      v: 1,
      type: 'web/ready',
      seq: 0,
      at: Date.now(),
      payload: { bridgeVersion: 1 }
    }));
  }, 100);
  true;
})();
`;
