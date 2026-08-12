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
    """Mô phỏng api/sheets: get_values/update_values/append_values trên dict rows."""

    def __init__(self):
        self.sheets = {}
        self._seq = 0

    def set_sheet(self, name, rows):
        self.sheets[name] = [list(r) for r in rows]

    def get_values(self, sheet_name, range_=None, unformatted=True):
        return [list(r) for r in self.sheets.get(sheet_name, [])]

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
        data.extend([list(r) for r in rows])
        return len(rows)


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


if __name__ == "__main__":
    unittest.main()
