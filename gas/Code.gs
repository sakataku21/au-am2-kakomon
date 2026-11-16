/**
 * AU 午前Ⅱ 過去問演習 ― 学習記録の受け口（Google Apps Script）
 *
 * 使い方
 *  1. 記録用のGoogleスプレッドシートで［拡張機能］→［Apps Script］を開き、このコードを貼り付けて保存する
 *  2. 関数「setup」を選んで［実行］し、権限を許可する（シートを作り、トークンを発行して実行ログに表示する）
 *  3. ［デプロイ］→［新しいデプロイ］→ 種類「ウェブアプリ」
 *       次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員
 *  4. 表示されたウェブアプリのURL（/exec）とトークンを、アプリの「学習記録の設定」に入力する
 *
 * コードを書き換えたときは［デプロイ］→［デプロイを管理］→ 編集 → バージョン「新バージョン」で更新すること。
 * トークンはスクリプト プロパティ（TOKEN）にだけ保存され、このコードには含まれない。
 */

var SHEET_ATTEMPTS = '解答履歴';
var SHEET_ANSWERS = '解答明細';
var TZ = 'Asia/Tokyo';

// アプリから届く項目名と同じ並び（列の追加・並べ替えをしても、1行目の見出し名で対応づける）
var HEAD_ATTEMPTS = ['受験ID', '開始日時', '終了日時', '受験日', '回', '回ID', '実施年度', 'モード', '出題順',
  '出題数', '正解数', '正答率', '得点', '基準点', '解答秒数', '端末', '記録元', 'アプリ版'];
var HEAD_ANSWERS = ['受験ID', '解答日時', '受験日', '回', '回ID', '実施年度', 'モード', '問番号', '問題',
  '分野', '論点', '選んだ解答', '正解', '正誤', '解答秒数'];

var DATETIME_FIELDS = { '開始日時': true, '終了日時': true, '解答日時': true };
var DATE_FIELDS = { '受験日': true };
var FORMATS = {
  '開始日時': 'yyyy/mm/dd hh:mm',
  '終了日時': 'yyyy/mm/dd hh:mm',
  '解答日時': 'yyyy/mm/dd hh:mm',
  '受験日': 'yyyy/mm/dd',
  '正答率': '0.0%'
};

