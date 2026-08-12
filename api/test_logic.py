"""test_logic — unittest cho logic đã port từ GAS (api/csvutil.py + api/scanlogic.py).

Chạy: python3 -m unittest discover -s api -p 'test_*.py'
Mirror các kỳ vọng trong tests JS (scan-classify / csv-normalize / meal-move).
"""

import datetime
import unittest

from api import config
from api import csvutil
from api import scanlogic

CFG = {
    "STATUS": config.STATUS,
    "TASK_STATUS": config.TASK_STATUS,
    "DUPLICATE_WINDOW_MS": config.DUPLICATE_WINDOW_MS,
}


class TestNormalize(unittest.TestCase):
    def test_staff_id_trim_upper(self):
        self.assertEqual(csvutil.normalize_staff_id("  ops229444 "), "OPS229444")

    def test_staff_name_collapse_spaces(self):
        self.assertEqual(csvutil.normalize_staff_name("Đào  Quang  Hà"), "Đào Quang Hà")

    def test_is_valid_barcode(self):
        self.assertTrue(csvutil.is_valid_barcode_id("Ops229444"))
        self.assertFalse(csvutil.is_valid_barcode_id("XYZ123"))
        self.assertFalse(csvutil.is_valid_barcode_id(""))

    def test_normalize_date_forms(self):
        self.assertEqual(csvutil.normalize_staff_date("8/1/2026"), "2026-01-08")
        self.assertEqual(csvutil.normalize_staff_date("26-07-2026"), "2026-07-26")
        self.assertEqual(csvutil.normalize_staff_date("2026-01-08"), "2026-01-08")
        d = datetime.datetime(2026, 8, 3)
        self.assertEqual(csvutil.normalize_staff_date(d), "2026-08-03")
        self.assertEqual(csvutil.normalize_staff_date(None), "")
        self.assertEqual(csvutil.normalize_staff_date(""), "")


class TestCsvParse(unittest.TestCase):
    def test_split_quoted(self):
        self.assertEqual(csvutil.split_csv_line('a,"b,c",d'), ["a", "b,c", "d"])
        self.assertEqual(csvutil.split_csv_line('a,"x""y"'), ["a", 'x"y'])

    def test_parse_csv_to_staff(self):
        csv_text = (
            'No.,Date,Staff ID,Staff Name,Staff Email,Agency,Contract Type\n'
            '1,8/1/2026,Ops237511,Đào  Quang  Hà,,GRG,FTE\n'
            '2,8/1/2026,ops229444,NV003,,GRG,BPO\n'
        )
        rows = csvutil.parse_csv_to_staff(csv_text)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["staffId"], "OPS237511")
        self.assertEqual(rows[0]["staffName"], "Đào Quang Hà")
        self.assertEqual(rows[0]["contractType"], "FTE")
        self.assertEqual(rows[1]["staffId"], "OPS229444")
        # GAS parseCsvToStaff KHÔNG normalize date (chỉ staffId/staffName) — giữ nguyên text
        self.assertEqual(rows[1]["date"], "8/1/2026")


