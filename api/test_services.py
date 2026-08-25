"""test_services — unittest cho api/services.py (port TaskService/ScanService).

Dùng FakeSheets giống test_database — test toàn luồng nghiệp vụ không cần Google.
Chạy: python3 -m unittest discover -s api -p 'test_*.py'
"""

import datetime
import os
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

    def test_transfer_present_list_to_meal_move(self):
        # A4 (2026-08-19): 1 RPC gộp tạo task Ra/Vào + đóng task cũ (trước 2 RPC riêng
        # → cửa sổ giữa 2 RPC fail → NV trùng 2 task). Server giữ 1 lock cho cả 2 bước.
        task_id = self._create_task()
        r0 = services.scan_staff(task_id, "OPS001", now_override=self.t0)  # OPS001 Có mặt
        self.assertTrue(r0["ok"], r0.get("message"))
        present = [r for r in services.get_task_detail(task_id)["log"] if r["status"] == "Có mặt"]
        self.assertEqual([p["staffId"] for p in present], ["OPS001"])
        time_ra_by_staff = {p["staffId"]: p["timeScanEpoch"] for p in present}
        r = services.transfer_present_list_to_meal_move(
            {
                "station": "HN2 SOC", "team": ["Outbound"],
                "staffIds": [p["staffId"] for p in present],
                "timeRaByStaff": time_ra_by_staff, "createdBy": "web",
            },
            task_id,
        )
        self.assertTrue(r["ok"], r.get("message"))
        new_id = r["taskId"]
        self.assertTrue(new_id.startswith("M"))
        # Task cũ ĐÃ ĐÓNG + NV chưa quét thành Vắng
        old_detail = services.get_task_detail(task_id)
        self.assertEqual(old_detail["task"]["status"], "done")
        old_statuses = {row["staffId"]: row["status"] for row in old_detail["log"]}
        self.assertEqual(old_statuses["OPS001"], "Có mặt")
        self.assertEqual(old_statuses["OPS002"], "Vắng")
        # Task mới: NV Có mặt → pre-fill "Giờ Ra" = "Giờ điểm danh" + status OUT
        # (khớp GAS createMealMoveTaskCore_ — trước Python tạo PENDING + giờ Ra trống)
        new_detail = services.get_task_detail(new_id)
        self.assertEqual(len(new_detail["log"]), 1)
        row = new_detail["log"][0]
        self.assertEqual(row["staffId"], "OPS001")
        self.assertEqual(row["status"], "Ra ngoài")
        self.assertEqual(row["timeRaEpoch"], time_ra_by_staff["OPS001"])

    def test_transfer_old_task_closed_rejected(self):
        task_id = self._create_task()
        services.complete_task(task_id)
        r = services.transfer_present_list_to_meal_move(
            {"station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["OPS001"]}, task_id)
        self.assertFalse(r["ok"])
        self.assertIn("không chuyển", r["message"])

    def test_transfer_unknown_old_task(self):
        r = services.transfer_present_list_to_meal_move(
            {"station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["OPS001"]}, "R-NOPE")
        self.assertFalse(r["ok"])

    def test_transfer_create_fail_no_side_effect(self):
        # Thiếu Station/Team → task cũ KHÔNG bị đóng
        task_id = self._create_task()
        r = services.transfer_present_list_to_meal_move(
            {"station": "", "team": [], "staffIds": ["OPS001"]}, task_id)
        self.assertFalse(r["ok"])
        self.assertIsNone(r["taskId"])
        detail = services.get_task_detail(task_id)
        self.assertEqual(detail["task"]["status"], "open", "task cũ không bị đóng khi tạo task mới fail")

    def test_meal_move_vao_before_ra_duration_not_negative(self):
        # B1 (2026-08-19): quét Vào trước Ra (bù) — durationMinutes sau reload phải
        # clamp 0, KHÔNG âm (timeScan < timeRa → round ra số âm).
        r = services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001"], "createdBy": "creator@x",
        })
        task_id = r["taskId"]
        services.scan_staff(task_id, "Ops001", "vao", now_override=self.t0)
        services.scan_staff(task_id, "Ops001", "ra", now_override=self.t0 + datetime.timedelta(minutes=5))
        detail = services.get_task_detail(task_id)
        row = detail["log"][0]
        self.assertEqual(row["status"], "Có mặt")
        self.assertGreaterEqual(row["durationMinutes"], 0, "duration không được âm")
        self.assertEqual(row["durationMinutes"], 0)

    def test_meal_move_response_duration_consistent_with_read_path(self):
        # P2 (2026-08-19): response scan_staff phải KHỚP read path (get_task_detail).
        # Bù flow: Vào t0 → Ra t0+5ph — response scan Ra (scanPhase 'ra') trả
        # durationMinutes=0; read path clamp 0. Nếu sau này response tính khác →
        # client hiện khác reload → test này bắt.
        r = services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001"], "createdBy": "creator@x",
        })
        task_id = r["taskId"]
        services.scan_staff(task_id, "Ops001", "vao", now_override=self.t0)
        r2 = services.scan_staff(task_id, "Ops001", "ra", now_override=self.t0 + datetime.timedelta(minutes=5))
        self.assertTrue(r2["ok"], r2.get("message"))
        self.assertEqual(r2["durationMinutes"], 0, "response bù flow phải 0 (Ra sau Vào)")
        row = services.get_task_detail(task_id)["log"][0]
        self.assertEqual(r2["durationMinutes"], row["durationMinutes"],
                         "response và read path phải khớp — nếu lệch client hiện sai tới khi reload")

    def test_scan_response_duration_clamped_halfup_source(self):
        # P2 (2026-08-19): clamp max(0) trong response scan_staff — khớp read path
        # (database.py B1). Rule duplicate 1.5s đảm bảo now >= ra_epoch + 1.5s nên
        # không reachable âm qua API → source check (convention static GAS tests).
        # 2026-08-20 (review #2): response phải dùng floor(x+0.5) (half-up khớp GAS
        # Math.round + read path) — round() banker's (round(2.5)=2) làm response
        # lệch reload.
        with open(os.path.join(os.path.dirname(__file__), "services.py"), encoding="utf-8") as f:
            src = f.read()
        i = src.find('floor((time_scan_epoch - result["row"]["timeRaEpoch"]) / 60000 + 0.5)')
        self.assertGreaterEqual(i, 0, "phải có công thức duration_minutes ở response (floor+0.5)")
        line_start = src.rfind("\n", 0, i)
        line = src[line_start:src.find("\n", i)]
        self.assertIn("max(0, math.floor(", line,
                      "response phải clamp max(0, ...) — read path đã clamp (database.py B1)")

    def test_meal_move_response_duration_halfup_matches_read_path(self):
        # 2026-08-20 (review #2): response scan Vào phải KHỚP read path cho mọi
        # duration lẻ .5 phút. round() banker's (round(2.5)=2) vs floor(x+0.5)
        # (2.5→3) → response hiện "2" nhưng reload hiện "3" — regression bắt lệch.
        r = services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001"], "createdBy": "creator@x",
        })
        task_id = r["taskId"]
        services.scan_staff(task_id, "Ops001", "ra", now_override=self.t0)
        r2 = services.scan_staff(task_id, "Ops001", "vao",
                                 now_override=self.t0 + datetime.timedelta(minutes=2, seconds=30))
        self.assertTrue(r2["ok"], r2.get("message"))
        self.assertEqual(r2["durationMinutes"], 3, "2m30s phải half-up thành 3, không phải 2")
        row = services.get_task_detail(task_id)["log"][0]
        self.assertEqual(r2["durationMinutes"], row["durationMinutes"],
                         "response và read path phải khớp cho duration .5 phút")

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

    def test_meal_move_duration_rounds_not_floors(self):
        # 2026-08-19: khớp GAS Math.round — 15m30s = 16 phút, KHÔNG floor xuống 15
        r = services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001"], "createdBy": "creator@x",
        })
        task_id = r["taskId"]
        services.scan_staff(task_id, "Ops001", "ra", now_override=self.t0)
        r2 = services.scan_staff(task_id, "Ops001", "vao",
                                 now_override=self.t0 + datetime.timedelta(minutes=15, seconds=30))
        self.assertTrue(r2["ok"], r2.get("message"))
        self.assertEqual(r2["durationMinutes"], 16)

    def test_paste_meal_move_scan(self):
        services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001"], "createdBy": "creator@x",
        })
        _res = services.list_tasks()
        task_id = (_res["tasks"] if isinstance(_res, dict) else _res)[0]["taskId"]
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

    def test_meal_move_ra_after_vao_present(self):
        # Regression: quét Ra cho NV đã có Vào (quên Ra lúc đi) → Có mặt, không phải
        # Ra ngoài; counters detail == list (trước đây OUT → detail out:1, list scanned:1).
        r = services.create_meal_move_task({
            "station": "HN2 SOC", "team": ["Outbound"], "staffIds": ["Ops001"], "createdBy": "creator@x",
        })
        self.assertTrue(r["ok"], r.get("message"))
        task_id = r["taskId"]
        vao = services.scan_staff(task_id, "Ops001", "vao", now_override=self.t0)
        self.assertEqual(vao["status"], "Dư")
        ra = services.scan_staff(task_id, "Ops001", "ra", now_override=self.t0 + datetime.timedelta(minutes=10))
        self.assertTrue(ra["ok"], ra.get("message"))
        self.assertEqual(ra["status"], "Có mặt")
        self.assertEqual(ra["scanPhase"], "ra")
        self.assertGreater(ra["timeRaEpoch"], 0)
        detail = services.get_task_detail(task_id)
        row = detail["log"][0]
        self.assertEqual(row["status"], "Có mặt")
        self.assertTrue(row.get("timeScanText"))
        self.assertTrue(row.get("timeRaText"))
        self.assertEqual(detail["counters"]["scanned"], 1)
        self.assertEqual(detail["counters"]["out"], 0)
        _lst_res = services.list_tasks()
        lst = (_lst_res["tasks"] if isinstance(_lst_res, dict) else _lst_res)[0]
        self.assertEqual(lst["scanned"], 1)

    def test_resolve_meal_move_mode_anyone_can_ra(self):
        # Yêu cầu 2026-08-19: bỏ giới hạn createdBy — mọi người quét 'ra' được
        # (khớp GAS resolveMealMoveMode_ — không session check).
        task = {"createdBy": "admin@spxexpress.com"}
        self.assertEqual(services.resolve_meal_move_mode(task, "ra"), "ra")
        self.assertEqual(services.resolve_meal_move_mode(task, "vao"), "vao")
        self.assertEqual(services.resolve_meal_move_mode(None, "ra"), "vao")
        self.assertEqual(services.resolve_meal_move_mode({}, "ra"), "vao")

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

    def test_task_detail_after_scan_no_sheet_log_read(self):
        # O5 (2026-08-20): detail rebuild từ TASK/LOG_ROWS cache (incremental) — sau
        # scan KHÔNG đọc lại full sheet (trước mỗi miss detail đọc lại cả AttendanceLog
        # + AttendanceTask → log phình → càng chậm).
        task_id = self._create_task()
        services.scan_staff(task_id, "OPS001")
        calls = []
        orig = self.fake.get_values
        def counting(sheet_name, *a, **k):
            calls.append(sheet_name)
            return orig(sheet_name, *a, **k)
        self.fake.get_values = counting
        detail = services.get_task_detail(task_id)
        self.assertTrue(detail["ok"])
        self.assertEqual(detail["log"][0]["status"], "Có mặt")
        self.assertNotIn(config.SHEETS["ATTENDANCE_LOG"], calls,
                         "detail phải build từ LOG_ROWS cache — không đọc lại sheet log")
        self.assertNotIn(config.SHEETS["ATTENDANCE_TASK"], calls,
                         "detail phải build từ TASK cache — không đọc lại sheet task")
        self.assertFalse(any("_rowIndex" in r for r in detail["log"]), "detail không chứa _rowIndex")
        # scan kế vẫn phải còn _rowIndex trong LOG_ROWS cache (detail copy không đụng cache)
        r = services.scan_staff(task_id, "OPS002")
        self.assertTrue(r["ok"], r.get("message"))
        self.assertEqual(r["status"], "Có mặt")

    def test_task_detail_delta_poll_unchanged(self):
        # O-A (2026-08-20): get_task_detail nhận client_sig — khớp → trả unchanged (~40B)
        # thay vì full log mỗi chu kỳ poll 3s (task lớn = 40-90KB/chu kỳ lãng phí).
        task_id = self._create_task()
        detail = services.get_task_detail(task_id)
        self.assertTrue(detail["ok"])
        sig = services.compute_detail_sig(detail)
        self.assertIsInstance(sig, str)
        self.assertTrue(sig, "detail có log → signature không rỗng")
        # gửi đúng sig → unchanged
        out = services.get_task_detail(task_id, sig)
        self.assertTrue(out.get("unchanged"), "sig khớp → phải trả unchanged")
        self.assertNotIn("task", out, "unchanged → không gửi full detail")
        # đổi sig (giả lập có ghi từ thiết bị khác) → trả full
        out2 = services.get_task_detail(task_id, "sig-khac")
        self.assertFalse(out2.get("unchanged"))
        self.assertIn("task", out2, "sig khác → phải gửi full detail")
        # không gửi sig → luôn full (backward compat loadTaskDetail)
        out3 = services.get_task_detail(task_id)
        self.assertIn("task", out3)

    def test_task_list_delta_poll_unchanged(self):
        # O-A (2026-08-20): list_tasks nhận client_sig — khớp → unchanged thay full list.
        # (list rỗng → sig "" falsy → server trả full — behavior đúng, cần task để sig khác rỗng)
        # P2-11: luôn {ok, tasks} khi có dữ liệu
        self._create_task()
        res = services.list_tasks()
        self.assertIsInstance(res, dict)
        self.assertIn("tasks", res)
        tasks = res["tasks"]
        self.assertIsInstance(tasks, list)
        sig = services.compute_task_list_sig(tasks)
        self.assertTrue(sig, "có task → signature không rỗng")
        out = services.list_tasks(sig)
        self.assertTrue(out.get("unchanged"), "sig khớp → phải trả unchanged")
        out2 = services.list_tasks("sig-khac")
        self.assertIsInstance(out2, dict, "sig khác → trả {ok, tasks}")
        self.assertIn("tasks", out2)
        self.assertEqual(out2["tasks"][0]["taskId"], tasks[0]["taskId"])

    def test_detail_sig_field_scope(self):
        # O-A: sig phải BAO PHỦ mọi field render — status/counters/log row đổi đều đổi sig
        # (thiếu field → client không nhận ra đổi → stale).
        base = {"task": {"status": "open"}, "counters": {"scanned": 1, "absent": 0, "extra": 0, "out": 0},
                "log": [{"staffId": "OPS001", "status": "Có mặt", "timeScanEpoch": 1000, "timeRaEpoch": 0}]}
        mutate = [
            ("status", {"task": {"status": "done"}}),
            ("scanned", {"counters": {"scanned": 2, "absent": 0, "extra": 0, "out": 0}}),
            ("absent", {"counters": {"scanned": 1, "absent": 1, "extra": 0, "out": 0}}),
            ("out", {"counters": {"scanned": 1, "absent": 0, "extra": 0, "out": 1}}),
            ("extra", {"counters": {"scanned": 1, "absent": 0, "extra": 1, "out": 0}}),
            ("staffId", {"log": [{"staffId": "OPS002", "status": "Có mặt", "timeScanEpoch": 1000, "timeRaEpoch": 0}]}),
            ("timeScanEpoch", {"log": [{"staffId": "OPS001", "status": "Có mặt", "timeScanEpoch": 5000, "timeRaEpoch": 0}]}),
            ("status row", {"log": [{"staffId": "OPS001", "status": "Vắng", "timeScanEpoch": 1000, "timeRaEpoch": 0}]}),
        ]
        base_sig = services.compute_detail_sig(base)
        for name, patch in mutate:
            d = {"task": dict(base["task"]), "counters": dict(base["counters"]), "log": [dict(r) for r in base["log"]]}
            d.update(patch)
            self.assertNotEqual(services.compute_detail_sig(d), base_sig, f"đổi {name} → sig phải đổi")

    def test_make_task_id_has_milliseconds(self):
        """B2 (2026-08-24): taskId có millisecond — 2 kiosk tạo CÙNG GIÂY vẫn khác ID
        (tránh vòng suffix -2/-3 tốn RPC read_task trong lock). Format R+8-12 số."""
        tid = services.make_task_id()
        self.assertTrue(tid.startswith("R"), tid)
        body = tid[1:]
        self.assertEqual(len(body), 18, f"{tid} — yyyyMMdd-HHMMSSmmm = 8+1+9 ký tự")
        date_part, time_part = body.split("-")
        self.assertEqual(len(time_part), 9, f"phần giờ phải có ms (6+3): {tid}")
        # 2 lần gọi cùng datetime (cùng giây, khác ms) → KHÔNG trùng
        base = datetime.datetime(2026, 8, 24, 14, 30, 15, tzinfo=cache._TZ)
        t1 = services.make_task_id(base.replace(microsecond=123000))
        t2 = services.make_task_id(base.replace(microsecond=456000))
        self.assertNotEqual(t1, t2, "cùng giây khác ms → ID phải khác")
        self.assertEqual(t1[:16], t2[:16], "cùng giây → cùng phần giây")


if __name__ == "__main__":
    unittest.main()
