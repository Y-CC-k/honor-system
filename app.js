// ==========================================================================
// 榮譽積點排行榜 — Supabase 版（vanilla JS，無 build step）
// 資料來源：Supabase RPC（schema.sql + seed.sql 建立的三個函式）
//   get_activity_order(p_school_id) → 各活動組 Top10
//   get_banners(p_school_id)        → 跑馬燈
//   get_stu_points(p_card)          → 靠卡查個人積點
// 未設 config.js 或 Supabase 不可達時自動 fallback 到 data.json。
// ==========================================================================
(function () {
  "use strict";

  var CFG = window.HONOR_CONFIG || {};

  // ---- 從 hash 拿 school_id：#/search?school_id=xxxx ------------------------
  var schoolId = "";
  var hq = (location.hash || "").split("?")[1] || "";
  hq.split("&").forEach(function (kv) {
    var p = kv.split("=");
    if (p[0] === "school_id") schoolId = decodeURIComponent(p[1] || "");
  });
  if (!schoolId) schoolId = CFG.DEFAULT_SCHOOL_ID || "";

  var SB = {
    url: (CFG.SUPABASE_URL || "").replace(/\/$/, ""),
    key: CFG.SUPABASE_KEY || ""
  };

  function sbReady() { return SB.url && SB.key; }

  function sbRPC(fn, body) {
    return fetch(SB.url + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: {
        "apikey": SB.key,
        "Authorization": "Bearer " + SB.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        throw new Error("supabase " + r.status + " " + t.slice(0, 200));
      });
      return r.json();
    });
  }

  // （相容 REST 表格查詢備用）
  function getImage(url) { return String(url || "").replace(/\\/g, "/"); }

  function loadSample() {
    return fetch("data.json").then(function (r) { return r.json(); });
  }

  // ---- 欄位定義（照原版 renderOrderView）-----------------------------------
  var COLS = [
    { name: "英文", color: "blueA" },
    { name: "讀經", color: "blue" },
    { name: "閱讀", color: "red" },
    { name: "跑步", color: "green" },
    { name: "榮譽", color: "yellow" }
  ];
  function orderList(order) {
    if (Array.isArray(order)) return order;
    return Object.keys(order).map(function (k) {
      var v = order[k];
      return typeof v === "object" && v !== null ? v : { act_group: k, stu_orders: [] };
    });
  }
  function groupData(order, name) {
    var l = orderList(order);
    for (var i = 0; i < l.length; i++) {
      var g = l[i];
      var key = g.act_group || g.name || "";
      if (key.indexOf(name) === 0) return g;
    }
    return null;
  }

  // ---- 渲染排行榜 ----------------------------------------------------------
  var gOrder = null;

  function renderOrder(order) {
    var root = document.getElementById("scoring");
    root.innerHTML = "";
    gOrder = order;
    var hasEng = groupData(order, "英文") !== null;
    var cols = COLS.filter(function (c) {
      return hasEng ? c.name !== "讀經" : c.name !== "英文";
    });
    cols.forEach(function (col) {
      var g = groupData(order, col.name);
      var rows = g && g.stu_orders ? g.stu_orders : [];
      var panel = document.createElement("div");
      panel.className = "panel " + col.color;
      var head = document.createElement("div");
      head.className = "head";
      rows.forEach(function (s, i) {
        var rank = i + 1;
        var row = document.createElement("div");
        row.className = "ranking";
        row.style.backgroundImage = "url(assets/bk-" + (rank < 10 ? "0" : "") + rank + ".svg)";
        row.innerHTML =
          '<div class="sp"></div>' +
          '<div class="who">' +
            '<p class="ranking_name">' + esc(s.stu_name) + "</p>" +
            '<p class="ranking_id_num">' + esc(s.stu_id) + "</p>" +
          "</div>" +
          '<div class="num">' + esc(s.point) + "</div>";
        head.appendChild(row);
      });
      var foot = document.createElement("div");
      foot.className = "foot";
      panel.appendChild(head);
      panel.appendChild(foot);
      root.appendChild(panel);
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- 靠卡查詢 -------------------------------------------------------------
  var childPool = ["boy_01", "boy_02", "boy_03", "boy_04", "gril_01", "gril_02", "gril_03", "gril_04"];

  function setScore(id, v) {
    document.getElementById(id).textContent = (typeof v === "number") ? v : "0";
  }

  function showStudent(d) {
    var sp = d && d.student ? d.student : {};
    var rec = d && d.stu_points ? d.stu_points : {};
    document.getElementById("stuName").textContent = sp.stu_name || "　";
    document.getElementById("stuId").textContent = sp.stu_id || "---";
    setScore("scoreA", rec.readBook);
    setScore("scoreB", rec.read);
    setScore("scoreC", rec.run);
    setScore("scoreD", rec.honor);
  }

  function handleCard(cardId) {
    if (!cardId) return;
    if (!sbReady()) { // 樣本模式：直接從 data 名單找
      getSampleStudent(cardId);
      return;
    }
    sbRPC("get_stu_points", { p_card: cardId })
      .then(function (d) { if (d) showStudent(d); })
      .catch(function () {});
  }

  function getSampleStudent(cardId) {
    loadSample().then(function (s) {
      // 從種子資料累加各組積點
      var r = { readBook: 0, read: 0, run: 0, honor: 0 }, stu = null;
      (s.order || []).forEach(function (g) {
        (g.stu_orders || []).forEach(function (row) {
          if (row.stu_id === cardId) {
            stu = { stu_id: row.stu_id, stu_name: row.stu_name };
            var k = g.act_group.indexOf("英文") === 0 || g.act_group.indexOf("讀經") === 0 ? "readBook"
                  : g.act_group.indexOf("閱讀") === 0 ? "read"
                  : g.act_group.indexOf("跑步") === 0 ? "run"
                  : "honor";
            r[k] += row.point;
          }
        });
      });
      if (stu) showStudent({ student: stu, stu_points: r });
    }).catch(function () {});
  }

  function randomAvatar() {
    var n = childPool[Math.floor(Math.random() * childPool.length)];
    document.getElementById("userImg").src = "assets/" + n + ".svg";
  }

  // ---- 跑馬燈 ---------------------------------------------------------------
  var banners = [], bannerIdx = 0;

  function renderBanners(list) {
    banners = list.map(function (b) { return getImage(b.banner_url || b.url); });
    var wrap = document.getElementById("bannerWrap");
    if (!banners.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    nextBanner();
  }
  function nextBanner() {
    if (!banners.length) return;
    document.getElementById("bannerImg").src = banners[bannerIdx % banners.length];
    bannerIdx++;
  }
  setInterval(nextBanner, 5000);

  // ---- 狀態標記 -------------------------------------------------------------
  var sourceTag = null;
  function tagSource(mode) {
    if (!sourceTag) {
      sourceTag = document.createElement("div");
      sourceTag.className = "source-tag";
      document.body.appendChild(sourceTag);
    }
    sourceTag.textContent =
      mode === "live" ? "資料來源: Supabase (live)" :
      mode === "sample" ? "資料來源: 內建樣本 data.json" :
      "尚未設定 Supabase（config.js），顯示內建樣本";
  }

  // ---- 初始資料 + 每 30 分鐘刷新 --------------------------------------------
  function getInitialData() {
    randomAvatar();
    if (!sbReady()) {
      tagSource("none");
      loadSample().then(function (s) {
        gOrder = s.order || [];
        renderOrder(gOrder);
        renderBanners(s.banners || []);
      }).catch(function () {});
      return;
    }
    sbRPC("get_activity_order", { p_school_id: schoolId })
      .then(function (order) {
        renderOrder(order || []); tagSource("live");
        return sbRPC("get_banners", { p_school_id: schoolId });
      })
      .then(function (bs) { renderBanners(bs || []); })
      .catch(function (e) {
        return loadSample().then(function (s) {
          renderOrder(s.order || []);
          renderBanners(s.banners || []);
          tagSource("sample");
        });
      });
  }

  // ---- 表單事件 -------------------------------------------------------------
  document.getElementById("cardForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = document.getElementById("keyInput");
    handleCard(input.value.trim());
    input.value = "";
    input.focus();
  });
  document.addEventListener("click", function () {
    var input = document.getElementById("keyInput");
    if (document.activeElement !== input) input.focus();
  });

  getInitialData();
  setInterval(getInitialData, 18e5);
})();
