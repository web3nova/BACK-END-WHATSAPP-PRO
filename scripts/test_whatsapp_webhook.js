#!/usr/bin/env node
import fetch from 'node-fetch';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const SECRET = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
if (!SECRET) {
    console.error('Please set WHATSAPP_APP_SECRET or META_APP_SECRET in your .env');
    process.exit(1);
}

const url = process.env.WEBHOOK_URL || 'http://localhost:4000/api/v1/webhook';

// Choose payload type via MESSAGE_TYPE env: text (default), interactive, image
const type = process.env.MESSAGE_TYPE || 'text';

function buildPayload(type) {
    const phoneNumberId = process.env.TEST_PHONE_NUMBER_ID || '1234567890';
    const from = process.env.TEST_SENDER_PHONE || '+15551234567';
    const messageId = `wamid.TEST.${Date.now()}`;

    let message;
    if (type === 'interactive') {
        message = {
            id: messageId,
            from,
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 'btn_1', title: 'Confirm' } }
        };
    } else if (type === 'image') {
        message = {
            id: messageId,
            from,
            type: 'image',
            image: { id: 'media_1', caption: 'Photo caption' }
        };
    } else {
        message = {
            id: messageId,
            from,
            type: 'text',
            text: { body: process.env.TEST_MESSAGE || 'Hello from test script' }
        };
    }

    return {
        object: 'whatsapp_business_account',
        entry: [
            {
                id: 'test-entry',
                changes: [
                    {
                        value: {
                            metadata: { phone_number_id: phoneNumberId },
                            contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
                            messages: [message]
                        },
                        field: 'messages'
                    }
                ]
            }
        ]
    };
}

const payload = buildPayload(type);
const body = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
const header = `sha256=${signature}`;

(async () => {
    console.log('Posting to', url, 'message type:', type);
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': header
        },
        body
    });

    console.log('Response status:', res.status);
    const text = await res.text();
    console.log('Response body:', text);
})();
