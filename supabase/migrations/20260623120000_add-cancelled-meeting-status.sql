-- Allow meetings to be cancelled (status change, not a delete) so the record/audit trail survives.
-- Adds 'cancelled' to the meeting_status enum used by public.meetings.status.
ALTER TYPE public.meeting_status ADD VALUE IF NOT EXISTS 'cancelled';
