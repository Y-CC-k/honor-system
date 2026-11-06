-- ==========================================================================
--榮譽積點管理系統 — Supabase schema（公開唯讀）
--  在 Supabase Dashboard: SQL Editor → New query → 貼上全部 → Run
-- ==========================================================================

create extension if not exists "pgcrypto";

-- ---- 1. 資料表 ------------------------------------------------------------
create table if not exists schools (
  id   uuid primary key default gen_random_uuid(),
  name text not null
);

create table if not exists act_groups (
  id        uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  name      text not null,                -- 英文 / 讀經 / 閱讀 / 跑步活動 / 榮譽積點 ...
  color     text                          -- blueA / blue / red / green / yellow
);

create table if not exists students (
  id        uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  stu_id    text not null,                -- 學號
  stu_name  text not null,                -- 顯示名稱（已遮罩：蔡O昱）
  card_id   text                          -- RFID 卡號（可留空；測試用學號替代）
);
create unique index if not exists students_school_stu on students(school_id, stu_id);
create index if not exists students_card on students(card_id);

create table if not exists points (
  id           bigint generated always as identity primary key,
  student_id   uuid not null references students(id) on delete cascade,
  act_group_id uuid not null references act_groups(id) on delete cascade,
  point        int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists points_group on points(act_group_id);
create index if not exists points_student on points(student_id);

create table if not exists banners (
  id        uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  url       text not null,
  status    boolean not null default true,
  sort      int not null default 0
);

-- ---- 2. RPC：回傳格式與原後端 API 對齊 -------------------------------------
-- GET 等價：POST /rest/v1/rpc/get_activity_order  {"p_school_id": "..."}
create or replace function get_activity_order(p_school_id uuid)
returns json
language sql stable as $$
  select coalesce(json_agg(x), '[]'::json)
  from (
    select g.id as act_group_id,
           g.name as act_group,
           coalesce(
             (select json_agg(y)
              from (
                select s.stu_id, s.stu_name, sum(pt.point)::int as point
                from points pt
                join students s on s.id = pt.student_id
                where pt.act_group_id = g.id
                group by s.stu_id, s.stu_name
                order by 3 desc, s.stu_id
                limit 10
              ) y
             ), '[]'::json) as stu_orders
    from act_groups g
    where g.school_id = p_school_id
    order by g.name
  ) x;
$$;

-- GET 等價：POST /rest/v1/rpc/get_banners  {"p_school_id": "..."}
create or replace function get_banners(p_school_id uuid)
returns json
language sql stable as $$
  select coalesce(json_agg(x), '[]'::json)
  from (
    select b.id as banner_id, b.url as banner_url, b.sort as banner_order, b.status as banner_status
    from banners b
    where b.school_id = p_school_id and b.status = true
    order by b.sort
  ) x;
$$;

-- GET 等價：POST /rest/v1/rpc/get_stu_points  {"p_card": "110047"}
-- p_card 可填 RFID 卡號或學號；回傳 student + 各組積點（對齊原站 ActGroupPoint）
create or replace function get_stu_points(p_card text)
returns json
language sql stable as $$
  with stu as (
    select s.id, s.school_id, s.stu_id, s.stu_name
    from students s
    where s.card_id = p_card or s.stu_id = p_card
    limit 1
  )
  select case when t.id is null then null else
    json_build_object(
      'student', json_build_object('stu_id', t.stu_id, 'stu_name', t.stu_name),
      'stu_points', coalesce((
        select json_build_object(
          'readBook', coalesce(sum(case when g.name = '英文' or g.name = '讀經' then pt.point end), 0),
          'read',     coalesce(sum(case when g.name = '閱讀' then pt.point end), 0),
          'run',      coalesce(sum(case when g.name like '跑步%' then pt.point end), 0),
          'honor',    coalesce(sum(case when g.name like '榮譽%' then pt.point end), 0)
        )
        from points pt
        join act_groups g on g.id = pt.act_group_id
        where pt.student_id = t.id
      ), json_build_object('readBook',0,'read',0,'run',0,'honor',0))
    )
  end
  from stu t;
$$;

-- ---- 3. RLS：匿名（anon）只讀 ---------------------------------------------
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
