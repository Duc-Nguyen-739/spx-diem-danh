/**
 * mock-google.js — Mock google.script.run cho test UI local (mở index.html trực tiếp).
 *
 * KHÔNG push lên GAS production (đã .claspignore). Chỉ dùng khi chạy file://
 * — index.html tự phát hiện thiếu google.script và nạp file này.
 *
 * Cùng interface thật: google.script.run.fn().withSuccessHandler(h).withFailureHandler(e)
 * Dữ liệu mẫu lấy từ test-fixtures/Att.sample.csv (ẩn danh hóa).
 */
(function () {
  if (typeof window.google !== 'undefined' && window.google.script) return;

  // Email "người dùng hiện tại" của mock (getMeta trả về) — task meal-move TẠO MỚI có
  // createdBy = email này → test quyền: task tự tạo = creator (chuyển Ra/Vào được),
  // task seed createdBy 'web' = người khác (khóa Điểm Danh, ẩn nút chuyển).
  var MOCK_CURRENT_USER = 'kiosk.creator@spxexpress.com';

  var MOCK_DATA = {
    meta: {
      ok: true,
      appTitle: 'Điểm danh kho [LOCAL MOCK]',
      labels: {
        APP_TITLE: 'Điểm danh kho',
        BTN_RECONCILE: '+ Đối chiếu danh sách',
        BTN_CREATE: '+ Tạo task',
        BTN_SCAN: 'Quét',
        BTN_FINISH: 'Kết thúc',
        BTN_BACK: '← Danh sách task',
        COUNTER_SCANNED: 'Đã quét',
        COUNTER_ABSENT: 'Vắng',
        COUNTER_EXTRA: 'Dư',
        SCAN_PLACEHOLDER: 'Quét mã nhân viên…',
        EMPTY_NO_TASK: 'Chưa có task nào — chọn Station/Ca/Team rồi nhấn "+ Tạo task"',
        EMPTY_NO_SCAN: 'Không có nhân viên nào trong danh sách',
        ALREADY_SCANNED: 'Đã điểm danh',
        TASK_CLOSED: 'Task đã kết thúc',
        STAFF_NOT_FOUND: 'Không tìm thấy nhân viên',
        CREATE_FAILED_EMPTY: 'Không có nhân viên nào trong tổ hợp đã chọn',
      },
      tableHeaders: {
        TASK_ID: 'Mã task', STATION: 'Station', SLOT_CODE: 'Ca', TEAM: 'Team',
        STATUS: 'Trạng thái', CREATED_AT: 'Tạo lúc', STAFF_ID: 'Mã NV', STAFF_NAME: 'Tên NV',
        CARD_IN: 'Card In', CARD_OUT: 'Card Out', TIME_REF: 'Giờ có mặt', TIME_SCAN: 'Giờ quét',
      },
    },
    staff: [
      { staffId: 'Ops237511', staffName: 'NV001', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBLoading', agency: 'GRG', cardIn: '20:15', cardOut: '06:20' },
      { staffId: 'Ops196935', staffName: 'NV002', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBLoading', agency: 'GRG', cardIn: '20:18', cardOut: '06:25' },
      { staffId: 'Ops229444', staffName: 'NV003', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBLoading', agency: 'GRG', cardIn: '20:22', cardOut: '06:30' },
      { staffId: 'Ops110512', staffName: 'NV004', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBHandover', agency: 'GRG', cardIn: '20:25', cardOut: '06:35' },
      { staffId: 'Ops124563', staffName: 'NV005', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBHandover', agency: 'GRG', cardIn: '20:28', cardOut: '' },
      { staffId: 'Ops129481', staffName: 'NV104', slotCode: '18:00-02:00', station: 'HN2 SOC', team: 'Inbound', workstation: 'IBReceiving', agency: 'GRG', cardIn: '06:10', cardOut: '14:20' },
      { staffId: 'Ops126503', staffName: 'NV105', slotCode: '18:00-02:00', station: 'HN2 SOC', team: 'Inbound', workstation: 'IBReceiving', agency: 'GRG', cardIn: '06:12', cardOut: '14:22' },
      { staffId: 'Ops133754', staffName: 'NV020', slotCode: '22:00-06:00', station: 'HN2 SOC', team: 'Inbound', workstation: 'IBMove', agency: 'GRG', cardIn: '10:15', cardOut: '18:19' },
    ],
    tasks: [
      {taskId:'R20260802-0900',taskType:'reconcile',station:'HN2 SOC',slotCode:'08:00-17:00',team:'Outbound',status:'open',total:5,scanned:2,extra:1,createdBy:'web',createdAtText:'2026-08-02 09:00:00'},
      {taskId:'R20260802-0850',taskType:'reconcile',station:'HN2 SOC',slotCode:'18:00-02:00',team:'Inbound',status:'done',total:3,scanned:3,extra:0,createdBy:'web',createdAtText:'2026-08-02 08:50:00'},
      {taskId:'M20260802-0905',taskType:'meal-move',station:'HN2 SOC',slotCode:'',team:'Outbound',status:'open',total:0,scanned:0,extra:0,createdBy:MOCK_CURRENT_USER,createdAtText:'2026-08-02 09:05:00'},
      {taskId:'R20260802-0830',taskType:'reconcile',station:'HN3 SOC',slotCode:'13:00-22:00',team:'Outbound',status:'done',total:6,scanned:6,extra:1,createdBy:'web',createdAtText:'2026-08-02 08:30:00'},
      {taskId:'R20260802-0820',taskType:'reconcile',station:'HN3 SOC',slotCode:'22:00-06:00',team:'Inbound',status:'open',total:4,scanned:1,extra:0,createdBy:'web',createdAtText:'2026-08-02 08:20:00'},
      {taskId:'M20260802-0845',taskType:'meal-move',station:'HN3 SOC',slotCode:'',team:'Inbound',status:'open',total:0,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-02 08:45:00'},
      {taskId:'R20260802-0800',taskType:'reconcile',station:'HN4 SOC',slotCode:'08:00-17:00',team:'Inbound',status:'done',total:5,scanned:5,extra:2,createdBy:'web',createdAtText:'2026-08-02 08:00:00'},
      {taskId:'R20260802-0750',taskType:'reconcile',station:'HN4 SOC',slotCode:'18:00-02:00',team:'Outbound',status:'open',total:4,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-02 07:50:00'},
      {taskId:'R20260802-0730',taskType:'reconcile',station:'HN5 SOC',slotCode:'13:00-22:00',team:'Inbound',status:'open',total:6,scanned:3,extra:1,createdBy:'web',createdAtText:'2026-08-02 07:30:00'},
      {taskId:'M20260802-0740',taskType:'meal-move',station:'HN5 SOC',slotCode:'',team:'Outbound',status:'done',total:0,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-02 07:40:00'},
      {taskId:'R20260801-1700',taskType:'reconcile',station:'HN2 SOC',slotCode:'08:00-17:00',team:'Outbound',status:'done',total:5,scanned:5,extra:0,createdBy:'web',createdAtText:'2026-08-01 17:00:00'},
      {taskId:'R20260801-1650',taskType:'reconcile',station:'HN2 SOC',slotCode:'22:00-06:00',team:'Inbound',status:'done',total:3,scanned:3,extra:1,createdBy:'web',createdAtText:'2026-08-01 16:50:00'},
      {taskId:'R20260801-1630',taskType:'reconcile',station:'HN3 SOC',slotCode:'18:00-02:00',team:'Outbound',status:'done',total:6,scanned:6,extra:0,createdBy:'web',createdAtText:'2026-08-01 16:30:00'},
      {taskId:'M20260801-1600',taskType:'meal-move',station:'HN3 SOC',slotCode:'',team:'Outbound',status:'done',total:0,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-01 16:00:00'},
      {taskId:'R20260801-1540',taskType:'reconcile',station:'HN4 SOC',slotCode:'08:00-17:00',team:'Inbound',status:'open',total:4,scanned:4,extra:0,createdBy:'web',createdAtText:'2026-08-01 15:40:00'},
      {taskId:'R20260801-1520',taskType:'reconcile',station:'HN4 SOC',slotCode:'13:00-22:00',team:'Outbound',status:'open',total:5,scanned:2,extra:1,createdBy:'web',createdAtText:'2026-08-01 15:20:00'},
      {taskId:'R20260801-1500',taskType:'reconcile',station:'HN5 SOC',slotCode:'18:00-02:00',team:'Inbound',status:'done',total:6,scanned:5,extra:1,createdBy:'web',createdAtText:'2026-08-01 15:00:00'},
      {taskId:'M20260801-1430',taskType:'meal-move',station:'HN5 SOC',slotCode:'',team:'Inbound',status:'open',total:0,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-01 14:30:00'},
      {taskId:'R20260801-1400',taskType:'reconcile',station:'HN2 SOC',slotCode:'13:00-22:00',team:'Inbound',status:'open',total:4,scanned:1,extra:0,createdBy:'web',createdAtText:'2026-08-01 14:00:00'},
      {taskId:'R20260801-1330',taskType:'reconcile',station:'HN3 SOC',slotCode:'08:00-17:00',team:'Outbound',status:'done',total:5,scanned:5,extra:2,createdBy:'web',createdAtText:'2026-08-01 13:30:00'},
      {taskId:'R20260801-1300',taskType:'reconcile',station:'HN3 SOC',slotCode:'22:00-06:00',team:'Inbound',status:'open',total:3,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-01 13:00:00'},
      {taskId:'M20260801-1240',taskType:'meal-move',station:'HN2 SOC',slotCode:'',team:'Inbound',status:'open',total:0,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-01 12:40:00'},
      {taskId:'R20260801-1200',taskType:'reconcile',station:'HN4 SOC',slotCode:'18:00-02:00',team:'Outbound',status:'done',total:6,scanned:6,extra:1,createdBy:'web',createdAtText:'2026-08-01 12:00:00'},
      {taskId:'R20260801-1130',taskType:'reconcile',station:'HN5 SOC',slotCode:'08:00-17:00',team:'Inbound',status:'open',total:5,scanned:3,extra:0,createdBy:'web',createdAtText:'2026-08-01 11:30:00'},
      {taskId:'R20260801-1100',taskType:'reconcile',station:'HN2 SOC',slotCode:'18:00-02:00',team:'Outbound',status:'open',total:4,scanned:2,extra:1,createdBy:'web',createdAtText:'2026-08-01 11:00:00'},
      {taskId:'M20260801-1030',taskType:'meal-move',station:'HN4 SOC',slotCode:'',team:'Outbound',status:'open',total:0,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-01 10:30:00'},
      {taskId:'R20260803-0900',taskType:'reconcile',station:'HN2 SOC',slotCode:'08:00-17:00',team:'Outbound',status:'open',total:5,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-03 09:00:00'},
      {taskId:'R20260803-0840',taskType:'reconcile',station:'HN4 SOC',slotCode:'13:00-22:00',team:'Inbound',status:'open',total:6,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-03 08:40:00'},
      {taskId:'R20260803-0820',taskType:'reconcile',station:'HN5 SOC',slotCode:'18:00-02:00',team:'Outbound',status:'open',total:4,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-03 08:20:00'},
      {taskId:'M20260803-0800',taskType:'meal-move',station:'HN3 SOC',slotCode:'',team:'Outbound',status:'open',total:0,scanned:0,extra:0,createdBy:'web',createdAtText:'2026-08-03 08:00:00'},
    ],
  };

  // 45 task bổ sung (tự sinh) — tổng 75 task để test phân trang 30 dòng/trang
  // taskId dạng R/M + ngày + giờ-phút; meal-move (Ra/Vào) không có ca (slotCode '')
  (function seedExtraTasks() {
    var stns = ['HN2 SOC', 'HN3 SOC', 'HN4 SOC', 'HN5 SOC'];
    var cas = ['08:00-17:00', '13:00-22:00', '18:00-02:00', '22:00-06:00'];
    var teams = ['Outbound', 'Inbound'];
    var extra = [];
    for (var i = 0; i < 45; i++) {
      var day = 20260803 - Math.floor(i / 25);
      var hh = 17 - (i % 18);
      var mm = (i * 13) % 60;
      var isMeal = (i % 6 === 3);
      var hhTxt = (hh < 10 ? '0' : '') + hh;
      var mmTxt = (mm < 10 ? '0' : '') + mm;
      extra.push({
        taskId: (isMeal ? 'M' : 'R') + day + '-' + hhTxt + mmTxt,
        taskType: isMeal ? 'meal-move' : 'reconcile',
        station: stns[i % 4],
        slotCode: isMeal ? '' : cas[i % 4],
        team: teams[i % 2],
        status: (i % 4 === 0) ? 'done' : 'open',
        total: 4 + (i % 3),
        scanned: (i % 4 === 0) ? 4 + (i % 3) : (i % 4),
        extra: (i % 4 === 0) ? (i % 3) : 0,
        createdBy: 'web',
        createdAtText: day + ' ' + hhTxt + ':' + mmTxt + ':00'
      });
    }
    MOCK_DATA.tasks = MOCK_DATA.tasks.concat(extra);
  })();

  // Log mẫu: 5 NV Outbound 08:00-17:00 (2 đã quét, 3 chưa — task ĐANG MỞ nên là '-') + 1 dư
  function buildLog(taskId) {
    var outbound = MOCK_DATA.staff.filter(function (s) { return s.slotCode === '08:00-17:00'; });
    var log = outbound.map(function (s, i) {
      var scanned = i < 2;
      return {
        taskId: taskId, staffId: s.staffId, staffName: s.staffName,
        slotCode: s.slotCode, station: s.station, team: s.team, workstation: s.workstation,
        agency: s.agency || '',
        timeRefText: '09:00:00',
        timeScanText: scanned ? (i === 0 ? '09:02:15' : '09:03:40') : '',
        timeScanEpoch: scanned ? 1783080000000 + i * 1000 : 0,  // sort key (khớp server)
        status: scanned ? 'Có mặt' : '-',
        dateText: '2026-08-01',  // ngày vào làm (StaffData Date) — khớp server yyyy-MM-dd
      };
    });
    // Dư mẫu: mã có trong StaffData nhưng KHÁC ca/team → hiện đủ thông tin NGAY (không chờ Kết Thúc)
    log.push({
      taskId: taskId, staffId: 'Ops129481', staffName: 'NV104', slotCode: '18:00-02:00',
      station: 'HN2 SOC', team: 'Inbound', workstation: 'IBReceiving', agency: 'GRG',
      timeRefText: '', timeScanText: '09:05:00', status: 'Dư',
    });
    return log;
  }

  function counters(log) {
    var c = { scanned: 0, absent: 0, extra: 0, out: 0 };
    log.forEach(function (r) {
      // Khớp server computeCounters: đếm theo timeScanText (không theo status text)
      var hasScan = !!(r.timeScan || r.timeScanText);
      if (r.status === 'Ra ngoài') { c.out++; return; }  // meal-move: đã Ra chưa Vào
      if (hasScan) c.scanned++;
      if (r.status === 'Dư') c.extra++;
      else if (!hasScan) c.absent++;
    });
    return c;
  }

  function delay(fn) { setTimeout(fn, 250); }

  // State per-task: mock PHẢI giữ log giữa các lần quét (giống prod đọc sheet thật).
  // Nếu buildLog lại mỗi lần → mất state → counters sai giữa các lần quét liên tiếp.
  var MOCK_LOGS = {};
  function getLog(taskId) {
    if (!MOCK_LOGS[taskId]) MOCK_LOGS[taskId] = buildLog(taskId);
    return MOCK_LOGS[taskId];
  }

  var handlers = {
    getMeta: function () {
      return { ok: true, appTitle: MOCK_DATA.meta.appTitle, labels: MOCK_DATA.meta.labels, tableHeaders: MOCK_DATA.meta.tableHeaders, currentUser: MOCK_CURRENT_USER };
    },
    getFilterOptions: function () {
      return {
        ok: true,
        stations: ['HN2 SOC'],
        slotCodes: ['08:00-17:00', '13:00-22:00', '18:00-02:00', '22:00-06:00'],
        teams: ['Inbound', 'Outbound'],
        dates: ['2026-08-01', '2026-08-02', '2026-08-03'],
      };
    },
    previewStaffApi: function (input) {
      // mock: dem NV khop bo loc — khop contract server previewStaffApi (chi count, khong sample)
      var count = 8;
      return { ok: true, count: count };
    },
    searchStaffApi: function (code) {
      // mock: tra cuu NV theo ma Ops + cac task da diem danh — khop contract server searchStaffApi
      var q = String(code || '').trim().toUpperCase();
      if (!q) return { ok: false, message: 'Nhập mã Ops để tìm' };
      var hit = null;
      MOCK_DATA.staff.forEach(function (s) { if (String(s.staffId).toUpperCase() === q) hit = s; });
      // Task ma NV nay da diem danh: log co timeScanText (reconcile / meal-move da Vao) hoac timeRaText (meal-move da Ra)
      var tasks = [];
      MOCK_DATA.tasks.forEach(function (t) {
        var log = getLog(t.taskId);
        var scanned = false;
        log.forEach(function (r) {
          if (!scanned && String(r.staffId).toUpperCase() === q && (r.timeScanText || r.timeRaText)) scanned = true;
        });
        if (scanned) {
          var c = counters(log);
          tasks.push(Object.assign({}, t, c, { total: log.length }));
        }
      });
      if (!hit && !tasks.length) return { ok: false, message: 'Không tìm thấy mã ' + q };
      return {
        ok: true,
        staff: hit ? { staffId: hit.staffId, staffName: hit.staffName, slotCode: hit.slotCode, team: hit.team, station: hit.station, workstation: hit.workstation } : null,
        tasks: tasks,
        taskCount: tasks.length,
      };
    },
    getTaskListApi: function () {
      return MOCK_DATA.tasks.slice();
    },
    getTaskDetailApi: function (taskId) {
      var task = null;
      MOCK_DATA.tasks.forEach(function (t) { if (t.taskId === taskId) task = t; });
      if (!task) return { ok: false, message: 'Không tìm thấy task', task: null, log: [] };
      var log = getLog(taskId);
      return { ok: true, task: task, log: log, counters: counters(log) };
    },
    createReconcileTaskApi: function (input) {
      var taskId = 'R' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-0' + (MOCK_DATA.tasks.length + 1);
      var task = {
        taskId: taskId, taskType: 'reconcile', station: input.station, slotCode: input.slotCode,
        team: input.team, date: (input && input.date) || '', status: 'open', createdBy: 'web', createdAtText: '2026-08-02 09:00:00',
        note: String((input && input.note) || ''),
      };
      MOCK_DATA.tasks.unshift(task);
      var log = getLog(taskId);
      return { ok: true, taskId: taskId, count: log.length, message: 'Tạo task thành công: ' + taskId };
    },
    updateTaskNoteApi: function (taskId, note) {
      var hit = null;
      MOCK_DATA.tasks.forEach(function (t) { if (t.taskId === taskId) hit = t; });
      if (!hit) return { ok: false, message: 'Không tìm thấy task' };
      hit.note = String(note || '').trim();
      return { ok: true, message: hit.note ? 'Đã lưu ghi chú' : 'Đã xoá ghi chú' };
    },
    createMealMoveTaskApi: function (input) {
      // 2026-08-08: khớp server mới — task Điểm danh Ra/Vào bắt buộc Station + Team
      var station = String((input && input.station) || '').trim();
      var team = Array.isArray(input && input.team) ? input.team.join(', ') : String((input && input.team) || '').trim();
      if (!station || !team) {
        return { ok: false, taskId: null, count: 0, message: 'Vui lòng chọn Station và Team để tạo task' };
      }
      var taskId = 'M' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-0' + (MOCK_DATA.tasks.length + 1);
      var task = {
        taskId: taskId, taskType: 'meal-move', station: station, slotCode: '',
        team: team, status: 'open', createdBy: MOCK_CURRENT_USER, createdAtText: '2026-08-02 09:00:00',
        note: String((input && input.note) || ''),
      };
      MOCK_DATA.tasks.unshift(task);
      return { ok: true, taskId: taskId, count: 0, message: 'Tạo task Điểm danh Ra/Vào: ' + taskId };
    },
    scanStaffApi: function (taskId, staffId) {
      var log = getLog(taskId);
      var hit = null;
      log.forEach(function (r) { if (r.staffId.toLowerCase() === staffId.toLowerCase()) hit = r; });
      var nowMs = Date.now();  // timeScanEpoch: sort key thật (QA sort "mới nhất lên đầu")
      var d = new Date(nowMs);
      var ts = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
      var info = null;
      if (hit && (hit.status === 'Có mặt' || hit.status === 'Dư' || hit.status === 'Ra ngoài')) {
        return { ok: false, message: 'Đã điểm danh', status: null, timeScanText: '', timeScanEpoch: 0, staffName: null, counters: counters(log) };
      }
      if (hit) { hit.status = 'Có mặt'; hit.timeScanText = ts; hit.timeScanEpoch = nowMs; }
      else {
        // NV lạ → tra StaffData: có thông tin thì điền ĐỦ NGAY (khớp server buildExtraRow
        // lookup staffIndex); không có → để trống. KHÔNG chờ Kết Thúc mới hiện thông tin.
        MOCK_DATA.staff.forEach(function (s) { if (s.staffId.toLowerCase() === staffId.toLowerCase()) info = s; });
        log.push({ taskId: taskId, staffId: staffId, staffName: info ? info.staffName : '',
          slotCode: info ? info.slotCode : '', station: info ? info.station : '',
          team: info ? info.team : '', workstation: info ? info.workstation : '',
          agency: info ? (info.agency || '') : '', timeRefText: '',
          timeScanText: ts, timeScanEpoch: nowMs, status: 'Dư' });
      }
      return {
        ok: true, message: hit ? 'Có mặt' : 'Dư', status: hit ? 'Có mặt' : 'Dư',
        timeScanText: ts, timeScanEpoch: nowMs,
        staffName: hit ? hit.staffName : (info ? info.staffName : ''),
        agency: info ? (info.agency || '') : '', slotCode: info ? (info.slotCode || '') : '',
        station: info ? (info.station || '') : '', team: info ? (info.team || '') : '',
        workstation: info ? (info.workstation || '') : '',
        counters: counters(log),
      };
    },
    pasteMealMoveScanApi: function (taskId, codes, mode) {
      // Mock của pasteMealMoveScan (server): ghi Ra/Vào hàng loạt; NV lạ append kèm
      // thông tin StaffData (hoặc trống). Khớp contract: { ok, message, summary, counters }.
      var list = Array.isArray(codes) ? codes : [];
      var log = getLog(taskId);
      var nowMs = Date.now();
      var d = new Date(nowMs);
      var ts = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
      var seen = {};
      var summary = { total: list.length, ra: 0, vao: 0, extra: 0, duplicate: 0, already: 0 };
      list.forEach(function (c) {
        var id = String(c || '').trim();
        if (!id) return;
        var key = id.toLowerCase();
        if (seen[key]) { summary.duplicate++; return; }
        seen[key] = true;
        var hit = null;
        log.forEach(function (r) { if (String(r.staffId || '').toLowerCase() === key) hit = r; });
        if (hit && (hit.status === 'Có mặt' || hit.status === 'Dư' || hit.status === 'Ra ngoài')) { summary.already++; return; }
        if (hit) {
          if (mode === 'ra') { hit.status = 'Ra ngoài'; hit.timeRaText = ts; hit.timeRaEpoch = nowMs; summary.ra++; }
          else { hit.status = 'Có mặt'; hit.timeScanText = ts; hit.timeScanEpoch = nowMs; summary.vao++; }
          return;
        }
        var info = null;
        MOCK_DATA.staff.forEach(function (s) { if (s.staffId.toLowerCase() === key) info = s; });
        log.push({
          taskId: taskId, staffId: id, staffName: info ? info.staffName : '',
          slotCode: info ? info.slotCode : '', station: info ? info.station : '',
          team: info ? info.team : '', workstation: info ? info.workstation : '',
          agency: info ? (info.agency || '') : '', timeRefText: '',
          timeRaText: mode === 'ra' ? ts : '', timeRaEpoch: mode === 'ra' ? nowMs : 0,
          timeScanText: mode === 'ra' ? '' : ts, timeScanEpoch: mode === 'ra' ? 0 : nowMs,
          status: mode === 'ra' ? 'Ra ngoài' : 'Dư',
        });
        if (mode === 'ra') summary.ra++; else summary.extra++;
      });
      return {
        ok: true,
        message: 'Đã ghi ' + summary.ra + ' Ra / ' + summary.vao + ' Vào / ' + summary.extra + ' Thừa — trùng ' + summary.duplicate + ', đã điểm danh ' + summary.already,
        summary: summary,
        counters: counters(log),
      };
    },
    completeTaskApi: function (taskId) {
      MOCK_DATA.tasks.forEach(function (t) { if (t.taskId === taskId) t.status = 'done'; });
      return { ok: true, message: 'Đã kết thúc task ' + taskId };
    },
  };

  // GAS thật: google.script.run.withSuccessHandler(h).withFailureHandler(e).fn(args)
  // → gọi theo CHAIN (handler gán trước, hàm gọi cuối).
  // Mock phải bắt chước đúng: MỖI chain có closure handler RIÊNG —
  // nếu dùng 1 object pending chung, 2 API gọi gần nhau (vd loadFilterOptions
  // + loadTaskList từ refreshAll) sẽ đè handler của nhau → dropdown trống.
  function makeRunner() {
    function makeChain() {
      var ok = null;
      var err = null;
      var proxy = {
        withSuccessHandler: function (h) { ok = h; return proxy; },
        withFailureHandler: function (h) { err = h; return proxy; },
      };
      Object.keys(handlers).forEach(function (name) {
        proxy[name] = function () {
          var args = Array.prototype.slice.call(arguments);
          delay(function () {
            try {
              var result = handlers[name].apply(null, args);
              if (ok) ok(result);
            } catch (e) {
              if (err) err(e);
              else throw e;
            }
          });
          return proxy;
        };
      });
      return proxy;
    }
    var run = {
      withSuccessHandler: function (h) { return makeChain().withSuccessHandler(h); },
      withFailureHandler: function (h) { return makeChain().withFailureHandler(h); },
    };
    // Cho phép gọi run.fn() trực tiếp không handler (chạy nhưng không làm gì)
    Object.keys(handlers).forEach(function (name) {
      run[name] = function () { return makeChain()[name].apply(null, arguments); };
    });
    return run;
  }

  var run = makeRunner();

  window.google = { script: { run: run } };
  console.log('[MOCK] google.script.run đã nạp — chế độ LOCAL, không gọi GAS thật');
})();
