# The Downtown House (Megaro Foumi) — reconstructed financial model

`downtown-house-model.xlsx` is a working reconstruction of the spreadsheet model behind the
financial section (pages 9–11) of GBR Consulting's business plan *"The Downtown house, a social
hub at Megaro Foumi"* (May 2024, draft). It was reverse-engineered from the printed figures so
that the plan can be adjusted, re-run under different scenarios, and audited.

Regenerate the workbook at any time with:

```bash
python3 generate_model.py downtown-house-model.xlsx   # requires openpyxl
```

## Workbook layout

| Sheet | Purpose |
|---|---|
| **README** | Usage instructions inside the file itself |
| **Inputs** | Every driver as a blue input cell, in a Base / Upside / Downside scenario table with a selector (`B4`). The model reads the "Active value" column. |
| **Model** | P&L 2025–2044, formula-only, mirroring the PDF's pages 9–10 layout |
| **Returns** | Unlevered cash flows 2024–2044, NPV and IRR, mirroring page 11 |
| **Check vs PDF** | All ~230 printed figures hard-coded next to the live model values, with tolerances and OK/CHECK status. With the Base scenario selected, all 228 checks pass. |

## Reconstructed model logic

Everything below was **proven against the printed figures** (each relationship reproduces the
PDF to the euro across all ten forecast years):

- **Rooms:** 5 rooms × 365 days = 1,825 available room nights. Occupancy ramps 65 / 70 / 75 / 80 %,
  flat at 80 % from 2028 (stabilisation).
- **ADR:** ramps to a stabilised level in 2028, then grows 2 %/year. The PDF prints ADR rounded to
  whole euros (113/122/131/141); the exact implied values are 113.2207 / 121.9006 / 130.8829 / 140.5027.
- **F&B revenue:** direct annual values 2025–2028 (1,045,493 / 1,332,401 / 1,598,479 / 1,811,423),
  then +2 %/year.
- **Departmental expenses:**
  - Rooms = 12.2845 / 11.9645 / 11.6760 / 11.4023 % of room revenue (flat at the 2028 ratio after).
  - F&B = **37.5 % of F&B revenue** (exact, every year).
  - Staff = **€533,868 in 2025, +2 %/year** (32 FTEs per the plan).
- **Undistributed expenses:**
  - A&G = **€82,212 fixed (growing 2 %/yr) + 2.0 % of total revenue** (exact in all ten years).
  - Marketing = **3.0 %**, Property Ops & Maintenance = **3.0 %**, Utilities = **4.5 %** of total revenue.
- **Fixed charges:** rent €15,000 (2024–2029), €21,000 (2030–2034), €90,000 from 2035 (see caveat);
  reserve for replacement = 1 % of revenue in year 1, 2 % thereafter.
- **Growth:** after stabilisation (2028) every revenue and cost line grows at a uniform 2 %/year,
  so margins are constant from 2029 on.
- **Returns:** CAPEX €1.5 m + €100 k pre-opening, both +24 % VAT, paid 2024; VAT (€384,000) fully
  recovered in 2025; NOI 2024 = −€15,000 (rent during works).
- **NPV convention:** the PDF's €746,821 comes from discounting the **2024 outflow by one full
  year** (Excel's `NPV()` over 2024–2044 at 10 %). The workbook uses the same convention.
  Reconstructed results: NPV ≈ €746,820, IRR ≈ 15.14 % (PDF: €746,821 / 15.1 %).

## Caveats — read before relying on the numbers

1. **Rent of €90,000 from 2035 is inferred, not printed.** The PDF shows rent only to 2034. The
   2035+ level is backed out of two printed numbers it must reconcile with — the 2044 NOI
   (€414,765) and the NPV (€746,821) — and both match to the euro. Still, verify it against the
   actual 30(+5)-year lease.
2. **Ramp-up inputs are taken at face value.** The consultants may have derived the annual ADR,
   F&B and rooms-cost figures from a monthly seasonality model; annual totals cannot reveal that
   detail, so the workbook treats them as direct annual inputs.
3. **The Upside/Downside scenario columns are illustrative placeholders**, not GBR's scenarios
   (the PDF contains only one case). Replace them with your own assumptions.
4. **The CAPEX grant driver defaults to 0 %.** The plan mentions applying for a 60–75 % CAPEX
   grant; the Upside column sets it to 60 %, received in 2025, applied to CAPEX excl. VAT.
5. A handful of ±€1–2 differences against the PDF are the PDF's own display rounding (it prints
   whole euros); the check sheet's tolerances account for exactly that and no more.
