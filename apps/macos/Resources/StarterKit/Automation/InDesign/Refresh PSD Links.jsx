#target indesign
(function(){
    try {
        $.evalFile(File(File($.fileName).parent.fsName+'/Deck Production.jsxinc'));
        var result=PitchdogDeckProduction.chooseRefresh();
        if(result)alert('Refreshed '+result.refreshedPlacements+' image placements.\nReturned PSDs installed: '+result.replacedPSDs+'.\n\nThe deck is saved.\nBackup: '+result.backup+(result.warning?'\n\n'+result.warning:''),'pitch.dog Deck Production');
    } catch(error) { alert('Refresh stopped: '+(error.message||String(error)),'pitch.dog Deck Production'); }
}());
