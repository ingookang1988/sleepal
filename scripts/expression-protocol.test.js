'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const protocolUrl = pathToFileURL(
  path.join(__dirname, '..', 'app', 'face', 'expression-protocol.mjs')
).href;

test('CON-01b expression payload allowlist and legacy tone normalization', async () => {
  const { normalizeExpressionTrigger } = await import(protocolUrl);
  assert.deepEqual(
    normalizeExpressionTrigger({ kind:'startled', tone:0.8, source:'lux' }),
    { kind:'startled', tone:0.8, source:'lux' }
  );
  assert.deepEqual(
    normalizeExpressionTrigger({ kind:'happy', tone:'soft', source:'play' }),
    { kind:'happy', tone:0.6, source:'play' }
  );
  assert.equal(normalizeExpressionTrigger({ kind:'angry', tone:1, source:'lux' }), null);
  assert.equal(normalizeExpressionTrigger({ kind:'happy', tone:1.1, source:'play' }), null);
  assert.equal(normalizeExpressionTrigger({ kind:'happy', tone:1, source:'play', userId:'x' }), null);
});
