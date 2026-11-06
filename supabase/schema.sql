-- ==========================================================================
-- 榮譽積點管理系統 — Supabase schema（欄位皆加 school_ 前綴）
--  在 Supabase Dashboard: SQL Editor → New query → 貼上全部 → Run
-- ==========================================================================

create extension if not exists "pgcrypto";

-- ---- 1. 資料表（所有欄位加 school_ 前綴）----------------------------------
create table if not exists schools (
  school_id     uuid primary key default gen_random_uuid(),
  school_name   text not null
);

create table if not exists act_groups (
  school_group_id        uuid primary key default gen_random_uuid(),
  school_group_school_id uuid references schools(school_id) on delete cascade,
  school_group_name      text not null,
  school_group_color     text
);

create table if not exists students (
  school_student_id       uuid primary key default gen_random_uuid(),
  school_student_school_id uuid references schools(school_id) on delete cascade,
  school_student_stu_id   text not null,
  school_student_stu_name text not null,
  school_student_card_id  text
);
create unique index if not exists students_school_stu on students(school_student_school_id, school_student_stu_id);
create index if not exists students_card on students(school_student_card_id);

create table if not exists points (
  school_point_id         bigint generated always as identity primary key,
  school_point_student_id uuid not null references students(school_student_id) on delete cascade,
  school_point_group_id   uuid not null references act_groups(school_group_id) on delete cascade,
  school_point_point      int not null default 0,
  school_point_created_at timestamptz not null default now()
);
create index if not exists points_group on points(school_point_group_id);
create index if not exists points_student on points(school_point_student_id);

create table if not exists banners (
  school_banner_id       uuid primary key default gen_random_uuid(),
  school_banner_school_id uuid references schools(school_id) on delete cascade,
  school_banner_url      text not null,
  school_banner_status   boolean not null default true,
  school_banner_sort     int not null default 0
);

-- ---- 2. RPC：回傳格式與原後端 API 對齊 -------------------------------------
-- GET 等價：POST /rest/v1/rpc/get_activity_order  {"p_school_id": "..."}
create or replace function get_activity_order(p_school_id uuid)
returns json
language sql stable as $$
  select coalesce(json_agg(x), '[]'::json)
  from (
    select g.school_group_id as act_group_id,
           g.school_group_name as act_group,
           coalesce(
             (select json_agg(y)
              from (
                select s.school_student_stu_id as stu_id, s.school_student_stu_name as stu_name, sum(pt.school_point_point)::int as point
                from points pt
                join students s on s.school_student_id = pt.school_point_student_id
                where pt.school_point_group_id = g.school_group_id
                group by s.school_student_stu_id, s.school_student_stu_name
                order by 3 desc, s.school_student_stu_id
                limit 10
              ) y
             ), '[]'::json) as stu_orders
    from act_groups g
    where g.school_group_school_id = p_school_id
    order by g.school_group_name
  ) x;
$$;

-- GET 等價：POST /rest/v1/rpc/get_banners  {"p_school_id": "..."}
create or replace function get_banners(p_school_id uuid)
returns json
language sql stable as $$
  select coalesce(json_agg(x), '[]'::json)
  from (
    select b.school_banner_id as banner_id,
           b.school_banner_url as banner_url,
           b.school_banner_sort as banner_order,
           b.school_banner_status as banner_status
    from banners b
    where b.school_banner_school_id = p_school_id and b.school_banner_status = true
    order by b.school_banner_sort
  ) x;
$$;

-- GET 等價：POST /rest/v1/rpc/get_stu_points  {"p_card": "110047"}
create or replace function get_stu_points(p_card text)
returns json
language sql stable as $$
  with stu as (
    select s.school_student_id, s.school_student_school_id, s.school_student_stu_id, s.school_student_stu_name
    from students s
    where s.school_student_card_id = p_card or s.school_student_stu_id = p_card
    limit 1
  )
  select case when t.school_student_id is null then null else
    json_build_object(
      'student', json_build_object('stu_id', t.school_student_stu_id, 'stu_name', t.school_student_stu_name),
      'stu_points', coalesce((
        select json_build_object(
          'readBook', coalesce(sum(case when g.school_group_name = '英文' or g.school_group_name = '讀經' then pt.school_point_point end), 0),
          'read',     coalesce(sum(case when g.school_group_name = '閱讀' then pt.school_point_point end), 0),
          'run',      coalesce(sum(case when g.school_group_name like '跑步%' then pt.school_point_point end), 0),
          'honor',    coalesce(sum(case when g.school_group_name like '榮譽%' then pt.school_point_point end), 0)
        )
        from points pt
        join act_groups g on g.school_group_id = pt.school_point_group_id
        where pt.school_point_student_id = t.school_student_id
      ), json_build_object('readBook',0,'read',0,'run',0,'honor',0))
    )
  end from stu t;
$$;

-- ---- 3. RLS：匿名（anon）只讀 ----------------------------------------------
alter table schools   enable row level security;
alter table act_groups enable row level security;
alter table students  enable row level security;
alter table points    enable row level security;
alter table banners   enable row level security;

drop policy if exists "public read schools"    on schools;
drop policy if exists "public read act_groups" on act_groups;
drop policy if exists "public read students"   on students;
drop policy if exists "public read points"     on points;
drop policy if exists "public read banners"    on banners;

create policy "public read schools"    on schools    for select to anon, authenticated using (true);
create policy "public read act_groups" on act_groups for select to anon, authenticated using (true);
create policy "public read students"   on students   for select to anon, authenticated using (true);
create policy "public read points"     on points     for select to anon, authenticated using (true);
create policy "public read banners"    on banners    for select to anon, authenticated using (true);

-- RPC 對 anon 開放執行
grant execute on function get_activity_order(uuid) to anon, authenticated;
grant execute on function get_banners(uuid) to anon, authenticated;
grant execute on function get_stu_points(text) to anon, authenticated;