class TestStaffIndexAndFilter(unittest.TestCase):
    HEADER = ['No.', 'Date', 'Staff ID', 'Staff Name', 'Staff Email', 'Agency', 'Contract Type',
              'Event ID', 'Matching Type', 'Gender', 'Department', 'Clock In Time', 'Clock Out Time',
              'Actual Hours', 'Clock In Remark', 'Clock Out Remark', 'Slot Code', 'Workstation',
              'Team', 'Station']

    def rows(self):
        return [
            self.HEADER,
            ['1', '2026-08-01', 'OPS001', 'NV A', '', '', 'FTE', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Outbound', 'HN2 SOC'],
            ['2', '2026-08-01', 'OPS002', 'NV B', '', '', 'BPO', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Outbound', 'HN2 SOC'],
            ['3', '2026-08-01', 'OPS003', 'NV C', '', '', 'FTE', '', '', '', '', '', '', '', '', '', '18:00-02:00', '', 'Inbound', 'HN2 SOC'],
            ['4', '2026-08-01', 'OPS004', 'NV D', '', '', 'OS', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Inbound', 'HN3 SOC'],
        ]

    def test_build_staff_list(self):
        staff = csvutil.build_staff_list_from_values(self.rows())
        self.assertEqual(len(staff), 4)
        self.assertEqual(staff[0]["contractType"], "FTE")
        self.assertEqual(staff[0]["date"], "2026-08-01")

    def test_build_staff_index_last_wins(self):
        rows = self.rows()
        rows.append(['5', '2026-08-01', 'OPS001', 'NV A MỚI', '', '', 'OS', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Outbound', 'HN2 SOC'])
        idx = csvutil.build_staff_index(rows)
        self.assertEqual(idx["OPS001"]["staffName"], "NV A MỚI")

    def test_filter_by_group(self):
        staff = csvutil.build_staff_list_from_values(self.rows())
        out = csvutil.filter_staff_by_group(staff, {"station": "HN2 SOC", "slotCode": ["08:00-17:00"], "team": ["Outbound"], "contractType": ["FTE"]})
        self.assertEqual([s["staffId"] for s in out], ["OPS001"])

    def test_filter_contract_types_from_column(self):
        staff = csvutil.build_staff_list_from_values(self.rows())
        self.assertEqual(csvutil.distinct_values(staff, "contractType"), ["BPO", "FTE", "OS"])
        self.assertEqual(csvutil.distinct_values(staff, "station"), ["HN2 SOC", "HN3 SOC"])

    def test_dedupe_keep_first(self):
        rows = self.rows()
        rows.append(['5', '2026-08-01', 'OPS001', 'NV A DUP', '', '', 'FTE', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Outbound', 'HN2 SOC'])
        staff = csvutil.build_staff_list_from_values(rows)
        deduped = csvutil.dedupe_staff_by_group(staff)
        names = [s["staffId"] for s in deduped]
        self.assertEqual(names.count("OPS001"), 1, "dedupe phải giữ 1 dòng")


class TestScanClassify(unittest.TestCase):
    def task(self, status="open"):
        return {"taskId": "R1", "status": status}

    def log(self):
        return [
            {"taskId": "R1", "staffId": "OPS001", "timeScanEpoch": 0, "timeRaEpoch": 0, "status": "-"},
            {"taskId": "R1", "staffId": "OPS002", "timeScanEpoch": 1783080000000, "timeRaEpoch": 0, "status": "Có mặt"},
        ]

    def test_closed_task_reject(self):
        r = scanlogic.classify_scan(CFG, self.task("done"), self.log(), "OPS003")
        self.assertEqual(r["reason"], "task-closed")

    def test_update_pending(self):
        r = scanlogic.classify_scan(CFG, self.task(), self.log(), "OPS001")
        self.assertEqual(r["action"], "update")
        self.assertEqual(r["status"], "Có mặt")

    def test_already_scanned(self):
        r = scanlogic.classify_scan(CFG, self.task(), self.log(), "OPS002")
        self.assertEqual(r["reason"], "already-scanned")

    def test_append_extra(self):
        r = scanlogic.classify_scan(CFG, self.task(), self.log(), "OPS999")
        self.assertEqual(r["action"], "append")
        self.assertEqual(r["status"], "Dư")

    def test_empty_staff_id(self):
        r = scanlogic.classify_scan(CFG, self.task(), self.log(), "")
        self.assertEqual(r["reason"], "empty-staff-id")


class TestCounters(unittest.TestCase):
    def test_counters(self):
        log = [
            {"status": "-", "timeScanEpoch": 0},
            {"status": "Có mặt", "timeScanEpoch": 1},
            {"status": "Dư", "timeScanEpoch": 2},
            {"status": "Ra ngoài", "timeScanEpoch": 0, "timeRaEpoch": 1},
        ]
        c = scanlogic.compute_counters(CFG, log)
        self.assertEqual(c["scanned"], 2)
        self.assertEqual(c["absent"], 1)
        self.assertEqual(c["extra"], 1)
        self.assertEqual(c["out"], 1)
        self.assertEqual(c["total"], 4)


class TestMealMove(unittest.TestCase):
    def task(self):
        return {"taskId": "M1", "status": "open", "taskType": "meal-move"}

    def log_ra(self):
        return [
            {"taskId": "M1", "staffId": "OPS001", "timeRaEpoch": 1783080000000, "timeScanEpoch": 0, "status": "Ra ngoài"},
            {"taskId": "M1", "staffId": "OPS002", "timeRaEpoch": 1783080000000, "timeScanEpoch": 1783083600000, "status": "Có mặt"},
        ]

    def test_ra_first(self):
        r = scanlogic.classify_meal_move_scan(CFG, self.task(), [], "OPS999", "ra", now_ms=1783080000000)
        self.assertEqual(r["action"], "append")
        self.assertEqual(r["status"], "Ra ngoài")
        self.assertEqual(r["scanPhase"], "ra")

    def test_ra_then_vao_present(self):
        r = scanlogic.classify_meal_move_scan(CFG, self.task(), self.log_ra(), "OPS001", "vao", now_ms=1783083600000)
        self.assertEqual(r["action"], "update")
        self.assertEqual(r["status"], "Có mặt")
        self.assertEqual(r["scanPhase"], "vao")

    def test_vao_without_ra_extra(self):
        log = [{"taskId": "M1", "staffId": "OPS003", "timeRaEpoch": 0, "timeScanEpoch": 0, "status": "-"}]
        r = scanlogic.classify_meal_move_scan(CFG, self.task(), log, "OPS003", "vao", now_ms=1783083600000)
        self.assertEqual(r["status"], "Dư")

    def test_duplicate_window(self):
        r = scanlogic.classify_meal_move_scan(CFG, self.task(), [], "OPS999", "ra", now_ms=1783080000000 + 3000)
        # vừa ghi Ra 3s trước (sim bằng log có timeRaEpoch gần)
        log = [{"taskId": "M1", "staffId": "OPS999", "timeRaEpoch": 1783080000000, "timeScanEpoch": 0, "status": "Ra ngoài"}]
        r2 = scanlogic.classify_meal_move_scan(CFG, self.task(), log, "OPS999", "ra", now_ms=1783080000000 + 3000)
        self.assertEqual(r2["reason"], "duplicate")

    def test_already_full(self):
        r = scanlogic.classify_meal_move_scan(CFG, self.task(), self.log_ra(), "OPS002", "ra", now_ms=1783087200000)
        self.assertEqual(r["reason"], "already-scanned")

    def test_build_meal_extra_ra(self):
        now = datetime.datetime(2026, 8, 3, 9, 0, 0, tzinfo=datetime.timezone.utc)
        # ScanService gọi với status OUT khi append Ra (khớp GAS)
        row = scanlogic.build_meal_move_extra_row(CFG, "M1", "OPS999", None, "ra", now, config.STATUS["OUT"])
        self.assertEqual(row["timeRaEpoch"], int(now.timestamp() * 1000))
        self.assertEqual(row["timeScanEpoch"], 0)
        self.assertEqual(row["status"], "Ra ngoài")
        # mặc định (không truyền status) = EXTRA như GAS


if __name__ == "__main__":
    unittest.main()
