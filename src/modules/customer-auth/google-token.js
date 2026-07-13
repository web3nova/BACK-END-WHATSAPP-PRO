import { UnauthorizedError } from '../../common/errors/index.js';

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// Validates the decoded tokeninfo payload. Google's tokeninfo endpoint already
// checks the signature; we must still check the claims are for OUR app.
export function validateGoogleTokenPayload(payload, expectedAud) {
  if (!expectedAud) {
    throw new UnauthorizedError('Google login is not configured on this server');
  }
  if (payload.aud !== expectedAud) {
    throw new UnauthorizedError('Google token was issued for a different application');
  }
  if (payload.iss && !GOOGLE_ISSUERS.includes(payload.iss)) {
    throw new UnauthorizedError('Invalid Google token issuer');
  }
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
    throw new UnauthorizedError('Google token has expired');
  }
  if (payload.email_verified === 'false' || payload.email_verified === false) {
    throw new UnauthorizedError('Google account email is not verified');
  }
}
