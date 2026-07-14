import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDomain, matchesVerifyToken } from '../../src/modules/website/domain-verification.js';

// --- isValidDomain ---

test('valid hostname "example.com" is valid', () => {
  assert.equal(isValidDomain('example.com'), true);
});

test('valid hostname "my-store.example.co" is valid', () => {
  assert.equal(isValidDomain('my-store.example.co'), true);
});

test('IPv4 address is not valid', () => {
  assert.equal(isValidDomain('192.168.1.1'), false);
});

test('empty string is not valid', () => {
  assert.equal(isValidDomain(''), false);
});

test('null is not valid', () => {
  assert.equal(isValidDomain(null), false);
});

test('undefined is not valid', () => {
  assert.equal(isValidDomain(undefined), false);
});

test('string over 253 chars is not valid', () => {
  const label = 'a'.repeat(63);
  const long = `${label}.${label}.${label}.${label}.com`; // well over 253 chars
  assert.ok(long.length > 253);
  assert.equal(isValidDomain(long), false);
});

test('label with leading hyphen is not valid', () => {
  assert.equal(isValidDomain('-bad.com'), false);
});

test('label with trailing hyphen is not valid', () => {
  assert.equal(isValidDomain('bad-.com'), false);
});

test('single-label with no dot is not valid', () => {
  assert.equal(isValidDomain('localhost'), false);
});

test('uppercase input is valid (case-insensitive)', () => {
  assert.equal(isValidDomain('EXAMPLE.COM'), true);
});

// --- matchesVerifyToken ---

test('exact single-chunk match returns true', () => {
  assert.equal(matchesVerifyToken([['abc123']], 'abc123'), true);
});

test('multi-chunk TXT record that concatenates to the token returns true', () => {
  assert.equal(matchesVerifyToken([['abc', '123']], 'abc123'), true);
});

test('matches among multiple records returns true', () => {
  assert.equal(matchesVerifyToken([['xyz'], ['abc123']], 'abc123'), true);
});

test('no matching record returns false', () => {
  assert.equal(matchesVerifyToken([['xyz']], 'abc123'), false);
});

test('empty records array returns false', () => {
  assert.equal(matchesVerifyToken([], 'abc123'), false);
});

test('null records returns false', () => {
  assert.equal(matchesVerifyToken(null, 'abc123'), false);
});

test('undefined records returns false', () => {
  assert.equal(matchesVerifyToken(undefined, 'abc123'), false);
});

test('empty token returns false', () => {
  assert.equal(matchesVerifyToken([['abc123']], ''), false);
});

test('null token returns false', () => {
  assert.equal(matchesVerifyToken([['abc123']], null), false);
});
