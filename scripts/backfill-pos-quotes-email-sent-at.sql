-- One-time: copy latest successful quote send time from pos_sent_emails into pos_quotes.email_sent_at.
UPDATE pos_quotes q
INNER JOIN (
  SELECT document_id AS qid, MAX(sent_at) AS sent_at
  FROM pos_sent_emails
  WHERE LOWER(COALESCE(document_type, '')) = 'quote'
    AND document_id IS NOT NULL AND document_id <> ''
    AND LOWER(COALESCE(status, '')) IN ('sent', 'resent')
  GROUP BY document_id
) e ON e.qid = q.id
SET q.email_sent_at = e.sent_at;
