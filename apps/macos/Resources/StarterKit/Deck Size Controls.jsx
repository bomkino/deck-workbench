#target indesign
// pitch.dog Deck Size Controls 0.1.1
// Moves Head, Sub and Body through this document's existing size presets.
// No font, face, colour or text edits. One Undo step. No automatic save.
(function () {
    var TITLE = "pitch.dog / Deck Size Controls";
    var UNDO = "Change deck size presets";
    var doc, styles, roles = [], dialog, summary, plan, before, began = false;

    function fail(message) { throw new Error(message); }
    function leaf(name) { var a = String(name).split(":"); return a[a.length - 1]; }
    function closeNumber(a, b) {
        return typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.01;
    }
    function exactStyle(name) {
        var found = null, n;
        for (n = 0; n < styles.length; n += 1) {
            if (leaf(styles[n].name) === name) {
                if (found) { fail("Two styles are named " + name + ". Give them unique names before using Size Controls."); }
                found = styles[n];
            }
        }
        if (!found) { fail("Missing " + name + ". Use the pitch.dog v0.03 starter or a deck made from it."); }
        return found;
    }
    function appearance(style) {
        var font = style.appliedFont, colour = style.fillColor;
        return [typeof font === "string" ? font : font.name, String(style.fontStyle),
            typeof colour === "string" ? colour : String(colour.id), String(style.fillTint)].join("|");
    }
    function snapshot() {
        var result = [], n, r;
        for (n = 0; n < roles.length; n += 1) {
            r = roles[n];
            result.push(String(r.style.basedOn.id), String(r.style.pointSize), String(r.style.leading), appearance(r.style));
        }
        return result.join("\n");
    }
    function addRole(name) {
        var r = { name: name, style: exactStyle("Project | " + name), presets: [], original: null }, n, p;
        for (n = 0; n < styles.length; n += 1) {
            p = styles[n];
            if (leaf(p.name).indexOf(name + " | ") === 0 && typeof p.pointSize === "number" && typeof p.leading === "number") {
                r.presets.push(p);
            }
        }
        r.presets.sort(function (a, b) { return a.pointSize - b.pointSize; });
        if (!r.presets.length) { fail("No " + name + " size presets found."); }
        r.original = { size: r.style.pointSize, leading: r.style.leading, appearance: appearance(r.style) };
        roles.push(r);
    }
    function selectedPreset(r) {
        return r.choice.selection && r.choice.selection.index > 0 ? r.presets[r.choice.selection.index - 1] : null;
    }
    function updateSummary() {
        var changes = [], n, p;
        for (n = 0; n < roles.length; n += 1) {
            p = selectedPreset(roles[n]);
            if (p && (!closeNumber(roles[n].original.size, p.pointSize) || !closeNumber(roles[n].original.leading, p.leading))) {
                changes.push(roles[n].name + ": " + roles[n].original.size + "/" + roles[n].original.leading + " > " + p.pointSize + "/" + p.leading);
            }
        }
        summary.text = changes.length ? changes.join("    |    ") : "Choose a size, or take one step smaller / larger.";
    }
    function step(r, direction) {
        var p = selectedPreset(r), size = p ? p.pointSize : r.original.size, n, found = -1;
        if (direction > 0) {
            for (n = 0; n < r.presets.length; n += 1) {
                if (r.presets[n].pointSize > size + 0.01) { found = n; break; }
            }
        } else {
            for (n = r.presets.length - 1; n >= 0; n -= 1) {
                if (r.presets[n].pointSize < size - 0.01) { found = n; break; }
            }
        }
        if (found >= 0) { r.choice.selection = found + 1; }
        updateSummary();
    }
    function buildRow(r) {
        var p = dialog.add("panel", undefined, r.name), g, n;
        p.orientation = "column"; p.alignChildren = "left"; p.margins = 12;
        p.add("statictext", undefined, "Current: " + r.original.size + " pt / " + r.original.leading + " pt leading");
        g = p.add("group");
        var smaller = g.add("button", undefined, "Smaller");
        r.choice = g.add("dropdownlist"); r.choice.preferredSize.width = 365;
        r.choice.add("item", "Keep current size");
        for (n = 0; n < r.presets.length; n += 1) {
            r.choice.add("item", leaf(r.presets[n].name) + " / " + r.presets[n].leading + " leading");
        }
        r.choice.selection = 0;
        var larger = g.add("button", undefined, "Larger");
        smaller.onClick = function () { step(r, -1); };
        larger.onClick = function () { step(r, 1); };
        r.choice.onChange = updateSummary;
    }
    function getPlan() {
        var result = [], n, r, p;
        if (!doc.isValid || app.activeDocument.id !== doc.id) { fail("The active document changed. Reopen Size Controls for that document."); }
        for (n = 0; n < roles.length; n += 1) {
            r = roles[n]; p = selectedPreset(r);
            if (p && (r.style.basedOn.id !== p.id || !closeNumber(r.style.pointSize, p.pointSize) || !closeNumber(r.style.leading, p.leading))) {
                result.push({ role: r, preset: p });
            }
        }
        return result;
    }
    function overflowPages() {
        var result = [], n, j, items, frame, parent, printable;
        for (n = 0; n < doc.pages.length; n += 1) {
            // Page collections omit frames inside groups; allPageItems includes them.
            items = doc.pages[n].allPageItems;
            for (j = 0; j < items.length; j += 1) {
                frame = items[j];
                if (!(frame instanceof TextFrame) || !frame.overflows || frame.nonprinting ||
                        !frame.itemLayer.visible || !frame.itemLayer.printable) { continue; }
                printable = true; parent = frame.parent;
                while (parent instanceof Group) {
                    if (parent.nonprinting || !parent.itemLayer.visible || !parent.itemLayer.printable) {
                        printable = false; break;
                    }
                    parent = parent.parent;
                }
                if (printable) { result.push(doc.pages[n].name); break; }
            }
        }
        return result;
    }

    try {
        if (!app.documents.length) { fail("Open your pitch.dog starter or project deck first."); }
        doc = app.activeDocument; styles = doc.allParagraphStyles;
        addRole("Head"); addRole("Sub"); addRole("Body");
        dialog = new Window("dialog", TITLE);
        dialog.orientation = "column"; dialog.alignChildren = "fill";
        dialog.add("statictext", undefined, "Document: " + doc.name);
        dialog.add("statictext", undefined, "Step through your existing size scale. Line spacing follows each preset.");
        var n;
        for (n = 0; n < roles.length; n += 1) { buildRow(roles[n]); }
        var all = dialog.add("group"); all.alignment = "center";
        var allSmall = all.add("button", undefined, "All one step smaller");
        var allLarge = all.add("button", undefined, "All one step larger");
        allSmall.onClick = function () { var j; for (j = 0; j < roles.length; j += 1) { step(roles[j], -1); } };
        allLarge.onClick = function () { var j; for (j = 0; j < roles.length; j += 1) { step(roles[j], 1); } };
        summary = dialog.add("statictext", undefined, "Choose a size, or take one step smaller / larger.");
        summary.preferredSize.width = 580;
        dialog.add("statictext", undefined, "Related styles follow their Project role wherever they inherit its size.");
        dialog.add("statictext", undefined, "Apply creates one Undo step. Review the pages, then save.");
        var buttons = dialog.add("group"); buttons.alignment = "right";
        buttons.add("button", undefined, "Cancel", { name: "cancel" });
        var apply = buttons.add("button", undefined, "Apply", { name: "ok" });
        apply.onClick = function () {
            try { plan = getPlan(); dialog.close(1); }
            catch (e) { alert(e.message, TITLE); }
        };
        if (dialog.show() !== 1 || !plan) { return; }
        if (!plan.length) { alert("No size settings changed.", TITLE); return; }
        before = snapshot();
        app.doScript(function () {
            var j, change;
            // Begin this transaction before editing styles, so recovery cannot undo earlier work.
            doc.insertLabel("pitchdog.size-controls.last-action", String(new Date().getTime())); began = true;
            for (j = 0; j < plan.length; j += 1) {
                change = plan[j]; change.role.style.basedOn = change.preset;
                if (!closeNumber(change.role.style.pointSize, change.preset.pointSize) || !closeNumber(change.role.style.leading, change.preset.leading)) {
                    fail(change.role.name + " has a fixed size or leading override in its Project style. Remove that override before switching presets. This change will be undone.");
                }
                if (appearance(change.role.style) !== change.role.original.appearance) {
                    fail("That " + change.role.name + " preset also changes its font, face or colour. Size Controls only accepts the connected size presets. This change will be undone.");
                }
            }
            doc.recompose();
        }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, UNDO);
        var overflow = overflowPages();
        alert("Sizes updated in " + doc.name + ". Review the pages, then save.\n\nEdit > Undo " + UNDO + " restores the previous sizes." +
            (overflow.length ? "\n\nOverset text on pages: " + overflow.join(", ") + ". Enlarge or recompose those frames." : "\n\nNo overset text found in visible, printable page text frames."), TITLE);
    } catch (e) {
        var message = String(e.message || e).replace(/^Uncaught JavaScript exception:\s*/, "");
        if (began) {
            try {
                doc.undo();
                if (snapshot() !== before) { fail("Restored settings differ from their original values."); }
                message += "\n\nThe size change was undone. Previous settings were restored.";
            } catch (undoError) {
                message += "\n\nAutomatic recovery could not be verified. Do not save over your original; inspect Undo or reopen your saved file.";
            }
        }
        alert(message, TITLE);
    }
}());
