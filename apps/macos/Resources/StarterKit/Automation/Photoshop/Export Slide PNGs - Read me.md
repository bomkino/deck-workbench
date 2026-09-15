# Export the two PNGs for Figma

1. Finish the PSD artwork and Character masks. Save **and close** every input PSD and its open Smart Object contents in Photoshop. Also close any open document with the **same filename**, even from another folder.
2. Keep one slide per file: `Slide 01.psd`, `Slide 02.psd`, etc. Choose one format's PSD folder at a time. Keep the `Slide 00` template outside that folder.
3. In Photoshop, choose **File → Scripts → Browse**, then open **Export Slide PNGs.jsx**.
4. Choose the folder of PSDs. Then choose a **fresh output folder**.
5. Wait for **Export complete**. Review the Character cut-outs before using the PNGs.

Each slide produces:

- `Slide 01-background.png`: only `00.Background` visible.
- `Slide 01-character.png`: only `01.Character` visible, with its saved transparency/mask.

Both PNGs retain the **entire 2576 × 1080 or 1920 × 1080 canvas**, so they line up at the same position in Figma. Transparent edges are never trimmed. There is no crop, resampling, flattening, background removal, or source save. Photoshop's native guides and numbered path do not become image pixels.

**Text-area guide:** Workbench adds a hidden cyan rectangle named `GUIDE - Text area (hide for export)` inside Shared Artwork when the slide has visible writing. Turn its eye on to see the 50% overlay; edit its vector shape or fill as needed. It marks the Workbench text region, not the individual letters. The bundled exporter hides this exact layer automatically, even when you saved the PSD with its eye on. Keep the name unchanged. Other guide artwork, or a guide merged into image pixels, must be hidden manually.

The exporter cleans a temporary disk copy. It visits both outer roles, recursively hides the named guide in layer groups and visible embedded PSD/PSB/TIFF Smart Objects, and saves changed embedded contents so the outer cached artwork refreshes. It then exports and discards the temporary copy. Your saved PSD and external images are not edited. Hidden nested Smart Objects remain hidden and do not need opening; the two outer roles are checked even if hidden in the source.

The top-level layers must be Smart Objects named exactly `00.Background` and `01.Character`. Other top-level layers are excluded. Keep supporting artwork and adjustments inside the appropriate Smart Object. Inputs must be the starter's **8-bit RGB** format; colour mode, bit depth and profile are not converted by the script. Use the sRGB starter for the intended colour handoff.

The exporter works on one slide at a time. It first checks every source, then opens a temporary copy for export. Embedded documents are visited one branch at a time, with a limit of four nested document levels and 32 container visits per slide. Flat JPEG/PNG and similar image sources are not reopened. Linked layered Smart Objects, unknown source formats or an embedding state that cannot be verified stop the export with instructions to embed a copy. This prevents a child save from changing an external original. Save and close already-open input/content documents before running; the exporter does not reuse or close your artwork windows. A same-named document in another folder is also refused because macOS aliases can identify one file through different paths.

Files are processed by their existing slide numbers, without renumbering gaps. `Slide 1.psd` and `slide-01.psd` are also accepted and produce `Slide 01-…` outputs, but duplicate numbers are rejected. Keep the normal Workbench shared-content setup; custom layer-comp overrides and guides baked into pixels are not a supported automatic-cleanup workflow.

**If it stops:** existing PNGs stay in the output folder. Read `PNG Export Report.txt`; only its final **COMPLETE** line means the whole batch finished. A failed write can leave a partial PNG that should not be used. Use a fresh folder for the next complete export. Existing outputs and reports are never overwritten.

## Scripted invocation

Run this wrapper in **Photoshop's ExtendScript engine**. Passing options opens no file dialogs, progress palette or alerts.

```javascript
var previousGuard = $.global.PITCHDOG_EXPORT_PNGS_NO_AUTORUN;
$.global.PITCHDOG_EXPORT_PNGS_NO_AUTORUN = true;
try {
    $.evalFile(new File("/absolute/path/Export Slide PNGs.jsx"));
    var result = $.global.PitchdogSlidePNGs.run({
        inputFolder: "/absolute/path/PSD",
        outputFolder: "/absolute/path/PNG-export-01"
    });
    // result.status === "complete"
    // result.outputs: path, source, role, width, height, bytes, hasAlphaChannel
    // result.completedSlides, result.warnings, result.reportPath
} catch (error) {
    // Failure/cancellation throws. error.result holds partial progress.
    // $.global.PitchdogSlidePNGs.lastResult also holds that result.
    throw error;
} finally {
    $.global.PITCHDOG_EXPORT_PNGS_NO_AUTORUN = previousGuard;
}
```

The output folder can already exist, or the script can create its final directory if its parent exists. There is deliberately no overwrite option. Optional `onProgress(state)` receives `phase`, `slide`, `index`, `total`, `role`; optional `shouldCancel()` can return `true` to stop between operations. Input files must stay unchanged for the duration of the batch.

Validation reads the written PNG header and checks its full-canvas dimensions. It does not judge a mask's quality, prove that artwork is finished, or fully decode the PNG. Native verification should include both sizes, a visibly masked Character, saved visible text guides inside nested content, source hashes before/after, and the open-input / existing-output refusal paths.

Adobe references: [Run a Photoshop JavaScript](https://helpx.adobe.com/photoshop/using/scripting.html), [embedded and linked Smart Objects](https://www.adobe.com/learn/photoshop/web/photoshop-linked-smart-objects). This Workbench bundled edition is separate from the original starter-kit exporter. It uses `PNGSaveOptions` and `Document.saveAs(file, options, true, Extension.LOWERCASE)` for a PNG copy, then closes the export document with `SaveOptions.DONOTSAVECHANGES`.
