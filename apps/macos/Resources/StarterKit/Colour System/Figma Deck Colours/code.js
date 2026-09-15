/* Deck Colours 1.0.0. The palette is pinned to pitchdog-colours/1 v1.0.0. */
const PD_SLOT_NAMES = {accent1:"Primary",accent2:"Secondary",accent3:"Third",accent4:"Fourth",mono:"Mono"};
const PD_ACCENT_ROLES = {text:"Text",solid:"Solid",onSolid:"On solid",soft:"Soft",onSoft:"On soft",line:"Line"};
const PD_BASE_ROLES = {background:"Surface/Base",text:"Ink/Primary",muted:"Ink/Muted",raised:"Surface/Raised",line:"Rule/Divider"};
function pdHex(value) {
  if (!value || typeof value.r !== "number") return null;
  return "#" + [value.r,value.g,value.b].map(n=>Math.round(n*255).toString(16).padStart(2,"0")).join("").toUpperCase();
}
function pdContext(collections,variables) {
  const collection=collections.find(c=>c.name==="pitch.dog / Colour");
  const palette=collections.find(c=>c.name==="pitch.dog / Palette");
  if (!collection || !palette) throw new Error("Open a copy of the updated pitch.dog starter. Its Colour and Palette variables are required.");
  const dark=collection.modes.find(m=>m.name==="Dark"),light=collection.modes.find(m=>m.name==="Light");
  if (!dark || !light) throw new Error("The starter needs its Dark and Light colour modes.");
  const byName=new Map();
  for (const v of variables) {
    if (v.variableCollectionId!==collection.id && v.variableCollectionId!==palette.id) continue;
    if (byName.has(v.name)) throw new Error("Duplicate colour variable: "+v.name+". Resolve the duplicate before changing the palette.");
    byName.set(v.name,v);
  }
  return {collection,palette,byName,modes:{dark:dark.modeId,light:light.modeId}};
}
function pdPlan(data,selection,context) {
  if (data.schema!=="pitchdog-colours/1" || data.version!=="1.0.0") throw new Error("Unsupported palette version.");
  const operations=[];
  function pair(targetName,sourceNameFor,expectedFor) {
    const variable=context.byName.get(targetName);
    if (!variable || variable.variableCollectionId!==context.collection.id) throw new Error("Missing project colour: "+targetName+". Use the updated starter.");
    const values={};
    for (const mode of ["dark","light"]) {
      const sourceName=sourceNameFor(mode);
      const source=context.byName.get(sourceName);
      if (!source || source.variableCollectionId!==context.palette.id) throw new Error("Missing library colour: "+sourceName+". Use the updated starter.");
      const sourceValue=source.valuesByMode[context.palette.defaultModeId];
      if (pdHex(sourceValue)!==expectedFor(mode).toUpperCase()) throw new Error("The library colour has changed: "+sourceName+". Restore the pinned palette before using this helper.");
      values[context.modes[mode]]={type:"VARIABLE_ALIAS",id:source.id};
    }
    operations.push({variable,name:targetName,values});
  }
  if (selection.base && selection.base!=="__keep__") {
    const base=data.bases.find(b=>b.id===selection.base);
    if (!base) throw new Error("Unknown base: "+selection.base);
    for (const [role,name] of Object.entries(PD_BASE_ROLES)) {
      pair(name,m=>"Library/Bases/"+base.label+"/"+(m==="dark"?"Dark":"Light")+"/"+role[0].toUpperCase()+role.slice(1),m=>base[m][role]);
    }
  }
  for (const [slot,label] of Object.entries(PD_SLOT_NAMES)) {
    const id=selection[slot];
    if (!id || id==="__keep__") continue;
    const family=data.families.find(f=>f.id===id);
    if (!family) throw new Error("Unknown colour family: "+id);
    for (const [role,title] of Object.entries(PD_ACCENT_ROLES)) {
      pair("Accent/"+label+"/"+title,m=>"Library/Accents/"+family.label+"/"+(m==="dark"?"Dark":"Light")+"/"+title,m=>family[m][role]);
    }
  }
  return operations;
}
function pdApplyPlan(operations) {
  const snapshot=operations.map(op=>({variable:op.variable,name:op.name,values:JSON.parse(JSON.stringify(op.variable.valuesByMode))}));
  try {
    for (const op of operations) for (const [mode,value] of Object.entries(op.values)) op.variable.setValueForMode(mode,value);
    for (const op of operations) for (const [mode,value] of Object.entries(op.values)) {
      const actual=op.variable.valuesByMode[mode];
      if (!actual || actual.type!=="VARIABLE_ALIAS" || actual.id!==value.id) throw new Error("Colour readback failed: "+op.name);
    }
  } catch (error) {
    for (const item of snapshot) for (const [mode,value] of Object.entries(item.values)) item.variable.setValueForMode(mode,value);
    throw error;
  }
  return snapshot;
}
function pdRestore(snapshot) {
  for (const item of snapshot) for (const [mode,value] of Object.entries(item.values)) item.variable.setValueForMode(mode,value);
}
async function pdLoadStyleFonts() {
  const styles=await figma.getLocalTextStylesAsync();
  const fonts=new Map(styles.map(s=>[JSON.stringify(s.fontName),s.fontName]));
  await Promise.all([...fonts.values()].map(f=>figma.loadFontAsync(f)));
}

