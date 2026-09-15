#target indesign
/* Workbench's portable automatic build. Run the copy in a handoff's Automation folder. */
(function () {
    var automation = File($.fileName).parent, root = automation.parent;
    var template = null, original = null, oldUI = app.scriptPreferences.userInteractionLevel;
    var oldUnits = app.scriptPreferences.measurementUnit, job = null, outcome = null, ownsScratch = false;
    function read(file) {
        file.encoding = 'UTF-8'; if (!file.open('r')) throw Error('Cannot read ' + file.name);
        try { return file.read(); } finally { file.close(); }
    }
    function json(value) {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'string') return '"' + value.replace(/[\\"\x00-\x1f]/g, function(c) {
            if (c === '\\') return '\\\\'; if (c === '"') return '\\"';
            return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        var values = [], i, key;
        if (value instanceof Array) { for (i=0;i<value.length;i++) values.push(json(value[i])); return '['+values.join(',')+']'; }
        for (key in value) if (value.hasOwnProperty(key)) values.push(json(key)+':'+json(value[key]));
        return '{'+values.join(',')+'}';
    }
    function write(file, value) {
        file.encoding = 'UTF-8'; if (!file.open('w')) throw Error('Cannot write ' + file.name);
        try { file.write(json(value)+'\n'); } finally { file.close(); }
    }
    function check() {
        if (File(automation.fsName+'/cancel').exists) throw Error('Build cancelled. The completed handoff is safe; any partial InDesign folder is marked incomplete.');
    }
    try {
        if (app.documents.length) original = app.activeDocument;
        var kit = Folder(root.fsName+'/Starter Kit');
        $.evalFile(File(kit.fsName+'/Automation/InDesign/Deck Production.jsxinc'));
        job = PitchdogDeckProduction.parseJSON(read(File(automation.fsName+'/job.json')));
        if (job.format !== 'pitchdog-indesign-job/1' || !job.runID || (job.width !== 1920 && job.width !== 2576)) throw Error('Invalid Workbench build job. Export a new handoff from Workbench.');
        check(); app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
        var relative = (job.width === 1920 ? '1920x1080/' : '') + '[Starter File] [Pitch Deck] '+job.width+'x1080 v0.03 [pitch.dog].indd';
        // Open an owned copy, never a resource or an already open user document.
        var scratch = File(automation.fsName+'/Build starter.indd');
        if (scratch.exists) throw Error('This build job was already run. Export a fresh handoff to retry.');
        if (!File(kit.fsName+'/'+relative).copy(scratch)) throw Error('Could not copy the starter.');
        ownsScratch = true;
        template = app.open(scratch);
        var missing = [];
        for (var i=0;i<template.fonts.length;i++) if (template.fonts[i].status !== FontStatus.INSTALLED) missing.push(template.fonts[i].name);
        if (missing.length) throw Error('Install these starter fonts before building: '+missing.join(', ')+'. PSDs and copy are ready.');
        check();
        outcome = PitchdogDeckProduction.build({document: template, markdownFile: File(root.fsName+'/Production/workbench.md'),
            outputParent: root, projectName: 'InDesign', stack: 'text-over-character', interactive: false, onProgress: check});
        if (outcome.slides !== job.slideCount) throw Error('The saved deck has a different slide count from the Workbench job.');
        outcome.runID = job.runID;
        // Source references are relative so the manifest travels with the folder.
        var manifestFile = File(root.fsName+'/InDesign/deck-production.json');
        var manifest = PitchdogDeckProduction.parseJSON(read(manifestFile));
        manifest.sourceWorkbench = '../Production/workbench.md';
        manifest.sourceStarter = '../Starter Kit/'+relative;
        manifest.sourcePSD = '../Starter Kit/'+(job.width===1920?'1920x1080/':'')+'slide-00 - '+job.width+'x1080.psd';
        manifest.sourceProductionBundle = '../Production';
        write(manifestFile, manifest);
    } catch (e) {
        outcome = {ok:false, runID:job ? job.runID : '', message:e.message || String(e), line:e.line || 0};
    } finally {
        if (template && template.isValid) { try { template.close(SaveOptions.NO); } catch (_) {} }
        if (outcome && !outcome.ok && original && original.isValid) { try { app.activeDocument=original; } catch (_) {} }
        app.scriptPreferences.userInteractionLevel=oldUI;
        app.scriptPreferences.measurementUnit=oldUnits;
        write(File(automation.fsName+'/result.json'), outcome || {ok:false, message:'No build result.'});
        var cleanup = File(automation.fsName+'/Build starter.indd');
        if (ownsScratch && cleanup.exists && (!template || !template.isValid)) cleanup.remove();
    }
})();
