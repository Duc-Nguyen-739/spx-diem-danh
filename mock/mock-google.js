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
      { staffId: 'Ops237511', staffName: 'NV001', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBLoading', cardIn: '20:15', cardOut: '06:20' },
      { staffId: 'Ops196935', staffName: 'NV002', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBLoading', cardIn: '20:18', cardOut: '06:25' },
      { staffId: 'Ops229444', staffName: 'NV003', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBLoading', cardIn: '20:22', cardOut: '06:30' },
      { staffId: 'Ops110512', staffName: 'NV004', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBHandover', cardIn: '20:25', cardOut: '06:35' },
      { staffId: 'Ops124563', staffName: 'NV005', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'Outbound', workstation: 'OBHandover', cardIn: '20:28', cardOut: '' },
      { staffId: 'Ops129481', staffName: 'NV104', slotCode: '18:00-02:00', station: 'HN2 SOC', team: 'Inbound', workstation: 'IBReceiving', cardIn: '06:10', cardOut: '14:20' },
      { staffId: 'Ops126503', staffName: 'NV105', slotCode: '18:00-02:00', station: 'HN2 SOC', team: 'Inbound', workstation: 'IBReceiving', cardIn: '06:12', cardOut: '14:22' },
      { staffId: 'Ops133754', staffName: 'NV020', slotCode: '22:00-06:00', station: 'HN2 SOC', team: 'Inbound', workstation: 'IBMove', cardIn: '10:15', cardOut: '18:19' },
    ],
    tasks: [
      { taskId: 'R20260802-0900', taskType: 'reconcile', station: 'HN2 SOC', slotCode: '08:00-17:00', team: 'Outbound', status: 'open', createdBy: 'web', createdAtText: '2026-08-02 09:00:00' },
      { taskId: 'R20260802-0850', taskType: 'reconcile', station: 'HN2 SOC', slotCode: '18:00-02:00', team: 'Inbound', status: 'done', createdBy: 'web', createdAtText: '2026-08-02 08:50:00' },
      { taskId: 'M20260802-0905', taskType: 'meal-move', station: 'HN2 SOC', slotCode: '08:00-17:00', team: 'Outbound', status: 'open', createdBy: 'web', createdAtText: '2026-08-02 09:05:00' },
    ],
  };

  // Log mẫu: 5 NV Outbound 08:00-17:00 (2 đã quét, 3 chưa — task ĐANG MỞ nên là '-') + 1 dư
  function buildLog(taskId) {
    var outbound = MOCK_DATA.staff.filter(function (s) { return s.slotCode === '08:00-17:00'; });
    var log = outbound.map(function (s, i) {
      var scanned = i < 2;
      return {
        taskId: taskId, staffId: s.staffId, staffName: s.staffName,
        slotCode: s.slotCode, station: s.station, team: s.team, workstation: s.workstation,
        timeRefText: '09:00:00',
        timeScanText: scanned ? (i === 0 ? '09:02:15' : '09:03:40') : '',
        timeScanEpoch: scanned ? 1783080000000 + i * 1000 : 0,  // sort key (khớp server)
        status: scanned ? 'Có mặt' : '-',
        dateText: '2026-08-01',  // ngày vào làm (StaffData Date) — khớp server yyyy-MM-dd
      };
    });
    log.push({
      taskId: taskId, staffId: 'Ops999999', staffName: 'NV-DU', slotCode: '', station: '', team: '',
      workstation: '', timeRefText: '', timeScanText: '09:05:00', status: 'Dư',
    });
    return log;
  }

  function counters(log) {
    var c = { scanned: 0, absent: 0, extra: 0 };
    log.forEach(function (r) {
      // Khớp server computeCounters: đếm theo timeScanText (không theo status text)
      var hasScan = !!(r.timeScan || r.timeScanText);
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
      return { ok: true, appTitle: MOCK_DATA.meta.appTitle, labels: MOCK_DATA.meta.labels, tableHeaders: MOCK_DATA.meta.tableHeaders };
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
        team: team, status: 'open', createdBy: 'web', createdAtText: '2026-08-02 09:00:00',
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
      if (hit && (hit.status === 'Có mặt' || hit.status === 'Dư')) {
        return { ok: false, message: 'Đã điểm danh', status: null, timeScanText: '', timeScanEpoch: 0, staffName: null, counters: counters(log) };
      }
      if (hit) { hit.status = 'Có mặt'; hit.timeScanText = ts; hit.timeScanEpoch = nowMs; }
      else { log.push({ taskId: taskId, staffId: staffId, staffName: 'NV LẠ', slotCode: '', station: '', team: '', workstation: '', timeRefText: '', timeScanText: ts, timeScanEpoch: nowMs, status: 'Dư' }); }
      return { ok: true, message: 'Có mặt', status: 'Có mặt', timeScanText: ts, timeScanEpoch: nowMs, staffName: hit ? hit.staffName : 'NV LẠ', counters: counters(log) };
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
