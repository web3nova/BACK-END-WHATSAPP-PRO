import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import * as customerAuthService from './customer-auth.service.js';

export const signup = asyncHandler(async (req, res) => {
  const { tenantId, name, phone, email, password } = req.body;
  const data = await customerAuthService.signup({ tenantId, name, phone, email, password });
  created(res, data);
});

export const login = asyncHandler(async (req, res) => {
  const { tenantId, phone, email, password } = req.body;
  const data = await customerAuthService.login({ tenantId, phone, email, password });
  ok(res, data);
});

export const googleLogin = asyncHandler(async (req, res) => {
  const { tenantId, idToken } = req.body;
  const data = await customerAuthService.googleLogin({ tenantId, idToken });
  ok(res, data);
});

export const passkeyRegisterStart = asyncHandler(async (req, res) => {
  const { customerId } = req.body;
  const tenantId = req.customer?.tenantId || req.body.tenantId;
  const data = await customerAuthService.passkeyRegisterStart({ tenantId, customerId });
  ok(res, data);
});

export const passkeyRegisterComplete = asyncHandler(async (req, res) => {
  const { customerId, credential } = req.body;
  const data = await customerAuthService.passkeyRegisterComplete({ customerId, credential });
  ok(res, data);
});

export const passkeyLoginStart = asyncHandler(async (req, res) => {
  const { tenantId } = req.body;
  const data = await customerAuthService.passkeyLoginStart({ tenantId });
  ok(res, data);
});

export const passkeyLoginComplete = asyncHandler(async (req, res) => {
  const { tenantId, credential } = req.body;
  const data = await customerAuthService.passkeyLoginComplete({ tenantId, credential });
  ok(res, data);
});

export const googleCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  let tenantId = '';
  try { tenantId = state ? JSON.parse(state).tenantId : ''; } catch {}

  let result = {};
  if (code) {
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          redirect_uri: `${req.protocol}://${req.get('host')}/api/v1/customer-auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.id_token) {
        const loginResult = await customerAuthService.googleLogin({ tenantId, idToken: tokenData.id_token });
        result = { type: 'GOOGLE_LOGIN_SUCCESS', ...loginResult };
      }
    } catch (err) {
      result = { type: 'GOOGLE_LOGIN_ERROR', error: err.message };
    }
  } else {
    result = { type: 'GOOGLE_LOGIN_ERROR', error: 'No authorization code received' };
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(`<script>
    if (window.opener) {
      window.opener.postMessage(${JSON.stringify(result)}, '*');
      window.close();
    } else {
      document.write('Authentication complete. You may close this window.');
    }
  </script>`);
});

export const getProfile = asyncHandler(async (req, res) => {
  const data = await customerAuthService.getProfile(req.customer.id, req.customer.tenantId);
  ok(res, data);
});
