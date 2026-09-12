# Care Log

A private tracker for one person's cancer treatment: daily measurements, every
appointment and test, the results, and the paperwork that comes with them.
Available in **English and Greek**, switchable at any time.

It is a small static web app — eight HTML pages, one stylesheet, three scripts,
no build step, no server, no dependencies.

---

## Privacy: read this first

**Everything is stored only in the browser on the device you use it on.**
Structured records live in `localStorage`; scanned documents live in `IndexedDB`.
Nothing is uploaded, and no account or network connection is involved.

This is deliberate. The rest of this repository is a business ERP that talks to a
shared Supabase project whose anonymous API key is committed in plain text — which
is fine for villa cleaning schedules and completely unacceptable for a named
person's medical records. Care Log therefore shares **no code and no configuration**
with `erp-base.js`, and it is not linked from the ERP navigation.

The trade-off is that nothing is recoverable if the browser's data is cleared, the
device is lost, or the site is opened in private/incognito mode:

> **Export a backup regularly** — Settings → *Export full backup*. It writes one
> `.json` file containing every record *and* every scanned document. The dashboard
> warns when the last backup is more than 14 days old. That same file is how you
> move the log to a new phone or computer.

---

## Two ways to run it

**One file (recommended).** `CareLog.html` at the repository root is the whole
application — every page, the stylesheet, both libraries — compiled into a single
self-contained file. Copy it wherever the medical documents already live and open
it with a double-click. No server, no install, no network. Verified on `file://`:
records, scanned documents, backups and calendar export all work.

Rebuild it after changing anything under `health/`:

```bash
node health/build-single.js      # → CareLog.html
```

The build keeps each page in its own scope and refuses to finish if an inline
handler would reference something that does not resolve, so a renamed function
cannot ship as a dead button.

**The pages themselves.** `health/index.html` and its siblings are the source of
truth and can be opened directly too. Serving them over HTTP behaves identically:

```bash
cd health && python3 -m http.server 8000
```

Chrome or Edge are the tested browsers. For everyday use on a phone, put
`CareLog.html` in a synced folder and open it from there.

---

## The screens

| Page | What it is for |
|---|---|
| **Overview** (`index.html`) | Next appointment, current weight and blood sugar, what the last blood test flagged, recently filed papers |
| **Daily Log** (`vitals.html`) | The daily entry: weight, blood sugar, blood pressure, pulse, temperature, oxygen, and 0–10 sliders for pain, nausea, fatigue, appetite and mood |
| **Calendar** (`calendar.html`) | Month grid and agenda. Examinations, surgery, chemotherapy, radiotherapy, scans, doctor visits. Repeating treatment cycles are created in one step |
| **Lab Results** (`labs.html`) | Blood-test values typed in against reference ranges, grouped into panels. Anything outside range is flagged |
| **Documents** (`records.html`) | The filing cabinet: PDFs and photos of reports, filed by date, type and tag, searchable, optionally linked to a calendar event. **Import a folder** files an existing archive in one pass |
| **Trends** (`charts.html`) | Weight, blood sugar by reading context, blood pressure, symptom scores, and any lab analyte over time, with treatment dates ticked on the axis |
| **Reports** (`reports.html`) | Four printable summaries — doctor-visit summary, treatment timeline, daily-metrics summary, lab summary — plus CSV export |
| **Settings** (`settings.html`) | Language, patient details, target ranges, reminders, medication list, backup/restore, storage usage |

### A suggested routine

- **Every morning** — Daily Log → *Log today*: weight and fasting blood sugar take
  about fifteen seconds. Add the symptom sliders on bad days.
- **When an appointment is booked** — Calendar → *Add event*. Chemotherapy cycles
  can be generated as a series (e.g. every 21 days × 6).
- **When results arrive** — type the numbers into Lab Results, then photograph the
  paper into Documents and link both to the event they belong to.
- **Before each doctor visit** — Reports → *Doctor-visit summary* → Print. It fits
  on a page or two and ends with a blank box for questions.
- **Once a fortnight** — Settings → *Export full backup*.
- **Whenever the schedule changes** — Calendar → *Export upcoming to calendar* and
  open the downloaded file on the phone, so the appointments ring there.

---

## How things connect

```
Calendar event ──┬── Lab result set   (labs.html,    eventId)
                 └── Document(s)      (records.html, eventId)

Daily Log ──────────► Trends (charts) ──► Reports
Lab Results ────────► Trends (per analyte, against its reference range)
```

Linking results to an event is optional but pays off: the event modal then lists
everything filed against that date, and the timeline report shows how many
documents back up each entry.

## Storage keys

| Key | Contents |
|---|---|
| `carelog_profile` | Patient, diagnosis, care team, target ranges |
| `carelog_vitals` | One record per reading (`date`, `time`, measurements, notes) |
| `carelog_events` | Calendar events |
| `carelog_labs` | Lab result sets, each holding an array of values with their ranges |
| `carelog_records` | Document metadata; the files themselves are in IndexedDB `carelog_files` |
| `carelog_meds` | Medication list |
| `carelog_meta` | Last backup timestamp |

Blank fields are stored as absent, never as `0` — an unmeasured weight and a
weight of zero must not look alike in a chart or an average. The symptom sliders
follow the same rule: a slider only counts once it has actually been moved.

---

## Charts

