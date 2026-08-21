"""test_database — unittest cho api/database.py (port Database.gs) + api/cache.py.

Dùng FakeSheets (in-memory) thay Google Sheets API — test logic đọc/ghi + cache.
Chạy: python3 -m unittest discover -s api -p 'test_*.py'
"""

import datetime
import unittest

from api import cache
from api import config
from api import csvutil
from api import database


class FakeSheets:
    """Mô phỏng api/sheets: get_values/update_values/append_values trên dict rows.
    Hỗ trợ range A1 notation ('A2:A', 'I2:J', 'A2', 'A2:M5') cho get_values —
    giả lập đúng sheets.get_values(range_=...) mà database.py dùng (G1 2026-08-21)."""

    def __init__(self):
        self.sheets = {}
        self._seq = 0

    def set_sheet(self, name, rows):
        self.sheets[name] = [list(r) for r in rows]

    @staticmethod
    def _parse_col(letters):
        """'A' → 1, 'B' → 2, ..., 'AA' → 27."""
        n = 0
        for ch in letters.upper():
            n = n * 26 + (ord(ch) - ord("A") + 1)
        return n

    @staticmethod
    def _parse_a1(range_):
        """'A2:A' → (start_row, end_row, start_col, end_col); None/'' → (1, None, 1, None)."""
        if not range_:
            return (1, None, 1, None)
        rng = range_.replace("'", "").split("!")[-1]
        if ":" in rng:
            a, b = rng.split(":", 1)
        else:
            a = rng
            b = None
        import re
        m = re.match(r"([A-Z]+)(\d*)", a)
        if not m:
            return (1, None, 1, None)
        start_col = FakeSheets._parse_col(m.group(1))
        start_row = int(m.group(2)) if m.group(2) else 1
        end_col, end_row = None, None
        if b:
            m2 = re.match(r"([A-Z]+)(\d*)", b)
            if m2:
                end_col = FakeSheets._parse_col(m2.group(1))
                end_row = int(m2.group(2)) if m2.group(2) else None
        return (start_row, end_row, start_col, end_col)

    def get_values(self, sheet_name, range_=None, unformatted=True):
        """Trả mảng 2D. range_=None → toàn bộ sheet; A1 notation → slice cột/dòng."""
        data = self.sheets.get(sheet_name, [])
        if not range_:
            return [list(r) for r in data]
        start_row, end_row, start_col, end_col = self._parse_a1(range_)
        if end_row is None:
            end_row = len(data)
        out = []
        for r in range(start_row - 1, min(end_row, len(data))):
            row = data[r]
            out.append(list(row[start_col - 1:end_col]))
        return out

    def update_values(self, sheet_name, start_row, start_col, rows):
        data = self.sheets.setdefault(sheet_name, [])
        for i, vals in enumerate(rows):
            r = start_row - 1 + i
            while len(data) <= r:
                data.append([])
            for j, v in enumerate(vals):
                c = start_col - 1 + j
                while len(data[r]) <= c:
                    data[r].append("")
                data[r][c] = v
        return len(rows)

    def append_values(self, sheet_name, rows):
        data = self.sheets.setdefault(sheet_name, [])
        start = len(data) + 1  # 1-based start row (khớp sheets.append_values thật)
        data.extend([list(r) for r in rows])
        return start

    def set_number_format(self, sheet_name, start_row, start_col, num_rows, num_cols, fmt):
        # number format là hiển thị (cosmetic) — fake chỉ cần tồn tại method
        return None


STAFF_HEADER = ['No.', 'Date', 'Staff ID', 'Staff Name', 'Staff Email', 'Agency', 'Contract Type',
                'Event ID', 'Matching Type', 'Gender', 'Department', 'Clock In Time', 'Clock Out Time',
                'Actual Hours', 'Clock In Remark', 'Clock Out Remark', 'Slot Code', 'Workstation',
                'Team', 'Station']

TASK_HEADER = ['taskId', 'taskType', 'station', 'slotCode', 'team', 'status', 'createdAt', 'createdBy', 'completedAt', 'note']
LOG_HEADER = ['taskId', 'staffId', 'staffName', 'slotCode', 'station', 'team', 'workstation',
              'timeRef', 'timeScan', 'status', 'date', 'timeRa', 'agency']


