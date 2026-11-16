/* AU 午前Ⅱ 過去問演習 */
(function () {
  'use strict';

  var EXAMS = window.EXAMS || [];
  var KANA = ['ア', 'イ', 'ウ', 'エ'];
  var KEY = 'au-am2-v1';
  var PASS_RATE = 0.6; // 午前Ⅱの基準点 60点
  var app = document.getElementById('app');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- storage (best effort) ---------- */
  var mem = { hist: {}, session: null, pick: null, order: 'seq' };
  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        mem.hist = d.hist || {};
        mem.session = d.session || null;
        mem.pick = d.pick || null;
        mem.order = d.order || 'seq';
      }
    } catch (e) { /* storage unavailable: keep in memory only */ }
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* ignore */ }
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function examById(id) {
    for (var i = 0; i < EXAMS.length; i++) if (EXAMS[i].id === id) return EXAMS[i];
    return null;
  }
  function qOf(exam, n) { return exam.q[n - 1]; }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }
  function focusMain() {
    window.scrollTo(0, 0);
    try { app.focus({ preventScroll: true }); } catch (e) { app.focus(); }
  }
  function penCircle() {
    return '<svg class="pen" viewBox="0 0 84 62" aria-hidden="true">' +
      '<path class="draw" d="M68 13 C52 1 15 4 9 27 C4 47 37 61 63 53 C82 47 84 24 64 12 L58 9"/></svg>';
  }
  function penCross() {
    return '<svg class="pen" viewBox="0 0 84 62" aria-hidden="true">' +
      '<path class="draw" d="M24 12 L60 50"/><path class="draw d2" d="M60 12 L24 50"/></svg>';
  }

  /* ---------- session ---------- */
  function startSession(examId, nums, order) {
    var list = order === 'random' ? shuffle(nums) : nums.slice().sort(function (a, b) { return a - b; });
    mem.session = {
      ex: examId,
      full: nums.length === 25,
      order: list,
      idx: 0,
      answers: {},
      done: false,
      started: Date.now()
    };
    mem.pick = examId;
    mem.order = order;
    save();
    go('#quiz');
  }

  function finishSession() {
    var s = mem.session;
    var exam = examById(s.ex);
    var wrong = [];
    var correct = 0;
    s.order.forEach(function (n) {
      if (s.answers[n] === qOf(exam, n).a) correct++; else wrong.push(n);
    });
    s.done = true;
    var h = mem.hist[s.ex] || {};
    if (s.full) {
      h.score = correct;
      h.total = 25;
      h.date = Date.now();
      h.wrong = wrong.slice().sort(function (a, b) { return a - b; });
    } else {
      // 解き直し: 正解できた問題を「間違えた問題」から外す
      var prev = h.wrong || [];
      h.wrong = prev.filter(function (n) { return s.order.indexOf(n) === -1 || wrong.indexOf(n) !== -1; });
    }
    mem.hist[s.ex] = h;
    save();
    go('#result');
  }

  /* ---------- top ---------- */
  function renderTop() {
    var pick = mem.pick && examById(mem.pick) ? mem.pick : EXAMS[0].id;
    var s = mem.session;
    var html = '';

    if (s && !s.done) {
      var se = examById(s.ex);
      if (se) {
        html += '<div class="resume"><p><b>' + esc(se.label) + '</b> の演習が途中です（' +
          (s.idx) + ' / ' + s.order.length + ' 問解答済み）</p>' +
          '<a class="btn" href="#quiz">続きから解く</a></div>';
      }
    }

    html += '<section class="intro"><h1>解く回を選んでください</h1>' +
      '<p class="lead">1問解くごとに正解と解説を表示します。平成31年度春期から令和7年度秋期までの7回分、各25問です。</p></section>';

    html += '<div class="sheet" role="radiogroup" aria-label="実施回">' +
      '<div class="sheet-head" aria-hidden="true"><span>選択</span><span>実施回</span><span>前回の結果</span></div>';
    EXAMS.forEach(function (e) {
      var h = mem.hist[e.id];
      var hist = '未実施';
      if (h && h.total) {
        hist = '<b>' + h.score + '</b> / 25';
        if (h.wrong && h.wrong.length) hist += '<br>要復習 ' + h.wrong.length + '問';
      } else if (h && h.wrong && h.wrong.length) {
        hist = '要復習 ' + h.wrong.length + '問';
      }
      var on = e.id === pick;
      html += '<button type="button" class="exam-row' + (on ? ' marked' : '') + '" role="radio" aria-checked="' + on +
        '" data-pick="' + e.id + '"><span class="bubble" aria-hidden="true">' + (on ? '' : '') + '</span>' +
        '<span><span class="label">' + esc(e.label) + '</span><span class="name">' + esc(e.name) + '</span></span>' +
        '<span class="hist">' + hist + '</span></button>';
    });
    html += '</div>';

    var ph = mem.hist[pick] || {};
    var wrongN = (ph.wrong || []).length;
    html += '<div class="options">' +
      '<fieldset class="opt-group"><legend>出題順</legend><div class="seg">' +
      radio('order', 'seq', '問題番号順', mem.order !== 'random') +
      radio('order', 'random', 'ランダム', mem.order === 'random') +
      '</div></fieldset>' +
      '<fieldset class="opt-group"><legend>出題範囲</legend><div class="seg">' +
      radio('scope', 'all', '全25問', true) +
      radio('scope', 'wrong', '前回間違えた問題だけ（' + wrongN + '問）', false, wrongN === 0) +
      '</div></fieldset></div>';

    html += '<div class="actions"><button type="button" class="btn btn-block" data-act="start">出題開始</button></div>';
    app.innerHTML = html;
  }
  function radio(name, value, text, checked, disabled) {
    return '<label><input type="radio" name="' + name + '" value="' + value + '"' +
      (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="dot"></span><span>' + esc(text) + '</span></label>';
  }

  /* ---------- quiz ---------- */
  function renderQuiz() {
    var s = mem.session;
    if (!s || s.done || !examById(s.ex)) { go('#top'); return; }
    var exam = examById(s.ex);
    var n = s.order[s.idx];
    var q = qOf(exam, n);

    var track = s.order.map(function (m, i) {
      var cls = '';
      if (i === s.idx) cls = 'now';
      else if (s.answers[m]) cls = s.answers[m] === qOf(exam, m).a ? 'ok' : 'ng';
      return '<i class="' + cls + '"></i>';
    }).join('');

    var html = '<div class="qbar"><div class="qbar-top">' +
      '<span class="where">' + esc(exam.label) + ' 午前Ⅱ' + (s.full ? '' : '・解き直し') + '</span>' +
      '<span class="count">' + (s.idx + 1) + ' <small>/ ' + s.order.length + '</small></span>' +
      '<button type="button" class="quit" data-act="quit">中断する</button></div>' +
      '<div class="track" aria-hidden="true">' + track + '</div></div>';

    html += questionBlock(exam, q, s.answers[n], false);
    app.innerHTML = html;
  }

  function questionBlock(exam, q, chosen, review) {
    var html = '<figure class="qfig"><button type="button" class="imgbtn" data-zoom="' + q.n + '" aria-label="問' + q.n + 'の問題文を拡大表示">' +
      '<img src="' + q.img + '" width="' + q.w + '" height="' + q.h + '" alt="' + esc(exam.label) + ' 午前Ⅱ 問' + q.n + 'の問題文と選択肢（問題冊子の画像）"></button></figure>' +
      '<div class="fig-tools"><button type="button" class="zoom-btn" data-zoom="' + q.n + '">問題文を拡大して読む</button></div>';
    html += '<div id="answer-area">' + answerArea(exam, q, chosen, review) + '</div>';
    return html;
  }

  function answerArea(exam, q, chosen, review) {
    var answered = !!chosen;
    var html = '<section class="answer-sheet" aria-label="解答欄"><h2>解答欄</h2><div class="choices">' +
      '<span class="row-label">問' + q.n + '</span>';
    KANA.forEach(function (k, i) {
      var isChosen = chosen === k;
      var isRight = q.a === k;
      var marks = '';
      if (answered && isRight) marks += penCircle();
      if (answered && isChosen && !isRight) marks += penCross();
      html += '<button type="button" class="choice' + (isChosen ? ' marked' : '') + '" data-ans="' + k + '"' +
        (answered ? ' disabled' : '') + ' aria-label="' + k + 'を選ぶ（キー ' + (i + 1) + '）"' +
        (answered ? ' aria-pressed="' + isChosen + '"' : '') + '>' +
        '<span class="bubble">' + k + '</span>' + marks + '</button>';
    });
    html += '</div></section>';

    if (answered) {
      var ok = chosen === q.a;
      html += '<div class="verdict" role="status">' +
        '<span class="mark" aria-hidden="true">' + (ok ? '〇' : '✕') + '</span>' +
        '<span class="word">' + (ok ? '正解' : '不正解') + '</span>' +
        '<span class="sub">正解は <b>' + q.a + '</b>' + (ok ? '' : '（あなたの解答：' + chosen + '）') + '</span></div>';
      html += '<div class="explain"><span class="tag">' + esc(q.tag) + '</span>' +
        '<p>' + esc(q.exp) + '</p>' +
        '<div class="refs"><h3>参考にした解説・資料</h3><ul>' +
        (q.src || []).map(function (s) {
          return '<li><a href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.t) + '</a></li>';
        }).join('') +
        '</ul><a class="search" href="' + q.search + '" target="_blank" rel="noopener">ほかの解説をWebで検索</a></div></div>';
      html += '<p class="source">出典：' + esc(exam.source) + ' 問' + q.n + '</p>';
      if (!review) {
        var s = mem.session;
        var last = s.idx >= s.order.length - 1;
        html += '<div class="next-wrap"><button type="button" class="btn btn-block" data-act="next" id="next-btn">' +
          (last ? '結果を見る' : '次の問題へ') + '</button></div>';
      }
    } else {
      html += '<p class="source">出典：' + esc(exam.source) + ' 問' + q.n + '</p>';
    }
    return html;
  }

  function answer(k) {
    var s = mem.session;
    if (!s || s.done) return;
    var exam = examById(s.ex);
    var n = s.order[s.idx];
    if (s.answers[n]) return;
    s.answers[n] = k;
    save();
    var area = document.getElementById('answer-area');
    area.innerHTML = answerArea(exam, qOf(exam, n), k, false);
    // update progress strip
    var cells = app.querySelectorAll('.track i');
    if (cells[s.idx]) cells[s.idx].className = (k === qOf(exam, n).a ? 'ok' : 'ng');
    var v = area.querySelector('.verdict');
    if (v && v.scrollIntoView) v.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    var nb = document.getElementById('next-btn');
    if (nb) try { nb.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function next() {
    var s = mem.session;
    if (!s) return;
    if (s.idx >= s.order.length - 1) { finishSession(); return; }
    s.idx++;
    save();
    renderQuiz();
    focusMain();
  }

  /* ---------- result ---------- */
  function renderResult() {
    var s = mem.session;
    if (!s || !s.done || !examById(s.ex)) { go('#top'); return; }
    var exam = examById(s.ex);
    var nums = s.order.slice().sort(function (a, b) { return a - b; });
    var correct = 0;
    var wrong = [];
    nums.forEach(function (n) { if (s.answers[n] === qOf(exam, n).a) correct++; else wrong.push(n); });
    var total = nums.length;

    var html = '<section class="intro"><h1>' + esc(exam.label) + ' 午前Ⅱの結果</h1>' +
      '<p class="lead">' + esc(exam.name) + (s.full ? '・全25問' : '・前回間違えた' + total + '問の解き直し') + '</p></section>';
    html += '<div class="score"><span class="big">' + correct + '<small> / ' + total + '問</small></span>';
    if (s.full) html += '<span class="pts">' + (correct * 4) + '点</span>';
    else html += '<span class="pts">正答率 ' + Math.round(correct / total * 100) + '%</span>';
    html += '</div>';
    if (s.full) {
      var need = Math.ceil(25 * PASS_RATE);
      html += correct >= need
        ? '<p class="pass ok">基準点（60点＝15問正解）に届いています。</p>'
        : '<p class="pass ng">基準点（60点＝15問正解）まで、あと' + (need - correct) + '問です。</p>';
    }

    html += '<div class="grid25" aria-label="問題ごとの結果。押すと問題と解説を見られます">';
    nums.forEach(function (n) {
      var q = qOf(exam, n);
      var c = s.answers[n];
      var ok = c === q.a;
      html += '<button type="button" class="cell" data-review="' + n + '" aria-label="問' + n + ' ' + (ok ? '正解' : '不正解') + '">' +
        '<span class="n">問' + n + '</span><span class="r">' + (ok ? '〇' : '✕') + '</span>' +
        '<span class="c">' + (ok ? q.a : (c || '－') + '→' + q.a) + '</span></button>';
    });
    // pad grid to complete rows
    for (var p = nums.length % 5; p > 0 && p < 5; p++) html += '<span class="cell" aria-hidden="true"></span>';
    html += '</div>';

    if (wrong.length) {
      html += '<div class="wrong-list"><h2>間違えた問題</h2><ul>' + wrong.map(function (n) {
        return '<li><a href="#review-' + n + '">問' + n + '</a></li>';
      }).join('') + '</ul></div>';
    }

    html += '<div class="actions">' +
      (wrong.length ? '<button type="button" class="btn" data-act="retry">間違えた' + wrong.length + '問を解き直す</button>' : '') +
      '<a class="btn secondary" href="#top">トップへ戻る</a></div>';
    app.innerHTML = html;
  }

  /* ---------- review ---------- */
  function renderReview(n) {
    var s = mem.session;
    if (!s || !s.done || !examById(s.ex)) { go('#top'); return; }
    var exam = examById(s.ex);
    var nums = s.order.slice().sort(function (a, b) { return a - b; });
    var pos = nums.indexOf(n);
    if (pos === -1) { go('#result'); return; }
    var q = qOf(exam, n);
    var html = '<div class="qbar"><div class="qbar-top">' +
      '<span class="where">' + esc(exam.label) + ' 午前Ⅱ・見直し</span>' +
      '<a class="quit" href="#result">結果に戻る</a></div></div>';
    html += questionBlock(exam, q, s.answers[n] || '－', true);
    html += '<div class="review-nav">' +
      (pos > 0 ? '<a class="btn secondary" href="#review-' + nums[pos - 1] + '">前の問題</a>' : '<span></span>') +
      (pos < nums.length - 1 ? '<a class="btn secondary" href="#review-' + nums[pos + 1] + '">次の問題</a>' : '<a class="btn secondary" href="#result">結果に戻る</a>') +
      '</div>';
    app.innerHTML = html;
  }

  /* ---------- zoom ---------- */
  var zoom = document.getElementById('zoom');
  var zoomImg = document.getElementById('zoom-img');
  var zoomTitle = document.getElementById('zoom-title');
  var lastFocus = null;
  function openZoom(n) {
    var ex = currentExam();
    if (!ex) return;
    var q = qOf(ex, n);
    lastFocus = document.activeElement;
    zoomImg.src = q.img;
    zoomImg.alt = ex.label + ' 午前Ⅱ 問' + n + 'の問題文（拡大）';
    zoomTitle.textContent = ex.label + ' 問' + n + '（横にスクロールできます）';
    zoom.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('zoom-close').focus();
  }
  function closeZoom() {
    zoom.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function currentExam() {
    return mem.session ? examById(mem.session.ex) : null;
  }

  /* ---------- events ---------- */
  app.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-pick],[data-act],[data-ans],[data-zoom],[data-review]');
    if (!t) return;
    if (t.hasAttribute('data-pick')) {
      mem.pick = t.getAttribute('data-pick');
      save();
      renderTop();
      var row = app.querySelector('[data-pick="' + mem.pick + '"]');
      if (row) row.focus();
      return;
    }
    if (t.hasAttribute('data-ans')) { answer(t.getAttribute('data-ans')); return; }
    if (t.hasAttribute('data-zoom')) { openZoom(parseInt(t.getAttribute('data-zoom'), 10)); return; }
    if (t.hasAttribute('data-review')) { go('#review-' + t.getAttribute('data-review')); return; }
    var act = t.getAttribute('data-act');
    if (act === 'start') {
      var orderEl = app.querySelector('input[name="order"]:checked');
      var scopeEl = app.querySelector('input[name="scope"]:checked');
      var order = orderEl ? orderEl.value : 'seq';
      var scope = scopeEl ? scopeEl.value : 'all';
      var pick = mem.pick && examById(mem.pick) ? mem.pick : EXAMS[0].id;
      var nums = [];
      if (scope === 'wrong') nums = ((mem.hist[pick] || {}).wrong || []).slice();
      if (!nums.length) for (var i = 1; i <= 25; i++) nums.push(i);
      startSession(pick, nums, order);
    } else if (act === 'next') {
      next();
    } else if (act === 'quit') {
      go('#top');
    } else if (act === 'retry') {
      var s = mem.session;
      var exam = examById(s.ex);
      var wrong = s.order.filter(function (n) { return s.answers[n] !== qOf(exam, n).a; });
      startSession(s.ex, wrong, mem.order);
    }
  });

  app.addEventListener('change', function (ev) {
    if (ev.target.name === 'order') { mem.order = ev.target.value; save(); }
  });

  // radio-group arrow keys on the exam rows
  app.addEventListener('keydown', function (ev) {
    var row = ev.target.closest && ev.target.closest('.exam-row');
    if (!row) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      var rows = Array.prototype.slice.call(app.querySelectorAll('.exam-row'));
      var i = rows.indexOf(row) + (ev.key === 'ArrowDown' ? 1 : -1);
      if (rows[i]) rows[i].click();
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (!zoom.hidden) { if (ev.key === 'Escape') closeZoom(); return; }
    if (location.hash !== '#quiz' || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    var k = { '1': 'ア', '2': 'イ', '3': 'ウ', '4': 'エ' }[ev.key];
    var s = mem.session;
    if (k && s && !s.done && !s.answers[s.order[s.idx]]) { ev.preventDefault(); answer(k); return; }
    if ((ev.key === 'ArrowRight' || ev.key === 'n') && s && s.answers[s.order[s.idx]]) { ev.preventDefault(); next(); }
  });

  document.getElementById('zoom-close').addEventListener('click', closeZoom);

  /* ---------- router ---------- */
  function route() {
    if (!zoom.hidden) closeZoom();
    var h = location.hash || '#top';
    var m = h.match(/^#review-(\d+)$/);
    if (h === '#quiz') renderQuiz();
    else if (h === '#result') renderResult();
    else if (m) renderReview(parseInt(m[1], 10));
    else renderTop();
    focusMain();
  }
  window.addEventListener('hashchange', route);

  load();
  if (!EXAMS.length) {
    app.innerHTML = '<p class="empty">問題データを読み込めませんでした。ページを再読み込みしてください。</p>';
  } else {
    route();
  }
})();
