# Your Workbench starter kit

Use **2576 × 1080** for cinemascope. Use the **1920x1080** folder for standard widescreen. Both use the 24-column × 12-row grid.

## Fastest start

1. Finish the writing, image choices and slide order in Workbench.
2. Choose **Export Handoff**. Keep **PSDs**, **Approved Media** and **Shortlisted Media** selected when you need them.
3. For InDesign, turn on **Build automatically**. For Figma, leave it off.
4. Choose a folder. Review the export result.
5. Open **InDesign/Deck.indd** to polish your deck, or use **Production/workbench.md** with your existing Figma importer.

**First use on each Mac:** Workbench → Settings → Connect InDesign. Accept the macOS Automation prompt. Photoshop setup is optional; PSD generation itself does not need Photoshop. The PNG exporter runs inside Photoshop. File access comes from the folders you choose; Full Disk Access and Accessibility access are not required by this workflow.

## What is here

- **Starter INDDs:** reusable one-page documents, with paragraph, character and object styles, colours, parent pages and guides. Duplicate one before editing it manually.
- **Layout Kit INDDs:** editable examples you can borrow pages from. The PDFs are flattened visual previews; use the INDDs for editing.
- **PSD templates:** shared Background and Character Smart Objects, in both sizes.
- **Deck Size Controls.jsx:** move Head, Sub and Body up or down their size scales without choosing a different font family.
- **Text Scramble Head Sub Body.jsx:** scramble selected text roles for layout studies. Run on a copy if you need to retain the writing.
- **Automation/InDesign:** Build, Refresh and their supporting files. Keep these files together.
- **Automation/Photoshop/Export Slide PNGs.jsx:** export a full-size background PNG and transparent-character PNG for each finished PSD.

The templates refer to installed fonts; they do not bundle Apple font files. Install any missing starter fonts before an automatic build. Choose project fonts in the InDesign base styles after building. The existing template type-system pin is preserved independently of Workbench's interface-font pin.

## Which PSDs do I edit?

**InDesign:** edit **InDesign/Links/PSD**. Those files are linked to Deck.indd.

**Figma:** edit **Production/PSD**, then run **Export Slide PNGs.jsx**. The PNG script is in this kit; your Figma importer and Figma file remain separate.

The two PSD folders are independent copies. Edit the one used by your chosen workflow.

To move computers, copy the whole handoff folder. Keep PSD names unchanged. In InDesign, run **Refresh PSD Links.jsx** after receiving artwork or moving the folder. It backs up old artwork and restores the two image roles. Copy your `.pitchdeck` document separately if you also need to revise the Workbench assembly.

## Learn one task at a time

- [Fonts, sizes, colours, layouts and dotted contents](Start%20Here%20-%20InDesign.md)
- [Building and refreshing InDesign decks](Start%20Here%20-%20Deck%20Production.md)
- [Preparing the two PNGs for Figma](Automation/Photoshop/Export%20Slide%20PNGs%20-%20Read%20me.md)
- [Scrambling Head, Sub and Body](Text%20Scramble%20Head%20Sub%20Body%20-%20Read%20me.md)

Workbench contents slides are an editable snapshot of the exported order. Reorder in Workbench and export again to regenerate that list. InDesign's own generated Table of Contents is a separate option explained in its guide.

Build failures leave the completed handoff in place. Read **Export issues.txt** and **Automation/result.json**; do not use an InDesign folder marked incomplete. A new export creates a new folder and does not overwrite earlier handoffs.