class TestCacheHelpers(unittest.TestCase):
    def test_serial_to_datetime(self):
        # serial 46204.5 = 2026-07-01 12:00 (UTC+7 — khớp spreadsheet TZ)
        dt = cache.to_datetime(46204.5)
        self.assertIsNotNone(dt)
        self.assertEqual(dt.strftime("%Y-%m-%d"), "2026-07-01")
        self.assertEqual(dt.strftime("%H:%M:%S"), "12:00:00")

    def test_iso_string_to_datetime(self):
        dt = cache.to_datetime("2026-08-03 09:00:00")
        self.assertIsNotNone(dt)
        self.assertEqual(cache.to_iso_cell(dt), "2026-08-03 09:00:00")

    def test_epoch_ms(self):
        dt = datetime.datetime(2026, 8, 3, 1, 0, 0, tzinfo=datetime.timezone.utc)
        self.assertEqual(cache.epoch_ms(dt), int(dt.timestamp() * 1000))

    def test_to_display_date_string(self):
        self.assertEqual(cache.to_display_date("8/1/2026"), "2026-01-08")

    def test_time_only_string(self):
        """#8: legacy '09:02:15' string → 1899-12-30 epoch, không phải None."""
        dt = cache.to_datetime("09:02:15")
        self.assertIsNotNone(dt, "09:02:15 phải parse được, không phải None")
        self.assertEqual(dt.strftime("%H:%M:%S"), "09:02:15")
        self.assertEqual(dt.year, 1899, "base 1899-12-30 consistent với serial 0.xxx")
        self.assertGreater(cache.epoch_ms(dt), -3000000000000, "epoch âm nhưng hợp lệ cho duration calc")
        self.assertEqual(cache.format_time(dt), "09:02:15")


