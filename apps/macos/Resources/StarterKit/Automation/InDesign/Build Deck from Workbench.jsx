#target indesign
(function(){
    try {
        $.evalFile(File(File($.fileName).parent.fsName+'/Deck Production.jsxinc'));
        var r=PitchdogDeckProduction.chooseBuild();
        if(r)alert('Created '+r.slides+' slides and '+r.psds+' numbered PSD files.\n\n'+r.document+(r.overflow.length?'\n\nText overflow on pages: '+r.overflow.join(', ')+'. All writing is retained.':'\n\nNo text overflow reported.')+'\n\nPSD - BACKGROUNDS and PSD - CHARACTERS are locked to prevent accidental movement.','Deck created');
    }catch(e){alert((e.message||String(e))+'\n\nYour original starter is unchanged. An incomplete build, if created, stays in its new project folder.','Build stopped');}
})();
