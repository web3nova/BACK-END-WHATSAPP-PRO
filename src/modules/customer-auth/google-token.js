import { UnauthorizedError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// Validates the decoded tokeninfo payload. Google's tokeninfo endpoint already
// checks the signature; we must still check the claims are for OUR app.
export function validateGoogleTokenPayload(payload, expectedAud) {
  if (!expectedAud) {
    throw new UnauthorizedError('Google login is not configured on this server');
  }
  if (payload.aud !== expectedAud) {
    // Client IDs aren't secret — log both sides (incl. in production) so a
    // Vercel VITE_GOOGLE_CLIENT_ID / Render GOOGLE_CLIENT_ID mismatch shows
    // up immediately in Render logs instead of just a generic 401.
    logger.warn(
      { expectedAud, receivedAud: payload.aud },
      '[googleLogin] aud mismatch — VITE_GOOGLE_CLIENT_ID (frontend) and GOOGLE_CLIENT_ID (backend) likely differ',
    );
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
