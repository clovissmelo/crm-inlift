ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_engagement_status_check;

ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_engagement_status_check
  CHECK (engagement_status IN ('active', 'inactive', 'paused', 'closed'));
