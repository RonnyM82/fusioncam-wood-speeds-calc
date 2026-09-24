# Fusion script: write every toolpath strategy and its classification flags to
# a CSV in the user's Downloads folder, one row per strategy.
#
# Why this exists. Autodesk classifies its own strategies, and the flags do not
# always agree with the strategy's own description: Geodesic describes itself as
# "a finishing operation to machine freeform surfaces and undercuts" and still
# reports is3DStrategy False. The post-processor API has the fuller grouping
# (Section.checkGroup against STRATEGY_3D, STRATEGY_MULTIAXIS, STRATEGY_SURFACE
# and the rest), and the design-time API exposes only part of it. This dumps
# what the design-time API does expose so the disagreements are visible in one
# table rather than one query at a time.
#
# To run it: Utilities tab, Add-Ins, Scripts and Add-Ins, the Scripts tab, the
# green plus, point it at the folder holding this file, then Run. A document
# with at least one manufacturing setup must be open, because Fusion lists the
# strategies per setup.
#
# It reads only. It creates nothing in the document and changes no parameter.

import csv
import os
import sys
import traceback

import adsk.core
import adsk.cam

# Every classification flag OperationStrategy carries on Fusion 2704. A build
# that drops one, or adds one, is handled: the row records "not on this build"
# rather than failing, and the header still lines up.
FLAGS = [
    'is2DStrategy',
    'is3DStrategy',
    'isFinishingStrategy',
    'isMillingStrategy',
    'isTurningStrategy',
    'isRotaryStrategy',
    'isDrillingStrategy',
    'isCuttingStrategy',
    'isAdditiveStrategy',
    'isSupportStrategy',
]

MISSING = 'not on this build'


def downloads_folder():
    """The user's Downloads folder, asking the OS where it is on Windows.

    Windows lets the user move Downloads, and ~/Downloads is then a folder
    that does not exist and should not be created. SHGetKnownFolderPath is
    the supported way to ask. Everywhere else ~/Downloads is the convention.
    """
    if sys.platform == 'win32':
        try:
            import ctypes
            import ctypes.wintypes
            import uuid

            class GUID(ctypes.Structure):
                _fields_ = [
                    ('Data1', ctypes.wintypes.DWORD),
                    ('Data2', ctypes.wintypes.WORD),
                    ('Data3', ctypes.wintypes.WORD),
                    ('Data4', ctypes.c_byte * 8),
                ]

                def __init__(self, uuid_string):
                    super().__init__()
                    u = uuid.UUID(uuid_string)
                    self.Data1, self.Data2, self.Data3, rest = u.fields[0], u.fields[1], u.fields[2], u.bytes[8:]
                    for i in range(8):
                        self.Data4[i] = rest[i]

            # FOLDERID_Downloads
            folder_id = GUID('{374DE290-123F-4565-9164-39C4925E467B}')
            path_ptr = ctypes.c_wchar_p()
            result = ctypes.windll.shell32.SHGetKnownFolderPath(
                ctypes.byref(folder_id), 0, None, ctypes.byref(path_ptr)
            )
            if result == 0 and path_ptr.value:
                path = path_ptr.value
                ctypes.windll.ole32.CoTaskMemFree(path_ptr)
                return path
        except Exception:
            # Fall through to the conventional path rather than stopping: a
            # CSV in the wrong folder beats no CSV.
            pass
    return os.path.join(os.path.expanduser('~'), 'Downloads')


def collect(cam):
    """Return (rows, setup_count).

    Fusion lists strategies per setup, and a milling setup, a turning setup
    and a multi-axis setup do not offer the same ones. Every setup is read
    and the results are merged, so the table is the union across the
    document and each row names the setups that offer that strategy.
    """
    by_name = {}
    for setup in cam.setups:
        for strategy in setup.operations.compatibleStrategies:
            row = by_name.get(strategy.name)
            if row is None:
                row = {'name': strategy.name}
                try:
                    row['title'] = strategy.title
                except Exception:
                    row['title'] = ''
                for flag in FLAGS:
                    try:
                        row[flag] = getattr(strategy, flag)
                    except AttributeError:
                        row[flag] = MISSING
                try:
                    # One line, so the CSV stays readable in a spreadsheet.
                    row['description'] = ' '.join((strategy.description or '').split())
                except Exception:
                    row['description'] = ''
                row['setups'] = []
                by_name[strategy.name] = row
            row['setups'].append(setup.name)

    rows = sorted(by_name.values(), key=lambda r: r['name'])
    for row in rows:
        row['setups'] = '; '.join(row['setups'])
    return rows, cam.setups.count


def run(_context):
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        doc = app.activeDocument

        cam = doc.products.itemByProductType('CAMProductType')
        if cam is None:
            ui.messageBox(
                'This document has no Manufacture data, so there are no toolpath '
                'strategies to list.\n\nOpen a document with a manufacturing setup '
                'and run the script again.'
            )
            return
        cam = adsk.cam.CAM.cast(cam)

        if cam.setups.count == 0:
            ui.messageBox(
                'This document has no manufacturing setup.\n\nFusion lists the '
                'available strategies per setup, so the script needs at least one. '
                'Create a setup and run the script again.'
            )
            return

        rows, setup_count = collect(cam)

        folder = downloads_folder()
        if not os.path.isdir(folder):
            os.makedirs(folder, exist_ok=True)

        safe_name = ''.join(c if c.isalnum() or c in ' -_' else '_' for c in doc.name).strip()
        path = os.path.join(folder, 'fusion-strategy-flags - %s.csv' % (safe_name or 'document'))

        header = ['name', 'title'] + FLAGS + ['setups', 'description']
        # newline='' is required, or every row gets a blank one after it on
        # Windows. utf-8-sig so Excel opens it without mangling the text.
        with open(path, 'w', newline='', encoding='utf-8-sig') as handle:
            writer = csv.DictWriter(handle, fieldnames=header)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

        three_d = sum(1 for r in rows if r['is3DStrategy'] is True)
        finishing = sum(1 for r in rows if r['isFinishingStrategy'] is True)
        both = sum(1 for r in rows if r['is3DStrategy'] is True and r['isFinishingStrategy'] is True)

        ui.messageBox(
            'Wrote %d strategies from %d setup(s).\n\n'
            'is3DStrategy true: %d\n'
            'isFinishingStrategy true: %d\n'
            'both true: %d\n\n%s'
            % (len(rows), setup_count, three_d, finishing, both, path)
        )

    except Exception:
        if ui:
            ui.messageBox('Script failed:\n\n%s' % traceback.format_exc())
        else:
            raise
