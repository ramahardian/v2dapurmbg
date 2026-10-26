ALTER TABLE bahan_baku
  ADD COLUMN sumber VARCHAR(20) DEFAULT NULL COMMENT 'sumber permintaan: ahli_gizi' AFTER stok_minimum;
