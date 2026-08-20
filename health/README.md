# Care Log

A private tracker for one person's cancer treatment: daily measurements, every
appointment and test, the results, and the paperwork that comes with them.

It is a small static web app — eight HTML pages, one stylesheet, two scripts, no
build step, no server, no dependencies.

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

## Opening it

Double-clicking `health/index.html` works in most browsers. If document uploads
misbehave (some browsers restrict IndexedDB on `file://`), serve the folder over
HTTP instead:

```bash
cd health
python3 -m http.server 8000     # then open http://localhost:8000
```

For everyday use on a phone, open that address once and add it to the home screen.

---

## The screens

| Page | What it is for |
|---|---|
| **Overview** (`index.html`) | Next appointment, current weight and blood sugar, what the last blood test flagged, recently filed papers |
| **Daily Log** (`vitals.html`) | The daily entry: weight, blood sugar, blood pressure, pulse, temperature, oxygen, and 0–10 sliders for pain, nausea, fatigue, appetite and mood |
| **Calendar** (`calendar.html`) | Month grid and agenda. Examinations, surgery, chemotherapy, radiotherapy, scans, doctor visits. Repeating treatment cycles are created in one step |
| **Lab Results** (`labs.html`) | Blood-test values typed in against reference ranges, grouped into panels. Anything outside range is flagged |
| **Documents** (`records.html`) | The filing cabinet: PDFs and photos of reports, filed by date, type and tag, searchable, optionally linked to a calendar event |
| **Trends** (`charts.html`) | Weight, blood sugar by reading context, blood pressure, symptom scores, and any lab analyte over time, with treatment dates ticked on the axis |
| **Reports** (`reports.html`) | Four printable summaries — doctor-visit summary, treatment timeline, daily-metrics summary, lab summary — plus CSV export |
| **Settings** (`settings.html`) | Patient details, target ranges, medication list, backup/restore, storage usage |

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

## Limitations, honestly

- **Single patient.** The whole app assumes one person. A second would need a
  patient key threading through every storage key.
- **Single device.** There is no sync — by design. Moving between devices means
  exporting and importing a backup.
- **Reference ranges are generic.** The built-in low/high values are typical adult
  figures; laboratories differ. Every range is editable per result, and the ones
  your lab printed should always win.
- **No reminders.** The calendar shows what is coming but the browser cannot send
  a notification when the app is closed. Keep hard appointments in a phone calendar
  as well.
- **Tumour markers have no universal cut-off.** The defaults are common laboratory
  cut-offs, not a clinical threshold for any individual.

**This is a record-keeping tool, not a medical device.** It stores what you type
and draws it back. It does not interpret results, calculate doses, or check
interactions. Every clinical judgement belongs to the treating doctor, and the
original reports remain the source of truth.
