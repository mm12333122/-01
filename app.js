const SUPABASE_URL = 'https://wstqsemnfvqeeildfwvw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_A4CYpqyg8xn7WDyJPUGz3A_e0uxII9c';

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 20 } }
    })
  : null;

const $ = s => document.querySelector(s);
const uid = p => `${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const localDate = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dateAdd = n => { const d = new Date(); d.setDate(d.getDate() + n); return localDate(d); };

let state = { lectures: [], checkins: [] };
let deepseekApiKey = localStorage.getItem('lecture-deepseek-key') || sessionStorage.getItem('lecture-deepseek-key') || '';
if (deepseekApiKey) localStorage.setItem('lecture-deepseek-key', deepseekApiKey);
let page = 'board', period = 'week';
let listPages = { today: 0, future: 0, past: 0 };
const PAGE_SIZE = 5;
let loading = true;
let realtimeChannels = [];
const todayObj = new Date();
let calYear = todayObj.getFullYear();
let calMonth = todayObj.getMonth() + 1;

const USERS = ['A', 'B'];
const defaultProfiles = { A: { name: '一二', avatar: '一' }, B: { name: '布布', avatar: '布' } };
let userProfiles = (() => {
  try { return { ...defaultProfiles, ...JSON.parse(localStorage.getItem('lecture-user-profiles') || '{}') }; }
  catch (_) { return { ...defaultProfiles }; }
})();
const userName = id => userProfiles[id]?.name || defaultProfiles[id]?.name || id;
const userAvatar = id => userProfiles[id]?.avatar || userName(id).slice(0, 1);
const userColorClass = id => `user-${id}`;

function showLoading(text = '正在连接云端数据…') {
  $('#app').innerHTML = `<div class="loading">${text}</div>`;
  loading = true;
}

function fmtDate(date) {
  const [y, m, d] = date.split('-');
  return `${m}月${d}日`;
}
function fullDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  const day = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, d).getDay()];
  return `${y}年${String(m).padStart(2, '0')}月${String(d).padStart(2, '0')}日（星期${day}）`;
}
function shortTime(value) { return String(value || '').slice(0, 5); }
function timeText(l) { return l.endTime ? `${shortTime(l.startTime)}–${shortTime(l.endTime)}` : `${shortTime(l.startTime)}开始`; }
function isEnded(l) {
  if (l.date < dateAdd(0)) return true;
  if (l.date > dateAdd(0)) return false;
  return l.endTime ? new Date(`${l.date}T${l.endTime}:00`) <= new Date() : false;
}
function checks(l) { return USERS.map(u => state.checkins.find(c => c.lectureId === l.id && c.userId === u)).filter(Boolean); }
function status(l) { return checks(l).length ? 'checked' : isEnded(l) ? 'missed' : 'pending'; }

function checkinAvatars(l) {
  const cs = checks(l);
  if (!cs.length) return '';
  return `<div class="checkin-avatars">${cs.map(c => `<div class="mini-avatar-wrap ${userColorClass(c.userId)}"><div class="mini-avatar">${avatarHtml(c.userId)}</div><span class="mini-count">${c.dataCount}</span></div>`).join('')}</div>`;
}

function card(l, compact = false) {
  const cs = checks(l);
  const canCheck = l.date === dateAdd(0);
  const isFuture = l.date > dateAdd(0) && !cs.length;
  const [, month, day] = l.date.split('-');
  const title = esc(l.title);
  const registrationHtml = l.registrationCount !== '' && l.registrationCount != null && Number.isFinite(Number(l.registrationCount)) && Number(l.registrationCount) >= 0
    ? `<span class="registration-count">报名 ${Number(l.registrationCount)}</span>` : '';
  const remarkHtml = l.remark
    ? `<div class="lecture-remark" onclick="openRemarkEdit('${l.id}')" title="点击编辑备注">📝 ${esc(l.remark)}</div>`
    : `<div class="lecture-remark remark-empty" onclick="openRemarkEdit('${l.id}')" title="点击添加备注">📝 点击添加备注</div>`;
  return `<article class="lecture-card ${compact ? 'compact' : ''} ${l.date === dateAdd(0) ? 'today-card' : ''} ${isFuture ? 'future-card' : ''}">
    <div class="title-line">
      ${isFuture ? `<div class="future-date" aria-label="${month}月${day}日"><b>${day}</b><span>${Number(month)}月</span></div>` : ''}
      <div class="title-left" onclick="openRemarkEdit('${l.id}')">
        <h3 class="lecture-title">${title}</h3>
        ${registrationHtml}
        ${checkinAvatars(l)}
      </div>
      <div class="title-right">
        ${canCheck ? `<button class="card-action mini" onclick="event.stopPropagation();openCheckin('${l.id}')">打卡</button>` : ''}
      </div>
    </div>
    <div class="meta big" onclick="openRemarkEdit('${l.id}')">${isFuture ? '' : `📅 ${fmtDate(l.date)}　`}⏰ ${timeText(l)}${l.location ? `　📍 ${esc(l.location)}` : ''}</div>
    ${remarkHtml}
  </article>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function checkSummary(l) {
  const cs = checks(l);
  return cs.length ? cs.map(c => `${userName(c.userId)} ${c.dataCount}`).join(' · ') : '无人打卡';
}
function compactLectureRow(l, ended = false) {
  const [, month, day] = l.date.split('-');
  const st = ended ? (checks(l).length ? '已打卡' : '无人打卡') : '待打卡';
  return `<article class="lecture-list-row"><div class="list-date"><b>${day}</b><span>${month}月</span></div><div class="list-main"><strong>${esc(l.title)}</strong><span>⏰ ${timeText(l)}${l.location ? `　📍 ${esc(l.location)}` : ''}</span></div><span class="list-state ${ended ? (checks(l).length ? 'done' : 'missed') : ''}">${ended ? checkSummary(l) : st}</span></article>`;
}
function pager(items, key, size = PAGE_SIZE) {
  const total = Math.ceil(items.length / size);
  if (total <= 1) return { items, page: 0, controls: '' };
  const current = Math.min(listPages[key] || 0, total - 1);
  const slice = items.slice(current * size, current * size + size);
  return { items: slice, page: current, controls: `<div class="pager"><button ${current === 0 ? 'disabled' : ''} onclick="setListPage('${key}',-1)">‹</button><span>${current + 1} / ${total}</span><button ${current === total - 1 ? 'disabled' : ''} onclick="setListPage('${key}',1)">›</button></div>` };
}
function section(title, items, empty, listKey = '', forceCompact = false) {
  const view = listKey ? pager(items, listKey) : { items, controls: '' };
  const hasItems = view.items.length > 0;
  return `<section class="section"><div class="section-title">${title}<span class="section-count">${items.length ? `<b>${items.length}</b> 场` : ''}</span></div>${hasItems ? `<div class="card-stack">${view.items.map(l => card(l, forceCompact)).join('')}</div>${view.controls}` : `<div class="empty">${empty}</div>`}</section>`;
}
function board() {
  const today = state.lectures.filter(l => l.date === dateAdd(0)).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const future = state.lectures.filter(l => l.date > dateAdd(0) && !checks(l).length).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const past = state.lectures.filter(l => l.date < dateAdd(0)).sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  return `<header class="page-head"><div><h1>一二布布打卡记</h1><span class="today">${fullDate(dateAdd(0))}</span></div></header>
    <div class="entry-actions">
      <button class="primary" onclick="openAIRecognition()">▣ AI 图片识别</button>
      <button class="secondary" onclick="openManual()">＋ 手动录入</button>
    </div>
    ${section('今日讲座', today, '今天还没有讲座。', 'today')}
    ${section('待打卡讲座', future, '暂无待打卡讲座。', 'future')}
    ${section('已结束讲座', past, '暂无已结束讲座。', 'past')}`;
}
function range(p) {
  const now = new Date(), start = new Date(now);
  if (p === 'week') { const day = (now.getDay() + 6) % 7; start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0); }
  else if (p === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else return null;
  return start;
}
function achievement() {
  const st = range(period);
  const relevant = state.checkins.filter(c => !st || new Date(c.checkInTime.replace(' ', 'T')) >= st);
  const vals = USERS.map(u => { const a = relevant.filter(c => c.userId === u); return { u, count: a.length, total: a.reduce((x, c) => x + Number(c.dataCount), 0) }; });
  const grandTotal = vals.reduce((x, v) => x + v.total, 0);
  const grandCount = vals.reduce((x, v) => x + v.count, 0);
  const max = Math.max(1, ...vals.map(x => x.total));
  const label = { week: '本周', month: '本月', all: '累计' }[period];

  const calSt = new Date(calYear, calMonth - 1, 1);
  const firstDay = calSt.getDay();
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const calCheckins = state.checkins.filter(c => {
    const dt = new Date(c.checkInTime.replace(' ', 'T'));
    return dt.getFullYear() === calYear && dt.getMonth() === calMonth - 1;
  });
  const calDaySet = new Set(calCheckins.map(c => c.checkInTime.slice(8, 10)));
  const calCheckinCounts = calCheckins.reduce((counts, c) => {
    const day = c.checkInTime.slice(8, 10);
    counts[day] = (counts[day] || 0) + 1;
    return counts;
  }, {});
  const lectureDaySet = new Set(state.lectures
    .filter(l => l.date && l.date.slice(0, 4) === String(calYear) && Number(l.date.slice(5, 7)) === calMonth)
    .map(l => l.date.slice(8, 10)));
  const monthTotalA = calCheckins.filter(c => c.userId === 'A').reduce((x, c) => x + Number(c.dataCount), 0);
  const monthTotalB = calCheckins.filter(c => c.userId === 'B').reduce((x, c) => x + Number(c.dataCount), 0);

  const yearOptions = [];
  const minYear = Math.min(todayObj.getFullYear(), ...state.checkins.map(c => new Date(c.checkInTime.replace(' ', 'T')).getFullYear()), todayObj.getFullYear() - 1);
  const maxYear = Math.max(todayObj.getFullYear(), ...state.checkins.map(c => new Date(c.checkInTime.replace(' ', 'T')).getFullYear()), todayObj.getFullYear());
  for (let y = minYear; y <= maxYear; y++) {
    yearOptions.push(`<option value="${y}" ${y === calYear ? 'selected' : ''}>${y}年</option>`);
  }
  const monthOptions = [];
  for (let m = 1; m <= 12; m++) {
    monthOptions.push(`<option value="${m}" ${m === calMonth ? 'selected' : ''}>${m}月</option>`);
  }

  const calCells = [];
  for (let i = 0; i < firstDay; i++) calCells.push(`<div class="cal-cell empty"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = String(d).padStart(2, '0');
    const checked = calDaySet.has(ds);
    const imported = lectureDaySet.has(ds);
    const dayCount = calCheckinCounts[ds] || 0;
    calCells.push(`<div class="cal-cell ${imported ? 'imported' : ''} ${checked ? 'checked' : ''}"><span>${d}</span>${dayCount ? `<b class="cal-count">${dayCount}</b>` : ''}</div>`);
  }
  const calendarHtml = `<div class="calendar-card">
    <div class="cal-header">
      <div class="cal-selects">
        <select class="cal-select" onchange="setCalYear(this.value)">${yearOptions.join('')}</select>
        <select class="cal-select" onchange="setCalMonth(this.value)">${monthOptions.join('')}</select>
        <span class="cal-subtitle">打卡日历</span>
      </div>
      <div class="cal-month-total">
        <div class="cal-tag user-A"><span>${userName('A')}</span><b>${monthTotalA}</b></div>
        <div class="cal-tag user-B"><span>${userName('B')}</span><b>${monthTotalB}</b></div>
      </div>
    </div>
    <div class="cal-weeks">${['日','一','二','三','四','五','六'].map(w => `<div class="cal-week">${w}</div>`).join('')}</div>
    <div class="cal-grid">${calCells.join('')}</div>
  </div>`;

  return `<header class="page-head"><div><span class="today">一二布布天下第一好</span></div></header>
    <div class="achievement-tabs">${[['week', '本周'], ['month', '本月'], ['all', '累计']].map(x => `<button class="${period === x[0] ? 'active' : ''}" onclick="setPeriod('${x[0]}')">${x[1]}</button>`).join('')}</div>
    <div class="stat-grid">${vals.map(x => `<div class="stat-card"><span class="name">${userName(x.u)} · ${label}打卡量</span><strong>${x.total}</strong><small>已打卡 ${x.count} 场</small></div>`).join('')}</div>
    <div class="grand-total-card"><span class="name">${label}总打卡量</span><strong>${grandTotal}</strong><small>累计打卡 ${grandCount} 场</small></div>
    <div class="chart"><div class="section-title">${label}打卡量<span>单位：量</span></div>${vals.map(x => `<div class="bar-row"><b>${userName(x.u)}</b><div class="track"><div class="bar" style="width:${x.total / max * 100}%"></div></div><b>${x.total}</b></div>`).join('')}</div>
    ${calendarHtml}`;
}
function setCalYear(v) { calYear = Number(v); render(); }
function setCalMonth(v) { calMonth = Number(v); render(); }
function mine() {
  return `<header class="page-head"><div><h1>我的</h1><span class="today">基础设置</span></div></header><div class="identity"><i class="avatar">${avatarHtml('A')}</i><div><strong>${esc(userName('A'))} / ${esc(userName('B'))}</strong><span>讲座打卡管理 App</span></div></div><div class="setting-group"><div class="setting"><span>当前身份</span><b>${esc(userName('A'))} / ${esc(userName('B'))}</b></div><div class="setting"><span>头像与昵称</span><button onclick="openProfileSettings()">设置 ›</button></div><div class="setting"><span>DeepSeek API</span><button onclick="openApiSettings()">${deepseekApiKey ? '已连接 ›' : '配置 Key ›'}</button></div><div class="setting"><span>数据统计</span><button onclick="go('achievement')">查看成就 ›</button></div><div class="setting"><span>连接状态</span><b id="realtime-status">🔗 已连接实时同步</b></div><div class="setting"><span>关于 App</span><b>V1.0 · Supabase 云端版</b></div></div>`;
}
function nav() {
  return `<nav class="bottom-nav">${[['board', '▦', '看板'], ['achievement', '◉', '成就'], ['mine', '◌', '我的']].map(x => `<button class="nav-btn ${page === x[0] ? 'active' : ''}" onclick="go('${x[0]}')"><b>${x[1]}</b>${x[2]}</button>`).join('')}</nav>`;
}
function render() {
  loading = false;
  $('#app').innerHTML = (page === 'board' ? board() : page === 'achievement' ? achievement() : mine()) + nav();
}
function go(p) { page = p; render(); window.scrollTo(0, 0); }
function setPeriod(p) { period = p; render(); }
function setListPage(key, step) { listPages[key] = Math.max(0, (listPages[key] || 0) + step); render(); }
function modal(content) { $('#modal-layer').className = 'modal-layer open'; $('#modal-layer').innerHTML = `<div class="modal">${content}</div>`; }
function closeModal() { $('#modal-layer').className = 'modal-layer'; $('#modal-layer').innerHTML = ''; }
function lectureForm(prefill = {}, title = '手动录入讲座', hint = '', editing = false) {
  modal(`<h2>${title}</h2>${hint ? `<div class="empty" style="text-align:left;margin-bottom:13px">${hint}</div>` : ''}
    <form onsubmit="${editing ? 'submitRemarkEdit(event' + `,'${prefill.id}'` + ')' : 'submitLecture(event)'}">
      ${editing ? '' : `
        <label class="field"><span>讲座主题 *</span><input required name="title" value="${esc(prefill.title || '')}" placeholder="请输入讲座主题"></label>
        <label class="field"><span>日期 *</span><input required type="date" name="date" value="${prefill.date || dateAdd(0)}"></label>
        <label class="field"><span>开始时间 *</span><input required type="time" step="1" name="startTime" value="${prefill.startTime || ''}"></label>
        <label class="field"><span>结束时间</span><input type="time" step="1" name="endTime" value="${prefill.endTime || ''}"></label>
        <label class="field"><span>项目地点</span><input name="location" value="${esc(prefill.location || '')}" placeholder="如：活动中心"></label>
        <label class="field"><span>报名数</span><input name="registrationCount" inputmode="numeric" type="number" min="0" step="1" value="${prefill.registrationCount ?? ''}" placeholder="可选"></label>
      `}
      <label class="field"><span>备注</span><textarea name="remark" rows="3" placeholder="可记录讲师、内容要点等">${esc(prefill.remark || '')}</textarea><button class="remark-quick" type="button" onclick="this.form.elements.remark.value='象山场';this.form.elements.remark.focus()">＋ 填入“象山场”</button></label>
      <div class="modal-actions">
        <button class="cancel" type="button" onclick="closeModal()">取消</button>
        <button class="confirm" type="submit">${editing ? '保存备注' : '确认添加'}</button>
      </div>
    </form>`);
}
function openManual(prefill = {}) { lectureForm(prefill); }
function openRemarkEdit(id) {
  const l = state.lectures.find(x => x.id === id);
  if (!l) { toast('讲座不存在'); return; }
  lectureForm({ id: l.id, remark: l.remark }, '编辑备注', '', true);
}
async function submitRemarkEdit(e, id) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const remark = (f.remark || '').trim();
  try {
    const { error } = await supabaseClient.from('lectures').update({ remark }).eq('id', id);
    if (error) throw error;
    const local = state.lectures.find(x => x.id === id);
    if (local) local.remark = remark;
    closeModal();
    toast('备注已保存');
    if (!loading) render();
  } catch (err) {
    toast(`保存失败：${esc(err.message || '请稍后重试')}`);
  }
}
function lectureFingerprint(lecture) { return ['title', 'date', 'startTime', 'endTime', 'location'].map(key => String(lecture[key] || '').trim().replace(/\s+/g, ' ').toLowerCase()).join('|'); }

async function submitLecture(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (state.lectures.some(lecture => lectureFingerprint(lecture) === lectureFingerprint(f))) {
    toast('相同的讲座已存在，无需重复录入。');
    return;
  }
  const remark = (f.remark || '').trim();
  const payload = {
    title: f.title.trim(),
    lecture_date: f.date,
    start_time: f.startTime,
    end_time: f.endTime || '',
    location: f.location || '',
    remark,
    registration_count: f.registrationCount === '' ? null : Number(f.registrationCount)
  };
  try {
    let { error } = await supabaseClient.from('lectures').insert(payload);
    if (error && /column.*(remark|registration_count).*does not exist|(remark|registration_count)/.test(error.message || '')) {
      const { remark: _r, registration_count: _rc, ...fallbackPayload } = payload;
      ({ error } = await supabaseClient.from('lectures').insert(fallbackPayload));
    }
    if (error) throw error;
    closeModal();
    toast('讲座已添加');
  } catch (err) {
    toast(`添加失败：${esc(err.message || '请稍后重试')}`);
  }
}

function openApiSettings() {
  modal(`<h2>配置 DeepSeek API Key</h2><form onsubmit="saveApiKey(event)"><label class="field"><span>API Key</span><input required name="apiKey" type="password" autocomplete="off" value="${esc(deepseekApiKey)}" placeholder="sk-..."></label><div class="empty" style="text-align:left">Key 会保存在本浏览器中；图片与识别指令将发送至 DeepSeek API 用于真实识别。</div><div class="modal-actions"><button class="cancel" type="button" onclick="closeModal()">取消</button><button class="confirm" type="submit">保存并连接</button></div></form>`);
}
function saveApiKey(event) {
  event.preventDefault();
  deepseekApiKey = new FormData(event.target).get('apiKey').trim();
  localStorage.setItem('lecture-deepseek-key', deepseekApiKey);
  sessionStorage.removeItem('lecture-deepseek-key');
  closeModal();
  render();
  toast('DeepSeek API Key 已保存');
}
function openAIRecognition() {
  if (!deepseekApiKey) { openApiSettings(); return; }
  modal(`<h2>AI 图片识别</h2><div class="upload-options"><button type="button" class="upload-box upload-option" onclick="openCameraCapture()">拍照识别</button><label class="upload-box upload-option">从相册选择<input type="file" accept="image/*" onchange="recognizeLectureWithDeepSeek(event)"></label></div><div class="empty">图片将发送给 DeepSeek 的视觉模型，识别结果需要你确认后才会保存。</div><div class="modal-actions"><button class="cancel" onclick="closeModal()">取消</button></div>`);
}
let cameraStream = null;
async function openCameraCapture() {
  if (!navigator.mediaDevices?.getUserMedia) { toast('当前浏览器不支持摄像头，请使用相册选择'); return; }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    modal(`<h2>拍照识别</h2><video class="camera-preview" id="camera-preview" autoplay playsinline></video><canvas id="camera-canvas" hidden></canvas><div class="modal-actions"><button class="cancel" type="button" onclick="closeCameraCapture()">取消</button><button class="confirm" type="button" onclick="captureCameraImage()">拍摄并识别</button></div>`);
    $('#camera-preview').srcObject = cameraStream;
  } catch (error) {
    cameraStream = null;
    toast(error.name === 'NotAllowedError' ? '请允许浏览器使用摄像头' : '摄像头启动失败，请检查设备权限');
  }
}
function closeCameraCapture() {
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  openAIRecognition();
}
function captureCameraImage() {
  const video = $('#camera-preview');
  const canvas = $('#camera-canvas');
  if (!video?.videoWidth) { toast('摄像头还未准备好'); return; }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  canvas.toBlob(blob => recognizeLectureWithDeepSeek({ target: { files: [new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' })] } }), 'image/jpeg', .92);
}
function parseModelJson(content) {
  const source = String(content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('模型未返回 JSON');
  const data = JSON.parse(match[0]);
  const registrationCount = data.registrationCount ?? data.registration_count;
  return { title: String(data.title || ''), date: String(data.date || ''), startTime: String(data.startTime || ''), endTime: String(data.endTime || ''), location: String(data.location || ''), registrationCount: registrationCount === '' || registrationCount == null ? '' : Math.max(0, Number(registrationCount) || 0), remark: String(data.remark || '') };
}
function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}
async function recognizeLectureWithDeepSeek(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  if (file.size > 32 * 1024 * 1024) { toast('图片不能超过 32MB'); return; }
  modal(`<h2>AI 正在识别</h2><div class="empty">正在通过 DeepSeek 读取主标题、起止时间和项目地点…</div>`);
  try {
    const imageUrl = await fileAsDataUrl(file);
    const prompt = `请严格读取这张讲座海报，并且只返回一个 JSON 对象，不能使用 Markdown。字段必须为 title、date、startTime、endTime、location、registrationCount。title：只读取海报主标题区域的原文，不要从正文、主办方或上下文猜测。date、startTime、endTime：只能读取"起止时间"字段；date 输出 YYYY-MM-DD，startTime/endTime 输出图片中的原始 24 小时制时间，可保留秒数。location：只能读取"项目地点"字段后的原文。registrationCount：只读取海报明确标注的报名数/报名人数，无法确认时返回空字符串。任何字段在图片中看不清或不存在时填空字符串；绝不编造或推测。`;
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` },
      body: JSON.stringify({ model: 'deepseek-flash', temperature: 0, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl, detail: 'original' } }] }] })
    });
    if (!response.ok) { const problem = await response.json().catch(() => ({})); throw new Error(problem.error?.message || `请求失败 (${response.status})`); }
    const payload = await response.json();
    const fields = parseModelJson(payload.choices?.[0]?.message?.content);
    lectureForm(fields, '识别结果确认', '结果由 DeepSeek 视觉模型生成。请确认后保存。');
  } catch (error) {
    lectureForm({}, '识别结果确认', `识别失败：${esc(error.message || '请检查 API Key、网络和额度后重试。')}`);
  }
}
function openCheckin(id) {
  const l = state.lectures.find(x => x.id === id);
  if (!l) { toast('讲座不存在'); return; }
  modal(`<h2>打卡</h2><div class="empty" style="text-align:left">${esc(l.title)}<br><span style="color:#8a98aa;font-size:12px">${fmtDate(l.date)} · ${timeText(l)}</span></div><form onsubmit="submitCheckin(event,'${id}')"><div class="field"><span>打卡人 *</span><div class="radio-row"><label class="radio"><input type="radio" name="userId" value="A" required>一二</label><label class="radio"><input type="radio" name="userId" value="B">布布</label></div></div><label class="field"><span>打卡量 *</span><input required name="dataCount" inputmode="decimal" type="number" min="0" step="any" placeholder="请输入非负数字"></label><div class="modal-actions"><button class="cancel" type="button" onclick="closeModal()">取消</button><button class="confirm" type="submit">确认打卡</button></div></form>`);
}