class TestDatabase(unittest.TestCase):
    def setUp(self):
        self.fake = FakeSheets()
        database.sheets = self.fake  # thay module sheets bằng fake
        cache.clear_cache()
        self.fake.set_sheet(config.SHEETS["STAFF_DATA"], [
            STAFF_HEADER,
            ['1', '2026-08-01', 'OPS001', 'NV A', '', '', 'FTE', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Outbound', 'HN2 SOC'],
            ['2', '2026-08-01', 'OPS002', 'NV B', '', '', 'BPO', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Outbound', 'HN2 SOC'],
        ])
        self.fake.set_sheet(config.SHEETS["ATTENDANCE_TASK"], [TASK_HEADER])
        self.fake.set_sheet(config.SHEETS["ATTENDANCE_LOG"], [LOG_HEADER])

    def test_read_staff_list(self):
        staff = database.read_staff_list()
        self.assertEqual(len(staff), 2)
        self.assertEqual(staff[0]["staffId"], "OPS001")
        self.assertEqual(staff[0]["contractType"], "FTE")
        # cache: đọc lại không chạm sheet (đếm lần gọi)
        before = len(self.fake.sheets[config.SHEETS["STAFF_DATA"]])
        database.read_staff_list()
        self.assertEqual(len(self.fake.sheets[config.SHEETS["STAFF_DATA"]]), before)

    def test_read_staff_index(self):
        idx = database.read_staff_index()
        self.assertIn("OPS001", idx)
        self.assertEqual(idx["OPS001"]["staffName"], "NV A")

    def test_insert_and_read_task(self):
        now = datetime.datetime(2026, 8, 3, 9, 0, 0, tzinfo=datetime.timezone.utc)
        database.insert_task({
            "taskId": "R20260803-0900", "taskType": "reconcile", "station": "HN2 SOC",
            "slotCode": "08:00-17:00", "team": "Outbound", "status": "open",
            "createdAt": now, "createdBy": "web", "completedAt": None, "note": "",
        })
        task = database.read_task("R20260803-0900")
        self.assertEqual(task["status"], "open")
        self.assertEqual(task["createdAtText"], "2026-08-03 16:00:00")  # UTC → +7
        tasks = database.read_task_list()
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["taskId"], "R20260803-0900")

    def test_batch_insert_log_and_scan(self):
        now = datetime.datetime(2026, 8, 3, 9, 0, 0, tzinfo=datetime.timezone.utc)
        staff = csvutil.filter_staff_by_group(database.read_staff_list(), {
            "station": "HN2 SOC", "slotCode": ["08:00-17:00"], "team": ["Outbound"],
        })
        self.assertEqual(len(staff), 2)
        n = database.batch_insert_log_rows("R1", staff, now)
        self.assertEqual(n, 2)
        rows = database.read_log_rows("R1")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["status"], "-")
        # scan NV đầu
        decision = {"action": "update", "status": config.STATUS["PRESENT"], "row": rows[0]}
        database.update_log_row_scan(rows[0], now, decision["status"])
        after = database.read_log_rows("R1")
        self.assertEqual(after[0]["status"], "Có mặt")
        self.assertGreater(after[0]["timeScanEpoch"], 0)

    def test_mark_absent_and_reset(self):
        now = datetime.datetime(2026, 8, 3, 9, 0, 0, tzinfo=datetime.timezone.utc)
        staff = csvutil.filter_staff_by_group(database.read_staff_list(), {
            "station": "HN2 SOC", "slotCode": ["08:00-17:00"], "team": ["Outbound"],
        })
        database.batch_insert_log_rows("R1", staff, now)
        rows = database.read_log_rows("R1")
        database.update_log_row_scan(rows[0], now, config.STATUS["PRESENT"])
        n = database.mark_unscanned_absent("R1", "reconcile")
        self.assertEqual(n, 1)  # dòng 2 chưa quét → Vắng
        after = database.read_log_rows("R1")
        statuses = {r["staffId"]: r["status"] for r in after}
        self.assertEqual(statuses["OPS001"], "Có mặt")
        self.assertEqual(statuses["OPS002"], "Vắng")
        # reopen: Vắng → pending
        m = database.reset_absent_to_pending("R1")
        self.assertEqual(m, 1)
        after2 = database.read_log_rows("R1")
        self.assertEqual({r["staffId"]: r["status"] for r in after2}["OPS002"], "-")

    def test_update_task_status_two_columns(self):
        now = datetime.datetime(2026, 8, 3, 9, 0, 0, tzinfo=datetime.timezone.utc)
        database.insert_task({
            "taskId": "R1", "taskType": "reconcile", "station": "HN2 SOC", "slotCode": "08:00-17:00",
            "team": "Outbound", "status": "open", "createdAt": now, "createdBy": "web",
            "completedAt": None, "note": "",
        })
        task = database.read_task("R1")
        database.update_task_status("R1", "done", now, task["_rowIndex"])
        data = self.fake.sheets[config.SHEETS["ATTENDANCE_TASK"]]
        # P0 fix: status ở cột 6, completedAt ở cột 9 — createdAt (cột 7) KHÔNG bị đè
        self.assertEqual(data[1][config.TASK_COLS["STATUS"]], "done")
        self.assertNotEqual(data[1][config.TASK_COLS["CREATED_AT"]], "")
        self.assertNotEqual(data[1][config.TASK_COLS["COMPLETED_AT"]], "")

    def test_batch_meal_move_updates(self):
        now = datetime.datetime(2026, 8, 3, 9, 0, 0, tzinfo=datetime.timezone.utc)
        staff = csvutil.filter_staff_by_group(database.read_staff_list(), {
            "station": "HN2 SOC", "slotCode": ["08:00-17:00"], "team": ["Outbound"],
        })
        database.batch_insert_log_rows("M1", staff, now)
        rows = database.read_log_rows("M1")
        updates = [{"_rowIndex": rows[0]["_rowIndex"], "status": config.STATUS["OUT"], "timeRa": now}]
        n = database.batch_meal_move_log_updates("M1", updates)
        self.assertEqual(n, 1)
        after = database.read_log_rows("M1")
        self.assertEqual(after[0]["status"], "Ra ngoài")
        self.assertGreater(after[0]["timeRaEpoch"], 0)

    def test_transform_g1_scattered(self):
        """#4 G1: 50 dòng rời xen task khác — chỉ dòng khớp đổi STATUS, không ghi cả cột."""
        now = datetime.datetime(2026, 8, 3, 9, 0, 0, tzinfo=datetime.timezone.utc)
        # 50 dòng R1 + 20 dòng R2 xen kẽ
        rows = []
        for i in range(50):
            rows.append(['R1', f'OPS{i:03d}', f'NV{i}', '', '', '', '', '', '', '-', '', '', ''])
            if i % 3 == 0:
                rows.append(['R2', f'OPX{i:03d}', f'NVX{i}', '', '', '', '', '', '', '-', '', '', ''])
        self.fake.set_sheet(config.SHEETS["ATTENDANCE_LOG"], [LOG_HEADER] + rows)
        cache.clear_cache()
        n = database.mark_unscanned_absent("R1", "reconcile")
        self.assertEqual(n, 50, "chỉ 50 dòng R1 '-' → Vắng, R2 giữ nguyên")
        # Verify R2 không bị đổi
        all_rows = self.fake.sheets[config.SHEETS["ATTENDANCE_LOG"]]
        for r in all_rows[1:]:
            if r[0] == 'R2':
                self.assertEqual(r[9], '-', "R2 không bị đánh Vắng nhầm")
            if r[0] == 'R1':
                self.assertEqual(r[9], 'Vắng')

    def test_sheets_updated_range_regex(self):
        """#20: sheets.append_values regex handle '!A1' lẫn '!A5:M6'."""
        import re
        pat = r"!([A-Z]+)(\d+)(?::[A-Z]+(\d+))?$"
        cases = [
            ("'AttendanceLog'!A5:M6", 2, 5),
            ("'AttendanceLog'!A1:M1", 1, 1),
            ("'AttendanceLog'!A1", 1, 1),
            ("'My Sheet'!A10:M12", 3, 10),
            ("", 1, 0),
        ]
        for updated, ln, expected in cases:
            m = re.search(pat, updated)
            start = int(m.group(3) or m.group(2)) - ln + 1 if m else 0
            self.assertEqual(start, expected, f"updated={updated!r} len={ln}")
        # old regex fails single-cell
        old_pat = r"!([A-Z]+)(\d+):[A-Z]+(\d+)$"
        m_old = re.search(old_pat, "'AttendanceLog'!A1")
        self.assertIsNone(m_old, "old regex không match single-cell → bug #20")


if __name__ == "__main__":
    unittest.main()
