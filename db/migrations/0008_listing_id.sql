-- 0008_listing_id.sql

-- The identity key of a listing was named after the marketplace it comes from.
-- `listing_id` says what the column is, and stays right if another source is
-- ever added.
alter table laptops           rename column avito_id to listing_id;
alter table new_laptops       rename column avito_id to listing_id;
alter table rejected_listings rename column avito_id to listing_id;

-- A unique constraint keeps its automatic name when its column is renamed
alter index if exists laptops_avito_id_key     rename to laptops_listing_id_key;
alter index if exists new_laptops_avito_id_key rename to new_laptops_listing_id_key;
