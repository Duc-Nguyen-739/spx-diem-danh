"""test_services — unittest cho api/services.py (port TaskService/ScanService).

Dùng FakeSheets giống test_database — test toàn luồng nghiệp vụ không cần Google.
Chạy: python3 -m unittest discover -s api -p 'test_*.py'
"""

import datetime
import unittest

from api import cache
from api import config
from api import database
from api import services

from api.test_database import FakeSheets, STAFF_HEADER, TASK_HEADER, LOG_HEADER


class TestServices(unittest.TestCase):
    def setUp(self):
        self.fake = FakeSheets()
        database.sheets = self.fake
        # services.sheets_log_values gọi trực tiếp api.sheets — patch về fake
        import api.sheets as sheets_mod
        sheets_mod.get_values = self.fake.get_values
        cache.clear_cache()
        self.t0 = datetime.datetime(2026, 8, 3, 9, 0, 0, tzinfo=datetime.timezone.utc)
        self.fake.set_sheet(config.SHEETS["STAFF_DATA"], [
            STAFF_HEADER,
            ['1', '2026-08-01', 'OPS001', 'NV A', '', '', 'FTE', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Outbound', 'HN2 SOC'],
            ['2', '2026-08-01', 'OPS002', 'NV B', '', '', 'BPO', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Outbound', 'HN2 SOC'],
            ['3', '2026-08-01', 'OPS003', 'NV C', '', '', 'OS', '', '', '', '', '', '', '', '', '', '18:00-02:00', '', 'Inbound', 'HN2 SOC'],
        ])
        self.fake.set_sheet(config.SHEETS["ATTENDANCE_TASK"], [TASK_HEADER])
        self.fake.set_sheet(config.SHEETS["ATTENDANCE_LOG"], [LOG_HEADER])

    def _create_task(self):
        r = services.create_reconcile_task({
            "station": "HN2 SOC", "slotCode": ["08:00-17:00"], "team": ["Outbound"],
            "contractType": ["FTE", "BPO"], "createdBy": "web", "note": "",
        })
        self.assertTrue(r["ok"], r.get("message"))
        return r["taskId"]

    def test_create_reconcile_task_prefills_log(self):
        task_id = self._create_task()
        self.assertTrue(task_id.startswith("R"))
        detail = services.get_task_detail(task_id)
        self.assertTrue(detail["ok"])
        self.assertEqual(len(detail["log"]), 2)  # OPS001 + OPS002 (Outbound 08:00-17:00)
        self.assertEqual(detail["counters"]["total"], 2)

    def test_scan_flow_present_duplicate_extra(self):
        task_id = self._create_task()
        r1 = services.scan_staff(task_id, "Ops001")
        self.assertTrue(r1["ok"])
        self.assertEqual(r1["status"], "Có mặt")
        r2 = services.scan_staff(task_id, "ops001")  # trùng
        self.assertFalse(r2["ok"])
        self.assertEqual(r2["message"], "Đã điểm danh")
        r3 = services.scan_staff(task_id, "OPS999")  # NV lạ → Dư
        self.assertTrue(r3["ok"])
        self.assertEqual(r3["status"], "Dư")
        detail = services.get_task_detail(task_id)
        statuses = {r["staffId"]: r["status"] for r in detail["log"]}
        self.assertEqual(statuses["OPS001"], "Có mặt")
        self.assertEqual(statuses["OPS999"], "Dư")

    def test_scan_invalid_format(self):
        task_id = self._create_task()
        r = services.scan_staff(task_id, "XYZ123")
        self.assertFalse(r["ok"])
        self.assertIn("Ops", r["message"])

    def test_scan_closed_task(self):
        task_id = self._create_task()
        services.complete_task(task_id)
        r = services.scan_staff(task_id, "OPS001")
        self.assertFalse(r["ok"])
        self.assertEqual(r["message"], "Task đã kết thúc")

    def test_complete_marks_absent(self):
        task_id = self._create_task()
        services.scan_staff(task_id, "OPS001")
        r = services.complete_task(task_id)
        self.assertTrue(r["ok"])
        detail = services.get_task_detail(task_id)
        statuses = {row["staffId"]: row["status"] for row in detail["log"]}
        self.assertEqual(statuses["OPS001"], "Có mặt")
        self.assertEqual(statuses["OPS002"], "Vắng")
        self.assertEqual(detail["task"]["status"], "done")

    def test_reopen_resets_absent(self):
        task_id = self._create_task()
        services.complete_task(task_id)
        r = services.reopen_task(task_id)
        self.assertTrue(r["ok"])
        detail = services.get_task_detail(task_id)
        self.assertEqual(detail["task"]["status"], "open")
        statuses = {row["staffId"]: row["status"] for row in detail["log"]}
        self.assertEqual(statuses["OPS002"], "-")

    def test_meal_move_ra_then_vao(self):
        r = services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001", "Ops002"], "createdBy": "creator@x",
        })
        self.assertTrue(r["ok"], r.get("message"))
        task_id = r["taskId"]
        self.assertTrue(task_id.startswith("M"))
        # rule 1.5s chống trùng (2026-08-17 giảm từ 10s): Ra → Vào cách 15 phút là hợp lệ
        r1 = services.scan_staff(task_id, "Ops001", "ra", now_override=self.t0)
        self.assertTrue(r1["ok"])
        self.assertEqual(r1["status"], "Ra ngoài")
        r2 = services.scan_staff(task_id, "Ops001", "vao", now_override=self.t0 + datetime.timedelta(minutes=15))
        self.assertTrue(r2["ok"], r2.get("message"))
        self.assertEqual(r2["status"], "Có mặt")
        self.assertEqual(r2["durationMinutes"], 15)

    def test_paste_meal_move_scan(self):
        services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001"], "createdBy": "creator@x",
        })
        task_id = services.list_tasks()[0]["taskId"]
        r = services.paste_meal_move_scan(task_id, ["Ops001", "Ops002", "OPS999"], "ra", now_override=self.t0)
        self.assertTrue(r["ok"], r.get("message"))
        self.assertEqual(r["summary"]["ra"], 3)  # cả 3 ghi Ra (kể cả NV lạ)
        r2 = services.paste_meal_move_scan(task_id, ["Ops001"], "vao", now_override=self.t0 + datetime.timedelta(minutes=15))
        self.assertTrue(r2["ok"], r2.get("message"))
        self.assertEqual(r2["summary"]["vao"], 1)

    def test_meal_move_append_unknown_staff(self):
        # Regression: nhánh append meal-move từng crash NameError 'now' (chỉ có now_dt).
        r = services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001"], "createdBy": "creator@x",
        })
        self.assertTrue(r["ok"], r.get("message"))
        task_id = r["taskId"]
        r1 = services.scan_staff(task_id, "OPS999", "ra", now_override=self.t0)
        self.assertTrue(r1["ok"], r1.get("message"))
        self.assertEqual(r1["status"], "Ra ngoài")
        self.assertEqual(r1["scanPhase"], "ra")
        self.assertGreater(r1["timeRaEpoch"], 0)
        r2 = services.scan_staff(task_id, "OPS998", "vao", now_override=self.t0 + datetime.timedelta(minutes=5))
        self.assertTrue(r2["ok"], r2.get("message"))
        self.assertEqual(r2["status"], "Dư")
        self.assertEqual(r2["scanPhase"], "vao")
        self.assertGreater(r2["timeScanEpoch"], 0)
        detail = services.get_task_detail(task_id)
        statuses = {row["staffId"]: row["status"] for row in detail["log"]}
        self.assertEqual(statuses["OPS999"], "Ra ngoài")
        self.assertEqual(statuses["OPS998"], "Dư")

    def test_meal_move_paste_short_row_ra(self):
        # Regression: paste 'ra' cho NV lạ đã quét Vào (row log NGẮN — Sheets API xén
        # cell rỗng cuối) từng văng IndexError ở batch_meal_move_log_updates.
        r = services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001"], "createdBy": "creator@x",
        })
        self.assertTrue(r["ok"], r.get("message"))
        task_id = r["taskId"]
        services.scan_staff(task_id, "OPS999", "vao", now_override=self.t0)
        rows = self.fake.sheets[config.SHEETS["ATTENDANCE_LOG"]]
        rows[-1] = rows[-1][:10]  # mô phỏng Sheets API trả row ngắn (chỉ tới STATUS idx 9)
        r2 = services.paste_meal_move_scan(task_id, ["OPS999"], "ra", now_override=self.t0 + datetime.timedelta(minutes=10))
        self.assertTrue(r2["ok"], r2.get("message"))
        self.assertEqual(r2["summary"]["ra"], 1)

    def test_filter_options_contract_types(self):
        opts = services.get_filter_options()
        self.assertEqual(opts["contractTypes"], ["BPO", "FTE", "OS"])
        self.assertEqual(opts["stations"], ["HN2 SOC"])

    def test_search_staff(self):
        task_id = self._create_task()
        services.scan_staff(task_id, "OPS001")
        r = services.search_staff("Ops001")
        self.assertTrue(r["ok"])
        self.assertEqual(r["staff"]["staffName"], "NV A")
        self.assertGreaterEqual(r["taskCount"], 1)
        r2 = services.search_staff("OPS999")
        self.assertFalse(r2["ok"])

    def test_get_staff_index_compact(self):
        idx = services.get_staff_index()
        self.assertEqual(idx["count"], 3)
        self.assertIn("OPS001", idx["staff"])
        self.assertEqual(idx["staff"]["OPS001"]["staffName"], "NV A")


if __name__ == "__main__":
    unittest.main()