function openProfileSettings() {
  modal(`<h2>头像与昵称</h2><div class="profile-edit-grid">${USERS.map(id => `<div class="profile-edit"><strong>${esc(userName(id))}</strong><div class="profile-avatar-preview" id="avatar-preview-${id}">${avatarHtml(id)}</div><label class="field"><span>头像图片</span><input class="profile-avatar-file" type="file" accept="image/*" onchange="selectAvatarImage(event,'${id}')"><input type="hidden" name="avatar-${id}" value="${esc(userAvatar(id))}"></label><label class="field"><span>昵称</span><input name="name-${id}" maxlength="12" value="${esc(userName(id))}" placeholder="请输入昵称"></label></div>`).join('')}</div><div class="modal-actions"><button class="cancel" type="button" onclick="closeModal()">取消</button><button class="confirm" type="button" onclick="saveProfileSettings(this)">保存设置</button></div>`);
}
function avatarHtml(id) {
  const avatar = userAvatar(id);
  return String(avatar).startsWith('data:image/') ? `<img src="${avatar}" alt="${esc(userName(id))}头像">` : esc(avatar);
}
function selectAvatarImage(event, id) {
  const file = event.target.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 5 * 1024 * 1024) { toast('头像图片不能超过 5MB'); event.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    const value = String(reader.result);
    const modalEl = event.target.closest('.modal');
    modalEl.querySelector(`[name="avatar-${id}"]`).value = value;
    modalEl.querySelector(`#avatar-preview-${id}`).innerHTML = `<img src="${value}" alt="头像预览">`;
  };
  reader.readAsDataURL(file);
}
function saveProfileSettings(button) {
  const modalEl = button.closest('.modal');
  USERS.forEach(id => {
    const name = modalEl.querySelector(`[name="name-${id}"]`).value.trim() || defaultProfiles[id].name;
    const avatar = modalEl.querySelector(`[name="avatar-${id}"]`).value.trim() || name.slice(0, 1);
    userProfiles[id] = { name, avatar };
  });
  localStorage.setItem('lecture-user-profiles', JSON.stringify(userProfiles));
  closeModal();
  render();
  toast('头像与昵称已保存');
}

