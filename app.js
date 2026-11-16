/* AU 午前Ⅱ 過去問演習 */
(function () {
  'use strict';

  var EXAMS = window.EXAMS || [];
  var KANA = ['ア', 'イ', 'ウ', 'エ'];
  var KEY = 'au-am2-v1';        // 進行中の演習・前回結果
  var LOG_KEY = 'au-am2-log';   // 受験ごとの記録（各問の正誤つき）
  var SYNC_KEY = 'au-am2-sync'; // スプレッドシートの送信先（この端末だけに保存）
  var APP_VER = '2.0';
  var PASS_RATE = 0.6; // 午前Ⅱの基準点 60点
  var PASS_N = Math.ceil(25 * PASS_RATE);
  var CODE_URL = 'gas/Code.gs';
  var CODE_VIEW = 'https://github.com/sakataku21/au-am2-kakomon/blob/main/gas/Code.gs';
  var app = document.getElementById('app');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // スプレッドシートの列（Apps Script 側と同じ名前で送る）
  var HEAD_ATTEMPTS = ['受験ID', '開始日時', '終了日時', '受験日', '回', '回ID', '実施年度', 'モード', '出題順',
    '出題数', '正解数', '正答率', '得点', '基準点', '解答秒数', '端末', '記録元', 'アプリ版'];
  var HEAD_ANSWERS = ['受験ID', '解答日時', '受験日', '回', '回ID', '実施年度', 'モード', '問番号', '問題',
    '分野', '論点', '選んだ解答', '正解', '正誤', '解答秒数'];

  /* ---------- storage (best effort) ---------- */
  var mem = { hist: {}, session: null, pick: null, order: 'seq' };
  var log = { attempts: [], migrated: false };
  var sync = { url: '', token: '', lastOk: 0, lastErr: '' };

  function readJSON(key) {
    try { var raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeJSON(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function load() {
    var d = readJSON(KEY);
    if (d) {
      mem.hist = d.hist || {};
      mem.session = d.session || null;
      mem.pick = d.pick || null;
      mem.order = d.order || 'seq';
    }
    var l = readJSON(LOG_KEY);
    if (l && l.attempts) { log.attempts = l.attempts; log.migrated = !!l.migrated; }
    var s = readJSON(SYNC_KEY);
    if (s) { sync.url = s.url || ''; sync.token = s.token || ''; sync.lastOk = s.lastOk || 0; sync.lastErr = s.lastErr || ''; }
    migrate();
  }
  function save() { writeJSON(KEY, mem); }
  function saveLog() { writeJSON(LOG_KEY, log); }
  function saveSync() { writeJSON(SYNC_KEY, sync); }

  // 旧版で残した「前回の点数」を、点数だけの記録として引き継ぐ
  function migrate() {
    if (log.migrated) return;
    Object.keys(mem.hist).forEach(function (ex) {
      var h = mem.hist[ex];
      if (!h || h.total !== 25 || !h.date || !examById(ex)) return;
      log.attempts.push({
        id: 'mig-' + ex + '-' + h.date, ex: ex, mode: 'full', order: '',
        started: h.date, finished: h.date, total: 25, correct: h.score, qs: [],
        src: 'migrated', dev: deviceType(), synced: false
      });
    });
    log.migrated = true;
    saveLog();
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
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pct(c, t) { return t ? Math.round(c / t * 100) : 0; }
  function md(ts) { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function dayLocal(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fmtLocal(ts) {
    var d = new Date(ts);
    return dayLocal(ts) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  function iso(ts) { return new Date(ts).toISOString(); }
  function deviceType() {
    var ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'タブレット';
    if (/Mobi|iPhone|Android/i.test(ua)) return 'スマホ';
    return 'PC';
  }
  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
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

  /* ---------- attempt log ---------- */
  function attemptById(id) {
    for (var i = 0; i < log.attempts.length; i++) if (log.attempts[i].id === id) return log.attempts[i];
    return null;
  }
  function fullAttempts(ex) {
    return log.attempts.filter(function (a) { return a.ex === ex && a.mode === 'full'; })
      .sort(function (a, b) { return a.finished - b.finished; });
  }
  function unsynced() { return log.attempts.filter(function (a) { return !a.synced; }); }

  // 1回分の記録を、スプレッドシートの列名をキーにした行へ変換する
  function rowsOf(a, forCsv) {
    var exam = examById(a.ex);
    if (!exam) return null;
    var dt = forCsv ? fmtLocal : iso;
    var full = a.mode === 'full';
    var day = dayLocal(a.finished);
    var secs = a.qs.map(function (x) { return x[3]; }).filter(function (v) { return typeof v === 'number'; });
    var common = { '回': exam.label, '回ID': exam.id, '実施年度': exam.year, 'モード': full ? '本番' : '解き直し' };
    var row = {
      '受験ID': a.id, '開始日時': dt(a.started), '終了日時': dt(a.finished), '受験日': day,
      '回': common['回'], '回ID': common['回ID'], '実施年度': common['実施年度'], 'モード': common['モード'],
      '出題順': a.order === 'random' ? 'ランダム' : (a.order === 'seq' ? '番号順' : ''),
      '出題数': a.total, '正解数': a.correct,
      '正答率': a.total ? Math.round(a.correct / a.total * 10000) / 10000 : '',
      '得点': full ? a.correct * 4 : '',
      '基準点': full ? (a.correct >= PASS_N ? '到達' : '未達') : '',
      '解答秒数': secs.length ? secs.reduce(function (s, v) { return s + v; }, 0) : '',
      '端末': a.dev || '', '記録元': a.src === 'migrated' ? '移行（点数のみ）' : 'アプリ', 'アプリ版': APP_VER
    };
    var answers = a.qs.map(function (x) {
      var q = qOf(exam, x[0]);
      return {
        '受験ID': a.id, '解答日時': dt(x[4] || a.finished), '受験日': day,
        '回': common['回'], '回ID': common['回ID'], '実施年度': common['実施年度'], 'モード': common['モード'],
        '問番号': x[0], '問題': exam.label + ' 問' + pad2(x[0]), '分野': q.cat || '', '論点': q.tag,
        '選んだ解答': x[1], '正解': q.a, '正誤': x[2], '解答秒数': typeof x[3] === 'number' ? x[3] : ''
      };
    });
    return { row: row, answers: answers };
  }

  /* ---------- spreadsheet sync ---------- */
  var syncBusy = false;
  var syncNote = { state: 'idle', msg: '' }; // idle | sending | ok | error

  function configured() { return !!(sync.url && sync.token); }

  function describeError(err) {
    var code = err && err.code;
    if (code === 'bad_token') return 'トークンが一致しません。Apps Scriptの実行ログに出たトークンを確認してください';
    if (code === 'not_setup') return 'Apps Scriptで setup がまだ実行されていません';
    if (code === 'parse') return '応答を読み取れません。デプロイの「アクセスできるユーザー」が「全員」になっているか確認してください';
    if (code === 'timeout') return '応答がありません。時間をおいて再送してください';
    if (code === 'server') return 'Apps Scriptでエラーが起きました（' + (err.message || '') + '）';
    if (code === 'bad_request') return '送信内容を受け付けられませんでした。Apps Scriptのコードが最新か確認してください';
    return 'URLに接続できません。URLが「/exec」で終わっているか、ネットに接続できているか確認してください';
  }

  function post(body) {
    var payload = {};
    for (var k in body) payload[k] = body[k];
    payload.token = sync.token;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;
    // Content-Type を付けない（text/plain）ことで、CORSの事前確認なしに送れる
    return fetch(sync.url, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        if (timer) clearTimeout(timer);
        var res;
        try { res = JSON.parse(t); } catch (e) { var pe = new Error('parse'); pe.code = 'parse'; throw pe; }
        if (!res.ok) { var se = new Error(res.message || res.error); se.code = res.error || 'server'; throw se; }
        return res;
      }, function (e) {
        if (timer) clearTimeout(timer);
        var ne = new Error(e && e.message); ne.code = (e && e.name === 'AbortError') ? 'timeout' : 'network';
        throw ne;
      });
  }

  function syncPending() {
    if (!configured()) { syncNote = { state: 'idle', msg: '' }; paintSync(); return Promise.resolve(false); }
    if (syncBusy) return Promise.resolve(false);
    var list = unsynced().slice(0, 20);
    if (!list.length) { paintSync(); return Promise.resolve(true); }
    syncBusy = true;
    syncNote = { state: 'sending', msg: '' };
    paintSync();
    var items = list.map(function (a) { return rowsOf(a, false); }).filter(Boolean);
    return post({ action: 'append', attempts: items }).then(function (res) {
      var ids = res.ids || [];
      log.attempts.forEach(function (a) { if (ids.indexOf(a.id) !== -1) a.synced = true; });
      // 問題データにない回の記録は送れないので、送信済み扱いにしておく
      list.forEach(function (a) { if (!examById(a.ex)) a.synced = true; });
      saveLog();
      sync.lastOk = Date.now(); sync.lastErr = ''; saveSync();
      syncBusy = false;
      syncNote = { state: 'ok', msg: '' };
      if (unsynced().length && list.length === 20) return syncPending();
      paintSync();
      return true;
    }).catch(function (err) {
      syncBusy = false;
      sync.lastErr = describeError(err); saveSync();
      syncNote = { state: 'error', msg: sync.lastErr };
      paintSync();
      return false;
    });
  }

  // 結果画面と設定画面の送信状況を書き換える
  function paintSync() {
    var el = document.getElementById('sync-status');
    if (el) el.innerHTML = syncLine(el.getAttribute('data-id'));
    var st = document.getElementById('sync-state');
    if (st) st.innerHTML = stateList();
  }
  function syncLine(id) {
    var a = id ? attemptById(id) : null;
    if (!configured()) {
      return 'この結果はこの端末に保存しました。<a href="#settings">学習記録の設定</a>をすると、Googleスプレッドシートにも記録できます。';
    }
    if (a && a.synced) return 'スプレッドシートに記録しました。';
    if (syncNote.state === 'sending') return 'スプレッドシートに送信しています…';
    if (syncNote.state === 'error') {
      return 'スプレッドシートに送れませんでした。' + esc(syncNote.msg) + '。未送信の記録は、次にアプリを開いたときにも再送します。' +
        ' <button type="button" class="linkbtn" data-act="sync">今すぐ再送する</button>';
    }
    return 'スプレッドシートへの送信を待っています。';
  }

  /* ---------- session ---------- */
  function startSession(examId, nums, order) {
    var list = order === 'random' ? shuffle(nums) : nums.slice().sort(function (a, b) { return a - b; });
    mem.session = {
      ex: examId,
      full: nums.length === 25,
      mode: order,
      order: list,
      idx: 0,
      answers: {},
      secs: {},
      at: {},
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
    var now = Date.now();
    s.order.forEach(function (n) {
      if (s.answers[n] === qOf(exam, n).a) correct++; else wrong.push(n);
    });
    s.done = true;
    var h = mem.hist[s.ex] || {};
    if (s.full) {
      h.score = correct;
      h.total = 25;
      h.date = now;
      h.wrong = wrong.slice().sort(function (a, b) { return a - b; });
    } else {
      // 解き直し: 正解できた問題を「間違えた問題」から外す
      var prev = h.wrong || [];
      h.wrong = prev.filter(function (n) { return s.order.indexOf(n) === -1 || wrong.indexOf(n) !== -1; });
    }
    mem.hist[s.ex] = h;

    // 受験の記録（問題番号順に、選んだ解答・正誤・解答秒数・解答時刻）
    var secs = s.secs || {};
    var at = s.at || {};
    var attempt = {
      id: uid(), ex: s.ex, mode: s.full ? 'full' : 'retry', order: s.mode || '',
      started: s.started, finished: now, total: s.order.length, correct: correct,
      qs: s.order.slice().sort(function (a, b) { return a - b; }).map(function (n) {
        var c = s.answers[n] || '';
        return [n, c, c === qOf(exam, n).a ? 1 : 0, typeof secs[n] === 'number' ? secs[n] : null, at[n] || null];
      }),
      src: 'app', dev: deviceType(), synced: false
    };
    log.attempts.push(attempt);
    saveLog();
    s.attemptId = attempt.id;
    save();
    go('#result');
    syncPending();
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
      '<div class="sheet-head" aria-hidden="true"><span>選択</span><span>実施回</span><span>前回の正答率</span></div>';
    EXAMS.forEach(function (e) {
      var h = mem.hist[e.id] || {};
      var fa = fullAttempts(e.id);
      var last = fa[fa.length - 1];
      var hist = '未実施';
      if (last) {
        hist = '<b>' + pct(last.correct, last.total) + '%</b> ' + last.correct + '/' + last.total;
        if (h.wrong && h.wrong.length) hist += '<br>要復習 ' + h.wrong.length + '問';
        else if (fa.length > 1) hist += '<br>' + fa.length + '回目';
      } else if (h.wrong && h.wrong.length) {
        hist = '要復習 ' + h.wrong.length + '問';
      }
      var on = e.id === pick;
      html += '<button type="button" class="exam-row' + (on ? ' marked' : '') + '" role="radio" aria-checked="' + on +
        '" data-pick="' + e.id + '"><span class="bubble" aria-hidden="true"></span>' +
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
  var shownAt = 0; // 表示中の問題を出した時刻（解答秒数の計測用）

  function renderQuiz() {
    var s = mem.session;
    if (!s || s.done || !examById(s.ex)) { go('#top'); return; }
    var exam = examById(s.ex);
    var n = s.order[s.idx];
    var q = qOf(exam, n);
    shownAt = s.answers[n] ? 0 : Date.now();

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
    var now = Date.now();
    s.answers[n] = k;
    s.secs = s.secs || {};
    s.at = s.at || {};
    // 30分を超えたものは席を外していたとみなし、時間は記録しない
    var sec = shownAt ? Math.round((now - shownAt) / 1000) : null;
    s.secs[n] = sec !== null && sec <= 1800 ? sec : null;
    s.at[n] = now;
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
    var rate = pct(correct, total);

    var html = '<section class="intro"><h1>' + esc(exam.label) + ' 午前Ⅱの結果</h1>' +
      '<p class="lead">' + esc(exam.name) + (s.full ? '・全25問' : '・前回間違えた' + total + '問の解き直し') + '</p></section>';
    html += '<div class="score"><span class="big" aria-label="正答率' + rate + 'パーセント">' + rate + '<small>%</small></span>' +
      '<span class="detail"><b>正答率</b><br>' + total + '問中 ' + correct + '問正解' + (s.full ? '（' + (correct * 4) + '点）' : '') + '</span></div>';
    if (s.full) {
      html += correct >= PASS_N
        ? '<p class="pass ok">基準点（60点＝15問正解）に届いています。</p>'
        : '<p class="pass ng">基準点（60点＝15問正解）まで、あと' + (PASS_N - correct) + '問です。</p>';
      // 同じ回の前回（本番）と比べる
      var fa = fullAttempts(s.ex).filter(function (a) { return a.id !== s.attemptId; });
      var cur = s.attemptId ? attemptById(s.attemptId) : null;
      if (cur) fa = fa.filter(function (a) { return a.finished < cur.finished; });
      var prev = fa[fa.length - 1];
      if (prev) {
        var pr = pct(prev.correct, prev.total);
        var diff = rate - pr;
        html += '<p class="delta">前回（' + md(prev.finished) + '）の' + pr + '%から' +
          (diff > 0 ? diff + 'ポイント上がりました。' : diff < 0 ? (-diff) + 'ポイント下がりました。' : '変わりませんでした。') + '</p>';
      }
    }
    if (s.attemptId) {
      html += '<p class="sync" id="sync-status" data-id="' + esc(s.attemptId) + '" role="status">' + syncLine(s.attemptId) + '</p>';
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

  /* ---------- settings: 学習記録 ---------- */
  function stateList() {
    var n = log.attempts.length;
    var pend = unsynced().length;
    var dest;
    if (!configured()) dest = '未設定';
    else if (syncNote.state === 'sending') dest = '送信中…';
    else if (sync.lastErr) dest = '<span class="ng">送信できていません</span><br><small>' + esc(sync.lastErr) + '</small>';
    else if (sync.lastOk) dest = '接続済み（最終送信 ' + md(sync.lastOk) + ' ' + fmtLocal(sync.lastOk).slice(11, 16) + '）';
    else dest = '設定済み（まだ送信していません）';
    return '<dt>この端末の記録</dt><dd>' + n + '回分</dd>' +
      '<dt>スプレッドシート</dt><dd>' + dest + '</dd>' +
      '<dt>未送信</dt><dd>' + pend + '回分' +
      (configured() && pend ? ' <button type="button" class="linkbtn" data-act="sync">今すぐ送る</button>' : '') + '</dd>';
  }

  function renderSettings() {
    var html = '<section class="intro"><h1>学習記録の設定</h1>' +
      '<p class="lead">解き終えるたびに、正答率と各問の正誤をあなたのGoogleスプレッドシートに記録します。記録したデータは Looker Studio で、正答率の推移や分野ごとの弱点としてグラフにできます。</p></section>';

    html += '<section class="panel"><h2>記録の状態</h2><dl class="kv" id="sync-state">' + stateList() + '</dl></section>';

    html += '<form class="panel" id="sync-form" novalidate><h2>送信先</h2>' +
      '<label class="field"><span>ウェブアプリのURL</span>' +
      '<input type="url" name="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(sync.url) + '"></label>' +
      '<label class="field"><span>トークン</span>' +
      '<input type="text" name="token" autocomplete="off" spellcheck="false" value="' + esc(sync.token) + '"></label>' +
      '<p class="note">URLとトークンは、この端末のブラウザにだけ保存します。公開しているGitHubのリポジトリには含まれません。スマホとPCの両方で使う場合は、それぞれで入力してください。</p>' +
      '<div class="actions"><button type="submit" class="btn">保存して接続を確認</button>' +
      (configured() ? '<button type="button" class="btn secondary" data-act="unlink">送信先を消す</button>' : '') + '</div>' +
      '<p class="form-msg" id="form-msg" role="status"></p></form>';

    html += '<section class="panel"><h2>はじめて設定するとき</h2><ol class="steps">' +
      '<li>記録用のGoogleスプレッドシートを開き、［拡張機能］から［Apps Script］を開きます。</li>' +
      '<li>最初から入っているコードを消し、コピーしたコードを貼り付けて保存します。<div class="inline-actions">' +
      '<button type="button" class="btn secondary small" data-act="copy-code">Apps Scriptのコードをコピー</button>' +
      '<a href="' + CODE_VIEW + '" target="_blank" rel="noopener">GitHubでコードを見る</a></div><span class="form-msg" id="copy-msg" role="status"></span></li>' +
      '<li>上の関数の選択欄で「setup」を選んで［実行］し、権限を許可します。実行ログに出るトークンを控えます。</li>' +
      '<li>［デプロイ］から［新しいデプロイ］を選び、種類を「ウェブアプリ」、次のユーザーとして実行を「自分」、アクセスできるユーザーを「全員」にしてデプロイします。表示されたURL（/exec で終わるもの）をコピーします。</li>' +
      '<li>このページの「送信先」にURLとトークンを入れて、［保存して接続を確認］を押します。</li>' +
      '</ol></section>';

    html += '<section class="panel"><h2>記録を書き出す</h2>' +
      '<p>この端末に残っている記録を、スプレッドシートと同じ列のCSVで保存できます。</p>' +
      '<div class="actions"><button type="button" class="btn secondary" data-act="csv-attempts">受験ごとの記録（CSV）</button>' +
      '<button type="button" class="btn secondary" data-act="csv-answers">問題ごとの記録（CSV）</button></div></section>';

    html += '<div class="actions"><a class="btn secondary" href="#top">トップへ戻る</a></div>';
    app.innerHTML = html;
  }

  function onSettingsSubmit(form) {
    var url = form.url.value.trim();
    var token = form.token.value.trim();
    var msg = document.getElementById('form-msg');
    msg.className = 'form-msg';
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
      msg.className = 'form-msg ng';
      msg.textContent = 'URLは https://script.google.com/ で始まり、/exec で終わるものを入れてください（デプロイ後に表示されるウェブアプリのURLです）。';
      form.url.focus();
      return;
    }
    if (!token) {
      msg.className = 'form-msg ng';
      msg.textContent = 'トークンを入れてください。Apps Scriptで setup を実行したときの実行ログに表示されます。';
      form.token.focus();
      return;
    }
    sync.url = url; sync.token = token; sync.lastErr = ''; saveSync();
    msg.textContent = '接続を確認しています…';
    post({ action: 'ping' }).then(function (res) {
      msg.className = 'form-msg ok';
      msg.textContent = '接続できました。スプレッドシート「' + (res.spreadsheet || '') + '」に、これまで ' + (res.attempts || 0) + '回分の記録があります。' +
        (unsynced().length ? 'この端末の未送信 ' + unsynced().length + '回分を送ります。' : '');
      sync.lastOk = sync.lastOk || 0;
      saveSync();
      return syncPending();
    }).catch(function (err) {
      sync.lastErr = describeError(err); saveSync();
      msg.className = 'form-msg ng';
      msg.textContent = '接続できませんでした。' + sync.lastErr + '。';
      paintSync();
    });
  }

  function copyCode() {
    var msg = document.getElementById('copy-msg');
    fetch(CODE_URL, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('fetch');
      return r.text();
    }).then(function (code) {
      return navigator.clipboard.writeText(code);
    }).then(function () {
      msg.className = 'form-msg ok';
      msg.textContent = 'コピーしました。Apps Scriptのエディタに貼り付けてください。';
    }).catch(function () {
      msg.className = 'form-msg ng';
      msg.textContent = 'コピーできませんでした。「GitHubでコードを見る」から開いてコピーしてください。';
    });
  }

  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(kind) {
    var head = kind === 'answers' ? HEAD_ANSWERS : HEAD_ATTEMPTS;
    var lines = [head.join(',')];
    log.attempts.slice().sort(function (a, b) { return a.finished - b.finished; }).forEach(function (a) {
      var r = rowsOf(a, true);
      if (!r) return;
      var rows = kind === 'answers' ? r.answers : [r.row];
      rows.forEach(function (row) { lines.push(head.map(function (h) { return csvCell(row[h]); }).join(',')); });
    });
    var blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (kind === 'answers' ? 'AU午前2_解答明細_' : 'AU午前2_解答履歴_') + dayLocal(Date.now()) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
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
    } else if (act === 'sync') {
      syncPending();
    } else if (act === 'copy-code') {
      copyCode();
    } else if (act === 'csv-attempts') {
      downloadCsv('attempts');
    } else if (act === 'csv-answers') {
      downloadCsv('answers');
    } else if (act === 'unlink') {
      sync.url = ''; sync.token = ''; sync.lastErr = ''; sync.lastOk = 0; saveSync();
      renderSettings();
      var fm = document.getElementById('form-msg');
      if (fm) fm.textContent = '送信先を消しました。記録はこの端末にだけ保存されます。';
    }
  });

  app.addEventListener('submit', function (ev) {
    if (ev.target.id === 'sync-form') { ev.preventDefault(); onSettingsSubmit(ev.target); }
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
    else if (h === '#settings') renderSettings();
    else if (m) renderReview(parseInt(m[1], 10));
    else renderTop();
    focusMain();
  }
  window.addEventListener('hashchange', route);

  if (!EXAMS.length) {
    app.innerHTML = '<p class="empty">問題データを読み込めませんでした。ページを再読み込みしてください。</p>';
  } else {
    load();
    route();
    // 前回送れなかった記録があれば、開いたときに再送する
    if (configured() && unsynced().length) syncPending();
  }
})();
