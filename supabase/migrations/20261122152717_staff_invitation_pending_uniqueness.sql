alter table public.staff_invitations drop constraint if exists staff_invitations_business_id_email_status_key;
create unique index if not exists staff_invitations_one_pending_per_email on public.staff_invitations (business_id, lower(email)) where status='pending';
