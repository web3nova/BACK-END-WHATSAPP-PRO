-- Nothing previously stopped two different tenants from both ending up with
-- a row pointing at the same real WhatsApp WABA/phone number — the connect
-- flow's upsert was scoped only by tenantId. Every place that resolves
-- "which tenant owns this number" (webhooks, incoming message routing) does
-- a findFirst lookup, so a collision would silently route a customer's
-- messages to whichever tenant Postgres happened to return first. Postgres
-- unique constraints allow multiple NULLs, so tenants with no WhatsApp
-- connected yet are unaffected.
CREATE UNIQUE INDEX "whatsapp_accounts_wabaId_key" ON "whatsapp_accounts"("wabaId");
CREATE UNIQUE INDEX "whatsapp_accounts_phoneNumberId_key" ON "whatsapp_accounts"("phoneNumberId");
