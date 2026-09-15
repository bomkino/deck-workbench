#target indesign
// pitch.dog Deck Colour Controls 1.0.0. Explicit Apply, one Undo, no automatic save.
(function () {
    var title='pitch.dog / Deck Colour Controls',doc,core,library,choice,dialog,base,slots=[],mono,status,apply,previews=[],prepared,started=false;
    try {
        if(!app.documents.length)throw new Error('Open your pitch.dog starter or project deck first.');
        doc=app.activeDocument;
        var support=File(File($.fileName).parent.fsName+'/Colour System/Colour Core.jsxinc');
        if(!support.exists)throw new Error('Keep the Colour System folder beside Deck Colour Controls.jsx.');
        $.evalFile(support);core=PitchdogColours;library=core.library();choice=core.selected(doc);
        function selectedIndex(items,id){for(var i=0;i<items.length;i++)if(items[i].id===id)return i;return 0;}
        function picker(parent,items,id,width){var p=parent.add('dropdownlist');p.preferredSize.width=width;for(var i=0;i<items.length;i++)p.add('item',items[i].label);p.selection=selectedIndex(items,id);return p;}
        function prepare(){var s={version:library.version,base:library.bases[base.selection.index].id,accents:[],mono:mono.value};for(var i=0;i<4;i++)s.accents.push(library.families[slots[i].selection.index].id);return {selection:s,palette:core.resolve(library,s)};}
        function rgba(hex){var v=core.rgb(hex);return [v[0]/255,v[1]/255,v[2]/255,1];}
        function preview(parent,mode,role){var p=parent.add('panel');p.preferredSize=[220,64];p.mode=mode;p.role=role;
            p.onDraw=function(){var g=this.graphics;if(!prepared)return;var c=prepared.palette.colors,mode=this.mode,k=this.role,w=this.size.width,h=this.size.height;
                function rect(x,y,rw,rh,colour){g.newPath();g.rectPath(x,y,rw,rh);g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR,rgba(colour)));}
                function text(s,x,y,colour){g.drawString(s,g.newPen(g.PenType.SOLID_COLOR,rgba(colour),1),x,y);}
                rect(0,0,w,h,c.background[mode]);text(mode==='dark'?'Dark slide':'Light slide',10,7,c.text[mode]);text('Aa',10,32,c[k][mode]);
                rect(53,28,70,28,c[k+'.solid'][mode]);text('Fill',71,34,c[k+'.onSolid'][mode]);rect(131,28,77,28,c[k+'.soft'][mode]);text('Soft',151,34,c[k+'.onSoft'][mode]);rect(0,h-2,w,2,c[k+'.line'][mode]);
            };previews.push(p);return p;
        }
        function update(){try{prepared=prepare();var r=core.report(prepared.palette);status.text=r.ok?'Checked: text pairs meet 4.5:1; meaningful lines meet 3:1.':'Check these pairs before using: '+r.issues.slice(0,3).join('; ')+(r.issues.length>3?' (+'+(r.issues.length-3)+' more)':'');apply.enabled=r.ok;for(var i=0;i<previews.length;i++){previews[i].visible=false;previews[i].visible=true;}dialog.update();}catch(e){status.text=e.message;apply.enabled=false;}}
        dialog=new Window('dialog',title);dialog.orientation='column';dialog.alignChildren='fill';
        dialog.add('statictext',undefined,'Document: '+doc.name);
        dialog.add('statictext',undefined,'Choose a project palette. Your dark and light pages stay as they are.');
        var row=dialog.add('group');row.add('statictext',undefined,'Base');base=picker(row,library.bases,choice.base,280);mono=row.add('checkbox',undefined,'Make all accents Mono');mono.value=!!choice.mono;
        var names=['Primary (main colour)','Secondary','Accent 3','Accent 4 (optional)'];
        for(var i=0;i<4;i++){
            var panel=dialog.add('panel',undefined,names[i]);panel.orientation='row';panel.alignChildren='center';
            slots.push(picker(panel,library.families,choice.accents[i],175));preview(panel,'dark','accent'+(i+1));preview(panel,'light','accent'+(i+1));
        }
        dialog.add('statictext',undefined,'Each preview: accent text / strong fill + ink / soft fill + ink. The line shows its divider colour.');
        dialog.add('statictext',undefined,'Mono styles are always available. Leave unused accents alone; they add no colour to a page.');
        status=dialog.add('statictext',undefined,'',{multiline:true});status.preferredSize=[640,44];
        dialog.add('statictext',undefined,'Apply changes named project swatches throughout this document, including imported palettes.');
        dialog.add('statictext',undefined,'Fonts, sizes, copy, layouts and per-page dark/light choices remain yours. One Undo restores colours.');
        var buttons=dialog.add('group');buttons.alignment='right';buttons.add('button',undefined,'Cancel',{name:'cancel'});apply=buttons.add('button',undefined,'Apply project colours',{name:'ok'});
        apply.onClick=function(){try{if(!doc.isValid||app.activeDocument.id!==doc.id)throw new Error('The active document changed. Reopen Colour Controls.');prepared=prepare();var r=core.report(prepared.palette);if(!r.ok)throw new Error(r.issues.join('\n'));dialog.close(1);}catch(e){alert(e.message,title);}};
        base.onChange=update;mono.onClick=update;for(i=0;i<slots.length;i++)slots[i].onChange=update;dialog.onShow=update;
        if(dialog.show()!==1)return;
        app.doScript(function(){doc.insertLabel('pitchdog.colours.last-action',String(new Date().getTime()));started=true;core.apply(doc,prepared.palette,prepared.selection);},ScriptLanguage.JAVASCRIPT,undefined,UndoModes.ENTIRE_SCRIPT,'Change deck project colours');
        alert('Project colours updated. Review your pages, then save.\n\nUse Character Styles / Object Styles > Project Colours for Primary, Secondary, Accent 3, Accent 4 and Mono.\n\nUse the matching Ink on fill / Ink on soft style for text on a coloured shape.\n\nChecks apply to solid colours. Recheck text placed over photos, gradients or transparency.',title);
    }catch(e){if(started){try{doc.undo();}catch(u){}}alert(String(e.message||e)+(started?'\n\nThe colour change was undone.':''),title);}
}());