`renderLineChart()` in `health-base.js` is a dependency-free SVG renderer: hairline
grid, 2px lines, a crosshair and tooltip on hover, the last point of each series
direct-labelled (nudged apart when they collide), treatment dates ticked on the
x-axis, a shaded reference/target band, and a *Show the numbers* table under every
chart so no value is reachable by colour alone.

Series colours are the three validated categorical slots — blue `#2a78d6`, orange
`#eb6834`, aqua `#1baf7a` — which clear the colour-blindness and normal-vision
separation gates on a white surface for all pairs. If you add a fourth series,
re-run the palette validator rather than inventing a hue.

Nothing is ever plotted on two y-axes. Where two measures share a unit (systolic
and diastolic in mmHg, the 0–10 symptom scores) they share one scale; where they
do not, they get separate charts.

---

## Importing a folder you already have

Most people come to this with a folder of scans already on disk. **Documents →
Import a folder** reads it in one pass:

- The browser hands over the file list only after you pick the folder. Nothing is
  uploaded; the reading happens in the page.
- Each file's **type is guessed from its name**, in Greek and English —
  βιοψία/biopsy → pathology, αξονική/CT/MRI/υπέρηχο → imaging,
  αιματολογικές/blood/CBC → lab, εξιτήριο → discharge, συνταγή → prescription,
  παραπεμπτικό → referral, απόδειξη → receipt, and so on. Accents are ignored, so
  `ΑΞΟΝΙΚΉ` and `αξονικη` match alike.
- The **date is read from the file name** — `2026-08-14`, `14-08-2026`,
  `20260811`, `15_03_2026` all work — falling back to the file's own timestamp.
- Everything lands in a review table first. Correct any date, type or title
  before filing; untick anything you do not want.
- Subfolder names become tags.

Two rules worth knowing:

- **Nothing is silently dropped.** Only obvious junk is skipped (`Thumbs.db`,
  `desktop.ini`, dotfiles, `.lnk`). File size is deliberately *not* a filter:
  some browsers report 0 bytes for files that are perfectly fine, and losing a
  medical document quietly is the worst thing this could do.
- **Importing twice is safe.** Files already filed from the same folder are
  recognised by name and size and skipped, so re-running it after adding new
  scans brings in only what is new.

*Keep a copy inside Care Log* (on by default) stores each file in the app, so it
travels with the backup and opens on any device. Switch it off and the entry
records the file name only, leaving the originals as the single copy — sensible
when the folder is already synced by OneDrive and the files are large.

---

## Language

The whole interface exists in English and Greek. Switch with the **EN / ΕΛ**
buttons at the bottom of the sidebar, or in Settings → Language; the choice is
remembered on that device, and on first run it follows the browser's own
language. Dates, month names and weekday names follow the active language;
numeric dates stay `DD/MM/YYYY` in both, which is unambiguous on a printed report.

What is *not* translated is your own data — a diagnosis, an event title or a
doctor's name stays exactly as it was typed. That is deliberate: a record should
read back the way it was written.

All strings live in `health-i18n.js` as one `en` / `el` pair per key:

```js
'vt.title': 'Daily Log',        // en
'vt.title': 'Ημερήσια καταγραφή' // el
```

To fix a translation, edit the `el` side — nothing else needs to change. Names of
measurements, event types, lab analytes and document categories carry their Greek
inline in `health-base.js` instead (`{ label: 'Haemoglobin', el: 'Αιμοσφαιρίνη' }`),
so a lab value typed in one language still reads correctly in the other.

## Reminders

A browser cannot notify anyone while it is closed, so Care Log does not pretend
to. Instead it hands appointments to the calendar app that *can*:

- **Calendar → Export upcoming to calendar (.ics)** writes every future
  appointment, each with its reminder, to one standard iCalendar file. Open it on
  the phone and Google, Apple or Outlook Calendar imports the lot.
- **Each event** has a *Remind me* lead time (1 hour to 1 week; default one day)
  and an *Add to phone calendar* button for that appointment alone.
- **Settings → Reminders** also generates a repeating daily nudge at a time you
  pick, to record the day's weight and blood sugar.

Every exported event carries a stable `UID` and a `SEQUENCE` that increases on
each edit, so re-exporting a changed appointment **replaces** the one already in
the calendar rather than duplicating it. Editing an appointment here does not
reach into a calendar that already imported it — export again to push the change.

---

## Limitations, honestly

- **Single patient.** The whole app assumes one person. A second would need a
  patient key threading through every storage key.
- **Single device.** There is no sync — by design. Moving between devices means
  exporting and importing a backup. Putting `CareLog.html` in a synced folder
  syncs the *app*, not its data: the records live in the browser, not in the file.
- **Reference ranges are generic.** The built-in low/high values are typical adult
  figures; laboratories differ. Every range is editable per result, and the ones
  your lab printed should always win.
- **Reminders leave the app.** Notifications happen in your calendar app, not
  here, so an appointment only rings once it has been exported and imported.
  Nothing is pushed automatically.
- **Tumour markers have no universal cut-off.** The defaults are common laboratory
  cut-offs, not a clinical threshold for any individual.

**This is a record-keeping tool, not a medical device.** It stores what you type
and draws it back. It does not interpret results, calculate doses, or check
interactions. Every clinical judgement belongs to the treating doctor, and the
original reports remain the source of truth.
