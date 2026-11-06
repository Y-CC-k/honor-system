-- ==========================================================================
-- 榮譽積點管理系統 — Supabase schema（欄位皆加表名前綴）
--  在 Supabase Dashboard: SQL Editor → New query → 貼上全部 → Run
-- ==========================================================================

create extension if not exists "pgcrypto";

-- ---- 1. 資料表（欄位加表名前綴）-------------------------------------------
create table if not exists schools (
  school_id   uuid primary key default gen_random_uuid(),
  school_name text not null
);

create table if not exists act_groups (
  group_id        uuid primary key default gen_random_uuid(),
  group_school_id uuid references schools(school_id) on delete cascade,
  group_name      text not null,
  group_color     text
);

create table if not exists students (
  student_id       uuid primary key default gen_random_uuid(),
  student_school_id uuid references schools(school_id) on delete cascade,
  student_stu_id   text not null,
  student_stu_name text not null,
  student_card_id  text
);
create unique index if not exists students_school_stu on students(student_school_id, student_stu_id);
create index if not exists students_card on students(student_card_id);

create table if not exists points (
  point_id         bigint generated always as identity primary key,
  point_student_id uuid not null references students(student_id) on delete cascade,
  point_group_id   uuid not null references act_groups(group_id) on delete cascade,
  point_point      int not null default 0,
  point_created_at timestamptz not null default now()
);
create index if not exists points_group on points(point_group_id);
create index if not exists points_student on points(point_student_id);

create table if not exists banners (
  banner_id       uuid primary key default gen_random_uuid(),
  banner_school_id uuid references schools(school_id) on delete cascade,
  banner_url      text not null,
  banner_status   boolean not null default true,
  banner_sort     int not null default 0
);

-- ---- 2. RPC：回傳格式與原後端 API 對齊 -------------------------------------
-- GET 等價：POST /rest/v1/rpc/get_activity_order  {"p_school_id": "..."}
create or replace function get_activity_order(p_school_id uuid)
returns json
language sql stable as $$
  select coalesce(json_agg(x), '[]'::json)
  from (
    select g.group_id as act_group_id,
           g.group_name as act_group,
           coalesce(
             (select json_agg(y)
              from (
                select s.student_stu_id as stu_id, s.student_stu_name as stu_name, sum(pt.point_point)::int as point
                from points pt
                join students s on s.student_id = pt.point_student_id
                where pt.point_group_id = g.group_id
                group by s.student_stu_id, s.student_stu_name
                order by 3 desc, s.student_stu_id
                limit 10
              ) y
             ), '[]'::json) as stu_orders
    from act_groups g
    where g.group_school_id = p_school_id
    order by g.group_name
  ) x;
$$;

-- GET 等價：POST /rest/v1/rpc/get_banners  {"p_school_id": "..."}
create or replace function get_banners(p_school_id uuid)
returns json
language sql stable as $$
  select coalesce(json_agg(x), '[]'::json)
  from (
    select b.banner_id as banner_id,
           b.banner_url as banner_url,
           b.banner_sort as banner_order,
           b.banner_status as banner_status
    from banners b
    where b.banner_school_id = p_school_id and b.banner_status = true
    order by b.banner_sort
  ) x;
$$;

-- GET 等價：POST /rest/v1/rpc/get_stu_points  {"p_card": "110047"}
create or replace function get_stu_points(p_card text)
returns json
language sql stable as $$
  with stu as (
    select s.student_id, s.student_school_id, s.student_stu_id, s.student_stu_name
    from students s
    where s.student_card_id = p_card or s.student_stu_id = p_card
    limit 1
  )
  select case when t.student_id is null then null else
    json_build_object(
      'student', json_build_object('stu_id', t.student_stu_id, 'stu_name', t.student_stu_name),
      'stu_points', coalesce((
        select json_build_object(
          'readBook', coalesce(sum(case when g.group_name = '英文' or g.group_name = '讀經' then pt.point_point end), 0),
          'read',     coalesce(sum(case when g.group_name = '閱讀' then pt.point_point end), 0),
          'run',      coalesce(sum(case when g.group_name like '跑步%' then pt.point_point end), 0),
          'honor',    coalesce(sum(case when g.group_name like '榮譽%' then pt.point_point end), 0)
        )
        from points pt
        join act_groups g on g.group_id = pt.point_group_id
        where pt.point_student_id = t.student_id
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
