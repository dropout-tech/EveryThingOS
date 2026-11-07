-- Two plans: monthly (NT$1,000 a month) and ai (NT$69,000 a year), both tax included (glue/src/plans.ts).
-- Rows from before the monthly plan say 'annual'; the code already reads anything but 'ai' as monthly.
UPDATE accounts SET plan = 'monthly' WHERE plan IS NULL OR lower(trim(plan)) <> 'ai';
UPDATE accounts SET plan = 'ai' WHERE lower(trim(plan)) = 'ai';
