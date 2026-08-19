"""main — HTTP handler cho RollCall backend (port JsonpApi.gs + doGet JSONP, 2026-08-12).

Giao thức (khớp shim google.script.run trong js.html + JsonpApi.gs):
  GET ?action=<fn>&args=<JSON array>&cb=<callback>  → cb({"ok":true,"result":...});
  POST body JSON {"action":..., "args":[...]}       → {"ok":true,"result":...}
  Không có cb → trả JSON thuần (dùng khi same-origin fetch).

Bảo mật: whitelist action (chỉ hàm đã duyệt); cb sanitize /^[A-Za-z0-9_$.]+$/
(chống phản chiếu script tùy ý — mirror JsonpApi.gs).

Handler theo convention event/context (Vercel-style: event.queryStringParameters;
AWS-style cũng chấp nhận event["query"]) — Freebuff hosting đọc api/*.py, verify
bằng freebuff-deploy check khi CLI hồi phục. `probe` action test kết nối sheet.
"""

import json
import re

from api import config
from api import sheets
from api import services


def probe():
    """Test kết nối: đọc StaffData → số dòng. Dùng ở lần deploy đầu verify key."""
    values = sheets.get_values(config.SHEETS["STAFF_DATA"], unformatted=True)
    return {"ok": True, "staffRows": max(len(values) - 1, 0)}


# action → (fn, số tham số tối đa nhận từ client)
API_ACTIONS = {
    "getMeta": (services.get_meta, 0),
    "getFilterOptions": (services.get_filter_options, 0),
    "previewStaffApi": (services.preview_staff, 1),
    "createReconcileTaskApi": (services.create_reconcile_task, 1),
    "createMealMoveTaskApi": (services.create_meal_move_task, 1),
    "transferPresentListToMealMoveApi": (services.transfer_present_list_to_meal_move, 2),
    "pasteMealMoveScanApi": (services.paste_meal_move_scan, 3),
    "getTaskListApi": (services.list_tasks, 0),
    "getTaskDetailApi": (services.get_task_detail, 1),
    "scanStaffApi": (services.scan_staff, 3),
    "completeTaskApi": (services.complete_task, 1),
    "reopenTaskApi": (services.reopen_task, 1),
    "updateTaskNoteApi": (services.update_task_note, 2),
    "searchStaffApi": (services.search_staff, 1),
    "getStaffIndexApi": (services.get_staff_index, 0),
    # probe: KHÔNG dùng bởi frontend — test kết nối service account + đọc sheet
    "probe": (probe, 0),
}


def dispatch(action, args):
    """Whitelist dispatch — mirror apiDispatchJsonp_ (JsonpApi.gs)."""
    entry = API_ACTIONS.get(action)
    if not entry:
        return {"ok": False, "error": "Unknown action: " + str(action)}
    fn, max_args = entry
    arg_list = list(args) if isinstance(args, (list, tuple)) else []
    try:
        return {"ok": True, "result": fn(*arg_list[:max_args])}
    except Exception as e:  # noqa: BLE001 — fail rõ ràng, không leak stack
        return {"ok": False, "error": str(e)}


def sanitize_callback(cb):
    s = str(cb or "").strip()
    return s if re.match(r"^[A-Za-z0-9_$.]+$", s) else "callback"


def handler(event, context=None):
    """Điểm vào HTTP — event: {queryStringParameters?, query?, body?}."""
    params = event.get("queryStringParameters") or event.get("query") or {}
    action = str(params.get("action") or "").strip()
    args = []
    raw_args = params.get("args")
    if raw_args:
        try:
            args = json.loads(raw_args)
        except Exception:
            args = []
    # POST body JSON override
    body = event.get("body")
    if body:
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict):
                if parsed.get("action"):
                    action = str(parsed["action"]).strip()
                if parsed.get("args") is not None:
                    args = parsed["args"]
        except Exception:
            pass

    out = dispatch(action, args)
    cb = str(params.get("cb") or "").strip()
    if cb:
        safe_cb = sanitize_callback(cb)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "text/javascript; charset=utf-8"},
            "body": f"{safe_cb}({json.dumps(out, ensure_ascii=False)});",
        }
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(out, ensure_ascii=False),
    }