/* ---------- メニュー ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('学習記録')
    .addItem('初期設定（シート作成・トークン発行）', 'setup')
    .addItem('トークンを表示', 'showToken')
    .addItem('トークンを作り直す', 'resetToken')
    .addToUi();
}

/* ---------- 初期設定 ---------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  var sa = ensureSheet_(ss, SHEET_ATTEMPTS, HEAD_ATTEMPTS);
  var sb = ensureSheet_(ss, SHEET_ANSWERS, HEAD_ANSWERS);
  // 最初からある空のシートは片付ける
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (name !== SHEET_ATTEMPTS && name !== SHEET_ANSWERS && sh.getLastRow() === 0 && ss.getSheets().length > 2) {
      ss.deleteSheet(sh);
    }
  });
  var token = token_(true);
  notify_('初期設定が完了しました。\n\n' +
    'トークン：' + token + '\n\n' +
    'アプリの「学習記録の設定」に、ウェブアプリのURLとこのトークンを入れてください。\n\n' +
    'Looker Studio は、1回分以上記録されてから次のリンクで開くと、項目の型（日付・数値）が正しく認識されます：\n' +
    lookerUrl_(ss, sa, sb));
  return token;
}

function showToken() {
  var t = token_(false);
  notify_(t ? 'トークン：' + t : 'まだトークンがありません。「初期設定」を実行してください。');
}

function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  notify_('新しいトークン：' + token_(true) + '\n\nアプリの「学習記録の設定」のトークンも入れ直してください。');
}

/* ---------- ウェブアプリ ---------- */
function doGet() {
  return json_({ ok: true, message: 'AU 午前Ⅱ 過去問演習の学習記録用URLです。アプリの「学習記録の設定」に入力して使います。' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (pe) {
      return json_({ ok: false, error: 'bad_request', message: 'JSONを読み取れません' });
    }
    var token = token_(false);
    if (!token) return json_({ ok: false, error: 'not_setup', message: 'setup が未実行です' });
    if (body.token !== token) return json_({ ok: false, error: 'bad_token', message: 'トークンが一致しません' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.action === 'ping') {
      var s0 = ss.getSheetByName(SHEET_ATTEMPTS);
      return json_({ ok: true, action: 'ping', spreadsheet: ss.getName(), attempts: s0 ? Math.max(s0.getLastRow() - 1, 0) : 0 });
    }
    if (body.action !== 'append' || !Array.isArray(body.attempts)) {
      return json_({ ok: false, error: 'bad_request', message: 'action が不正です' });
    }

    lock.waitLock(20000);
    locked = true;
    var sa = ensureSheet_(ss, SHEET_ATTEMPTS, HEAD_ATTEMPTS);
    var sb = ensureSheet_(ss, SHEET_ANSWERS, HEAD_ANSWERS);
    var headA = header_(sa);
    var headB = header_(sb);
    var seen = existingIds_(sa, headA);
    var rowsA = [];
    var rowsB = [];
    var ids = [];
    var dup = 0;

    body.attempts.forEach(function (item) {
      var row = item && item.row;
      var id = row && row['受験ID'];
      if (!id) return;
      ids.push(id);
      if (seen[id]) { dup++; return; } // 同じ記録の再送は追記しない
      seen[id] = true;
      rowsA.push(toRow_(headA, row));
      (item.answers || []).forEach(function (a) { rowsB.push(toRow_(headB, a)); });
    });

    append_(sa, headA, rowsA);
    append_(sb, headB, rowsB);
    return json_({ ok: true, saved: rowsA.length, answers: rowsB.length, duplicated: dup, ids: ids });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

/* ---------- 内部処理 ---------- */
function ensureSheet_(ss, name, head) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#E6EEF7');
    sh.setFrozenRows(1);
  }
  return sh;
}

function header_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
}

function existingIds_(sh, head) {
  var col = head.indexOf('受験ID') + 1;
  var map = {};
  var n = sh.getLastRow() - 1;
  if (col < 1 || n < 1) return map;
  sh.getRange(2, col, n, 1).getValues().forEach(function (r) { if (r[0]) map[String(r[0])] = true; });
  return map;
}

function toRow_(head, obj) {
  return head.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (DATETIME_FIELDS[h] && v) {
      var d = new Date(v);
      return isNaN(d.getTime()) ? String(v) : d;
    }
    if (DATE_FIELDS[h] && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return Utilities.parseDate(v, TZ, 'yyyy-MM-dd'); // 日本時間の0時として書く
    }
    if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v; // 数式として解釈させない
    return v;
  });
}

function append_(sh, head, rows) {
  if (!rows.length) return;
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, head.length).setValues(rows);
  head.forEach(function (h, i) {
    if (FORMATS[h]) sh.getRange(start, i + 1, rows.length, 1).setNumberFormat(FORMATS[h]);
  });
}

function token_(create) {
  var props = PropertiesService.getScriptProperties();
  var t = props.getProperty('TOKEN');
  if (!t && create) {
    t = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', t);
  }
  return t;
}

function lookerUrl_(ss, sa, sb) {
  var id = ss.getId();
  var p = [
    ['r.reportName', 'AU午前Ⅱ 学習ダッシュボード'],
    ['ds.ds0.connector', 'googleSheets'], ['ds.ds0.spreadsheetId', id], ['ds.ds0.worksheetId', String(sb.getSheetId())],
    ['ds.ds0.datasourceName', 'AU学習_解答明細'],
    ['ds.ds1.connector', 'googleSheets'], ['ds.ds1.spreadsheetId', id], ['ds.ds1.worksheetId', String(sa.getSheetId())],
    ['ds.ds1.datasourceName', 'AU学習_解答履歴']
  ];
  return 'https://lookerstudio.google.com/reporting/create?' + p.map(function (kv) {
    return kv[0] + '=' + encodeURIComponent(kv[1]);
  }).join('&');
}

function notify_(msg) {
  console.log(msg);
  try {
    SpreadsheetApp.getUi().alert('学習記録', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // エディタから実行したときは画面に出せないので、実行ログを見る
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
