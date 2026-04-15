-- Balance Due (pos_customers.account_balance) is recalculated by sp_recalc_customer_ledger when invoices/receipts change.
-- Without this change, an invoice that goes from Paid → Partially Paid after a refund enters the "open" set and
-- increases the customer's Balance Due even though refunds are not AR charges. Exclude any invoice with refund
-- activity from this AR-style total.
--
-- Run: npm run db:migrate:sp-recalc-customer-ledger-exclude-refunds

DROP PROCEDURE IF EXISTS sp_recalc_customer_ledger;

DELIMITER //
CREATE PROCEDURE sp_recalc_customer_ledger(IN p_customer_id VARCHAR(128))
BEGIN
  DECLARE v_bal DECIMAL(14,2);
  IF p_customer_id IS NOT NULL THEN
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(i.total, 0) - COALESCE(rp.paid, 0))), 0) INTO v_bal
    FROM pos_invoices i
    LEFT JOIN (
      SELECT l.invoice_id AS invoice_id, SUM(l.amount_applied) AS paid
      FROM pos_receipt_invoice_links l
      INNER JOIN pos_receipts r ON r.id = l.receipt_id AND r.status = 'approved'
      GROUP BY l.invoice_id
    ) rp ON rp.invoice_id = i.id
    WHERE i.customer_id COLLATE utf8mb4_unicode_ci = p_customer_id COLLATE utf8mb4_unicode_ci
      AND i.status COLLATE utf8mb4_unicode_ci IN ('Unpaid', 'Partially Paid')
      AND NOT EXISTS (
        SELECT 1 FROM pos_refunds rf
        WHERE rf.invoice_id COLLATE utf8mb4_unicode_ci = i.id COLLATE utf8mb4_unicode_ci
           OR (
             rf.invoice_links IS NOT NULL
             AND TRIM(rf.invoice_links) NOT IN ('', 'null', '[]')
             AND JSON_VALID(rf.invoice_links)
             AND JSON_SEARCH(rf.invoice_links, 'one', i.id, NULL, '$[*].invoice_id') IS NOT NULL
           )
      );

    UPDATE pos_customers
    SET account_balance = GREATEST(v_bal, 0),
        updated_at = CURRENT_TIMESTAMP(3)
    WHERE id COLLATE utf8mb4_unicode_ci = p_customer_id COLLATE utf8mb4_unicode_ci;
  END IF;
END//
DELIMITER ;
