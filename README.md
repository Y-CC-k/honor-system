# 榮譽積點管理系統（重建版）

原站 `https://honor.iiv.tw/#/search?school_id=...`（React + CRA + 後端 `honor.backend.iiv.tw`）
的**公眾排行榜頁面重建**：純靜態前端（無 build step） + 資料改存 **Supabase**。

## 佈署地圖

```
GitHub Pages（本 repo）          Supabase（資料庫）
┌───────────────────┐    RPC    ┌──────────────────────────┐
│ index.html        │──────────→│ get_activity_order(sch)  │
│ style.css         │           │ get_banners(sch)         │
│ app.js + config.js│           │ get_stu_points(card)     │
│ assets/ (SVG素材) │           │ tables: schools / act_groups / students / points / banners
└───────────────────┘           └──────────────────────────┘
```

## 1. Supabase（資料庫）

1. Supabase Dashboard → **SQL Editor** → New query
2. 貼上 `supabase/schema.sql` 全部執行（建表 + RLS 公開讀 + 3 支 RPC）
3. 再貼上 `supabase/seed.sql` 執行（示範資料）
4. 左側 **Settings → API** 取得：
   - Project URL
   - `anon` public key（**不要**用 service_role key 放在前端！）

## 2. 設定前端

編輯 `config.js`，填入：

```js
window.HONOR_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_KEY: "eyJhbGciOi...",   // anon key
  DEFAULT_SCHOOL_ID: "283b80a6-a69e-4848-a5df-e3162d21f7f2"
};
```

> 沒填也能跑 — 自動 fallback 到 `data.json` 的內建樣本（標記會顯示在右下角）。

## 3. GitHub Pages（網頁）

```bash
git init
git add -A
git commit -m "honor point leaderboard: static site + Supabase"
git remote add origin https://github.com/<你的帳號>/honor-system.git
git push -u origin main
```

之後在 GitHub 網頁：**Settings → Pages → Source: Deploy from a branch → main / /(root)**，
1 分鐘後就能開 `https://<你的帳號>.github.io/honor-system/`。

> 匿名讀取無安全疑慮（後端只開 SELECT 給 anon；寫入管理功能若要加，需另建認證層）。

## 功能（與原站對照）

| 功能 | 原站 API | 本版 |
|---|---|---|
| 各組 Top 10 排行 | `GET /api/Activity/Order?school_id=` | `RPC get_activity_order` |
| 靠卡查個人積點 | `GET /api/Stu_Activity/ActGroupPoint?card_id=` | `RPC get_stu_points`（接受卡號或學號） |
| 跑馬燈 | `GET /api/Banner/GetAll?school_id=` | `RPC get_banners` |
| 隱藏輸入框自動聚焦（RFID 讀卡機） | ✅ | ✅ 保留 |
| 30 分鐘自動刷新 | ✅ (18e5 ms) | ✅ |

### 測試方法

1. 開站後 focus 自動在隱藏輸入框，直接打 `110047`（Sean? 否）→ Enter
   → 顯示「蔡O昱」與四項積點（示範學校 283b80a6…）
2. 沒接 Supabase 時，也以內建 data.json 顯示排行。

## 資料維護

- 新增學生 / 積點：Supabase **Table Editor** 直接加 rows（`points` 一列 = 一次積點記錄）
- 換跑馬燈圖：`banners.url` 直接填新圖網址（或上傳到 Supabase Storage 用 public URL）
- 新學校：`schools` 加一筆，URL 帶 `?school_id=<新id>` 即可

## 原始逆向筆記

完整分析（權限架構、全部 50+ API、路由表）見專案外 `honor-analysis/main.js` 與分析文件：
原站為 CRA 5 + React 17（w/ props 無 hooks 大量 class 元件）+ Redux-saga + antd 4 + react-router(hash)。
axios baseURL `https://honor.backend.iiv.tw`，timeout 120s，Authorization 由登入流程注入。
本頁 `/search` 為免登入的公眾大螢幕頁（靠卡簽到/查點）。