async function submitCheckin(e, id) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (state.checkins.some(c => c.lectureId === id && c.userId === f.userId)) {
    toast('该用户已完成本场打卡。');
    return;
  }
  const n = Number(f.dataCount);
  if (!Number.isFinite(n) || n < 0) { toast('打卡量必须为非负数字'); return; }
  try {
    const { error } = await supabaseClient.from('checkins').insert({
      lecture_id: id,
      user_id: f.userId,
      data_count: n,
      remark: ''
    });
    if (error) throw error;
    closeModal();
    toast('打卡成功，数据统计已更新');
  } catch (err) {
    toast(`打卡失败：${esc(err.message || '请稍后重试')}`);
  }
}

function toast(s) {
  const e = $('#toast');
  e.textContent = s;
  e.className = 'toast show';
  setTimeout(() => e.className = 'toast', 2400);
}

function normalizeLecture(row) {
  return {
    id: row.id,
    title: row.title,
    date: typeof row.lecture_date === 'string' ? row.lecture_date.slice(0, 10) : row.lecture_date,
    startTime: row.start_time,
    endTime: row.end_time || '',
    location: row.location || '',
    remark: row.remark || '',
    registrationCount: row.registration_count == null ? '' : Number(row.registration_count),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
  };
}
function normalizeCheckin(row) {
  const dt = row.checkin_time ? new Date(row.checkin_time) : new Date();
  const tzMs = dt.getTimezoneOffset() * 60000;
  const local = new Date(dt.getTime() - tzMs);
  return {
    id: row.id,
    lectureId: row.lecture_id,
    userId: row.user_id,
    checkInTime: `${local.toISOString().slice(0, 10)} ${dt.toTimeString().slice(0, 5)}`,
    dataCount: Number(row.data_count) || 0,
    remark: row.remark || ''
  };
}

