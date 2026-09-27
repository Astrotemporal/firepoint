-- Community report backend for protected Vercel Preview.
-- Apply to the Preview Neon/Postgres database/branch before setting DATABASE_URL.
-- Production must use a separate database/branch and must remain unconfigured until launch review.

create extension if not exists pgcrypto;

create table if not exists community_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  topic text not null check (topic in ('fire', 'smoke', 'flooding', 'wind-damage', 'road-obstruction', 'utility', 'other')),
  report_text text not null check (char_length(report_text) between 1 and 1000),
  observed_at timestamptz,
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  precision_meters integer not null check (precision_meters > 0 and precision_meters <= 1500),
  submitted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consent_version text not null,
  consent_retention_days integer not null check (consent_retention_days > 0 and consent_retention_days <= 30),
  reporter_hash text not null,
  ip_hash text not null,
  user_agent_hash text,
  rate_key text not null,
  moderator_name text,
  moderation_reason text,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moderation_fields_match_status check (
    (status = 'pending' and moderator_name is null and moderation_reason is null and moderated_at is null)
    or (status in ('approved', 'rejected') and moderator_name is not null and moderation_reason is not null and moderated_at is not null)
  )
);

create index if not exists community_observations_pending_idx
  on community_observations (tenant_id, submitted_at) where status = 'pending';
create index if not exists community_observations_approved_idx
  on community_observations (tenant_id, moderated_at, topic) where status = 'approved';
create index if not exists community_observations_expiry_idx
  on community_observations (tenant_id, expires_at);

create table if not exists community_observation_moderation_audit (
  audit_id bigserial primary key,
  tenant_id text not null,
  observation_id uuid not null references community_observations(id) on delete cascade,
  operator_name text not null,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text not null,
  decided_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists community_observation_moderation_audit_observation_idx
  on community_observation_moderation_audit (tenant_id, observation_id, decided_at);

create table if not exists community_observation_rate_limits (
  tenant_id text not null,
  rate_key text not null,
  window_start timestamptz not null,
  count integer not null check (count > 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, rate_key, window_start)
);
create index if not exists community_observation_rate_limits_expiry_idx
  on community_observation_rate_limits (tenant_id, window_start);
