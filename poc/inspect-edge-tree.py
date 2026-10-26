# inspect-edge-tree.py
# Step 1 of 2: Inspect Edge's UI element tree to find the address bar AutomationId.
# Run this BEFORE read-edge-url.py to confirm the correct AutomationId on your machine.
#
# Setup:
#   pip install pywinauto
#
# Run:
#   python inspect-edge-tree.py
#
# What to do:
#   Open Microsoft Edge and navigate to any website.
#   Run this script and look through the output for the address bar element.
#   The address bar will appear as an Edit control whose title is the current URL.
#   Note its AutomationId — set ADDRESS_BAR_AUTO_ID in read-edge-url.py to that value.

import sys
import ctypes
from ctypes import wintypes

try:
    from pywinauto import Desktop
except ImportError:
    print("pywinauto not found. Install it with: pip install pywinauto")
    sys.exit(1)

def exe_name(pid):
    # Basename of the process image, lowercase, or '' if it can't be queried (same as the sidecar).
    kernel32 = ctypes.windll.kernel32
    h = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return ''
    try:
        buf = ctypes.create_unicode_buffer(1024)
        size = wintypes.DWORD(len(buf))
        if not kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
            return ''
        return buf.value.rsplit('\\', 1)[-1].lower()
    finally:
        kernel32.CloseHandle(h)


def find_controls(element, control_type, results=None):
    if results is None:
        results = []
    try:
        if element.element_info.control_type == control_type:
            results.append(element)
        for child in element.children():
            find_controls(child, control_type, results)
    except Exception:
        pass
    return results

print("=== Edge UI Tree Inspector ===")
print("Make sure Microsoft Edge is open with a website loaded.\n")

try:
    desktop = Desktop(backend='uia')
    # Match by process, not title: an Edge Workspace window is titled by the workspace name with
    # no "Microsoft Edge" suffix (the sidecar matches the same way).
    edge_windows = [w for w in desktop.windows() if exe_name(w.process_id()) == 'msedge.exe']
    if not edge_windows:
        raise RuntimeError("No Edge window found — make sure Edge is open with a webpage loaded.")

    window = edge_windows[0]

    print(f"Connected to window: \"{window.window_text()}\"\n")
    print("Searching all descendants for Edit controls...\n")
    print("=" * 60)

    edit_controls = [c for c in find_controls(window, 'Edit')
                     if c.element_info.automation_id and c.window_text().isascii()]
    if not edit_controls:
        print("No Edit controls found.")
    for ctrl in edit_controls:
        title = ctrl.window_text()  # the control's accessible name ("Address and search bar")
        auto_id = ctrl.element_info.automation_id
        try:
            value = ctrl.get_value()  # the current URL for the address bar
        except Exception:
            value = ''
        print(f"Edit - '{title}' [AutomationId: '{auto_id}'] value='{value}'")

    print("=" * 60)
    print("\nThe address bar Edit control is named 'Address and search bar' and its value is the URL.")
    print("Note its AutomationId and set ADDRESS_BAR_AUTO_ID in read-edge-url.py.")

except Exception as e:
    print(f"Error connecting to Edge ({type(e).__name__}): {e}")
    print("\nTroubleshooting:")
    print("  - Make sure Microsoft Edge is open")
    print("  - Make sure a webpage is loaded (not the new tab page)")
    sys.exit(1)