async function loadData() {
  if (!supabaseClient) {
    showLoading('⚠️ Supabase SDK 未加载，请检查网络');
    return false;
  }
  try {
    const [{ data: lectures, error: lerr }, { data: checkins, error: cerr }] = await Promise.all([
      supabaseClient.from('lectures').select('*'),
      supabaseClient.from('checkins').select('*')
    ]);
    if (lerr) throw lerr;
    if (cerr) throw cerr;
    state.lectures = (lectures || []).map(normalizeLecture);
    state.checkins = (checkins || []).map(normalizeCheckin);
    return true;
  } catch (err) {
    console.error('loadData error', err);
    showLoading(`⚠️ 加载云端数据失败：${esc(err.message || '请检查网络或 RLS 策略')}<br><br><button class="confirm" onclick="loadData().then(ok=>ok&&startRealtime().then(render))">重新连接</button>`);
    return false;
  }
}

async function startRealtime() {
  try {
    realtimeChannels.forEach(ch => supabaseClient.channel(ch).unsubscribe());
    realtimeChannels = [];

    const lecturesChannel = supabaseClient.channel('public:lectures')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lectures' }, async (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          state.lectures.push(normalizeLecture(payload.new));
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          const idx = state.lectures.findIndex(x => x.id === payload.new.id);
          if (idx >= 0) state.lectures[idx] = normalizeLecture(payload.new);
        } else if (payload.eventType === 'DELETE' && payload.old) {
          state.lectures = state.lectures.filter(x => x.id !== payload.old.id);
          state.checkins = state.checkins.filter(c => c.lectureId !== payload.old.id);
        }
        if (!loading) render();
      })
      .subscribe(status => {
        const el = document.getElementById('realtime-status');
        if (el) el.textContent = status === 'SUBSCRIBED' ? '🔗 已连接实时同步' : '⏳ 连接中…';
      });
    realtimeChannels.push('public:lectures');

    const checkinsChannel = supabaseClient.channel('public:checkins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, async (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          state.checkins.push(normalizeCheckin(payload.new));
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          const idx = state.checkins.findIndex(x => x.id === payload.new.id);
          if (idx >= 0) state.checkins[idx] = normalizeCheckin(payload.new);
        } else if (payload.eventType === 'DELETE' && payload.old) {
          state.checkins = state.checkins.filter(x => x.id !== payload.old.id);
        }
        if (!loading) render();
      })
      .subscribe();
    realtimeChannels.push('public:checkins');
  } catch (err) {
    console.warn('Realtime subscribe error', err);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('SW register failed', err));
  });
}

(async function init() {
  showLoading('正在连接云端数据…');
  const ok = await loadData();
  if (ok) {
    await startRealtime();
    render();
  }
})();
