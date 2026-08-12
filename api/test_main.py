"""test_main — unittest cho api/main.py (HTTP protocol JSONP/JSON + whitelist).

Dùng FakeSheets như test_services — test end-to-end: event → response body đúng
định dạng shim google.script.run (JsonpApi.gs) mong đợi.
Chạy: python3 -m unittest discover -s api -p 'test_*.py'
"""

import json
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
        self.assertEqual(data["result"]["appTitle"], "Điểm danh kho")

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

    def test_unknown_action(self):
        resp = main.handler(self._event("deleteEverything"))
        data = self._json(resp)
        self.assertFalse(data["ok"])
        self.assertIn("Unknown action", data["error"])

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


if __name__ == "__main__":
    unittest.main()