const PD_DATA = {"schema":"pitchdog-colours/1","version":"1.0.0","colorSpace":"sRGB","source":{"name":"@radix-ui/colors","version":"3.0.0","license":"MIT","ramps":"Unmodified sRGB ramps; deck roles selected for the listed neutral bases."},"defaults":{"base":"studio","accent1":"pink","accent2":"purple","accent3":"blue","accent4":"teal","mono":"gray"},"bases":[{"id":"studio","label":"Studio · warm ink & cream","dark":{"background":"#24171D","text":"#FFF8EE","muted":"#C7BBC1","raised":"#3A2832","line":"#917A87"},"light":{"background":"#FFF8EE","text":"#24171D","muted":"#6F5B63","raised":"#ECE3D8","line":"#806C75"}},{"id":"gray","label":"Neutral · Gray","dark":{"background":"#111111","text":"#EEEEEE","muted":"#B4B4B4","raised":"#222222","line":"#6E6E6E"},"light":{"background":"#FCFCFC","text":"#202020","muted":"#646464","raised":"#F0F0F0","line":"#838383"}},{"id":"sand","label":"Warm · Sand","dark":{"background":"#111110","text":"#EEEEEC","muted":"#B5B3AD","raised":"#222221","line":"#6F6D66"},"light":{"background":"#FDFDFC","text":"#21201C","muted":"#63635E","raised":"#F1F0EF","line":"#82827C"}},{"id":"slate","label":"Cool · Slate","dark":{"background":"#111113","text":"#EDEEF0","muted":"#B0B4BA","raised":"#212225","line":"#696E77"},"light":{"background":"#FCFCFD","text":"#1C2024","muted":"#60646C","raised":"#F0F0F3","line":"#80838D"}},{"id":"blackwhite","label":"Black & white","dark":{"background":"#000000","text":"#FFFFFF","muted":"#B8B8B8","raised":"#1C1C1C","line":"#777777"},"light":{"background":"#FFFFFF","text":"#000000","muted":"#555555","raised":"#F0F0F0","line":"#777777"}}],"families":[{"id":"tomato","label":"Coral · Tomato","group":"Colour","steps":{"dark":["#181111","#1F1513","#391714","#4E1511","#5E1C16","#6E2920","#853A2D","#AC4D39","#E54D2E","#EC6142","#FF977D","#FBD3CB"],"light":["#FFFCFC","#FFF8F7","#FEEBE7","#FFDCD3","#FFCDC2","#FDBDAF","#F5A898","#EC8E7B","#E54D2E","#DD4425","#D13415","#5C271F"]},"dark":{"text":"#FF977D","solid":"#E54D2E","onSolid":"#000000","soft":"#391714","onSoft":"#FF977D","line":"#E54D2E"},"light":{"text":"#5C271F","solid":"#E54D2E","onSolid":"#000000","soft":"#FEEBE7","onSoft":"#5C271F","line":"#E54D2E"}},{"id":"red","label":"Red","group":"Colour","steps":{"dark":["#191111","#201314","#3B1219","#500F1C","#611623","#72232D","#8C333A","#B54548","#E5484D","#EC5D5E","#FF9592","#FFD1D9"],"light":["#FFFCFC","#FFF7F7","#FEEBEC","#FFDBDC","#FFCDCE","#FDBDBE","#F4A9AA","#EB8E90","#E5484D","#DC3E42","#CE2C31","#641723"]},"dark":{"text":"#FF9592","solid":"#E5484D","onSolid":"#000000","soft":"#3B1219","onSoft":"#FF9592","line":"#E5484D"},"light":{"text":"#641723","solid":"#E5484D","onSolid":"#000000","soft":"#FEEBEC","onSoft":"#CE2C31","line":"#E5484D"}},{"id":"ruby","label":"Ruby Red","group":"Colour","steps":{"dark":["#191113","#1E1517","#3A141E","#4E1325","#5E1A2E","#6F2539","#883447","#B3445A","#E54666","#EC5A72","#FF949D","#FED2E1"],"light":["#FFFCFD","#FFF7F8","#FEEAED","#FFDCE1","#FFCED6","#F8BFC8","#EFACB8","#E592A3","#E54666","#DC3B5D","#CA244D","#64172B"]},"dark":{"text":"#FF949D","solid":"#E54666","onSolid":"#000000","soft":"#3A141E","onSoft":"#FF949D","line":"#E54666"},"light":{"text":"#64172B","solid":"#E54666","onSolid":"#000000","soft":"#FEEAED","onSoft":"#CA244D","line":"#E54666"}},{"id":"crimson","label":"Crimson","group":"Colour","steps":{"dark":["#191114","#201318","#381525","#4D122F","#5C1839","#6D2545","#873356","#B0436E","#E93D82","#EE518A","#FF92AD","#FDD3E8"],"light":["#FFFCFD","#FEF7F9","#FFE9F0","#FEDCE7","#FACEDD","#F3BED1","#EAACC3","#E093B2","#E93D82","#DF3478","#CB1D63","#621639"]},"dark":{"text":"#FF92AD","solid":"#E93D82","onSolid":"#000000","soft":"#381525","onSoft":"#FF92AD","line":"#E93D82"},"light":{"text":"#621639","solid":"#E93D82","onSolid":"#000000","soft":"#FFE9F0","onSoft":"#CB1D63","line":"#E93D82"}},{"id":"pink","label":"Pink","group":"Colour","steps":{"dark":["#191117","#21121D","#37172F","#4B143D","#591C47","#692955","#833869","#A84885","#D6409F","#DE51A8","#FF8DCC","#FDD1EA"],"light":["#FFFCFE","#FEF7FB","#FEE9F5","#FBDCEF","#F6CEE7","#EFBFDD","#E7ACD0","#DD93C2","#D6409F","#CF3897","#C2298A","#651249"]},"dark":{"text":"#FF8DCC","solid":"#D6409F","onSolid":"#000000","soft":"#37172F","onSoft":"#FF8DCC","line":"#D6409F"},"light":{"text":"#651249","solid":"#D6409F","onSolid":"#000000","soft":"#FEE9F5","onSoft":"#C2298A","line":"#D6409F"}},{"id":"plum","label":"Plum","group":"Colour","steps":{"dark":["#181118","#201320","#351A35","#451D47","#512454","#5E3061","#734079","#92549C","#AB4ABA","#B658C4","#E796F3","#F4D4F4"],"light":["#FEFCFF","#FDF7FD","#FBEBFB","#F7DEF8","#F2D1F3","#E9C2EC","#DEADE3","#CF91D8","#AB4ABA","#A144AF","#953EA3","#53195D"]},"dark":{"text":"#E796F3","solid":"#AB4ABA","onSolid":"#FFF8EE","soft":"#351A35","onSoft":"#E796F3","line":"#B658C4"},"light":{"text":"#953EA3","solid":"#AB4ABA","onSolid":"#FFF8EE","soft":"#FBEBFB","onSoft":"#953EA3","line":"#AB4ABA"}},{"id":"purple","label":"Purple","group":"Colour","steps":{"dark":["#18111B","#1E1523","#301C3B","#3D224E","#48295C","#54346B","#664282","#8457AA","#8E4EC6","#9A5CD0","#D19DFF","#ECD9FA"],"light":["#FEFCFE","#FBF7FE","#F7EDFE","#F2E2FC","#EAD5F9","#E0C4F4","#D1AFEC","#BE93E4","#8E4EC6","#8347B9","#8145B5","#402060"]},"dark":{"text":"#D19DFF","solid":"#8E4EC6","onSolid":"#FFF8EE","soft":"#301C3B","onSoft":"#D19DFF","line":"#9A5CD0"},"light":{"text":"#8347B9","solid":"#8E4EC6","onSolid":"#FFF8EE","soft":"#F7EDFE","onSoft":"#8145B5","line":"#8E4EC6"}},{"id":"violet","label":"Violet","group":"Colour","steps":{"dark":["#14121F","#1B1525","#291F43","#33255B","#3C2E69","#473876","#56468B","#6958AD","#6E56CF","#7D66D9","#BAA7FF","#E2DDFE"],"light":["#FDFCFE","#FAF8FF","#F4F0FE","#EBE4FF","#E1D9FF","#D4CAFE","#C2B5F5","#AA99EC","#6E56CF","#654DC4","#6550B9","#2F265F"]},"dark":{"text":"#BAA7FF","solid":"#6E56CF","onSolid":"#FFF8EE","soft":"#291F43","onSoft":"#BAA7FF","line":"#7D66D9"},"light":{"text":"#654DC4","solid":"#6E56CF","onSolid":"#FFF8EE","soft":"#F4F0FE","onSoft":"#6550B9","line":"#6E56CF"}},{"id":"iris","label":"Iris Blue","group":"Colour","steps":{"dark":["#13131E","#171625","#202248","#262A65","#303374","#3D3E82","#4A4A95","#5958B1","#5B5BD6","#6E6ADE","#B1A9FF","#E0DFFE"],"light":["#FDFDFF","#F8F8FF","#F0F1FE","#E6E7FF","#DADCFF","#CBCDFF","#B8BAF8","#9B9EF0","#5B5BD6","#5151CD","#5753C6","#272962"]},"dark":{"text":"#B1A9FF","solid":"#5B5BD6","onSolid":"#FFF8EE","soft":"#202248","onSoft":"#B1A9FF","line":"#6E6ADE"},"light":{"text":"#5151CD","solid":"#5B5BD6","onSolid":"#FFF8EE","soft":"#F0F1FE","onSoft":"#5753C6","line":"#5B5BD6"}},{"id":"indigo","label":"Indigo","group":"Colour","steps":{"dark":["#11131F","#141726","#182449","#1D2E62","#253974","#304384","#3A4F97","#435DB1","#3E63DD","#5472E4","#9EB1FF","#D6E1FF"],"light":["#FDFDFE","#F7F9FF","#EDF2FE","#E1E9FF","#D2DEFF","#C1D0FF","#ABBDF9","#8DA4EF","#3E63DD","#3358D4","#3A5BC7","#1F2D5C"]},"dark":{"text":"#9EB1FF","solid":"#3E63DD","onSolid":"#FFF8EE","soft":"#182449","onSoft":"#9EB1FF","line":"#5472E4"},"light":{"text":"#3358D4","solid":"#3E63DD","onSolid":"#FFF8EE","soft":"#EDF2FE","onSoft":"#3A5BC7","line":"#3E63DD"}},{"id":"blue","label":"Ocean · Blue","group":"Colour","steps":{"dark":["#0D1520","#111927","#0D2847","#003362","#004074","#104D87","#205D9E","#2870BD","#0090FF","#3B9EFF","#70B8FF","#C2E6FF"],"light":["#FBFDFF","#F4FAFF","#E6F4FE","#D5EFFF","#C2E5FF","#ACD8FC","#8EC8F6","#5EB1EF","#0090FF","#0588F0","#0D74CE","#113264"]},"dark":{"text":"#3B9EFF","solid":"#0090FF","onSolid":"#24171D","soft":"#0D2847","onSoft":"#70B8FF","line":"#0090FF"},"light":{"text":"#113264","solid":"#0090FF","onSolid":"#24171D","soft":"#E6F4FE","onSoft":"#113264","line":"#0D74CE"}},{"id":"cyan","label":"Cyan","group":"Colour","steps":{"dark":["#0B161A","#101B20","#082C36","#003848","#004558","#045468","#12677E","#11809C","#00A2C7","#23AFD0","#4CCCE6","#B6ECF7"],"light":["#FAFDFE","#F2FAFB","#DEF7F9","#CAF1F6","#B5E9F0","#9DDDE7","#7DCEDC","#3DB9CF","#00A2C7","#0797B9","#107D98","#0D3C48"]},"dark":{"text":"#00A2C7","solid":"#00A2C7","onSolid":"#24171D","soft":"#082C36","onSoft":"#4CCCE6","line":"#11809C"},"light":{"text":"#0D3C48","solid":"#00A2C7","onSolid":"#24171D","soft":"#DEF7F9","onSoft":"#0D3C48","line":"#107D98"}},{"id":"teal","label":"Teal","group":"Colour","steps":{"dark":["#0D1514","#111C1B","#0D2D2A","#023B37","#084843","#145750","#1C6961","#207E73","#12A594","#0EB39E","#0BD8B6","#ADF0DD"],"light":["#FAFEFD","#F3FBF9","#E0F8F3","#CCF3EA","#B8EAE0","#A1DED2","#83CDC1","#53B9AB","#12A594","#0D9B8A","#008573","#0D3D38"]},"dark":{"text":"#0EB39E","solid":"#12A594","onSolid":"#24171D","soft":"#0D2D2A","onSoft":"#0BD8B6","line":"#12A594"},"light":{"text":"#0D3D38","solid":"#12A594","onSolid":"#24171D","soft":"#E0F8F3","onSoft":"#0D3D38","line":"#008573"}},{"id":"jade","label":"Jade Green","group":"Colour","steps":{"dark":["#0D1512","#121C18","#0F2E22","#0B3B2C","#114837","#1B5745","#246854","#2A7E68","#29A383","#27B08B","#1FD8A4","#ADF0D4"],"light":["#FBFEFD","#F4FBF7","#E6F7ED","#D6F1E3","#C3E9D7","#ACDEC8","#8BCEB6","#56BA9F","#29A383","#26997B","#208368","#1D3B31"]},"dark":{"text":"#27B08B","solid":"#29A383","onSolid":"#24171D","soft":"#0F2E22","onSoft":"#1FD8A4","line":"#29A383"},"light":{"text":"#1D3B31","solid":"#29A383","onSolid":"#24171D","soft":"#E6F7ED","onSoft":"#1D3B31","line":"#208368"}},{"id":"green","label":"Green","group":"Colour","steps":{"dark":["#0E1512","#121B17","#132D21","#113B29","#174933","#20573E","#28684A","#2F7C57","#30A46C","#33B074","#3DD68C","#B1F1CB"],"light":["#FBFEFC","#F4FBF6","#E6F6EB","#D6F1DF","#C4E8D1","#ADDDC0","#8ECEAA","#5BB98B","#30A46C","#2B9A66","#218358","#193B2D"]},"dark":{"text":"#33B074","solid":"#30A46C","onSolid":"#24171D","soft":"#132D21","onSoft":"#3DD68C","line":"#30A46C"},"light":{"text":"#193B2D","solid":"#30A46C","onSolid":"#24171D","soft":"#E6F6EB","onSoft":"#193B2D","line":"#218358"}},{"id":"grass","label":"Grass Green","group":"Colour","steps":{"dark":["#0E1511","#141A15","#1B2A1E","#1D3A24","#25482D","#2D5736","#366740","#3E7949","#46A758","#53B365","#71D083","#C2F0C2"],"light":["#FBFEFB","#F5FBF5","#E9F6E9","#DAF1DB","#C9E8CA","#B2DDB5","#94CE9A","#65BA74","#46A758","#3E9B4F","#2A7E3B","#203C25"]},"dark":{"text":"#46A758","solid":"#46A758","onSolid":"#24171D","soft":"#1B2A1E","onSoft":"#71D083","line":"#46A758"},"light":{"text":"#203C25","solid":"#46A758","onSolid":"#24171D","soft":"#E9F6E9","onSoft":"#2A7E3B","line":"#2A7E3B"}},{"id":"orange","label":"Sunset · Orange","group":"Colour","steps":{"dark":["#17120E","#1E160F","#331E0B","#462100","#562800","#66350C","#7E451D","#A35829","#F76B15","#FF801F","#FFA057","#FFE0C2"],"light":["#FEFCFB","#FFF7ED","#FFEFD6","#FFDFB5","#FFD19A","#FFC182","#F5AE73","#EC9455","#F76B15","#EF5F00","#CC4E00","#582D1D"]},"dark":{"text":"#F76B15","solid":"#F76B15","onSolid":"#24171D","soft":"#331E0B","onSoft":"#FFA057","line":"#F76B15"},"light":{"text":"#582D1D","solid":"#F76B15","onSolid":"#24171D","soft":"#FFEFD6","onSoft":"#582D1D","line":"#CC4E00"}},{"id":"amber","label":"Amber","group":"Colour","steps":{"dark":["#16120C","#1D180F","#302008","#3F2700","#4D3000","#5C3D05","#714F19","#8F6424","#FFC53D","#FFD60A","#FFCA16","#FFE7B3"],"light":["#FEFDFB","#FEFBE9","#FFF7C2","#FFEE9C","#FBE577","#F3D673","#E9C162","#E2A336","#FFC53D","#FFBA18","#AB6400","#4F3422"]},"dark":{"text":"#FFC53D","solid":"#FFC53D","onSolid":"#24171D","soft":"#302008","onSoft":"#FFCA16","line":"#FFC53D"},"light":{"text":"#4F3422","solid":"#FFC53D","onSolid":"#24171D","soft":"#FFF7C2","onSoft":"#4F3422","line":"#AB6400"}},{"id":"yellow","label":"Yellow","group":"Colour","steps":{"dark":["#14120B","#1B180F","#2D2305","#362B00","#433500","#524202","#665417","#836A21","#FFE629","#FFFF57","#F5E147","#F6EEB4"],"light":["#FDFDF9","#FEFCE9","#FFFAB8","#FFF394","#FFE770","#F3D768","#E4C767","#D5AE39","#FFE629","#FFDC00","#9E6C00","#473B1F"]},"dark":{"text":"#FFE629","solid":"#FFE629","onSolid":"#24171D","soft":"#2D2305","onSoft":"#F5E147","line":"#FFE629"},"light":{"text":"#473B1F","solid":"#FFE629","onSolid":"#24171D","soft":"#FFFAB8","onSoft":"#473B1F","line":"#9E6C00"}},{"id":"lime","label":"Lime","group":"Colour","steps":{"dark":["#11130C","#151A10","#1F2917","#29371D","#334423","#3D522A","#496231","#577538","#BDEE63","#D4FF70","#BDE56C","#E3F7BA"],"light":["#FCFDFA","#F8FAF3","#EEF6D6","#E2F0BD","#D3E7A6","#C2DA91","#ABC978","#8DB654","#BDEE63","#B0E64C","#5C7C2F","#37401C"]},"dark":{"text":"#BDEE63","solid":"#BDEE63","onSolid":"#24171D","soft":"#1F2917","onSoft":"#BDE56C","line":"#BDEE63"},"light":{"text":"#37401C","solid":"#BDEE63","onSolid":"#24171D","soft":"#EEF6D6","onSoft":"#37401C","line":"#5C7C2F"}},{"id":"mint","label":"Mint","group":"Colour","steps":{"dark":["#0E1515","#0F1B1B","#092C2B","#003A38","#004744","#105650","#1E685F","#277F70","#86EAD4","#A8F5E5","#58D5BA","#C4F5E1"],"light":["#F9FEFD","#F2FBF9","#DDF9F2","#C8F4E9","#B3ECDE","#9CE0D0","#7ECFBD","#4CBBA5","#86EAD4","#7DE0CB","#027864","#16433C"]},"dark":{"text":"#86EAD4","solid":"#86EAD4","onSolid":"#24171D","soft":"#092C2B","onSoft":"#58D5BA","line":"#86EAD4"},"light":{"text":"#16433C","solid":"#86EAD4","onSolid":"#24171D","soft":"#DDF9F2","onSoft":"#027864","line":"#027864"}},{"id":"sky","label":"Sky Blue","group":"Colour","steps":{"dark":["#0D141F","#111A27","#112840","#113555","#154467","#1B537B","#1F6692","#197CAE","#7CE2FE","#A8EEFF","#75C7F0","#C2F3FF"],"light":["#F9FEFF","#F1FAFD","#E1F6FD","#D1F0FA","#BEE7F5","#A9DAED","#8DCAE3","#60B3D7","#7CE2FE","#74DAF8","#00749E","#1D3E56"]},"dark":{"text":"#7CE2FE","solid":"#7CE2FE","onSolid":"#24171D","soft":"#112840","onSoft":"#75C7F0","line":"#7CE2FE"},"light":{"text":"#1D3E56","solid":"#7CE2FE","onSolid":"#24171D","soft":"#E1F6FD","onSoft":"#00749E","line":"#00749E"}},{"id":"brown","label":"Brown","group":"Colour","steps":{"dark":["#12110F","#1C1816","#28211D","#322922","#3E3128","#4D3C2F","#614A39","#7C5F46","#AD7F58","#B88C67","#DBB594","#F2E1CA"],"light":["#FEFDFC","#FCF9F6","#F6EEE7","#F0E4D9","#EBDACA","#E4CDB7","#DCBC9F","#CEA37E","#AD7F58","#A07553","#815E46","#3E332E"]},"dark":{"text":"#B88C67","solid":"#AD7F58","onSolid":"#24171D","soft":"#28211D","onSoft":"#DBB594","line":"#AD7F58"},"light":{"text":"#815E46","solid":"#AD7F58","onSolid":"#24171D","soft":"#F6EEE7","onSoft":"#815E46","line":"#A07553"}},{"id":"bronze","label":"Bronze","group":"Colour","steps":{"dark":["#141110","#1C1917","#262220","#302A27","#3B3330","#493E3A","#5A4C47","#6F5F58","#A18072","#AE8C7E","#D4B3A5","#EDE0D9"],"light":["#FDFCFC","#FDF7F5","#F6EDEA","#EFE4DF","#E7D9D3","#DFCDC5","#D3BCB3","#C2A499","#A18072","#957468","#7D5E54","#43302B"]},"dark":{"text":"#D4B3A5","solid":"#A18072","onSolid":"#24171D","soft":"#262220","onSoft":"#D4B3A5","line":"#A18072"},"light":{"text":"#7D5E54","solid":"#A18072","onSolid":"#24171D","soft":"#F6EDEA","onSoft":"#7D5E54","line":"#957468"}},{"id":"gold","label":"Gold","group":"Colour","steps":{"dark":["#121211","#1B1A17","#24231F","#2D2B26","#38352E","#444039","#544F46","#696256","#978365","#A39073","#CBB99F","#E8E2D9"],"light":["#FDFDFC","#FAF9F2","#F2F0E7","#EAE6DB","#E1DCCF","#D8D0BF","#CBC0AA","#B9A88D","#978365","#8C7A5E","#71624B","#3B352B"]},"dark":{"text":"#CBB99F","solid":"#978365","onSolid":"#24171D","soft":"#24231F","onSoft":"#CBB99F","line":"#978365"},"light":{"text":"#71624B","solid":"#978365","onSolid":"#24171D","soft":"#F2F0E7","onSoft":"#71624B","line":"#8C7A5E"}},{"id":"gray","label":"Gray","group":"Neutral","steps":{"dark":["#111111","#191919","#222222","#2A2A2A","#313131","#3A3A3A","#484848","#606060","#6E6E6E","#7B7B7B","#B4B4B4","#EEEEEE"],"light":["#FCFCFC","#F9F9F9","#F0F0F0","#E8E8E8","#E0E0E0","#D9D9D9","#CECECE","#BBBBBB","#8D8D8D","#838383","#646464","#202020"]},"dark":{"text":"#B4B4B4","solid":"#6E6E6E","onSolid":"#FFF8EE","soft":"#222222","onSoft":"#B4B4B4","line":"#7B7B7B"},"light":{"text":"#646464","solid":"#8D8D8D","onSolid":"#24171D","soft":"#F0F0F0","onSoft":"#646464","line":"#646464"}},{"id":"mauve","label":"Mauve","group":"Neutral","steps":{"dark":["#121113","#1A191B","#232225","#2B292D","#323035","#3C393F","#49474E","#625F69","#6F6D78","#7C7A85","#B5B2BC","#EEEEF0"],"light":["#FDFCFD","#FAF9FB","#F2EFF3","#EAE7EC","#E3DFE6","#DBD8E0","#D0CDD7","#BCBAC7","#8E8C99","#84828E","#65636D","#211F26"]},"dark":{"text":"#B5B2BC","solid":"#6F6D78","onSolid":"#FFF8EE","soft":"#232225","onSoft":"#B5B2BC","line":"#7C7A85"},"light":{"text":"#65636D","solid":"#8E8C99","onSolid":"#24171D","soft":"#F2EFF3","onSoft":"#65636D","line":"#65636D"}},{"id":"slate","label":"Slate","group":"Neutral","steps":{"dark":["#111113","#18191B","#212225","#272A2D","#2E3135","#363A3F","#43484E","#5A6169","#696E77","#777B84","#B0B4BA","#EDEEF0"],"light":["#FCFCFD","#F9F9FB","#F0F0F3","#E8E8EC","#E0E1E6","#D9D9E0","#CDCED6","#B9BBC6","#8B8D98","#80838D","#60646C","#1C2024"]},"dark":{"text":"#B0B4BA","solid":"#696E77","onSolid":"#FFF8EE","soft":"#212225","onSoft":"#B0B4BA","line":"#777B84"},"light":{"text":"#60646C","solid":"#8B8D98","onSolid":"#24171D","soft":"#F0F0F3","onSoft":"#60646C","line":"#60646C"}},{"id":"sage","label":"Sage","group":"Neutral","steps":{"dark":["#101211","#171918","#202221","#272A29","#2E3130","#373B39","#444947","#5B625F","#63706B","#717D79","#ADB5B2","#ECEEED"],"light":["#FBFDFC","#F7F9F8","#EEF1F0","#E6E9E8","#DFE2E0","#D7DAD9","#CBCFCD","#B8BCBA","#868E8B","#7C8481","#5F6563","#1A211E"]},"dark":{"text":"#ADB5B2","solid":"#63706B","onSolid":"#FFF8EE","soft":"#202221","onSoft":"#ADB5B2","line":"#717D79"},"light":{"text":"#5F6563","solid":"#868E8B","onSolid":"#24171D","soft":"#EEF1F0","onSoft":"#5F6563","line":"#7C8481"}},{"id":"olive","label":"Olive","group":"Neutral","steps":{"dark":["#111210","#181917","#212220","#282A27","#2F312E","#383A36","#454843","#5C625B","#687066","#767D74","#AFB5AD","#ECEEEC"],"light":["#FCFDFC","#F8FAF8","#EFF1EF","#E7E9E7","#DFE2DF","#D7DAD7","#CCCFCC","#B9BCB8","#898E87","#7F847D","#60655F","#1D211C"]},"dark":{"text":"#AFB5AD","solid":"#687066","onSolid":"#FFF8EE","soft":"#212220","onSoft":"#AFB5AD","line":"#767D74"},"light":{"text":"#60655F","solid":"#898E87","onSolid":"#24171D","soft":"#EFF1EF","onSoft":"#60655F","line":"#7F847D"}},{"id":"sand","label":"Sand","group":"Neutral","steps":{"dark":["#111110","#191918","#222221","#2A2A28","#31312E","#3B3A37","#494844","#62605B","#6F6D66","#7C7B74","#B5B3AD","#EEEEEC"],"light":["#FDFDFC","#F9F9F8","#F1F0EF","#E9E8E6","#E2E1DE","#DAD9D6","#CFCECA","#BCBBB5","#8D8D86","#82827C","#63635E","#21201C"]},"dark":{"text":"#B5B3AD","solid":"#6F6D66","onSolid":"#FFF8EE","soft":"#222221","onSoft":"#B5B3AD","line":"#7C7B74"},"light":{"text":"#63635E","solid":"#8D8D86","onSolid":"#24171D","soft":"#F1F0EF","onSoft":"#63635E","line":"#82827C"}}],"usage":{"textMinimum":4.5,"lineMinimum":3,"baseTextMinimum":7,"limits":"Ratios apply to the listed opaque sRGB pairs. Custom values, opacity, images, gradients and other surfaces need their own check. Existing project values stay frozen until Apply."}};


