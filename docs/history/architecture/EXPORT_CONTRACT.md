> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.

# Export contract

## Profiles

### Review PDF

Canonical visual-fidelity output. Exact canvas ratio, explicit colour profile, resolved fonts/assets and deterministic Preflight.

### Visual-fidelity PPTX

- editable text when acceptably faithful;
- replaceable basic images when faithful;
- editable basic shapes and lines;
- unsupported effects rasterize the smallest coherent visual group;
- whole-Slide rasterization only when no smaller faithful grouping exists;
- every fallback appears before export and in `export-report.json`.

### Handoff package

```text
project.pitchdeck
review.pdf
visual-fidelity.pptx
png/
source-manifest.json
font-report.json
preflight-report.json
export-report.json
notes.md
optional-sources/       # explicit permission only
```

### PNG sequence

Exact preset dimensions, stable filenames and sequence order.

## Renderer-neutral export plan

The Deck kernel resolves:

- active Design Options;
- typography;
- Assets/attachments;
- ordered editable objects;
- visual groups requiring rasterization;
- substitutions;
- missing dependencies;
- warnings and blockers.

Adapters may not silently widen the fallback unit.

## T00

Export one PDF page from the same Slide projection used by the workspace. The tracer does not implement PPTX or full handoff.

## Production proof

Use real pitch.dog fonts and representative Slides. Compare WebKit/Chromium PDF and PNG, PptxGenJS PPTX, Microsoft PowerPoint, and LibreOffice. LibreOffice success does not prove PowerPoint fidelity.
