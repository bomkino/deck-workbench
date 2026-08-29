import { copyField } from '../../packages/workflow-model/index.mjs'

const present = (markdown) => copyField('present', markdown)
const blank = () => copyField('intentionally-blank')
const unreviewed = () => copyField('unreviewed')

function assembly(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'Primary Assembly',
    image: { panX: 0, panY: 0, scale: 1, sourceTreatment: 'crop-provisional' },
    text: {
      x: 260,
      y: 600,
      width: 1650,
      height: 330,
      scaleToken: 'M',
      opticalMultiplier: 1,
      columns: 1,
      columnGap: 64,
      overflow: false,
      layoutSnapshotState: 'current',
    },
    gradient: {
      enabled: true,
      type: 'linear',
      preset: 'left',
      start: { x: 0.03, y: 0.5 },
      end: { x: 0.76, y: 0.5 },
      feather: 0.68,
      opacity: 0.82,
      reverse: false,
    },
    designerNotes: '',
    unplacedAssetIds: [],
    ...overrides,
  }
}

function slide(input) {
  const nextAssembly = assembly(input.assembly)
  return {
    id: input.id,
    partId: input.partId,
    lifecycle: input.lifecycle ?? 'included',
    internalTitle: input.internalTitle,
    purpose: input.purpose,
    textPresence: input.textPresence ?? 'visible',
    contentPattern: input.contentPattern ?? 'simple-copy',
    visualStyle: input.visualStyle ?? 'full-bleed-overlay',
    mediaSlotCount: input.mediaSlotCount ?? 1,
    textHint: input.textHint ?? 'left',
    copy: input.copy,
    supportingItems: input.supportingItems ?? [],
    findMoreMedia: input.findMoreMedia ?? { state: 'not-needed', brief: '', existingPrimaryStatus: 'none' },
    sourceTreatment: input.sourceTreatment ?? 'crop-provisional',
    copyReviewState: 'clean',
    layoutReviewState: 'clean',
    assemblies: [nextAssembly],
    activeAssemblyId: nextAssembly.id,
  }
}

