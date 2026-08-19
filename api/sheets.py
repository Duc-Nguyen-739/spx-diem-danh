"""sheets — Google Sheets API client (service account) cho backend RollCall v2.

Auth: đọc service account từ env GOOGLE_SERVICE_ACCOUNT_JSON (nội dung JSON)
hoặc GOOGLE_SERVICE_ACCOUNT_FILE (đường dẫn file). User tạo service account trên
Google Cloud, tải JSON, dán vào Keys/API keys tab của Freebuff (tên biến
GOOGLE_SERVICE_ACCOUNT_JSON), và chia sẻ spreadsheet (DEFAULT_SPREADSHEET_ID)
cho email service account (vai trò Editor).
"""

import json
import os

from api import config

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

_service = None

# google-api-python-client / google-auth chỉ import trong hàm (lazy) — module
# import được cả khi chưa cài deps (test logic chạy được trên máy không có google).


def _load_credentials():
    """Service account credentials — fail rõ ràng nếu chưa cấu hình."""
    from google.oauth2 import service_account
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if raw:
        info = json.loads(raw)
        return service_account.Credentials.from_service_account_info(info, scopes=_SCOPES)
    path = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE")
    if path:
        return service_account.Credentials.from_service_account_file(path, scopes=_SCOPES)
    raise RuntimeError(
        "Thiếu service account: đặt GOOGLE_SERVICE_ACCOUNT_JSON (hoặc FILE) và "
        "share spreadsheet cho email service account."
    )


def get_service():
    global _service
    if _service is None:
        from googleapiclient.discovery import build
        _service = build("sheets", "v4", credentials=_load_credentials(), cache_discovery=False)
    return _service


def spreadsheet_id():
    """Spreadsheet id — override bằng env RC_SPREADSHEET_ID nếu cần."""
    return os.environ.get("RC_SPREADSHEET_ID") or config.DEFAULT_SPREADSHEET_ID


def get_values(sheet_name, range_=None, unformatted=True):
    """Đọc mảng 2D (dòng 0 = header).

    unformatted=True → UNFORMATTED_VALUE: cell date trả SERIAL NUMBER (float)
    → convert qua cache.to_datetime giữ nguyên epoch (khớp GAS Date.getTime()).
    unformatted=False → FORMATTED_VALUE: chuỗi hiển thị ("09:02:15") — mất ngày,
    không dùng cho log.
    """
    rng = f"'{sheet_name}'" + (f"!{range_}" if range_ else "")
    result = get_service().spreadsheets().values().get(
        spreadsheetId=spreadsheet_id(), range=rng,
        valueRenderOption="UNFORMATTED_VALUE" if unformatted else "FORMATTED_VALUE",
    ).execute()
    return result.get("values", [])


def update_values(sheet_name, start_row, start_col, rows):
    """Ghi batch mảng 2D — KHÔNG loop từng ô (khớp constraint GAS batch)."""
    if not rows:
        return 0
    end_row = start_row + len(rows) - 1
    end_col = start_col + len(rows[0]) - 1
    rng = f"'{sheet_name}'!{_col_letter(start_col)}{start_row}:{_col_letter(end_col)}{end_row}"
    body = {"values": rows}
    get_service().spreadsheets().values().update(
        spreadsheetId=spreadsheet_id(), range=rng,
        valueInputOption="USER_ENTERED", body=body,
    ).execute()
    return len(rows)


def append_values(sheet_name, rows):
    """Append batch cuối sheet (khớp GAS appendRow nhưng batch 1 lần)."""
    if not rows:
        return 0
    rng = f"'{sheet_name}'"
    body = {"values": rows}
    get_service().spreadsheets().values().append(
        spreadsheetId=spreadsheet_id(), range=rng,
        valueInputOption="USER_ENTERED", insertDataOption="INSERT_ROWS", body=body,
    ).execute()
    return len(rows)


def _col_letter(idx):
    """1-based column index → 'A', 'B', ..., 'Z', 'AA'..."""
    s = ""
    while idx > 0:
        idx, rem = divmod(idx - 1, 26)
        s = chr(65 + rem) + s
    return s


_sheet_ids = {}


def sheet_id(sheet_name):
    """Grid sheetId theo tên — repeatCell/batchUpdate cần sheetId, không phải tên."""
    if sheet_name not in _sheet_ids:
        resp = get_service().spreadsheets().get(
            spreadsheetId=spreadsheet_id(),
            fields="sheets(properties(sheetId,title))",
        ).execute()
        for s in resp.get("sheets", []):
            _sheet_ids[s["properties"]["title"]] = s["properties"]["sheetId"]
    return _sheet_ids.get(sheet_name)


def set_number_format(sheet_name, start_row, start_col, num_rows, num_cols, fmt):
    """Set number format cho dải ô — tương đương GAS Range.setNumberFormat (giờ HH:mm:ss)."""
    if not num_rows or not num_cols:
        return
    sid = sheet_id(sheet_name)
    if sid is None:
        return
    body = {
        "requests": [{
            "repeatCell": {
                "range": {
                    "sheetId": sid,
                    "startRowIndex": start_row - 1,
                    "endRowIndex": start_row - 1 + num_rows,
                    "startColumnIndex": start_col - 1,
                    "endColumnIndex": start_col - 1 + num_cols,
                },
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE_TIME", "pattern": fmt}}},
                "fields": "userEnteredFormat.numberFormat",
            }
        }]
    }
    get_service().spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id(), body=body,
    ).execute()
