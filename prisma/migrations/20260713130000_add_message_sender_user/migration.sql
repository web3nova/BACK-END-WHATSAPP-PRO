-- Attribute staff-sent messages to the specific team member who sent them
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "senderUserId" TEXT;
CREATE INDEX IF NOT EXISTS "messages_senderUserId_idx" ON "messages"("senderUserId");
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
