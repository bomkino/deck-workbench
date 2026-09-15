# Text Scramble Roles for InDesign

A standalone `.jsx` script for the pitch.dog v0.03 starter and decks made from it. Choose Head, Sub, Body, or any combination. Run it from InDesign's Scripts panel; no plugin manager or subscription is required.

## Why paragraph styles are the right boundary

The supplied 2576 × 1080 starter contains `Head.`, `Sub.` and `Body.` in one text frame. They use three separate paragraph styles:

| Control | Paragraph style |
| --- | --- |
| Head | `Project | Head` |
| Sub | `Project | Sub` |
| Body | `Project | Body` |

The script resolves those styles by their document IDs. It does not guess from the words, font size, frame name, paragraph order, or screen position. Multiple body paragraphs work naturally. A selected substring remains limited to that substring.

With **Include styles based on these roles** enabled, it follows InDesign's Based On relationships. That includes the template's light variants, bordered headings, justified/reading/compact body text, bullets, numbered lists, captions and eyebrows. Captions and eyebrows belong to Body because that is their actual template inheritance. Quote and Screenplay styles do not inherit the three Project roles and remain unchanged. Turn this option off to target only the three exact Project styles.

## Use it

1. Work in a project copy of your starter.
2. Open **Window → Utilities → Scripts → User** and run **Text Scramble Head Sub Body.jsx**.
3. Choose **Selection**, **Active page**, or **Whole document**. Selection is the default; an insertion cursor alone does not select text.
4. Tick any combination of Head, Sub and Body. The paragraph counts show what each role contains. The summary shows the enabled paragraphs and eligible letters/digits.
5. Optionally enable number scrambling. It is off by default.
6. Click **Scramble**. Review the result and the overflow report, then save when ready.

Use **Edit → Undo Scramble Head / Sub / Body** to restore a completed run in one step. Canceling the initial dialog makes no text changes. The script never creates or saves a document and makes no network requests.

To install manually, right-click **User** in the Scripts panel and choose **Reveal in Finder**. Copy `Text Scramble Head Sub Body.jsx` into that folder. Keep the original `Text Scramble.jsx` if you also want its unrestricted frame-based command. Adobe documents this [Scripts panel workflow](https://helpx.adobe.com/indesign/desktop/automation-and-scripting/document-automation/automate-workflows-with-scripts.html).

## What it preserves

- Paragraph styles, character styles, direct formatting, frame geometry and document structure are not reassigned.
- Characters are replaced individually in native InDesign coordinates. Punctuation, spaces, tabs, explicit line breaks, paragraph breaks, emoji and native special-character markers are left alone.
- Repeated ASCII words receive the same replacement within one run. Case and word length stay the same; the latest Raycast logic chooses pronounceable substitutes using total width, letter-by-letter shape, repetition and readability scores.
- Folios, automatic page-number markers, generated contents/index stories and TOC entry/marker styles are protected. Parent-page objects, pasteboard objects, hidden/nonprinting content, locked frames/layers/groups, and locked managed stories are excluded.
- Table cells, footnotes, endnotes, notes and text on paths are outside this first version's scope.

The source document's existing typography and its v13.1.1 type-system pin (`318e6ff4d4bf76be76f7ed5225aacf7517d2ee82`) are preserved. This helper uses native ScriptUI controls and includes no font binaries or imported typography CSS.

## Raycast engine parity

The word-generation logic is ported from the [latest merged Raycast source](https://github.com/raycast/extensions/blob/41aa46f190eeb9d414b342847000653f5759e49f/extensions/text-scramble/src/scramble-text.ts). Seeded comparisons check exact English-text output and random-number consumption, including repeated words across separate native ranges. The standalone script embeds that verified ES3-compatible engine.

## Practical limits

This classic ExtendScript port scrambles **A–Z/a–z and optional 0–9**. Accented characters and other writing systems remain unchanged; ASCII portions of mixed words can change. It is a layout-placeholder tool, not a complete document anonymizer: links, metadata, notes and protected contents entries can retain original information.

Word widths are approximate, so automatic wrapping can move. The script reports overset stories before and after a run without resizing frames or changing type. GREP, nested and nested-line style rules stay active and can respond differently to the replacement text. Update the table of contents normally if you want it to reflect scrambled headings.

A run examines at most 50,000 native characters. Split larger decks into selections or pages. Candidate positions are frozen before the first edit so recomposition does not expand a selected frame into the rest of its threaded story. A failure after some edits reports the successful character count and leaves one Undo step; the script does not claim automatic rollback.
