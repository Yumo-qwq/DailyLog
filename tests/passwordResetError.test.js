import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordResetError } from '../src/services/passwordResetError.js';

test('HTTP 500 does not expose an empty object as the error', () => {
  const error = passwordResetError({ status: 500, message: '{}' });
  assert.match(error.message, /HTTP 500/);
  assert.match(error.message, /Authentication 日志/);
});

test('rate limit has a useful explanation', () => {
  assert.match(passwordResetError({ status: 429, message: '{}' }).message, /发送过于频繁/);
});
