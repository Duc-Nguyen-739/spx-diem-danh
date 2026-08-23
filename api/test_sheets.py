"""test_sheets — unittest cho api/sheets.py (Google Sheets client)."""

import unittest
from unittest import mock


class TestSheetsService(unittest.TestCase):
    """C3 (2026-08-23): socket timeout + retry khi tạo service."""

    @mock.patch("api.sheets._load_credentials")
    @mock.patch("googleapiclient.discovery.build")
    def test_get_service_has_timeout_and_retries(self, mock_build, mock_creds):
        """get_service phải truyền httplib2.Http(timeout=30) + num_retries=3 cho build."""
        from api import sheets
        # Reset global _service để build gọi lại
        if sheets._service is not None:
            sheets._service = None
        sheets.get_service()
        args, kwargs = mock_build.call_args
        self.assertEqual(kwargs.get("num_retries"), 3)
        http_obj = kwargs.get("http")
        import httplib2
        self.assertIsInstance(http_obj, httplib2.Http)
        self.assertEqual(http_obj.timeout, 30)
        sheets._service = None  # reset cho test khác