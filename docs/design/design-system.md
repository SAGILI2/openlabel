# OpenLabel design system

## Subject, audience, job

- **Subject:** a workbench for making training data: images and pages covered in boxes, transcripts, review queues, accuracy numbers.
- **Audience:** ML engineers, annotation leads and labellers who spend hours a day in it; admins who configure it.
- **Primary job:** let people look closely at source material and make precise, fast corrections, then see that the data is getting better.

## Concept: the light table

Annotators work like people at a light table: the _material_ (scans, photos, waveforms) is the brightest, most important thing on screen; the tool chrome recedes. Labels are drawn on top like grease-pencil marks in a small set of clear, distinct inks. Precision shows in the details: crisp 1px rules, tabular numbers, a measured grid.

## Colour tokens

| Token      | Light     | Dark      | Role                                                   |
| ---------- | --------- | --------- | ------------------------------------------------------ |
| `graphite` | `#1C2126` | `#E6E9EC` | Primary text, primary buttons                          |
| `slate`    | `#5B6670` | `#9AA4AE` | Secondary text, icons                                  |
| `paper`    | `#F7F8F6` | `#14181B` | App background                                         |
| `sheet`    | `#FFFFFF` | `#1B2024` | Panels, the canvas surround                            |
| `rule`     | `#DDE1E3` | `#2B3237` | Borders, dividers                                      |
| `cobalt`   | `#2B59C3` | `#6F95F0` | The one brand accent: focus, selection, primary action |

Annotation inks (for regions on the canvas, chosen for distinguishability and colour-blind safety): `#2B59C3` cobalt, `#D9480F` vermilion, `#2F9E44` leaf, `#AE3EC9` violet, `#E8A400` amber, `#0C8599` teal. Status: success `#2F9E44`, warning `#E8A400`, danger `#C92A2A`.

The palette is neutral by design, so customer material is never tinted by the UI; cobalt alone carries identity.

## Type

- **Geist Sans** for interface text; **Geist Mono** only where characters must be compared exactly (OCR text fields, IDs, numbers in diff views), which is the product's actual need, not decoration.
- Scale (px): 12 / 13 / 14 (base) / 16 / 20 / 24 / 32. Weights 400 and 550; headings 600. Line height 1.5 for body, 1.25 for headings.
- Numbers use tabular figures everywhere.
- Sentence case for everything, no all-caps labels.

## Layout

```
┌──────┬──────────────────────────────────────────────┐
│ Rail │ Top bar: org switcher · breadcrumbs · search │
│ 56px ├──────────────────────────────────────────────┤
│ icons│ Page                                          │
│      │ (max-width 1200 for settings/lists;           │
│      │  full-bleed for the labelling workspace)      │
└──────┴──────────────────────────────────────────────┘
```

- Left-aligned everywhere; 4px spacing grid; radius 6px for controls, 10px for panels, none on the canvas.
- Density: compact by default (labellers see more), roomier for settings.

## Principles

1. **Material first.** The canvas and media are the hero; chrome is quiet greys.
2. **One accent.** Cobalt means "selected / acting". Annotation colours are reserved for labels.
3. **Show precision.** Hairline rules, tabular numbers, exact coordinates on hover.
4. **Keyboard first.** Every action has a shortcut, shown in tooltips and menus.
5. **Honest states.** Empty, loading and error states say what happened and what to do next.

## Review against the brief

- First draft used a near-black UI with a bright accent, a common default for "pro tools". Changed to a light, paper-neutral base with a dark mode, because annotators read documents for hours and source material must not be colour-shifted.
- Considered a monospace face for all labels; rejected as a cliché. Mono is used only where character-exact comparison is the task (OCR text, IDs).
- The landing/home page leads with the product's real output (a document with live, editable boxes) rather than a stats hero.
