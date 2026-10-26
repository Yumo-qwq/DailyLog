import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubjectEditHeatmap } from '../src/utils.js';

const today = '2026-10-26';

test('weeks run Sunday to Saturday and future dates stay empty', () => {
  const cells = buildSubjectEditHeatmap([], [], 'u1', 12, today);
  assert.equal(cells.length, 84);
  assert.equal(new Date(`${cells[0].key}T12:00:00Z`).getUTCDay(), 0);
  assert.equal(new Date(`${cells.at(-1).key}T12:00:00Z`).getUTCDay(), 6);
  assert.equal(cells.find((cell) => cell.key === today).isToday, true);
  assert.equal(cells.at(-1).isFuture, true);
});

test('color level counts distinct subjects changed that day, not saves or unrelated logs', () => {
  const logs = [
    { user_id: 'u1', date: today, action: 'cell-update', column_id: 'math' },
    { user_id: 'u1', date: today, action: 'cell-images', column_id: 'math' },
    { user_id: 'u1', date: today, action: 'cell-clear', column_id: 'english' },
    { user_id: 'u1', date: today, action: 'column-create', column_id: 'physics' },
    { user_id: 'u2', date: today, action: 'cell-update', column_id: 'physics' }
  ];
  const cell = buildSubjectEditHeatmap(logs, [], 'u1', 12, today).find((item) => item.key === today);
  assert.equal(cell.count, 2);
  assert.equal(cell.level, 2);
});

test('older records without cell logs use populated subjects as a fallback', () => {
  const date = '2026-10-24';
  const checkins = [{ user_id: 'u1', date, entries: {
    math: { content: '复习' },
    english: { content: '', images: [{ id: 'image' }] },
    physics: { content: '' }
  } }];
  const cell = buildSubjectEditHeatmap([], checkins, 'u1', 12, today).find((item) => item.key === date);
  assert.equal(cell.count, 2);
  assert.equal(cell.level, 2);
});
