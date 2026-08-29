# Phased Workbench Constitution

Status: accepted product direction; production migration is incremental.

## Product sentence

Deck Workbench is pitch.dog's internal pre-production tool for turning locked slide copy and project media into a slide-by-slide visual plan, rough assembly and designer-ready handoff.

## Entry condition

Workbench begins after writing has been divided into Slides and is locked or nearly locked. Copy correction is supported; writing the Deck is not the product's primary job.

## Exit condition

A cold designer receives exact copy, Part and Slide order, Purpose, visual intent, selected and alternate media, unresolved research requests, rough composition, crop, gradient, source-treatment and Designer Notes without reconstructing pitch.dog's thinking verbally.

## Four phases

1. **Plan** — verify exact copy, intentional blanks, Parts, Purpose, Content Pattern, Visual Style and Slide lifecycle.
2. **Curate** — search a large project media source; judge Assets globally and per Slide; shortlist, compare, select, alternate, reject and request more media.
3. **Assemble** — fluidly arrange media and white text on the Swiss Pitch Grid; crop, resize, snap, columnise Body copy and build editable black gradients.
4. **Handoff** — expose concrete unresolved decisions and publish a complete designer package.

The phases are task-specific workspaces over one Deck. The selected Slide, durable history and canonical meaning survive phase changes.

## Canonical distinctions

- absence, unreviewed absence and intentional blank are different states;
- no on-Slide text is valid and does not remove Purpose or handoff context;
- Content Pattern describes information structure; Visual Style describes starting composition;
- Full Bleed means the image frame covers the artboard, not that the source is final or needs no expansion;
- project-level media judgment and per-Slide suitability are separate;
- Slide identity is stable; page number is derived from included order;
- Included, Skipped and Cut are distinct lifecycle states;
- Find More Media, Source Treatment, Purpose and Designer Notes are distinct fields;
- supporting items such as comps, cast, episodes and team retain stable identities binding copy, links and media.

## Copy contract

The privileged visible roles are Headline, Subheadline and Body. Each may be present, intentionally blank or unreviewed. Repeated content uses Supporting Items instead of flattening captions into one Body blob.

Copy uses a restricted Markdown model preserving paragraphs, authored line breaks, emphasis, strong emphasis, lists and explicit `http`, `https` or `mailto` links. Raw HTML, embedded media, scripts, arbitrary colour and arbitrary typography are not canonical copy.

A soft visual wrap is not an authored break. In Body and caption editing, Enter creates a paragraph and Shift-Enter creates a hard break. In Headline and Subheadline editing, Enter creates an authored line break.

## Media contract

Workbench may consume a `.pitchlibrary`, one or more authorised project folders, dragged-in files or a migrated Deck Prototyper media folder. Reference Library remains a separate product.

Media infrastructure owns Root authority, Source/Location reconciliation, stable Asset identity, availability, bounded renditions, query, paging and resource authorisation. Workbench owns Slide candidates, project ratings/Picks, per-Slide shortlist and rejection, primary slots, alternates, crop, source treatment, Find More Media and handoff copying.

Missing or offline media remains visible. No Workbench action renames, moves, trashes or overwrites source files.

## Assembly contract

Assembly is an art-direction instrument, not final production design.

Primary controls:

- direct image-frame movement and resize;
- source crop pan, scale, fit, align and mirror;
- one bundled open-source typeface and white text;
- semantic XXS–XXL role scales;
- one, two or three Body columns;
- a constrained Text Stack with Auto Layout Lite;
- the original 24×12 Pitch Grid plus smart snapping;
- editable linear/radial black gradients with start/end handles, stops, feather and presets;
- Designer Notes and source-treatment status;
- Primary and optional Alternate Assemblies.

Pointer movement is transient. Pointer-up produces one durable semantic command. Interface Scale and artboard zoom never alter Deck geometry.

## Change propagation

Upstream changes create review work; they do not destroy downstream decisions.

- copy edits preserve media and Assembly, then mark text/gradient review;
- Visual Style changes preserve copy and all candidates, retain compatible slots and move incompatible selections to an unplaced tray;
- primary-media replacement preserves slot, frame, gradient and Notes, attempts normalised crop transfer and marks crop review;
- Supporting Item reorder moves its copy, links, media and layout identity together;
- skipped or cut Slides retain all work and can be restored;
- a successful Handoff records its Deck revision and becomes visibly stale after relevant changes.

## Handoff contract

The primary output is a versioned designer package containing a rough Deck, contact sheet, per-Slide specs, exact copy, selected and alternate source media, open Find More requests, source treatments, Notes, neutral data manifests and checksums.

Preflight reports concrete locatable blockers and warnings. It never produces a creative-quality score.

## Constitutional prohibitions

- generic presentation-platform scope;
- required accounts, cloud services, telemetry or analytics;
- embedded AI or hidden creative judgment;
- browser storage as canonical document state;
- raw renderer filesystem or shell authority;
- silent copy rewriting, media disappearance, font substitution or source mutation;
- hidden destructive cascades;
- pointer-only core actions;
- drag-history spam;
- final-production typography breadth before the four-phase journey is excellent.