function pdCurrent(context) {
  function hex(name,mode) {
    let variable=context.byName.get(name);
    for (let depth=0;depth<12;depth++) {
      if (!variable) throw new Error("Missing project colour: "+name);
      const modeId=variable.variableCollectionId===context.collection.id?context.modes[mode]:context.palette.defaultModeId;
      const value=variable.valuesByMode[modeId];
      if (value && value.type==="VARIABLE_ALIAS") {variable=[...context.byName.values()].find(v=>v.id===value.id);continue;}
      const result=pdHex(value);if(!result)throw new Error("Unresolved colour: "+name);return result;
    }
    throw new Error("Colour alias cycle: "+name);
  }
  const result={base:{},accent:{}};
  for (const mode of ["dark","light"]) {
    result.base[mode]={background:hex("Surface/Base",mode),text:hex("Ink/Primary",mode)};
    result.accent[mode]={text:hex("Accent/Primary/Text",mode),solid:hex("Accent/Primary/Solid",mode),onSolid:hex("Accent/Primary/On solid",mode)};
  }
  return result;
}

let pdPrevious=null;
let pdBusy=false;
figma.showUI(__html__,{width:450,height:730,themeColors:true});
figma.ui.onmessage=async message=>{
  if (!message || typeof message.type!=="string" || pdBusy) return;
  try {
    if (message.type==="ready") {
      const [collections,variables]=await Promise.all([figma.variables.getLocalVariableCollectionsAsync(),figma.variables.getLocalVariablesAsync("COLOR")]);
      const context=pdContext(collections,variables);
      figma.ui.postMessage({type:"ready",data:PD_DATA,version:PD_DATA.version,fileName:figma.root.name,current:pdCurrent(context)});
    } else if (message.type==="apply") {
      pdBusy=true;
      const [collections,variables]=await Promise.all([figma.variables.getLocalVariableCollectionsAsync(),figma.variables.getLocalVariablesAsync("COLOR")]);
      const context=pdContext(collections,variables);
      const operations=pdPlan(PD_DATA,message.selection||{},context);
      if (!operations.length) throw new Error("Choose at least one colour or base first.");
      await pdLoadStyleFonts();
      pdPrevious=pdApplyPlan(operations);
      figma.commitUndo();
      figma.ui.postMessage({type:"applied",count:operations.length,canRestore:true,current:pdCurrent(context)});
    } else if (message.type==="restore") {
      pdBusy=true;
      if (!pdPrevious) throw new Error("No palette change to restore in this session.");
      await pdLoadStyleFonts();
      pdRestore(pdPrevious);
      pdPrevious=null;
      figma.commitUndo();
      const context=pdContext(await figma.variables.getLocalVariableCollectionsAsync(),await figma.variables.getLocalVariablesAsync("COLOR"));
      figma.ui.postMessage({type:"restored",current:pdCurrent(context)});
    } else if (message.type==="close") {
      figma.closePlugin();
    }
  } catch (error) {
    figma.ui.postMessage({type:"error",message:String(error && error.message || error)});
  } finally {
    pdBusy=false;
  }
};
