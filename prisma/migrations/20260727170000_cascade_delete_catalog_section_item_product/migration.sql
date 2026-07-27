-- Deleting a product that had been added to a catalog arrangement section
-- previously failed with a foreign key violation (ON DELETE NO ACTION),
-- surfacing to the tenant as an opaque 500 on product delete. A deleted
-- product should just drop out of any catalog section it was placed in.
ALTER TABLE "catalog_section_items" DROP CONSTRAINT "catalog_section_items_productId_fkey";
ALTER TABLE "catalog_section_items" ADD CONSTRAINT "catalog_section_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON UPDATE NO ACTION ON DELETE CASCADE;
