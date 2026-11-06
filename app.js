// ==========================================================================
// 榮譽積點管理系統 — 美化版（vanilla JS + Supabase）
// 功能與原版一致：排行榜 / 靠卡查詢 / 跑馬燈 / 每 30 分鐘刷新
// ==========================================================================
(function () {
  "use strict";

  var CFG = window.HONOR_CONFIG || {};

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

  function loadSample() { return fetch("data.json").then(function (r) { return r.json(); }); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- 欄位 ------------------------------------------------------------
  // 每個欄位對應原站的排行榜面板顏色與 SVG 背景圖：
  //   英文/讀經 → blueA / scoring-blue_eng.svg
  //   閱讀      → red   / scoring-red.svg
  //   跑步      → green / scoring-green.svg
  //   榮譽      → yellow/ scoring-yellow.svg
  var COLS = [
    { name: "英文",  color: "blueA", scoreId: "scoreA", label: "英文 / 讀經", key: "readBook" },
    { name: "讀經",  color: "blue",  scoreId: null,              label: "英文 / 讀經", key: "readBook" },
    { name: "閱讀",  color: "red",   scoreId: "scoreB", label: "閱讀",            key: "read" },
    { name: "跑步",  color: "green", scoreId: "scoreC", label: "跑步",            key: "run" },
    { name: "榮譽",  color: "yellow",scoreId: "scoreD", label: "榮譽",            key: "honor" }
  ];
  function orderList(order) {
    if (Array.isArray(order)) return order;
    return Object.keys(order).map(function (k) {
      var v = order[k];
      return typeof v === "object" && v !== null ? v : { act_group: k, stu_orders: [] };
    });
  }
  // 依活動組名稱前綴比對（支援「跑步活動」匹配「跑步」、「榮譽積點」匹配「榮譽」）
  function groupData(order, name) {
    var l = orderList(order);
    for (var i = 0; i < l.length; i++) {
      var g = l[i];
      var key = g.act_group || g.name || "";
      if (key.indexOf(name) === 0) return g;
    }
    return null;
  }

  // ---- DOM -------------------------------------------------------------
  var els = {
    name: document.getElementById("stuName"),
    id:   document.getElementById("stuId"),
    A:    document.getElementById("scoreA"),
    B:    document.getElementById("scoreB"),
    C:    document.getElementById("scoreC"),
    D:    document.getElementById("scoreD"),
    list: document.getElementById("scoring"),
    input: document.getElementById("keyInput"),
    status: document.getElementById("shellStatus"),
    toast: document.getElementById("toast"),
    avatar: document.getElementById("userImg")
  };

  var childPool = ["boy_01","boy_02","boy_03","boy_04","gril_01","gril_02","gril_03","gril_04"];

  function randomAvatar() {
    els.avatar.src = "assets/" + childPool[Math.floor(Math.random() * childPool.length)] + ".svg";
  }

  // ---- 數字計數動畫 -----------------------------------------------------
  function countTo(el, target) {
    var start = parseInt(el.textContent, 10) || 0;
    target = parseInt(target, 10) || 0;
    if (start === target) return;
    var diff = target - start;
    var duration = 900;
    var startTime = performance.now();
    function step(now) {
      var t = Math.min(1, (now - startTime) / duration);
      // ease out
      var ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.floor(start + diff * ease);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  // ---- 顯示學生 --------------------------------------------------------
  function showStudent(d) {
    var sp = d && d.student ? d.student : {};
    var rec = d && d.stu_points ? d.stu_points : {};
    els.name.textContent = sp.stu_name || "　";
    els.id.textContent = sp.stu_id || "---";
    countTo(els.queryScore("A"), rec.readBook);
    countTo(els.queryScore("B"), rec.read);
    countTo(els.queryScore("C"), rec.run);
    countTo(els.queryScore("D"), rec.honor);
  }
  els.queryScore = function (k) { return document.getElementById(k === "A" ? "scoreA" : k === "B" ? "scoreB" : k === "C" ? "scoreC" : "scoreD"); };

  // ---- 渲染排行榜（原版結構）----------------------------------------------
  function renderOrder(order) {
    var root = els.list;
    root.innerHTML = "";
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
      panel.appendChild(head);

      var wrap = document.createElement("div");
      wrap.className = "rank-list-wrap";
      var list = document.createElement("div");
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
        list.appendChild(row);
      });
      wrap.appendChild(list);
      panel.appendChild(wrap);

      var foot = document.createElement("div");
      foot.className = "foot";
      panel.appendChild(foot);
      root.appendChild(panel);
    });
  }

  // ---- 跑馬燈 ----------------------------------------------------------
  var banners = [], bannerIdx = 0;
  function renderBanners(list) {
    banners = list.map(function (b) { return String(b.banner_url || b.url || "").replace(/\\/g, "/"); });
    var track = document.getElementById("bannerTrack");
    track.innerHTML = "";
    if (!banners.length) return;
    // 複製兩輪做無縫循環
    var slides = banners.concat(banners).concat(banners);
    slides.forEach(function (u) {
      var slide = document.createElement("div");
      slide.className = "banner-slide";
      var img = document.createElement("img");
      img.src = u; img.alt = "banner";
      slide.appendChild(img);
      track.appendChild(slide);
    });
  }

  // ---- 提示 ------------------------------------------------------------
  var sourceTag = null;
  function tagSource(mode) {
    var t = els.toast;
    var msg = mode === "live" ? "資料來源：Supabase (即時)"
      : mode === "sample" ? "資料來源：內建樣本 data.json"
      : "尚未設定 Supabase，顯示內建樣本";
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2500);
  }

  // ---- 靠卡查詢 --------------------------------------------------------
  function handleCard(cardId) {
    if (!cardId) return;
    if (!sbReady()) { getSampleStudent(cardId); return; }
    sbRPC("get_stu_points", { p_card: cardId })
      .then(function (d) { if (d) showStudent(d); })
      .catch(function () {});
  }
  function getSampleStudent(cardId) {
    loadSample().then(function (s) {
      var r = { readBook: 0, read: 0, run: 0, honor: 0 }, stu = null;
      (s.order || []).forEach(function (g) {
        (g.stu_orders || []).forEach(function (row) {
          if (row.stu_id === cardId) {
            stu = { stu_id: row.stu_id, stu_name: row.stu_name };
            var k = (g.act_group.indexOf("英文") === 0 || g.act_group.indexOf("讀經") === 0) ? "readBook"
                  : g.act_group.indexOf("閱讀") === 0 ? "read"
                  : g.act_group.indexOf("跑步") === 0 ? "run" : "honor";
            r[k] += row.point;
          }
        });
      });
      if (stu) showStudent({ student: stu, stu_points: r });
    }).catch(function () {});
  }

  // ---- 初始資料 --------------------------------------------------------
  var gOrder = null;
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
        gOrder = order || [];
        renderOrder(gOrder);
        tagSource("live");
        return sbRPC("get_banners", { p_school_id: schoolId });
      })
      .then(function (bs) { renderBanners(bs || []); })
      .catch(function () {
        return loadSample().then(function (s) {
          gOrder = s.order || [];
          renderOrder(gOrder);
          renderBanners(s.banners || []);
          tagSource("sample");
        });
      });
  }

  // ---- 事件 ------------------------------------------------------------
  document.getElementById("cardForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = els.input;
    handleCard(input.value.trim());
    input.value = "";
    input.focus();
  });
  document.addEventListener("click", function () {
    if (document.activeElement !== els.input) els.input.focus();
  });
  // 載入完成後自動聚焦（RFID 讀卡機即可輸入）
  els.input.focus();

  getInitialData();
  setInterval(getInitialData, 18e5);
})();
