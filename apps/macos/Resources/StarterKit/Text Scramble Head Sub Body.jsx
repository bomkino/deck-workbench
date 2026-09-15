#target "InDesign"

/* Text Scramble Roles 0.2.0 · classic InDesign script · MIT · pitch.dog
   Raycast 41aa46f190eeb9d414b342847000653f5759e49f ASCII engine. Native controls. */
(function () {
/*
 * Text Scramble ASCII engine for ExtendScript (ES3).
 * Raycast source: raycast/extensions@41aa46f190eeb9d414b342847000653f5759e49f
 * extensions/text-scramble/src/scramble-text.ts; matching local ASCII model.
 * No document access. ASCII letters/digits only; all other characters pass through.
 * Share one plain cache object and random function across every group in a run.
 * A token's first spelling/case supplies its scoring profile; later case variants
 * reuse that lowercase base word, exactly as the canonical engine does.
 * The existing original InDesign script is intentionally unchanged.
 */
var scrambleContents = (function () {
    var VOWELS = ["a","a","a","e","e","e","e","i","i","o","o","u"];
    var CONSONANTS = ["b","c","d","f","g","h","l","l","l","m","m","m","n","n","n","n","p","r","r","r","r","s","s","s","t","t","t","v","v","w"];
    var END_CONSONANTS = ["d","l","l","m","n","n","r","r","s","s","t"];
    var CLUSTER_FOLLOWERS = {"b":["l","r"],"c":["h","l","r"],"d":["r"],"f":["l","r"],"g":["l","r"],"p":["l","r"],"s":["c","h","l","p","t"],"t":["h","r"]};
    var COMMON_WORDS = {"a":true,"about":true,"after":true,"again":true,"all":true,"also":true,"am":true,"an":true,"and":true,"another":true,"any":true,"are":true,"as":true,"at":true,"back":true,"bad":true,"be":true,"because":true,"before":true,"being":true,"best":true,"better":true,"big":true,"brand":true,"but":true,"by":true,"can":true,"car":true,"cat":true,"clear":true,"come":true,"could":true,"day":true,"deck":true,"design":true,"did":true,"do":true,"dog":true,"down":true,"each":true,"even":true,"every":true,"feel":true,"first":true,"for":true,"from":true,"get":true,"give":true,"go":true,"good":true,"great":true,"had":true,"has":true,"have":true,"he":true,"her":true,"here":true,"him":true,"his":true,"how":true,"i":true,"if":true,"in":true,"into":true,"is":true,"it":true,"its":true,"just":true,"know":true,"last":true,"like":true,"light":true,"little":true,"look":true,"make":true,"man":true,"many":true,"may":true,"me":true,"more":true,"most":true,"my":true,"need":true,"new":true,"no":true,"not":true,"now":true,"of":true,"off":true,"old":true,"on":true,"once":true,"one":true,"only":true,"or":true,"other":true,"our":true,"out":true,"over":true,"own":true,"people":true,"put":true,"red":true,"same":true,"say":true,"see":true,"set":true,"shape":true,"she":true,"should":true,"so":true,"some":true,"still":true,"story":true,"sun":true,"take":true,"text":true,"than":true,"that":true,"the":true,"their":true,"them":true,"then":true,"there":true,"these":true,"they":true,"thing":true,"think":true,"this":true,"those":true,"through":true,"time":true,"to":true,"too":true,"two":true,"under":true,"up":true,"us":true,"use":true,"very":true,"want":true,"was":true,"way":true,"we":true,"well":true,"were":true,"what":true,"when":true,"where":true,"which":true,"while":true,"who":true,"why":true,"will":true,"with":true,"work":true,"world":true,"would":true,"year":true,"you":true,"your":true};
    var UNWELCOME_FRAGMENTS = ["anus","ass","cock","cunt","dick","fuck","hate","kill","nazi","porn","rape","sex","shit","slut"];
    var WIDTHS = {"i":0.34,"j":0.43,"l":0.38,"f":0.55,"r":0.58,"t":0.56,"c":0.82,"s":0.82,"v":0.86,"x":0.86,"y":0.86,"z":0.8,"a":0.9,"b":0.92,"d":0.92,"e":0.88,"g":0.92,"h":0.94,"k":0.9,"n":0.94,"o":0.94,"p":0.92,"q":0.94,"u":0.94,"m":1.34,"w":1.28};
    var TOKEN_PATTERN = /[A-Za-z]+|[0-9]+/g;
    var LETTER_PATTERN = /^[A-Za-z]+$/;
    var VOWEL_PATTERN = /[aeiou]/;
    var TRIPLE_VOWEL_PATTERN = /[aeiou]{3}/;
    var TRIPLE_CONSONANT_PATTERN = /[^aeiou]{3}/;
    var REPEATED_BIGRAM_PATTERN = /([a-z]{2})\1/;

    function pick(items, random) {
        return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
    }

    function isVowel(character) {
        return VOWEL_PATTERN.test(character);
    }

    function makeCandidate(length, random) {
        var result = [], index, previous, beforePrevious, finalPosition;
        var choices, choiceIndex, followers, alreadyInCluster, mustUseConsonant;
        var word = "";
        if (length === 1) { return pick(VOWELS, random); }
        for (index = 0; index < length; index += 1) {
            if (index === 0) {
                result[result.length] = random() < 0.18 ? pick(VOWELS, random) : pick(CONSONANTS, random);
                continue;
            }
            previous = result[index - 1];
            beforePrevious = result[index - 2];
            finalPosition = index === length - 1;
            if (finalPosition) {
                if (isVowel(previous)) {
                    if (random() < 0.07) {
                        choices = [];
                        for (choiceIndex = 0; choiceIndex < VOWELS.length; choiceIndex += 1) {
                            if (VOWELS[choiceIndex] !== previous) { choices[choices.length] = VOWELS[choiceIndex]; }
                        }
                        result[result.length] = pick(choices, random);
                    } else {
                        result[result.length] = pick(END_CONSONANTS, random);
                    }
                } else {
                    result[result.length] = pick(VOWELS, random);
                }
                continue;
            }
            if (isVowel(previous)) {
                mustUseConsonant = typeof beforePrevious !== "undefined" && isVowel(beforePrevious);
                result[result.length] = mustUseConsonant || random() < 0.95 ? pick(CONSONANTS, random) : pick(VOWELS, random);
                continue;
            }
            followers = CLUSTER_FOLLOWERS[previous];
            alreadyInCluster = typeof beforePrevious !== "undefined" && !isVowel(beforePrevious);
            if (!alreadyInCluster && followers && random() < 0.18) {
                result[result.length] = pick(followers, random);
            } else {
                result[result.length] = pick(VOWELS, random);
            }
        }
        for (index = 0; index < result.length; index += 1) { word += result[index]; }
        return word;
    }

    function isUppercaseLetter(character) {
        return character !== character.toLowerCase();
    }

    function applyCasePattern(candidate, source) {
        var result = "", index, character;
        for (index = 0; index < candidate.length; index += 1) {
            character = candidate.charAt(index);
            result += isUppercaseLetter(source.charAt(index)) ? character.toUpperCase() : character;
        }
        return result;
    }

    function glyphWidth(character) {
        var lower, base;
        if (character === "\t") { return 2.08; }
        if (/\s/.test(character)) { return 0.52; }
        if (/[0-9]/.test(character)) { return 0.92; }
        lower = character.toLowerCase();
        base = WIDTHS[lower];
        if (typeof base === "undefined") { base = /[A-Za-z]/.test(character) ? 0.94 : 0.5; }
        return isUppercaseLetter(character) ? base * 1.06 : base;
    }

    function estimateVisualWidth(text) {
        var total = 0, index;
        for (index = 0; index < text.length; index += 1) { total += glyphWidth(text.charAt(index)); }
        return total;
    }

    function candidateScore(candidate, source) {
        var lowerCandidate = candidate.toLowerCase(), index;
        var styledCandidate, totalWidthDifference, profileDifference = 0, positionalMatches = 0;
        var similarity, unusualMatches, vowelMatches, unusualLetters, vowelPairs;
        if (lowerCandidate === source.lower || COMMON_WORDS[lowerCandidate] === true) { return Number.POSITIVE_INFINITY; }
        for (index = 0; index < UNWELCOME_FRAGMENTS.length; index += 1) {
            if (lowerCandidate.indexOf(UNWELCOME_FRAGMENTS[index]) !== -1) { return Number.POSITIVE_INFINITY; }
        }
        if (TRIPLE_VOWEL_PATTERN.test(lowerCandidate) || TRIPLE_CONSONANT_PATTERN.test(lowerCandidate) || REPEATED_BIGRAM_PATTERN.test(lowerCandidate)) {
            return Number.POSITIVE_INFINITY;
        }
        styledCandidate = applyCasePattern(candidate, source.characters);
        totalWidthDifference = Math.abs(estimateVisualWidth(styledCandidate) - source.width) / source.width;
        for (index = 0; index < source.characters.length; index += 1) {
            profileDifference += Math.abs(glyphWidth(styledCandidate.charAt(index)) - source.characterWidths[index]);
            if (styledCandidate.charAt(index).toLowerCase() === source.characters.charAt(index).toLowerCase()) { positionalMatches += 1; }
        }
        profileDifference /= Math.max(source.characters.length, 1);
        similarity = positionalMatches / Math.max(source.characters.length, 1);
        unusualMatches = lowerCandidate.match(/[kwyz]/g);
        vowelMatches = lowerCandidate.match(/[aeiou]{2}/g);
        unusualLetters = (unusualMatches ? unusualMatches.length : 0) / Math.max(source.characters.length, 1);
        vowelPairs = (vowelMatches ? vowelMatches.length : 0) / Math.max(source.characters.length, 1);
        return totalWidthDifference * 6 + profileDifference * 0.34 + similarity * 0.42 + unusualLetters * 0.18 + vowelPairs * 0.08;
    }

    function createBaseWord(source, random) {
        var length = source.length, sourceCharacterWidths = [], total = 0, index;
        var candidateCount = length <= 2 ? 32 : length > 40 ? 40 : 96;
        var sourceProfile, bestCandidate = "", bestScore = Number.POSITIVE_INFINITY, candidate, score;
        var fallbackLetters = ["v", "e", "l", "o", "r", "a", "n", "i"], fallback = "", reversed = "";
        for (index = 0; index < length; index += 1) {
            sourceCharacterWidths[index] = glyphWidth(source.charAt(index));
            total += sourceCharacterWidths[index];
        }
        sourceProfile = { "characters": source, "characterWidths": sourceCharacterWidths, "lower": source.toLowerCase(), "width": Math.max(total, 0.01) };
        for (index = 0; index < candidateCount; index += 1) {
            candidate = makeCandidate(length, random);
            score = candidateScore(candidate, sourceProfile);
            if (score < bestScore) { bestCandidate = candidate; bestScore = score; }
        }
        if (bestCandidate) { return bestCandidate; }
        for (index = 0; index < length; index += 1) { fallback += fallbackLetters[index % fallbackLetters.length]; }
        if (fallback.toLowerCase() !== source.toLowerCase()) { return fallback; }
        for (index = fallback.length - 1; index >= 0; index -= 1) { reversed += fallback.charAt(index); }
        return reversed;
    }

    function scrambleDigits(source, random) {
        var output = "", index, original, offset;
        for (index = 0; index < source.length; index += 1) {
            original = source.charCodeAt(index) - 48;
            offset = 1 + Math.floor(random() * 9);
            output += String.fromCharCode(48 + ((original + offset) % 10));
        }
        return output;
    }

    return function (source, scrambleNumbers, cache, random) {
        if (!cache) { cache = {}; }
        if (typeof random !== "function") { random = Math.random; }
        return source.replace(TOKEN_PATTERN, function (token) {
            var key, baseWord;
            if (!LETTER_PATTERN.test(token)) {
                return scrambleNumbers === false ? token : scrambleDigits(token, random);
            }
            key = "$text-scramble-ascii$" + token.length + ":" + token.toLowerCase();
            baseWord = cache[key];
            if (!baseWord) {
                baseWord = createBaseWord(token, random);
                cache[key] = baseWord;
            }
            return applyCasePattern(baseWord, token);
        });
    };
}());

  var TITLE = "Text Scramble - Head / Sub / Body";
  var UNDO = "Scramble Head / Sub / Body";
  var ROLE_NAMES = ["Head", "Sub", "Body"];
  var MAX_CHARACTERS = 50000;

  function typeOf(item) {
    try { return item.constructor.name; } catch (error) { return ""; }
  }

  function leaf(name) {
    var parts = String(name).split(":");
    return parts[parts.length - 1];
  }

  function rootsFor(doc) {
    var roots = [], styles = doc.allParagraphStyles, i, r;
    for (r = 0; r < ROLE_NAMES.length; r += 1) {
      roots[r] = null;
      for (i = 0; i < styles.length; i += 1) {
        if (leaf(styles[i].name) !== "Project | " + ROLE_NAMES[r]) continue;
        if (roots[r]) throw new Error("More than one Project | " + ROLE_NAMES[r] + " style exists. Give the duplicate a different name first.");
        roots[r] = styles[i];
      }
      if (!roots[r]) throw new Error("Missing Project | " + ROLE_NAMES[r] + ". Use the pitch.dog starter or a deck made from it.");
    }
    return roots;
  }

  function roleFor(style, roots, related) {
    var visited = {}, i, depth = 0, name;
    while (style && style.isValid !== false && depth < 64) {
      name = leaf(style.name);
      // Generated contents entries and hidden markers are not slide copy.
      if (/^TOC - (Entry|Subentry|Marker)(\b| )/.test(name)) return -1;
      for (i = 0; i < roots.length; i += 1) if (style.id === roots[i].id) return i;
      if (!related || visited["$" + style.id]) break;
      visited["$" + style.id] = true;
      try { style = style.basedOn; } catch (error) { break; }
      depth += 1;
    }
    return -1;
  }

  function editableFrame(frame) {
    var parent = frame, depth = 0;
    try {
      if (!frame || frame.isValid === false || typeOf(frame) !== "TextFrame") return false;
      if (!frame.parentPage || typeOf(frame.parentPage.parent) === "MasterSpread") return false;
      if (frame.itemLayer.locked || !frame.itemLayer.visible || frame.itemLayer.printable === false) return false;
      while (parent && depth < 64) {
        if (typeOf(parent) === "Spread" || typeOf(parent) === "Document" || typeOf(parent) === "Page") return true;
        if (parent.locked === true || parent.visible === false || parent.nonprinting === true) return false;
        parent = parent.parent;
        depth += 1;
      }
    } catch (error) { return false; }
    return false;
  }

  function normalText(item) {
    var parent = item, depth = 0, name;
    while (parent && depth < 64) {
      name = typeOf(parent);
      if (/^(Cell|Table|Footnote|Endnote|Note|HiddenText|EndnoteTextFrame|TextPath)$/.test(name)) return false;
      if (name === "Story" || name === "TextFrame") return true;
      try { parent = parent.parent; } catch (error) { return false; }
      depth += 1;
    }
    return false;
  }

  function inspect(doc, scope, related) {
    var model = { doc: doc, roots: rootsFor(doc), entries: [], stories: [], excluded: 0, examined: 0 };
    var frames = {}, seen = {}, stories = {}, styleRoles = {}, roots = model.roots;

    function addText(text, fallbackFrame) {
      var chars, i, ch, source, story, position, stable, key, owners, owner, role, style, para;
      if (!normalText(text)) { model.excluded += 1; return; }
      try { chars = text.characters; } catch (error) { model.excluded += 1; return; }
      if (model.examined + chars.length > MAX_CHARACTERS) throw new Error("This scope exceeds 50,000 characters. Select a smaller batch.");
      for (i = 0; i < chars.length; i += 1) {
        ch = chars.item(i);
        model.examined += 1;
        source = ch.contents;
        // Work in InDesign's native character coordinates. Never stringify markers.
        if (typeof source !== "string" || !/^[A-Za-z0-9]$/.test(source)) continue;
        var conditions = ch.appliedConditions, hidden = conditions && conditions.length > 0, conditionIndex;
        for (conditionIndex = 0; conditions && conditionIndex < conditions.length; conditionIndex += 1) {
          if (conditions[conditionIndex].visible !== false) hidden = false;
        }
        if (hidden) { model.excluded += 1; continue; }
        story = ch.parentStory;
        if (story.storyType !== StoryTypes.REGULAR_STORY) continue;
        if (story.lockState === LockStateValues.LOCKED_STORY) { model.excluded += 1; continue; }
        position = ch.insertionPoints.firstItem().index;
        key = "$" + story.id + ":" + position;
        if (seen[key]) continue;
        seen[key] = true;
        owners = ch.parentTextFrames;
        owner = owners.length ? owners[0] : fallbackFrame;
        if (!owner || !editableFrame(owner)) { model.excluded += 1; continue; }
        style = ch.appliedParagraphStyle;
        if (!Object.prototype.hasOwnProperty.call(styleRoles, "$" + style.id)) {
          styleRoles["$" + style.id] = roleFor(style, roots, related);
        }
        role = styleRoles["$" + style.id];
        if (role < 0) { model.excluded += 1; continue; }
        stable = story.characters.item(position);
        if (!stable.isValid || stable.contents !== source || stable.appliedParagraphStyle.id !== style.id) {
          throw new Error("Could not safely resolve a text position. Nothing was changed.");
        }
        para = ch.paragraphs.firstItem().insertionPoints.firstItem().index;
        model.entries.push({ character: stable, source: source, position: position, story: story,
          role: role, styleId: style.id, paragraph: "$" + story.id + ":" + para, frame: owner });
        if (!stories["$" + story.id]) { stories["$" + story.id] = true; model.stories.push(story); }
      }
    }

    function addFrame(frame) {
      var key = "$" + frame.id;
      if (frames[key]) return;
      frames[key] = true;
      if (!editableFrame(frame)) { model.excluded += 1; return; }
      addText(frame.texts.item(0), frame);
    }

    function addItem(item) {
      var name = typeOf(item), items, i;
      if (name === "TextFrame") { addFrame(item); return; }
      if (/^(Text|Character|Word|Line|Paragraph|TextColumn|TextStyleRange|Story)$/.test(name)) {
        addText(item, null); return;
      }
      if (name === "InsertionPoint") return;
      try { items = item.allPageItems; } catch (error) { return; }
      if (!items) return;
      for (i = 0; i < items.length; i += 1) if (typeOf(items[i]) === "TextFrame") addFrame(items[i]);
    }

    var i;
    if (scope === "selection") {
      for (i = 0; i < app.selection.length; i += 1) addItem(app.selection[i]);
    } else if (scope === "page") {
      if (!app.activeWindow || !app.activeWindow.activePage) throw new Error("Switch to a document layout window first.");
      addItem(app.activeWindow.activePage);
    } else {
      for (i = 0; i < doc.pages.length; i += 1) addItem(doc.pages[i]);
    }
    model.entries.sort(function (a, b) { return a.story.id === b.story.id ? a.position - b.position : a.story.id - b.story.id; });
    return model;
  }

  function counts(model, options) {
    var result = { roles: [0, 0, 0], paragraphs: 0, characters: 0 }, seen = {}, i, entry;
    for (i = 0; i < model.entries.length; i += 1) {
      entry = model.entries[i];
      if (!options.numbers && /^[0-9]$/.test(entry.source)) continue;
      if (!seen[entry.paragraph]) { seen[entry.paragraph] = true; result.roles[entry.role] += 1; }
      if (options.roles[entry.role]) result.characters += 1;
    }
    for (i = 0; i < 3; i += 1) if (options.roles[i]) result.paragraphs += result.roles[i];
    return result;
  }

  function planEdits(model, options) {
    var edits = [], cache = {}, entries = model.entries, i = 0, j, group, token, output, entry, previous, numeric;
    while (i < entries.length) {
      entry = entries[i];
      if (!options.roles[entry.role] || (!options.numbers && /^[0-9]$/.test(entry.source))) { i += 1; continue; }
      group = [entry]; token = entry.source; numeric = /^[0-9]$/.test(entry.source); i += 1;
      while (i < entries.length) {
        entry = entries[i]; previous = group[group.length - 1];
        if (entry.story.id !== previous.story.id || entry.position !== previous.position + 1 ||
          entry.paragraph !== previous.paragraph || entry.role !== previous.role ||
          /^[0-9]$/.test(entry.source) !== numeric) break;
        group.push(entry); token += entry.source; i += 1;
      }
      output = scrambleContents(token, options.numbers, cache);
      for (j = 0; j < group.length; j += 1) {
        if (output.charAt(j) !== group[j].source) edits.push({ entry: group[j], replacement: output.charAt(j) });
      }
    }
    return edits;
  }

  function assertUnchanged(entry) {
    if (!entry.character.isValid || entry.character.contents !== entry.source ||
      entry.character.appliedParagraphStyle.id !== entry.styleId || !editableFrame(entry.frame) ||
      entry.story.lockState === LockStateValues.LOCKED_STORY) {
      throw new Error("The text or its editable state changed. Close this dialog and run the script again.");
    }
  }

  function apply(model, options) {
    var edits = planEdits(model, options), result = { changed: 0, paragraphs: 0, overflowBefore: 0,
      overflowAfter: 0, newOverflow: [], error: "" }, seen = {}, before = {}, i;
    if (!model.doc.isValid || app.activeDocument.id !== model.doc.id) throw new Error("The active document changed. Run the script again.");
    for (i = 0; i < model.entries.length; i += 1) assertUnchanged(model.entries[i]);
    for (i = 0; i < model.stories.length; i += 1) {
      before["$" + model.stories[i].id] = model.stories[i].overflows;
      if (model.stories[i].overflows) result.overflowBefore += 1;
    }
    if (!edits.length) return result;
    app.doScript(function () {
      var n, edit;
      try {
        for (n = edits.length - 1; n >= 0; n -= 1) {
          edit = edits[n];
          assertUnchanged(edit.entry);
          edit.entry.character.contents = edit.replacement;
          result.changed += 1;
          if (!seen[edit.entry.paragraph]) { seen[edit.entry.paragraph] = true; result.paragraphs += 1; }
        }
        model.doc.recompose();
      } catch (error) { result.error = String(error.message || error); }
    }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, UNDO);
    for (i = 0; i < model.stories.length; i += 1) {
      if (model.stories[i].overflows) {
        result.overflowAfter += 1;
        if (!before["$" + model.stories[i].id]) result.newOverflow.push(String(model.stories[i].id));
      }
    }
    return result;
  }

  function runRoleScramble() {
    if (!app.documents.length) { alert("Open your InDesign deck first.", TITLE); return; }
    var doc = app.activeDocument, dialog, model = null, errorText = "", roleControls = [], i;
    try { rootsFor(doc); } catch (error) { alert(error.message, TITLE); return; }
    dialog = new Window("dialog", TITLE);
    dialog.orientation = "column"; dialog.alignChildren = "fill"; dialog.spacing = 12; dialog.margins = 18;
    dialog.add("statictext", undefined, "Choose which parts of your copy to scramble.");
    var scopeRow = dialog.add("group"); scopeRow.add("statictext", undefined, "Scope");
    var scopeControl = scopeRow.add("dropdownlist", undefined, ["Selection", "Active page", "Whole document"]);
    scopeControl.selection = 0; scopeControl.preferredSize.width = 280;
    var rolePanel = dialog.add("panel", undefined, "Text roles");
    rolePanel.orientation = "column"; rolePanel.alignChildren = "left"; rolePanel.margins = 14;
    for (i = 0; i < 3; i += 1) {
      roleControls[i] = rolePanel.add("checkbox", undefined, ROLE_NAMES[i]); roleControls[i].value = true;
    }
    var related = dialog.add("checkbox", undefined, "Include styles based on these roles"); related.value = true;
    dialog.add("statictext", undefined, "Includes light slides, lists, reading styles and captions.");
    var numbers = dialog.add("checkbox", undefined, "Scramble numbers inside the chosen roles"); numbers.value = false;
    var summary = dialog.add("statictext", undefined, "", { multiline: true }); summary.preferredSize = [430, 58];
    dialog.add("statictext", undefined, "Folios, generated contents, hidden and locked text stay intact.");
    dialog.add("statictext", undefined, "English letters only. Punctuation and hard line breaks stay intact.");
    var buttons = dialog.add("group"); buttons.alignment = "right";
    var refresh = buttons.add("button", undefined, "Refresh");
    buttons.add("button", undefined, "Cancel", { name: "cancel" });
    var scramble = buttons.add("button", undefined, "Scramble", { name: "ok" });

    function options() { return { roles: [roleControls[0].value, roleControls[1].value, roleControls[2].value], numbers: numbers.value }; }
    function update(rebuild) {
      var count, opts = options(), r;
      if (rebuild) {
        model = null; errorText = "";
        try { model = inspect(doc, ["selection", "page", "document"][scopeControl.selection.index], related.value); }
        catch (error) { errorText = String(error.message || error); }
      }
      if (!model) { summary.text = errorText; scramble.enabled = false; return; }
      count = counts(model, opts);
      for (r = 0; r < 3; r += 1) roleControls[r].text = ROLE_NAMES[r] + " - " + count.roles[r] + (count.roles[r] === 1 ? " paragraph" : " paragraphs");
      summary.text = count.characters ? count.paragraphs + (count.paragraphs === 1 ? " paragraph ready; " : " paragraphs ready; ") + count.characters + (count.characters === 1 ? " letter" : " letters") + (opts.numbers ? "/digits" : "") + ".\nOne Undo step. The document will not be saved." : "No eligible text. Select text/frames, choose a wider scope, or enable a role.";
      scramble.enabled = count.characters > 0;
      dialog.layout.layout(true);
    }
    scopeControl.onChange = related.onClick = refresh.onClick = function () { update(true); };
    numbers.onClick = function () { update(false); };
    for (i = 0; i < 3; i += 1) roleControls[i].onClick = function () { update(false); };
    update(true);
    if (dialog.show() !== 1) return;
    try {
      var result = apply(model, options());
      var message = result.changed + (result.changed === 1 ? " character changed in " : " characters changed in ") + result.paragraphs + (result.paragraphs === 1 ? " paragraph." : " paragraphs.");
      if (result.error) message += "\nStopped: " + result.error;
      if (result.changed) message += "\nUse Edit > Undo " + UNDO + " to restore this run.";
      if (result.overflowAfter) message += "\nOverset stories: " + result.overflowBefore + " before; " + result.overflowAfter + " after (" + result.newOverflow.length + " newly overset). Review text fit.";
      message += "\nDocument left unsaved.";
      alert(message, TITLE);
    } catch (error) { alert(String(error.message || error), TITLE); }
  }

  runRoleScramble();
}());
