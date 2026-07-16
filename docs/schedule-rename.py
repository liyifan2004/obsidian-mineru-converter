"""Schedule a folder rename to run on next Windows reboot via HKCU registry.
Safe to run as non-admin: writes to HKEY_CURRENT_USER, not HKEY_LOCAL_MACHINE.
Idempotent: re-running just refreshes our entry and leaves others alone.
"""
import winreg

HKCU = winreg.HKEY_CURRENT_USER
SUBKEY = r'System\CurrentControlSet\Control\Session Manager'
VALUE = 'PendingFileRenameOperations'

SRC = r'D:\MyProjects\obsidian-mineru'
DST = r'D:\MyProjects\obsidian-mineru-converter'

# Windows NT path prefix `\??\`. In a Python literal each backslash needs
# to be doubled, so the prefix is written as `'\\??\\'`.
src_entry = '\\??\\' + SRC
dst_entry = '\\??\\' + DST

# Read existing pending list so we don't blow away other installers' pending ops.
try:
    with winreg.OpenKey(HKCU, SUBKEY, 0, winreg.KEY_READ | winreg.KEY_SET_VALUE) as h:
        try:
            cur, _ = winreg.QueryValueEx(h, VALUE)
            existing = list(cur)
        except FileNotFoundError:
            existing = []
except FileNotFoundError:
    winreg.CreateKey(HKCU, SUBKEY)
    existing = []
    print(f'[+] Created HKCU\\{SUBKEY}')

# Remove ANY existing entry that mentions our src path (regardless of prefix).
# Also drop the entry right after each match (that's the dst half of the pair).
new = []
skip_next = False
for entry in existing:
    if skip_next:
        skip_next = False
        continue
    # Match anything ending with our SRC path (catches \??\, \\??\, /??/, etc.)
    if isinstance(entry, str) and entry.endswith(SRC):
        skip_next = True
        continue
    new.append(entry)

# Append our (correctly-formatted) pair.
new.extend([src_entry, dst_entry])

with winreg.OpenKey(HKCU, SUBKEY, 0, winreg.KEY_SET_VALUE) as h:
    winreg.SetValueEx(h, VALUE, 0, winreg.REG_MULTI_SZ, new)

print(f'[+] Scheduled rename on next reboot:')
print(f'    {SRC}')
print(f'      ->')
print(f'    {DST}')
print(f'    Pending entries now: {len(new)}')
print()
print('To trigger the rename NOW without a full reboot:')
print('  Sign out and back in (faster), OR just reboot normally.')
print()
print('To CANCEL the pending rename before rebooting:')
print('  Delete the HKCU\\System\\CurrentControlSet\\Control\\Session Manager')
print('  \\PendingFileRenameOperations value (regedit or PowerShell).')