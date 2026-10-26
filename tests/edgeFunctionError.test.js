import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeFunctionErrorMessage } from '../src/services/edgeFunctionError.js';

test('empty object response is replaced by an actionable HTTP error', async () => {
  const error = {
    name: 'FunctionsHttpError',
    context: { status: 502, json: async () => ({ error: '{}' }) }
  };
  const message = await edgeFunctionErrorMessage(error, '发送用户邀请');
  assert.match(message, /HTTP 502/);
  assert.match(message, /Authentication 日志/);
});

test('specific function error is shown to the administrator', async () => {
  const error = {
    name: 'FunctionsHttpError',
    context: { status: 409, json: async () => ({ error: '用户名已存在' }) }
  };
  assert.equal(await edgeFunctionErrorMessage(error, '发送用户邀请'), '用户名已存在');
});
