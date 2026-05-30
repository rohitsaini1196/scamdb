-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

create type entity_type as enum ('phone', 'upi');

create type report_category as enum (
  'financial_fraud',
  'impersonation',
  'lottery_scam',
  'job_scam',
  'investment_fraud',
  'romance_scam',
  'phishing',
  'fake_customer_support',
  'other'
);

create type platform_type as enum (
  'whatsapp',
  'phone_call',
  'sms',
  'telegram',
  'instagram',
  'facebook',
  'email',
  'upi_app',
  'other'
);

create type report_status as enum ('pending', 'approved', 'rejected', 'hidden');

create type moderation_action_type as enum ('approved', 'rejected', 'hidden', 'merge', 'note');

-- ============================================
-- TABLES
-- ============================================

create table entities (
  id uuid primary key default uuid_generate_v4(),
  type entity_type not null,
  normalized_value text not null,
  display_value text not null,
  report_count integer not null default 0,
  last_reported_at timestamptz,
  created_at timestamptz not null default now(),
  constraint entities_unique unique (type, normalized_value)
);

create table reports (
  id uuid primary key default uuid_generate_v4(),
  entity_id uuid not null references entities(id) on delete cascade,
  category report_category not null,
  platform platform_type not null,
  description text not null check (char_length(description) >= 20 and char_length(description) <= 1000),
  amount_lost numeric(12,2),
  evidence_urls text[] not null default '{}',
  status report_status not null default 'pending',
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table moderation_actions (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid not null references reports(id) on delete cascade,
  action moderation_action_type not null,
  moderator_id uuid not null references auth.users(id),
  notes text,
  created_at timestamptz not null default now()
);

create table user_trust (
  user_id uuid primary key references auth.users(id) on delete cascade,
  approved_report_count integer not null default 0,
  is_trusted boolean not null default false,
  is_moderator boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================
-- INDEXES
-- ============================================

create index entities_normalized_value_idx on entities (type, normalized_value);
create index entities_report_count_idx on entities (report_count desc);
create index reports_entity_id_status_idx on reports (entity_id, status);
create index reports_status_created_idx on reports (status, created_at desc);
create index reports_created_by_idx on reports (created_by);

-- ============================================
-- VIEWS
-- ============================================

create or replace view entity_summary as
select
  e.id,
  e.type,
  e.normalized_value,
  e.display_value,
  e.report_count,
  e.last_reported_at,
  e.created_at,
  coalesce(
    array_agg(distinct r.category) filter (where r.status = 'approved'),
    '{}'::report_category[]
  ) as categories,
  coalesce(
    sum(array_length(r.evidence_urls, 1)) filter (where r.status = 'approved'),
    0
  ) as evidence_count,
  -- Confidence score: log scale based on approved report count, capped at 100
  least(100, round(
    case
      when e.report_count = 0 then 0
      when e.report_count = 1 then 30
      when e.report_count = 2 then 50
      when e.report_count <= 5 then 65
      when e.report_count <= 10 then 80
      else 90
    end
  )) as confidence_score
from entities e
left join reports r on r.entity_id = e.id
group by e.id;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update entity report_count and last_reported_at when a report is approved
create or replace function update_entity_on_report_status_change()
returns trigger as $$
begin
  if new.status = 'approved' and (old.status is null or old.status != 'approved') then
    update entities
    set
      report_count = report_count + 1,
      last_reported_at = new.created_at
    where id = new.entity_id;

    -- Check if reporter should become trusted
    update user_trust
    set
      approved_report_count = approved_report_count + 1,
      is_trusted = (approved_report_count + 1) >= 5
    where user_id = new.created_by;

  elsif old.status = 'approved' and new.status != 'approved' then
    update entities
    set report_count = greatest(0, report_count - 1)
    where id = new.entity_id;

    update user_trust
    set
      approved_report_count = greatest(0, approved_report_count - 1),
      is_trusted = (greatest(0, approved_report_count - 1)) >= 5
    where user_id = new.created_by;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger report_status_change
  after update of status on reports
  for each row
  execute function update_entity_on_report_status_change();

-- Create user_trust row on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_trust (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table entities enable row level security;
alter table reports enable row level security;
alter table moderation_actions enable row level security;
alter table user_trust enable row level security;

-- entities: anyone can read
create policy "entities_public_read" on entities
  for select using (true);

-- entities: service role can insert/update
create policy "entities_service_write" on entities
  for all using (auth.role() = 'service_role');

-- reports: only approved reports are public
create policy "reports_public_read_approved" on reports
  for select using (status = 'approved');

-- reports: authenticated users can insert
create policy "reports_auth_insert" on reports
  for insert with check (auth.uid() is not null and auth.uid() = created_by);

-- reports: users can read their own reports
create policy "reports_owner_read" on reports
  for select using (auth.uid() = created_by);

-- reports: service role full access
create policy "reports_service_all" on reports
  for all using (auth.role() = 'service_role');

-- moderation_actions: moderators only (enforced at API level via service role)
create policy "moderation_service_all" on moderation_actions
  for all using (auth.role() = 'service_role');

-- user_trust: users can read their own
create policy "trust_owner_read" on user_trust
  for select using (auth.uid() = user_id);

-- user_trust: service role full access
create policy "trust_service_all" on user_trust
  for all using (auth.role() = 'service_role');
