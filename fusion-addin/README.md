# Fusion add-in

Two add-ins live here. `WoodSpeedsFeeds/` is the real add-in.
`spike/WSFSpike/` is a throwaway probe.

On 2026-09-01 the Fusion connector settled every API fact on Windows:
the parameter names, the unit factors, the operation identity, the
machine spindle and the palette behaviour. The readings are in
`spike-results-windows.md` and they are folded into `protocol.md` and
the add-in. Two things stay open, and the spike serves both: the Mac
pass, and the round trip with the live page at wood.fusioncam.co,
which the connector could not drive.

## Install on Windows

1. Close Fusion.
2. Copy the `WoodSpeedsFeeds` folder to
   `%APPDATA%\Autodesk\Autodesk Fusion 360\API\AddIns\`.
3. For the spike, copy `spike\WSFSpike` to the same folder.
4. Start Fusion. Press Shift+S. Open the Add-Ins tab.
5. Select the add-in and click Run.

## Install on Mac

Follow the same steps. The folder is
`~/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns/`.

## Run the spike

1. Open a document that has at least one setup and one operation in
   the Manufacture workspace.
2. Run WSFSpike from the Add-Ins dialog.
3. The spike opens the panel on the live page, probes the document,
   and waits ten seconds for the page to answer.
4. While it waits, look at the panel. Note whether the page, the
   fonts and the components render correctly.
5. A message box shows the report. The log file holds the full copy.

The report's "hello: RECEIVED" line is the live-URL round trip. Its
name probes and unit factor line cross-check the Windows readings on
the other platform.

## Log files

Both add-ins write to the temp folder.

- The add-in writes `wood-speeds-feeds-addin.log`.
- The spike writes `wood-speeds-feeds-spike.log`.

On Windows the temp folder is `%TEMP%`. On Mac run `echo $TMPDIR` in
Terminal to find it.

## What to paste back

Run the spike on Mac, and on Windows for the live-URL round trip.
Paste the full `wood-speeds-feeds-spike.log` from each run. Add one
line per platform about the panel: rendered correctly, or what looked
wrong.
