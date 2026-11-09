create table if not exists public.generation_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  generations integer not null default 0 check (generations >= 0),
  primary key (user_id, usage_date)
);

alter table public.generation_usage enable row level security;

revoke all on table public.generation_usage from anon, authenticated;

create or replace function public.consume_generation_quota(
  p_daily_limit integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_generations integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_daily_limit < 1 then
    raise exception 'invalid_daily_limit' using errcode = '22023';
  end if;

  insert into public.generation_usage (user_id, usage_date, generations)
  values (v_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_date) do update
  set generations = public.generation_usage.generations + 1
  where public.generation_usage.generations < p_daily_limit
  returning generations into v_generations;

  if v_generations is null then
    raise exception 'daily_generation_limit_reached' using errcode = 'P0001';
  end if;

  return v_generations;
end;
$$;

revoke all on function public.consume_generation_quota(integer) from public, anon;
grant execute on function public.consume_generation_quota(integer) to authenticated;

notify pgrst, 'reload schema';
