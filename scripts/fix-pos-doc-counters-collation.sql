-- pos_doc_counters was created without CHARSET/COLLATE and inherits DB default (utf8mb4_0900_ai_ci on MySQL 8).
-- sp_next_doc_number compares doc_type = p_doc_type → collation mix with utf8mb4_unicode_ci POS tables / session.
ALTER TABLE pos_doc_counters CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
