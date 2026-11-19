-- Revert by restoring company_founders from a pre-migration backup.
UPDATE company_founders
SET account_id = (
  SELECT id FROM accounts
  WHERE accounts.company_id = company_founders.company_id AND role = 'owner'
  ORDER BY created_at, id LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM accounts WHERE accounts.company_id = company_founders.company_id AND role = 'owner');

DELETE FROM company_founders
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.company_id = company_founders.company_id AND role = 'owner');
