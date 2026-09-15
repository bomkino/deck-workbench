#target photoshop
// pitch.dog / Export Slide PNGs 0.2.0 (Workbench bundled edition)
// Full-canvas Background + Character PNGs. Source PSDs are never saved.
// Set $.global.PITCHDOG_EXPORT_PNGS_NO_AUTORUN = true before $.evalFile()
// to load PitchdogSlidePNGs.run(options) without opening any dialogs.

$.global.PitchdogSlidePNGs = (function () {
    var TITLE = "pitch.dog / Export Slide PNGs";
    var REPORT_NAME = "PNG Export Report.txt";
    var ROLE_NAMES = ["00.Background", "01.Character"];
    var SUFFIXES = ["background", "character"];
    var TEXT_GUIDE = "GUIDE - Text area (hide for export)";
    var api = { version: "0.2.0", lastResult: null };

    function fail(message) { throw new Error(message); }
    function messageOf(error) { return String(error.message || error); }
    function displayName(file) { return File.decode(file.name); }
    function pathKey(file) {
        var target = file.alias ? file.resolve() : file;
        // Conservative comparison also catches case variants on Mac/Windows.
        return String((target || file).fsName).toLowerCase();
    }
    function numberLabel(number) { return number < 10 ? "0" + number : String(number); }
    function fingerprint(file) {
        var current = new File(file.fsName);
        if (!current.exists) { fail("Source PSD is missing: " + file.fsName); }
        return String(current.length) + "|" + String(current.modified.getTime());
    }
    function assertUnchanged(entry) {
        if (fingerprint(entry.file) !== entry.fingerprint) {
            fail("The source changed during this batch: " + entry.file.fsName + ". Finish saving it, then use a fresh output folder.");
        }
    }
    function collectSlides(folder) {
        var files = folder.getFiles(), slides = [], invalid = [], seen = {}, i, file, match, number;
        for (i = 0; i < files.length; i += 1) {
            file = files[i];
            if (!(file instanceof File) || /^\./.test(displayName(file)) || !/\.(psd|psb)$/i.test(displayName(file))) { continue; }
            match = /^Slide[ -](\d+)\.psd$/i.exec(displayName(file));
            number = match ? Number(match[1]) : 0;
            if (!match || number < 1 || number > 999999) {
                invalid.push(displayName(file)); continue;
            }
            if (seen["slide" + number]) {
                fail("Two PSDs have slide number " + number + ": " + seen["slide" + number] + " and " + displayName(file) + ". Keep one PSD per slide number.");
            }
            seen["slide" + number] = displayName(file);
            slides.push({ file: file, number: number, stem: "Slide " + numberLabel(number), fingerprint: fingerprint(file) });
        }
        if (invalid.length) {
            fail("Rename these PSDs as Slide 01.psd, Slide 02.psd, etc., or move them out of the input folder. PSB files and Slide 00 templates are not batch inputs.\n\n" + invalid.slice(0, 8).join("\n") + (invalid.length > 8 ? "\n..." : ""));
        }
        if (!slides.length) { fail("No numbered slide PSDs found. Choose the folder containing Slide 01.psd, Slide 02.psd, etc."); }
        slides.sort(function (a, b) { return a.number - b.number; });
        return slides;
    }
    function rejectOpenInputs(slides) {
        var i, j, doc, fullName, openName, same;
        for (i = 0; i < app.documents.length; i += 1) {
            doc = app.documents[i]; fullName = null; openName = File.decode(String(doc.name)).toLowerCase();
            try { fullName = doc.fullName; } catch (ignored) {}
            for (j = 0; j < slides.length; j += 1) {
                // Different path spellings can identify the same open PSD. Refuse
                // matching basenames even in other folders instead of risking it.
                same = openName === displayName(slides[j].file).toLowerCase() || (fullName && pathKey(fullName) === pathKey(slides[j].file));
                if (same) {
                    fail("Save and close every open document named " + doc.name + " in Photoshop first, even if it is in another folder, then run this batch again. Matching filenames are refused because aliases can make the same PSD appear to have different paths. Open input documents are never reused or closed by this exporter.");
                }
            }
        }
    }
    function outputFile(folder, entry, roleIndex) {
        return new File(folder.fsName + "/" + entry.stem + "-" + SUFFIXES[roleIndex] + ".png");
    }
    function rejectExistingOutputs(folder, slides) {
        var i, j, file;
        if (new File(folder.fsName + "/" + REPORT_NAME).exists) {
            fail("This output folder already contains " + REPORT_NAME + ". Choose a fresh folder; previous exports are never overwritten.");
        }
        for (i = 0; i < slides.length; i += 1) {
            for (j = 0; j < ROLE_NAMES.length; j += 1) {
                file = outputFile(folder, slides[i], j);
                if (file.exists || new Folder(file.fsName).exists) {
                    fail("Output already exists: " + file.fsName + ". Choose a fresh folder; previous exports are never overwritten.");
                }
            }
        }
    }
    function inspectDocument(doc, entry) {
        var width = doc.width.as("px"), height = doc.height.as("px"), roles = [], i, j, layer;
        if ((width !== 2576 && width !== 1920) || height !== 1080) {
            fail(entry.stem + " is " + width + " x " + height + " px. Expected 2576 x 1080 or 1920 x 1080; nothing will be resized.");
        }
        if (doc.mode !== DocumentMode.RGB || doc.bitsPerChannel !== BitsPerChannelType.EIGHT) {
            fail(entry.stem + " must be an 8-bit RGB PSD, like the starter. Convert a copy deliberately before exporting; this script does not change image mode or bit depth.");
        }
        for (i = 0; i < ROLE_NAMES.length; i += 1) {
            roles[i] = null;
            for (j = 0; j < doc.layers.length; j += 1) {
                layer = doc.layers[j];
                if (layer.name !== ROLE_NAMES[i]) { continue; }
                if (roles[i]) { fail(entry.stem + " has duplicate top-level layers named " + ROLE_NAMES[i] + ". Keep exactly one."); }
                if (layer.typename !== "ArtLayer" || layer.kind !== LayerKind.SMARTOBJECT) {
                    fail(entry.stem + " / " + ROLE_NAMES[i] + " must be a top-level Smart Object layer.");
                }
                roles[i] = layer;
            }
            if (!roles[i]) { fail(entry.stem + " is missing the top-level Smart Object " + ROLE_NAMES[i] + "."); }
        }
        entry.width = width; entry.height = height;
        return roles;
    }
    function openDocumentIDs() {
        var ids = {}, i;
        for (i = 0; i < app.documents.length; i += 1) { ids[String(app.documents[i].id)] = true; }
        return ids;
    }
    function smartObjectInfo(doc, layer) {
        app.activeDocument = doc; doc.activeLayer = layer;
        var reference = new ActionReference(), descriptor, key = stringIDToTypeID("smartObject");
        reference.putProperty(charIDToTypeID("Prpr"), key);
        reference.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        descriptor = executeActionGet(reference).getObjectValue(key);
        return {
            filename: descriptor.getString(stringIDToTypeID("fileReference")),
            verifiedEmbedded: descriptor.hasKey(stringIDToTypeID("linked")) &&
                !descriptor.getBoolean(stringIDToTypeID("linked")) && !descriptor.hasKey(stringIDToTypeID("link"))
        };
    }
    function rejectOpenContents(filename) {
        var expected = displayName(new File(filename)).toLowerCase(), i;
        for (i = 0; i < app.documents.length; i += 1) {
            if (File.decode(String(app.documents[i].name)).toLowerCase() === expected) {
                fail("Save and close the open Smart Object document " + filename + " first. The exporter will not reuse or close your artwork window.");
            }
        }
    }
    function suppressSmartObject(doc, layer, depth, state) {
        var info = smartObjectInfo(doc, layer), before, child = null, failure = null, changed = 0;
        // Flat formats cannot carry an editable Photoshop guide layer. Leave
        // their original bytes/caches alone; do not decode twelve photos again.
        if (/\.(png|jpe?g|gif|bmp|webp|heic|heif|avif)$/i.test(info.filename)) { return 0; }
        if (!/\.(psd|psb|tiff?)$/i.test(info.filename)) {
            fail("Cannot safely check Smart Object " + layer.name + " (" + info.filename + ") for text guides. Use an embedded PSD/PSB or a flat image copy, then export again.");
        }
        if (!info.verifiedEmbedded) {
            fail("Smart Object " + layer.name + " (" + info.filename + ") is linked or its embedding could not be verified. Embed a copy before exporting; external artwork will never be edited by this script.");
        }
        if (depth >= 4 || state.containers >= 32) {
            fail("This slide has more nested Smart Object documents than the safe PNG export limit (four levels / 32 containers). Simplify a copy before exporting.");
        }
        rejectOpenContents(info.filename);
        before = openDocumentIDs(); state.containers += 1;
        try {
            executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);
            if (before[String(app.activeDocument.id)]) {
                fail("Photoshop did not open a new embedded document for " + layer.name + ". Save and close open artwork, then retry; the existing window was left untouched.");
            }
            child = app.activeDocument;
            changed = suppressLayers(child, child.layers, depth + 1, state, true);
            if (changed) {
                // Saving an embedded child updates every shared instance in our
                // temporary parent, including its cached pixels and outer mask.
                child.save();
            }
        } catch (error) { failure = error; }
        if (child) {
            try { child.close(SaveOptions.DONOTSAVECHANGES); }
            catch (closeError) { failure = new Error((failure ? messageOf(failure) + "\n" : "") + "Could not close temporary Smart Object " + info.filename + ": " + messageOf(closeError)); }
        }
        try { app.activeDocument = doc; } catch (ignored) {}
        if (failure) { throw failure; }
        return changed;
    }
    function suppressLayers(doc, layers, depth, state, parentVisible) {
        var changed = 0, i, layer, visible;
        for (i = 0; i < layers.length; i += 1) {
            if (state.options.shouldCancel && state.options.shouldCancel()) { throw cancelledError(); }
            layer = layers[i];
            if (layer.name === TEXT_GUIDE) {
                if (layer.visible) { layer.visible = false; changed += 1; }
                continue;
            }
            visible = parentVisible && layer.visible;
            if (layer.typename === "LayerSet") {
                changed += suppressLayers(doc, layer.layers, depth, state, visible);
            } else if (visible && layer.kind === LayerKind.SMARTOBJECT) {
                changed += suppressSmartObject(doc, layer, depth, state);
            }
        }
        return changed;
    }
    function suppressTextGuides(doc, entry, options) {
        var roles = inspectDocument(doc, entry), state = { containers: 0, options: options }, changed = 0, i;
        // The two outer roles will be exported independently even if one was
        // hidden in the saved PSD. Inspect both; shared content may be revisited.
        for (i = 0; i < roles.length; i += 1) { changed += suppressSmartObject(doc, roles[i], 0, state); }
        return changed;
    }
    function withClosedPSD(entry, action, exportOptions) {
        var doc = null, result, failure = null, temporary = null, copy = null, source = entry.file, token;
        assertUnchanged(entry); rejectOpenInputs([entry]);
        try {
            if (exportOptions) {
                // A physical copy isolates embedded child saves from the user's
                // original, even when Photoshop updates shared-object caches.
                token = String(new Date().getTime()) + "-" + String(Math.floor(Math.random() * 1000000000));
                temporary = new Folder(Folder.temp.fsName + "/pitchdog-png-" + token);
                if (temporary.exists || !temporary.create()) { temporary = null; fail("Cannot create an exclusive temporary PSD folder."); }
                copy = new File(temporary.fsName + "/Export-" + token + ".psd");
                if (copy.exists || !entry.file.copy(copy.fsName) || copy.length !== entry.file.length) {
                    fail("Cannot create a complete temporary copy of " + entry.stem + ". The original was not opened for editing.");
                }
                source = copy;
            }
            doc = app.open(source);
            if (exportOptions) { entry.suppressedGuides = suppressTextGuides(doc, entry, exportOptions); }
            result = action(doc);
        } catch (error) { failure = error; }
        if (doc) {
            try { doc.close(SaveOptions.DONOTSAVECHANGES); }
            catch (closeError) {
                failure = new Error((failure ? messageOf(failure) + "\n\n" : "") + "Could not close " + entry.stem + ": " + messageOf(closeError) + ". Close the export document without saving.");
            }
        }
        if (temporary) {
            // Never recursively delete a directory or remove Photoshop's own
            // extracted child files. Only this exact task-created PSD is ours.
            if (copy && copy.exists && !copy.remove()) {
                failure = new Error((failure ? messageOf(failure) + "\n\n" : "") + "Temporary PSD could not be removed: " + copy.fsName);
            }
            if (!temporary.remove()) {
                failure = new Error((failure ? messageOf(failure) + "\n\n" : "") + "Temporary folder retained: " + temporary.fsName);
            }
        }
        try { assertUnchanged(entry); }
        catch (changeError) { failure = new Error((failure ? messageOf(failure) + "\n\n" : "") + messageOf(changeError)); }
        if (failure) { throw failure; }
        return result;
    }
    function inspectPNG(file, entry) {
        var data, current = new File(file.fsName);
        if (!current.exists || current.length < 33) { fail("PNG was not written completely: " + file.fsName); }
        current.encoding = "BINARY";
        if (!current.open("r")) { fail("Cannot read the exported PNG: " + file.fsName); }
        try { data = current.read(33); } finally { current.close(); }
        function uint32(offset) {
            return data.charCodeAt(offset) * 16777216 + data.charCodeAt(offset + 1) * 65536 + data.charCodeAt(offset + 2) * 256 + data.charCodeAt(offset + 3);
        }
        if (data.length < 33 || data.substring(0, 8) !== "\x89PNG\r\n\x1a\n" || data.substring(12, 16) !== "IHDR" || uint32(16) !== entry.width || uint32(20) !== entry.height) {
            fail("PNG header or full-canvas dimensions could not be verified: " + file.fsName + ". Keep this partial batch separate.");
        }
        return { path: file.fsName, width: uint32(16), height: uint32(20), bytes: current.length, hasAlphaChannel: data.charCodeAt(25) === 6 || data.charCodeAt(25) === 4 };
    }
    function appendReport(file, text, create) {
        file.encoding = "UTF-8"; file.lineFeed = "Unix";
        if (create && file.exists) { fail("The export report already exists: " + file.fsName); }
        if (!file.open(create ? "w" : "a")) { fail("Cannot write the export report: " + file.fsName + ". " + file.error); }
        try {
            if (!file.writeln(text)) { fail("Could not finish writing the export report: " + file.fsName); }
        } finally { file.close(); }
    }
    function cancelledError() { var error = new Error("Export cancelled. Existing PNGs are retained; this batch is incomplete."); error.cancelled = true; return error; }
    function reportProgress(options, phase, entry, index, total, role) {
        if (options.shouldCancel && options.shouldCancel()) { throw cancelledError(); }
        if (options.onProgress) { options.onProgress({ phase: phase, slide: entry.stem, index: index + 1, total: total, role: role || "" }); }
        if (options.shouldCancel && options.shouldCancel()) { throw cancelledError(); }
    }

    api.run = function (options) {
        var input, output, slides, originalDialogs, originalDocument = null, report = null, reportStarted = false;
        var i, result = { status: "checking", completedSlides: [], outputs: [], partialOutputs: [], warnings: [], reportPath: null }, attemptedOutput = null;
        api.lastResult = result;
        try {
            if (!options || !options.inputFolder || !options.outputFolder) { fail("Pass inputFolder and outputFolder to PitchdogSlidePNGs.run(), or use PitchdogSlidePNGs.interactive()."); }
            if (typeof app === "undefined" || !/photoshop/i.test(app.name)) { fail("Run this JSX in Adobe Photoshop."); }
            input = new Folder(options.inputFolder); output = new Folder(options.outputFolder);
            if (!input.exists) { fail("Input folder does not exist: " + input.fsName); }
            if (!output.exists && !output.parent.exists) { fail("Create the parent of this output folder first: " + output.fsName); }
            slides = collectSlides(input); result.slideCount = slides.length; result.inputFolder = input.fsName; result.outputFolder = output.fsName;
            rejectOpenInputs(slides); rejectExistingOutputs(output, slides);
            originalDialogs = app.displayDialogs;
            if (app.documents.length) { originalDocument = app.activeDocument; }
            app.displayDialogs = DialogModes.NO;

            // Check each saved PSD first. Export visits one temporary slide and
            // its bounded embedded contents at a time, never all deck slides.
            for (i = 0; i < slides.length; i += 1) {
                result.currentSlide = slides[i].stem;
                reportProgress(options, "Checking", slides[i], i, slides.length);
                withClosedPSD(slides[i], function (doc) { inspectDocument(doc, slides[i]); });
            }
            rejectExistingOutputs(output, slides);
            if (!output.exists && !output.create()) { fail("Cannot create output folder: " + output.fsName); }
            report = new File(output.fsName + "/" + REPORT_NAME);
            appendReport(report, "pitch.dog / Export Slide PNGs " + api.version + "\nStarted: " + new Date().toUTCString() + "\nInput: " + input.fsName + "\nSlides: " + slides.length + "\nState: IN PROGRESS (only COMPLETE below means the whole batch finished)\nSource PSDs are checked without saving; exports use temporary copies.\nThe named text-area guide is suppressed inside embedded contents before PNG export.\nCharacter transparency follows the saved layer/mask.\n", true);
            reportStarted = true; result.reportPath = report.fsName; result.status = "exporting";
            for (i = 0; i < slides.length; i += 1) {
                result.currentSlide = slides[i].stem;
                reportProgress(options, "Opening", slides[i], i, slides.length);
                withClosedPSD(slides[i], function (doc) {
                    var roles = inspectDocument(doc, slides[i]), j, k, destination, pngOptions, verified;
                    for (j = 0; j < ROLE_NAMES.length; j += 1) {
                        reportProgress(options, "Exporting", slides[i], i, slides.length, SUFFIXES[j]);
                        for (k = 0; k < doc.layers.length; k += 1) { doc.layers[k].visible = false; }
                        roles[j].visible = true;
                        destination = outputFile(output, slides[i], j);
                        if (destination.exists || new Folder(destination.fsName).exists) { fail("Output appeared during the batch: " + destination.fsName + ". Nothing will overwrite it."); }
                        attemptedOutput = destination;
                        pngOptions = new PNGSaveOptions(); pngOptions.compression = 6; pngOptions.interlaced = false;
                        // Save a Copy keeps source format/path intact. No trim, crop, resize, or flatten.
                        doc.saveAs(destination, pngOptions, true, Extension.LOWERCASE);
                        verified = inspectPNG(destination, slides[i]); verified.role = SUFFIXES[j]; verified.source = slides[i].file.fsName;
                        result.outputs.push(verified); attemptedOutput = null;
                        appendReport(report, "PNG verified: " + verified.path + " | " + verified.width + " x " + verified.height + " px | " + verified.bytes + " bytes", false);
                        if (j === 1 && !verified.hasAlphaChannel) {
                            result.warnings.push(slides[i].stem + "-character.png has no alpha channel. Review the saved Character mask; this script does not remove backgrounds.");
                        }
                    }
                }, options);
                result.completedSlides.push(slides[i].stem);
                appendReport(report, "Slide complete; source metadata unchanged: " + slides[i].file.fsName + " | visible text guides suppressed: " + slides[i].suppressedGuides, false);
            }
            appendReport(report, "\nCOMPLETE: " + result.completedSlides.length + " slides / " + result.outputs.length + " PNGs.\n" + (result.warnings.length ? "Review:\n" + result.warnings.join("\n") : "Review the images before delivery; header checks establish dimensions, not artistic completeness."), false);
            result.status = "complete"; result.currentSlide = null;
            return result;
        } catch (error) {
            result.status = error.cancelled ? "cancelled" : "failed"; result.error = messageOf(error);
            if (attemptedOutput && new File(attemptedOutput.fsName).exists) { result.partialOutputs.push(attemptedOutput.fsName); }
            if (reportStarted) {
                try {
                    appendReport(report, "\n" + result.status.toUpperCase() + ": " + result.error + "\nCompleted slides: " + result.completedSlides.length + "; verified PNGs retained: " + result.outputs.length + (result.partialOutputs.length ? "\nUnverified partial files retained:\n" + result.partialOutputs.join("\n") : "") + "\nUse a fresh output folder for the next complete batch.", false);
                } catch (reportError) { result.error += "\nExport report could not be updated: " + messageOf(reportError); }
            }
            var failure = new Error(result.error); failure.result = result;
            throw failure;
        } finally {
            if (originalDialogs !== undefined) { app.displayDialogs = originalDialogs; }
            if (originalDocument) { try { app.activeDocument = originalDocument; } catch (ignored) {} }
        }
    };

    api.interactive = function () {
        var input = Folder.selectDialog("Choose the saved PSD folder: Slide 01.psd, Slide 02.psd, etc."), output, palette, label, bar, cancelled = false, result;
        if (!input) { return { status: "cancelled" }; }
        output = Folder.selectDialog("Choose a fresh PNG output folder. Existing exports will not be overwritten.");
        if (!output) { return { status: "cancelled" }; }
        palette = new Window("palette", TITLE);
        palette.orientation = "column"; palette.alignChildren = "fill";
        label = palette.add("statictext", undefined, "Checking saved PSDs..."); label.preferredSize.width = 440;
        bar = palette.add("progressbar", undefined, 0, 100);
        palette.add("button", undefined, "Stop after current operation").onClick = function () { cancelled = true; label.text = "Stopping after current operation..."; };
        palette.onClose = function () { cancelled = true; return true; };
        palette.show();
        try {
            result = api.run({
                inputFolder: input.fsName, outputFolder: output.fsName,
                shouldCancel: function () { return cancelled; },
                onProgress: function (state) {
                    label.text = state.phase + " " + state.index + " / " + state.total + ": " + state.slide + (state.role ? " / " + state.role : "");
                    bar.value = (state.phase === "Checking" ? 0 : 50) + 50 * (state.index - 1) / state.total;
                    palette.update();
                }
            });
        } catch (error) { result = error.result || { status: "failed", error: messageOf(error), completedSlides: [], outputs: [] }; }
        finally { palette.close(); }
        if (result.status === "complete") {
            alert("Export complete: " + result.completedSlides.length + " slides / " + result.outputs.length + " full-size PNGs.\n\n" + result.outputFolder + "\n\nSource PSDs were not saved or changed." + (result.warnings.length ? "\n\nReview:\n" + result.warnings.slice(0, 5).join("\n") : "\n\nReview the Character cut-outs before using the PNGs."), TITLE);
        } else {
            alert((result.status === "cancelled" ? "Stopped" : "Export stopped") + ": " + result.error + "\n\nCompleted slides: " + result.completedSlides.length + ". Verified PNGs retained: " + result.outputs.length + "." + (result.reportPath ? "\nReport: " + result.reportPath : "\nNo batch report was created.") + "\n\nThis is not a complete export. Use a fresh output folder when you run again.", TITLE);
        }
        return result;
    };
    return api;
}());

if ($.global.PITCHDOG_EXPORT_PNGS_NO_AUTORUN !== true) {
    $.global.PitchdogSlidePNGs.interactive();
}
