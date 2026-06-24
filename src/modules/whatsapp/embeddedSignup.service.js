import fetch from 'node-fetch';
import { prisma } from '../../config/prisma.js';

/**
 * Minimal implementation for Meta Embedded Signup flow.
 * This service exchanges an OAuth code for a permanent access token
 * and persists the WhatsApp account config for a tenant.
 *
 * Note: The exact Meta endpoints and response shapes should be verified
 * against the Meta Embedded Signup docs for your app and API version.
 */
export async function exchangeCodeForAccount({ tenantId, redirectUri, code }) {
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
        throw new Error('META_APP_ID / META_APP_SECRET not configured');
    }

    // Exchange the authorization code for a short-lived token
    const tokenUrl = `https://graph.facebook.com/v16.0/oauth/access_token`;
    const params = new URLSearchParams({
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: redirectUri,
        code
    });

    const tokenRes = await fetch(`${tokenUrl}?${params.toString()}`);
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`Failed to exchange code: ${JSON.stringify(tokenJson)}`);

    const shortLived = tokenJson.access_token;

    // Exchange for long-lived token (app access token flow may vary)
    const extParams = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: shortLived
    });

    const extRes = await fetch(`https://graph.facebook.com/v16.0/oauth/access_token?${extParams.toString()}`);
    const extJson = await extRes.json();
    if (!extRes.ok) throw new Error(`Failed to extend token: ${JSON.stringify(extJson)}`);

    const accessToken = extJson.access_token;

    // Use the Graph API to fetch the connected WhatsApp Business Account(s)
    // This is an approximation — the real endpoint may differ.
    const accountsRes = await fetch(`https://graph.facebook.com/v16.0/me?fields=businesses&access_token=${accessToken}`);
    const accountsJson = await accountsRes.json();
    if (!accountsRes.ok) throw new Error(`Failed to fetch businesses: ${JSON.stringify(accountsJson)}`);

    // TODO: map the response to the WhatsappAccount model fields correctly
    // For now, persist the token and mark as verified for the tenant
    await prisma.whatsappAccount.upsert({
        where: { tenantId },
        update: { accessToken, verified: true },
        create: { tenantId, accessToken, verified: true }
    });

    return { tenantId, accessToken };
}

export default { exchangeCodeForAccount };
// Meta Embedded Signup OAuth -> WABA_ID + tokens
// TODO: implement
