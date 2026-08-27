"""main — HTTP handler cho Điểm Danh HN2 SOC backend (port JsonpApi.gs + doGet JSONP, 2026-08-12).

Giao thức (khớp shim google.script.run trong js.html + JsonpApi.gs):
  GET ?action=<fn>&args=<JSON array>&cb=<callback>  → cb({"ok":true,"result":...});
  POST body JSON {"action":..., "args":[...]}       → {"ok":true,"result":...}
  Không có cb → trả JSON thuần (dùng khi same-origin fetch).

Bảo mật: whitelist action (chỉ hàm đã duyệt); cb sanitize /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/
(mirror JsonpApi.gs — chống phản chiếu script tùy ý + prototype pollution).

Handler theo convention event/context (Vercel-style: event.queryStringParameters;
AWS-style cũng chấp nhận event["query"]) — Freebuff hosting đọc api/*.py, verify
bằng freebuff-deploy check khi CLI hồi phục. `probe` action test kết nối sheet.
"""

import hmac
import json
import os
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
    "getTaskListApi": (services.list_tasks, 1),
    "getTaskDetailApi": (services.get_task_detail, 2),
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
        # A3 (2026-08-23): log đầy đủ server-side, client nhận message chung — không
        # leak đường dẫn/tên service qua str(e).
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": "Lỗi hệ thống — thử lại sau"}


def sanitize_callback(cb):
    """Mirror JsonpApi.gs sanitizeCallback_: chỉ cho ký tự định danh JS an toàn,
    chống XSS (cb được phản chiếu nguyên văn vào output JS). Chặn chuỗi rỗng,
    số đầu, `$`, và prototype pollution (__proto__/constructor/prototype)."""
    s = str(cb or "").strip()
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$", s):
        return "callback"
    # Chặn prototype pollution (khớp JsonpApi.gs)
    for part in s.split("."):
        if part in ("__proto__", "constructor", "prototype"):
            return "callback"
    return s


def _bad_request():
    """Action để test handler: ném exception — client nhận generic error A3."""
    raise RuntimeError("secret path /home/abc")


def api_token():
    """Token API tùy chọn (env ROLLCALL_API_TOKEN — Điểm Danh HN2 SOC) — 2026-08-19 (NEW-1).

    Rỗng = KHÔNG bắt buộc (backward compat — preview/demo/test local).
    Khi set: mọi action phải kèm token (query `token=` hoặc body JSON), sai → 401.
    GAS không áp dụng cơ chế này (lá chắn = deployment access DOMAIN).
    Đọc env mỗi request (rẻ) để test đổi được mà không reload module.
    """
    return (os.environ.get("ROLLCALL_API_TOKEN") or "").strip()


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
    # POST body JSON override — parse 1 lần dùng chung cho action/args/token
    # (2026-08-20 review: trước parse 2 lần — rẻ nhưng thừa)
    body = event.get("body")
    parsed_body = None
    if body:
        try:
            parsed_body = json.loads(body)
        except Exception:
            parsed_body = None
    if isinstance(parsed_body, dict):
        if parsed_body.get("action"):
            action = str(parsed_body["action"]).strip()
        if parsed_body.get("args") is not None:
            args = parsed_body["args"]

    # NEW-1 (2026-08-19): auth tùy chọn — kiểm tra TRƯỚC dispatch (kể cả probe).
    token = str(params.get("token") or "").strip()
    if not token and isinstance(parsed_body, dict) and parsed_body.get("token"):
        token = str(parsed_body["token"]).strip()
    required = api_token()
    if required and not hmac.compare_digest(token, required):
        out = {"ok": False, "error": "Unauthorized"}
        # P1-3 (2026-08-25): khi có cb= thì phải wrap 401 thành cb({...}); — nếu trả
        # JSON thuần, script JSONP SyntaxError và withFailureHandler không bao giờ fire → kiosk treo
        cb401 = str(params.get("cb") or "").strip()
        if cb401:
            safe401 = sanitize_callback(cb401)
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "text/javascript; charset=utf-8"},
                "body": f"{safe401}({json.dumps(out, ensure_ascii=False)});",
            }
        return {
            "statusCode": 401,
            "headers": {"Content-Type": "application/json; charset=utf-8"},
            "body": json.dumps(out, ensure_ascii=False),
        }

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
