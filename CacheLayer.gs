/**
 * CacheLayer.gs — Cache wrapper + timezone + format Date (tách từ Database.gs 2026-08-11).
 *
 * CHỈ chứa: cache_(), cachedJson_(), getTimeZone_(), formatTime_(), formatDateTime_(),
 * formatDateShort_() — các hàm GAS API thuần (CacheService/Session/Utilities), KHÔNG
 * business logic. Database.gs gọi các hàm này như trước (GAS share global scope —
 * mọi .gs cùng 1 không gian hàm).
 *
 * Patterns (v1 lesson, giữ nguyên từ Database.gs):
 * - Cache version-key (CACHE_KEYS.*) để invalidate dễ
 * - Timezone cache 1 lần — KHÔNG gọi Session.getScriptTimeZone() trong loop
 * - cachedJson_ luôn fallback: cache hỏng/put fail → rebuild + log, không fail-open
 */

// ===== Cache wrapper =====

function cache_() {
  return CacheService.getScriptCache();
}

/**
 * Đọc/ghi JSON cache theo key (version-key).
 * @param {string} key
 * @param {Function} load — trả về value khi cache miss
 * @param {number} ttlSeconds
 */
function cachedJson_(key, load, ttlSeconds) {
  const cached = cache_().get(key);
  if (cached !== null) {
    try { return JSON.parse(cached); }
    catch (e) { Logger.log('cache parse fail: ' + key + ' — ' + e.message); }  // F8: cache hỏng → rebuild, log để biết nếu lặp
  }
  const value = load();
  try { cache_().put(key, JSON.stringify(value), ttlSeconds); }
  catch (e) { Logger.log('cache put fail: ' + key + ' — ' + e.message); }  // F3: put >100KB/entry throw — log để biết cache đang miss âm thầm
  return value;
}

/**
 * cachedJson_ có version-check — cho key bị invalidate THƯỜNG XUYÊN (TASK_LIST,
 * TASK_COUNTS all). Scan chỉ bump rev key (1 put nhỏ) thay vì remove() — value
 * sống tiếp nên poll thiết bị khác vẫn HIT (bỏ rebuild full-sheet mỗi lượt khi
 * ≥3 thiết bị poll 3s). Value lưu {v: rev, d: data}; rev lệch/mất → rebuild.
 * Self-heal: rev key chưa tồn tại (deploy đầu tiên / hết hạn) → tạo '1'.
 */
function cachedJsonRev_(key, revKey, load, ttlSeconds) {
  const cached = cache_().get(key);
  if (cached !== null) {
    try {
      const parsed = JSON.parse(cached);
      const rev = cache_().get(revKey);
      if (rev !== null && String(parsed.v) === rev) return parsed.d;
    } catch (e) { Logger.log('cache parse fail: ' + key + ' — ' + e.message); }
  }
  const value = load();
  try {
    let rev = cache_().get(revKey);
    if (rev === null) { rev = '1'; cache_().put(revKey, rev, ttlSeconds); }
    cache_().put(key, JSON.stringify({ v: rev, d: value }), ttlSeconds);
  } catch (e) { Logger.log('cache put fail: ' + key + ' — ' + e.message); }
  return value;
}

/** Bump version key — invalidate "nhẹ" (1 put), KHÔNG remove value (xem cachedJsonRev_). */
function bumpCacheRev_(revKey) {
  try {
    const cur = cache_().get(revKey);
    cache_().put(revKey, String((cur === null ? 0 : parseInt(cur, 10) || 0) + 1), CACHE_TTL.TASK_LIST);
  } catch (e) { Logger.log('bumpCacheRev_ fail: ' + revKey + ' — ' + e.message); }
}

/** Cache timezone 1 lần (tránh gọi trong loop). */
function getTimeZone_() {
  return cachedJson_(CACHE_KEYS.TZ, function () {
    return Session.getScriptTimeZone();
  }, CACHE_TTL.TZ);
}

/** Format Date theo timezone script — dùng cho hiển thị/ghi cột giờ. */
function formatTime_(date) {
  if (!date) return '';
  return Utilities.formatDate(date, getTimeZone_(), 'HH:mm:ss');
}

/** P2: format có ngày (dd/MM HH:mm:ss) — danh sách task nhiều ngày phân biệt được. */
function formatDateTime_(date) {
  if (!date) return '';
  // yyyy-MM-dd HH:mm:ss (đủ năm — task list Tạo lúc/Kết thúc); trước là dd/MM thiếu
  // năm → "30/12 12:48" gây nhầm (bug 2026-07-29). Giờ quét (formatTime_) vẫn HH:mm:ss.
  return Utilities.formatDate(date, getTimeZone_(), 'yyyy-MM-dd HH:mm:ss');
}

/** Date = ngày vào làm (StaffData) — format yyyy-MM-dd (ISO — sort string đúng thứ tự). */
function formatDateShort_(date) {
  if (!date) return '';
  // Ủy quyền cho normalizeStaffDate_ (CsvUtil) — xử lý cả Date object thật (dữ liệu
  // cũ trong sheet: "Mon Aug 03 2026 00:00:00 GMT+0700") lẫn string "8/1/2026".
  // 1 nguồn sự thật — tránh 2 bộ regex lệch nhau.
  return normalizeStaffDate_(date);
}

// ===== Node test support (GAS bỏ qua) =====
// Nạp cùng Config.gs (CACHE_KEYS/CACHE_TTL) trong vm sandbox có mock GAS
// (CacheService/Session/Utilities) — xem tests/cache-layer.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cache_: cache_,
    cachedJson_: cachedJson_,
    cachedJsonRev_: cachedJsonRev_,
    bumpCacheRev_: bumpCacheRev_,
    getTimeZone_: getTimeZone_,
    formatTime_: formatTime_,
    formatDateTime_: formatDateTime_,
    formatDateShort_: formatDateShort_,
  };
}