export const fixture = {
  project: {
    id: 'deck-motherly-christmas-prototype',
    title: 'A Very Motherly Christmas',
    version: 'v03',
    canvas: { width: 2576, height: 1080 },
  },
  phase: 'plan',
  selectedSlideId: 'slide-cover',
  interfaceScale: 1,
  artboardZoom: 0.36,
  curate: {
    search: '',
    stateFilter: 'all',
    folderFilter: 'all',
    typeFilter: 'all',
    density: 220,
    selectedAssetId: null,
    scrollTop: 0,
  },
  assemble: {
    tool: 'select',
    selection: 'text',
    cleanPreview: false,
    showGrid: true,
    snap: true,
    smartGuides: true,
  },
  parts: [
    { id: 'part-opening', title: 'Opening' },
    { id: 'part-story-one', title: 'Story One' },
    { id: 'part-story-two', title: 'Story Two' },
    { id: 'part-characters', title: 'Characters' },
    { id: 'part-positioning', title: 'Positioning' },
    { id: 'part-production', title: 'Production' },
    { id: 'part-closing', title: 'Closing' },
  ],
  slides: [
    slide({
      id: 'slide-cover',
      partId: 'part-opening',
      internalTitle: 'Cover',
      purpose: 'Create warmth, confidence and a memorable first emotional promise.',
      visualStyle: 'full-bleed-overlay',
      copy: {
        headline: present('A Very Motherly Christmas'),
        subheadline: blank(),
        body: blank(),
      },
      sourceTreatment: 'needs-expansion',
      assembly: {
        text: { x: 230, y: 650, width: 1840, height: 280, scaleToken: 'XL', opticalMultiplier: 1, columns: 1, columnGap: 64, overflow: false, layoutSnapshotState: 'current' },
        designerNotes: 'The image can be expanded beyond frame. Preserve breathing room around the title.',
      },
    }),
    slide({
      id: 'slide-logline',
      partId: 'part-opening',
      internalTitle: 'The promise',
      purpose: 'Deliver the central premise in one quick emotional turn.',
      visualStyle: 'full-bleed-overlay',
      copy: {
        headline: present('Christmas is complicated. Mothers make it impossible.'),
        subheadline: present('A warm, sharp family comedy about love, expectation and the people who refuse to let us grow up quietly.'),
        body: blank(),
      },
      assembly: {
        text: { x: 260, y: 500, width: 1760, height: 390, scaleToken: 'L', opticalMultiplier: 1, columns: 1, columnGap: 64, overflow: false, layoutSnapshotState: 'current' },
      },
    }),
    slide({
      id: 'slide-pause',
      partId: 'part-opening',
      internalTitle: 'A breath before the story',
      purpose: 'Create a visual pause before moving into character and conflict.',
      textPresence: 'no-on-slide-text',
      contentPattern: 'no-on-slide-text',
      visualStyle: 'full-bleed',
      copy: {
        headline: unreviewed(),
        subheadline: unreviewed(),
        body: unreviewed(),
      },
      assembly: {
        gradient: { enabled: false, type: 'linear', preset: 'left', start: { x: 0, y: 0.5 }, end: { x: 0.5, y: 0.5 }, feather: 0.5, opacity: 0.7, reverse: false },
      },
    }),
    slide({
      id: 'slide-world',
      partId: 'part-story-one',
      internalTitle: 'The family world',
      purpose: 'Establish the crowded, loving ecosystem that turns every private decision into public theatre.',
      visualStyle: 'gallery',
      mediaSlotCount: 6,
      copy: {
        headline: present('Everyone has an opinion.'),
        subheadline: blank(),
        body: present('In this family, affection arrives as food, advice, interruption and the occasional emergency group chat.'),
      },
      findMoreMedia: {
        state: 'needed',
        brief: 'More images of multi-generational family rooms with genuine warmth—not glossy advertising cheer.',
        existingPrimaryStatus: 'temporary',
      },
    }),
    slide({
      id: 'slide-maya',
      partId: 'part-characters',
      internalTitle: 'Maya’s contradiction',
      purpose: 'Introduce Maya as capable and magnetic before revealing the private constraint that drives the story.',
      visualStyle: 'image-text',
      copy: {
        headline: present('Maya can solve everyone’s problem but her own.'),
        subheadline: present('Brilliant, composed and one family dinner away from collapse.'),
        body: present('She has built a life around being useful. Christmas forces her to confront the difference between being needed and being known.'),
      },
      assembly: {
        text: { x: 180, y: 190, width: 1080, height: 690, scaleToken: 'M', opticalMultiplier: 1, columns: 1, columnGap: 52, overflow: false, layoutSnapshotState: 'current' },
      },
    }),
    slide({
      id: 'slide-conflict',
      partId: 'part-story-two',
      internalTitle: 'The rupture',
      purpose: 'Move the story from affectionate inconvenience into emotional danger.',
      visualStyle: 'full-bleed-overlay',
      copy: {
        headline: present('Then the secret arrives before dessert.'),
        subheadline: blank(),
        body: present('One revelation turns a familiar Christmas into a referendum on who Maya has been allowed to become.'),
      },
      sourceTreatment: 'placeholder',
    }),
    slide({
      id: 'slide-comps',
      partId: 'part-positioning',
      internalTitle: 'Comparable projects',
      purpose: 'Place the project inside a recognisable emotional and commercial field without suggesting imitation.',
      contentPattern: 'repeater',
      visualStyle: 'triptych',
      mediaSlotCount: 3,
      copy: {
        headline: present('Three stories where family becomes the pressure chamber.'),
        subheadline: blank(),
        body: blank(),
      },
      supportingItems: [
        { id: 'item-bear', title: 'The Bear', caption: 'Family systems rendered with speed, tenderness and emotional shrapnel.', link: 'https://www.imdb.com/title/tt14452776/' },
        { id: 'item-reservation', title: 'Reservation Dogs', caption: 'Specific community, lived-in humour and grief without sentimentality.', link: 'https://www.imdb.com/title/tt13623580/' },
        { id: 'item-this-is-us', title: 'This Is Us', caption: 'Accessible emotional storytelling built around intergenerational consequence.', link: 'https://www.imdb.com/title/tt5555260/' },
      ],
      assembly: {
        text: { x: 160, y: 110, width: 2256, height: 200, scaleToken: 'M', opticalMultiplier: 1, columns: 1, columnGap: 64, overflow: false, layoutSnapshotState: 'current' },
        gradient: { enabled: false, type: 'linear', preset: 'left', start: { x: 0, y: 0.5 }, end: { x: 0.5, y: 0.5 }, feather: 0.5, opacity: 0.7, reverse: false },
      },
    }),
    slide({
      id: 'slide-engine',
      partId: 'part-story-two',
      internalTitle: 'The series engine',
      purpose: 'Explain how the premise keeps generating story beyond the pilot.',
      visualStyle: 'text-only',
      copy: {
        headline: present('Every celebration reveals a new fault line.'),
        subheadline: present('The family gathers. The rules change. Everyone brings history.'),
        body: present('Each episode turns a ritual, obligation or family milestone into a pressure test. What begins as comedy exposes a deeper question: can this family love one another without preserving the roles that are hurting them?\n\nThe engine is elastic enough for weddings, funerals, birthdays, homecomings and the supposedly ordinary Sundays where the biggest emotional shifts often happen.'),
      },
      assembly: {
        text: { x: 220, y: 150, width: 2136, height: 760, scaleToken: 'M', opticalMultiplier: 1, columns: 2, columnGap: 86, overflow: false, layoutSnapshotState: 'current' },
        gradient: { enabled: false, type: 'linear', preset: 'left', start: { x: 0, y: 0.5 }, end: { x: 0.5, y: 0.5 }, feather: 0.5, opacity: 0.7, reverse: false },
      },
    }),
    slide({
      id: 'slide-episodes',
      partId: 'part-story-two',
      internalTitle: 'Episode field',
      purpose: 'Show breadth and escalation without turning the Deck into a synopsis document.',
      contentPattern: 'repeater',
      visualStyle: 'gallery',
      mediaSlotCount: 6,
      copy: {
        headline: present('Six gatherings. Six ways to lose control.'),
        subheadline: blank(),
        body: blank(),
      },
      supportingItems: [
        { id: 'ep-1', title: 'The Arrival', caption: 'A surprise guest upends the seating plan and the family hierarchy.' },
        { id: 'ep-2', title: 'The Photograph', caption: 'One old image opens a story no one agrees belongs to them.' },
        { id: 'ep-3', title: 'The Toast', caption: 'A sincere speech becomes a public accusation.' },
        { id: 'ep-4', title: 'The Kitchen', caption: 'The people doing the work finally stop protecting the people making demands.' },
        { id: 'ep-5', title: 'The Snow Day', caption: 'No one can leave, so everyone must listen.' },
        { id: 'ep-6', title: 'The Morning After', caption: 'Repair begins with the one person least interested in pretending.' },
      ],
    }),
    slide({
      id: 'slide-production',
      partId: 'part-production',
      internalTitle: 'Production approach',
      purpose: 'Translate the creative promise into a practical, credible production language.',
      visualStyle: 'image-text',
      copy: {
        headline: present('Intimate scale. Cinematic emotional range.'),
        subheadline: blank(),
        body: present('The film lives in expressive close-ups, layered family spaces and carefully controlled movement. Production design should feel accumulated rather than decorated. The camera joins the family instead of observing from a safe distance.\n\nA contained location strategy keeps the schedule efficient while giving performance, sound and art direction room to carry the world.'),
      },
      assembly: {
        text: { x: 180, y: 150, width: 1150, height: 740, scaleToken: 'S', opticalMultiplier: 1, columns: 2, columnGap: 54, overflow: false, layoutSnapshotState: 'current' },
      },
    }),
    slide({
      id: 'slide-team',
      partId: 'part-production',
      internalTitle: 'The team',
      purpose: 'Establish the people carrying the project and the specific authority each brings.',
      contentPattern: 'repeater',
      visualStyle: 'triptych',
      mediaSlotCount: 3,
      copy: {
        headline: present('Built by storytellers who know the world from the inside.'),
        subheadline: blank(),
        body: blank(),
      },
      supportingItems: [
        { id: 'team-1', title: 'Oji Singletary', caption: 'Creator / Producer' },
        { id: 'team-2', title: 'Erika Nuri Taylor', caption: 'Writer / Producer' },
        { id: 'team-3', title: 'Additional Partner', caption: 'To be confirmed' },
      ],
    }),
    slide({
      id: 'slide-close',
      partId: 'part-closing',
      internalTitle: 'Closing image',
      purpose: 'Leave the reader with warmth, possibility and the sense that repair has begun.',
      textPresence: 'no-on-slide-text',
      contentPattern: 'no-on-slide-text',
      visualStyle: 'full-bleed',
      copy: {
        headline: blank(),
        subheadline: blank(),
        body: blank(),
      },
      assembly: {
        gradient: { enabled: false, type: 'linear', preset: 'left', start: { x: 0, y: 0.5 }, end: { x: 0.5, y: 0.5 }, feather: 0.5, opacity: 0.7, reverse: false },
      },
    }),
  ],
  projectAssetJudgments: {},
  slideMediaDecisions: {},
}
