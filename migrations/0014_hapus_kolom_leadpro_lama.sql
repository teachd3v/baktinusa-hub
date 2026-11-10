-- Kolom LeadPro lama di awardees tidak lagi dipakai sejak 0013 (tabel leadpros dan leadpro_fields).
ALTER TABLE awardees DROP COLUMN leadpro_name;
ALTER TABLE awardees DROP COLUMN leadpro_field;
ALTER TABLE awardees DROP COLUMN leadpro_description;
