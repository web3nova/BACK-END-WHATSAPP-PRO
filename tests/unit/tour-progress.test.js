import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTourProgress } from '../../src/modules/users/tour-progress.js';

test('sets a tour when previously empty', () => {
  const out = mergeTourProgress({}, 'dashboard', { completedChapters: [0], done: false });
  assert.deepEqual(out, { dashboard: { completedChapters: [0], done: false } });
});

test('merges into an existing tour without dropping the other tour', () => {
  const prev = { dashboard: { completedChapters: [0], done: false }, websiteBuilder: { completedChapters: [1], done: false } };
  const out = mergeTourProgress(prev, 'dashboard', { completedChapters: [0, 1], done: false });
  assert.deepEqual(out.dashboard, { completedChapters: [0, 1], done: false });
  assert.deepEqual(out.websiteBuilder, { completedChapters: [1], done: false });
});

test('dedupes and sorts completedChapters', () => {
  const out = mergeTourProgress({ dashboard: { completedChapters: [2, 0] } }, 'dashboard', { completedChapters: [0, 1] });
  assert.deepEqual(out.dashboard.completedChapters, [0, 1, 2]);
});

test('marks done', () => {
  const out = mergeTourProgress({}, 'dashboard', { done: true });
  assert.equal(out.dashboard.done, true);
});

test('ignores an unknown tour id', () => {
  assert.throws(() => mergeTourProgress({}, 'nope', { done: true }), /Unknown tour/);
});

test('treats a non-object prior as empty', () => {
  const out = mergeTourProgress(null, 'dashboard', { done: true });
  assert.equal(out.dashboard.done, true);
});
