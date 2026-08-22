import { fromByteArray, toByteArray } from 'base64-js';

export function decodeAsciiBase64(value: string): string {
  const bytes = toByteArray(value);
  let decoded = '';
  for (const byte of bytes) decoded += String.fromCharCode(byte);
  return decoded;
}

export function encodeAsciiBase64(value: string): string {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) throw new Error('NUS payload must be ASCII');
    bytes[index] = code;
  }
  return fromByteArray(bytes);
}
