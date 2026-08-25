"""test_main — unittest cho api/main.py (HTTP protocol JSONP/JSON + whitelist).

Dùng FakeSheets như test_services — test end-to-end: event → response body đúng
định dạng shim google.script.run (JsonpApi.gs) mong đợi.
Chạy: python3 -m unittest discover -s api -p 'test_*.py'
"""

import json
import os
import unittest

from api import cache
from api import config
from api import database
from api import main

from api.test_database import FakeSheets, STAFF_HEADER, TASK_HEADER, LOG_HEADER


class TestMain(unittest.TestCase):
    def setUp(self):
        self.fake = FakeSheets()
        database.sheets = self.fake
        import api.sheets as sheets_mod
        sheets_mod.get_values = self.fake.get_values
        cache.clear_cache()
        self.fake.set_sheet(config.SHEETS["STAFF_DATA"], [
            STAFF_HEADER,
            ['1', '2026-08-01', 'OPS001', 'NV A', '', '', 'FTE', '', '', '', '', '', '', '', '', '', '08:00-17:00', '', 'Outbound', 'HN2 SOC'],
        ])
        self.fake.set_sheet(config.SHEETS["ATTENDANCE_TASK"], [TASK_HEADER])
        self.fake.set_sheet(config.SHEETS["ATTENDANCE_LOG"], [LOG_HEADER])

    def _event(self, action, args=None, cb=None):
        qs = {"action": action}
        if args is not None:
            qs["args"] = json.dumps(args)
        if cb:
            qs["cb"] = cb
        return {"queryStringParameters": qs}

    def _json(self, resp):
        return json.loads(resp["body"])

    def test_get_meta_json(self):
        resp = main.handler(self._event("getMeta"))
        self.assertEqual(resp["statusCode"], 200)
        self.assertIn("application/json", resp["headers"]["Content-Type"])
        data = self._json(resp)
        self.assertTrue(data["ok"])
        self.assertEqual(data["result"]["appTitle"], "Điểm Danh HN2 SOC")  # 2026-08-20: khớp Config.gs

    def test_jsonp_format(self):
        resp = main.handler(self._event("getMeta", cb="__rcJsonp1_123"))
        self.assertIn("text/javascript", resp["headers"]["Content-Type"])
        self.assertTrue(resp["body"].startswith("__rcJsonp1_123("))
        self.assertTrue(resp["body"].endswith(");"))
        # body phải parse được phần JSON
        inner = resp["body"][resp["body"].index("(") + 1:resp["body"].rindex(")")]
        data = json.loads(inner)
        self.assertTrue(data["ok"])

    def test_cb_sanitize(self):
        resp = main.handler(self._event("getMeta", cb="alert(1);x"))
        self.assertTrue(resp["body"].startswith("callback("), "cb nguy hiểm → fallback callback")

    def test_cb_sanitize_matches_gas(self):
        """2026-08-24: unify regex với JsonpApi.gs — GAS chặt hơn (cấm số đầu/$/proto).
        Python trước /^[A-Za-z0-9_$.]+$/ cho phép '1a', '$.x', '__proto__' → lệch + prototype pollution."""
        cases_ok = [
            "cb", "_cb", "cb1", "cb.obj", "myApp.scan.callback", "a.b.c",
        ]
        cases_block = [
            "1cb", "1.cb",          # số đầu — GAS cấm
            "$.ajax", "a.$b", "a.b$",  # $ — GAS cấm
            "__proto__", "a.__proto__", "constructor", "a.constructor", "prototype", "a.prototype",
            "", " ", "alert(1)", "cb;evil", "cb..x", ".cb", "cb.", "cb .x",
        ]
        for cb in cases_ok:
            self.assertEqual(main.sanitize_callback(cb), cb, f"cb hợp lệ {cb!r} phải giữ nguyên")
        for cb in cases_block:
            self.assertEqual(main.sanitize_callback(cb), "callback", f"cb nguy hiểm {cb!r} phải fallback")

    def test_unknown_action(self):
        resp = main.handler(self._event("deleteEverything"))
        data = self._json(resp)
        self.assertFalse(data["ok"])
        self.assertIn("Unknown action", data["error"])

    def test_dispatch_exception_generic_message(self):
        """A3 (2026-08-23): hàm throw → client nhận message chung, KHÔNG leak str(e)."""
        from unittest import mock
        saved = dict(main.API_ACTIONS)
        main.API_ACTIONS["boom"] = (main._bad_request, 0)
        try:
            resp = main.handler(self._event("boom"))
            data = self._json(resp)
        finally:
            main.API_ACTIONS.clear()
            main.API_ACTIONS.update(saved)
        self.assertFalse(data["ok"])
        self.assertNotIn("secret", data["error"])
        self.assertNotIn("/home/", data["error"])
        self.assertIn("Lỗi hệ thống", data["error"])

    def test_create_task_end_to_end(self):
        resp = main.handler(self._event("createReconcileTaskApi", [{
            "station": "HN2 SOC", "slotCode": ["08:00-17:00"], "team": ["Outbound"],
            "contractType": ["FTE"], "createdBy": "web", "note": "",
        }]))
        data = self._json(resp)
        self.assertTrue(data["ok"], data.get("error"))
        self.assertTrue(data["result"]["ok"])
        task_id = data["result"]["taskId"]

        resp2 = main.handler(self._event("getTaskDetailApi", [task_id]))
        detail = self._json(resp2)["result"]
        self.assertTrue(detail["ok"])
        self.assertEqual(detail["counters"]["total"], 1)

        resp3 = main.handler(self._event("scanStaffApi", [task_id, "Ops001", ""]))
        scan = self._json(resp3)["result"]
        self.assertTrue(scan["ok"])
        self.assertEqual(scan["status"], "Có mặt")

    def test_post_json_body(self):
        body = json.dumps({"action": "getTaskListApi", "args": []})
        resp = main.handler({"body": body})
        data = self._json(resp)
        self.assertTrue(data["ok"])
        self.assertIsInstance(data["result"], list)

    def test_probe(self):
        resp = main.handler(self._event("probe"))
        data = self._json(resp)
        self.assertTrue(data["ok"])
        self.assertEqual(data["result"]["staffRows"], 1)

    # NEW-1 (2026-08-19): auth token tùy chọn — env ROLLCALL_API_TOKEN bắt buộc
    # mọi action kèm token (query `token=` hoặc body JSON), sai → 401 trước dispatch.
    def _with_token_env(self, token):
        self._saved_token_env = os.environ.get("ROLLCALL_API_TOKEN")
        os.environ.pop("ROLLCALL_API_TOKEN", None)
        if token:
            os.environ["ROLLCALL_API_TOKEN"] = token
        self.addCleanup(self._restore_token_env)

    def _restore_token_env(self):
        if self._saved_token_env is None:
            os.environ.pop("ROLLCALL_API_TOKEN", None)
        else:
            os.environ["ROLLCALL_API_TOKEN"] = self._saved_token_env

    def test_no_token_env_open(self):
        resp = main.handler(self._event("getMeta"))
        self.assertEqual(resp["statusCode"], 200)

    def test_token_env_requires_correct_token(self):
        self._with_token_env("sekret")
        for params in ({"action": "getMeta"}, {"action": "getMeta", "token": "wrong"}):
            resp = main.handler({"queryStringParameters": params})
            self.assertEqual(resp["statusCode"], 401)
            self.assertIn("Unauthorized", resp["body"])

    def test_token_env_accepts_query_and_body_token(self):
        self._with_token_env("sekret")
        # P1-3 (2026-08-25): cb + token sai → 200 cb({error}) để JSONP không treo, không còn 401 JSON thuần
        resp = main.handler(self._event("getMeta", cb="__rcJsonp1_123"))
        self.assertEqual(resp["statusCode"], 200)
        self.assertIn("text/javascript", resp["headers"]["Content-Type"])
        self.assertIn("Unauthorized", resp["body"])
        # không cb + token sai → 401 JSON thuần
        resp_401 = main.handler(self._event("getMeta"))
        self.assertEqual(resp_401["statusCode"], 401)
        qs = {"action": "getMeta", "token": "sekret"}
        resp2 = main.handler({"queryStringParameters": qs})
        self.assertEqual(resp2["statusCode"], 200)
        self.assertTrue(self._json(resp2)["ok"])
        body = json.dumps({"action": "getMeta", "args": [], "token": "sekret"})
        resp3 = main.handler({"body": body})
        self.assertEqual(resp3["statusCode"], 200)
        self.assertTrue(self._json(resp3)["ok"])


if __name__ == "__main__":
    unittest.main()
