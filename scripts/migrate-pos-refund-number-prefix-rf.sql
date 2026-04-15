-- One-time: ensure the insert trigger assigns REF-1000001… when refund_number is empty.
-- Run against DBs that still use RF- in the trigger; new installs: scripts/mysql-aiven-bootstrap.sql.

DROP TRIGGER IF EXISTS trg_pos_refunds_before_insert;
DELIMITER //
CREATE TRIGGER trg_pos_refunds_before_insert
BEFORE INSERT ON pos_refunds
FOR EACH ROW
BEGIN
  DECLARE v_num VARCHAR(64);
  IF NEW.refund_number IS NULL OR TRIM(NEW.refund_number) = '' THEN
    CALL sp_next_doc_number('refund', 'REF-', v_num);
    SET NEW.refund_number = v_num;
  END IF;
END//
DELIMITER ;
