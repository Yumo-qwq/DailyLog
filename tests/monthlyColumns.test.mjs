import test from 'node:test';
import assert from 'node:assert/strict';
import { getLearningColumns } from '../src/store.js';

test('subjects belong only to their own month', () => {
  const state = { learningColumns: [
    { id: 'september', user_id: 'u', month_key: '2026-09', name: '英语', column_order: 1 },
    { id: 'october', user_id: 'u', month_key: '2026-10', name: '英语', column_order: 1 },
    { id: 'other-user', user_id: 'v', month_key: '2026-10', name: '英语', column_order: 2 }
  ] };
  assert.deepEqual(getLearningColumns(state, 'u', '2026-09').map((column) => column.id), ['september']);
  assert.deepEqual(getLearningColumns(state, 'u', '2026-10').map((column) => column.id), ['october']);
  assert.deepEqual(getLearningColumns(state, 'u', '2026-11'), []);
});
