#!/usr/bin/env node
import dotenv from 'dotenv';
import { prisma } from '../src/config/prisma.js';

dotenv.config();

const DRY = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

async function main() {
    console.log('Starting backfill for Message.externalId from meta.whatsappMessageId');

    // 1) Find duplicates (whatsappMessageId that occur more than once)
    const dupRows = await prisma.$queryRaw`
    SELECT meta->>'whatsappMessageId' as whatsappMessageId, count(*) as cnt
    FROM messages
    WHERE meta->>'whatsappMessageId' IS NOT NULL
    GROUP BY meta->>'whatsappMessageId'
    HAVING count(*) > 1
  `;

    const dupSet = new Set(dupRows.map(r => r.whatsappMessageId));
    if (dupSet.size > 0) {
        console.warn(`Found ${dupSet.size} whatsappMessageId values with duplicates. These will be skipped.`);
    }

    // 2) Find messages to update
    const rows = await prisma.$queryRaw`
    SELECT id, meta->>'whatsappMessageId' as whatsappMessageId
    FROM messages
    WHERE externalId IS NULL AND meta->>'whatsappMessageId' IS NOT NULL
  `;

    console.log(`Found ${rows.length} messages eligible for backfill`);

    let updated = 0;
    let skipped = 0;

    for (const r of rows) {
        const id = r.id;
        const wid = r.whatsappMessageId;
        if (!wid) { skipped++; continue; }
        if (dupSet.has(wid)) {
            skipped++;
            console.warn(`Skipping ${id} because whatsappMessageId ${wid} is duplicated in DB.`);
            continue;
        }

        // Ensure no existing externalId equals wid
        const exist = await prisma.message.findFirst({ where: { externalId: wid } });
        if (exist) {
            skipped++;
            console.warn(`Skipping ${id} because another message already has externalId=${wid}`);
            continue;
        }

        if (DRY) {
            console.log(`[DRY] Would update message ${id} -> externalId=${wid}`);
            updated++;
            continue;
        }

        await prisma.message.update({ where: { id }, data: { externalId: wid } });
        updated++;
        if (updated % 100 === 0) console.log(`Updated ${updated} messages so far...`);
    }

    console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}`);
}

main()
    .catch((e) => { console.error('Backfill failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
