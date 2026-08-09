/**
 * TaskSearch.gs — Logic THUẦN: tìm các task mà 1 mã NV đã từng điểm danh
 * (dùng cho ô tìm kiếm mã Ops ở header — lọc "Danh Sách Task").
 *
 * KHÔNG gọi GAS API — test được trên Node (`node --test tests/task-search.test.js`).
 * Code.gs (wrapper GAS) gọi hàm này sau khi đọc AttendanceLog từ Database.
 *
 * Cột sheet truyền qua `cols` (LOG_COLS từ Config.gs) — giữ module thuần,
 * không phụ thuộc Config/global (giống ScanLogic.gs).
 */

/**
 * Lọc AttendanceLog (mảng 2D thô, đã bỏ header) → danh sách taskId DUY NHẤT mà
 * staffCode đã từng điểm danh. "Đã điểm danh" = cột TIME_SCAN có giá trị
 * (reconcile đã quét / meal-move đã quét Vào) HOẶC cột TIME_RA có giá trị
 * (meal-move đã quét Ra — chưa Vào vẫn tính là đã điểm danh).
 * Dòng pre-fill khi tạo task (status '-', chưa quét) bị bỏ qua.
 *
 * @param {Array<Array>} logValues — getDataRange().getValues() đã slice(1) (bỏ header)
 * @param {string} staffCode — mã Ops (không phân biệt hoa/thường)
 * @param {Object} cols — LOG_COLS: cần { TASK_ID, STAFF_ID, TIME_SCAN, TIME_RA }
 * @returns {Array<string>} — taskId duy nhất, giữ thứ tự xuất hiện trong log
 */
function collectTaskIdsByStaffLog_(logValues, staffCode, cols) {
  const q = String(staffCode || '').trim().toUpperCase();
  if (!q || !logValues || !logValues.length) return [];
  const ids = [];
  const seen = {};
  for (let i = 0; i < logValues.length; i++) {
    const row = logValues[i] || [];
    const taskId = String(row[cols.TASK_ID] || '').trim();
    if (!taskId) continue;
    if (String(row[cols.STAFF_ID] || '').toUpperCase() !== q) continue;
    if (!row[cols.TIME_SCAN] && !row[cols.TIME_RA]) continue;  // chưa điểm danh (pre-fill '-')
    if (!seen[taskId]) { seen[taskId] = true; ids.push(taskId); }
  }
  return ids;
}

// GAS: hàm global (mọi .gs share scope). Node test: export qua module.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { collectTaskIdsByStaffLog_ };
}
