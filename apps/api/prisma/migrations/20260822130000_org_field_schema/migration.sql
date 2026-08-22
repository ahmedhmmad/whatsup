-- Per-organization overrides of the vertical's labels and custom fields, so a new
-- kind of organization can be onboarded without a code change. Nullable: existing
-- organizations keep using their built-in type.
ALTER TABLE "organizations" ADD COLUMN "field_schema" JSONB;
