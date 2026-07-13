import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGoogleTokenPayload } from '../../src/modules/customer-auth/google-token.js';

const CLIENT_ID = '123-abc.apps.googleusercontent.com';
const good = {
  aud: CLIENT_ID,
  iss: 'https://accounts.google.com',
  exp: String(Math.floor(Date.now() / 1000) + 3600),
  email: 'shopper@example.com',
  email_verified: 'true',
};

test('accepts a valid payload', () => {
  assert.doesNotThrow(() => validateGoogleTokenPayload(good, CLIENT_ID));
});

test('rejects a token issued for a different app', () => {
  assert.throws(() => validateGoogleTokenPayload({ ...good, aud: 'evil-app' }, CLIENT_ID), /different application/);
});

test('rejects when server has no client id configured', () => {
  assert.throws(() => validateGoogleTokenPayload(good, ''), /not configured/);
});

test('rejects a bad issuer', () => {
  assert.throws(() => validateGoogleTokenPayload({ ...good, iss: 'https://evil.example' }, CLIENT_ID), /issuer/);
});

test('rejects an expired token', () => {
  assert.throws(() => validateGoogleTokenPayload({ ...good, exp: '100' }, CLIENT_ID), /expired/);
});

test('rejects unverified email', () => {
  assert.throws(() => validateGoogleTokenPayload({ ...good, email_verified: 'false' }, CLIENT_ID), /not verified/);
});
