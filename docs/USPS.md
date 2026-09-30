# Bidmark: what sets it apart

Integrated bid compliance verification for public procurement (reference context: Ministry of Petroleum & Natural Gas, CPCL).

The honest objection to this problem statement is that the portal integrations it asks for
(GSTN, MCA21, EPFO, Udyam, debarment lists) need credentialed government access no student team
has. Most teams will answer it with mocked API responses. Bidmark's answer is different: most of
the fraud this PS is about can be caught **from the documents themselves and from how bids
arrive**, with no portal access at all. The integrations sit behind an adapter that answers from a
sandbox dataset today and from real APIs later.

Every USP below runs on the seeded demo (`python -m app.seed`) and is covered by tests.

---

## King USPs

### 1. The file tells on itself: evidence-pinned document forensics

Bidmark reads each uploaded PDF or image and reports what was changed, with the exact spot
highlighted on the page. When someone covers a value with a white box and types a new one, the
old value is still in the file. Bidmark recovers it:

> On page 1, '15/08/2028' is printed on top of '15/08/2026'. The original value is still in the file underneath.

| Signal | What it catches |
|---|---|
| `OVERLAPPING_TEXT` | A value typed over another value. Reports both the covered and the visible text. |
| `FIELD_FONT_OUTLIER` | A key field (expiry, name, GSTIN, turnover) set in a font used nowhere else in the file. |
| `MODIFIED_AFTER_SIGNING` / `SIGNATURE_BROKEN` | A digitally signed certificate changed after the issuer signed it (pyHanko diff analysis). |
| `INCREMENTAL_UPDATES` | Content appended to the file after it was first produced. |
| `EDITOR_TOOL`, `TIMESTAMP_INVERSION` | Re-saved in iLovePDF, Photoshop, Word etc.; ModDate earlier than CreationDate. |
| `CATEGORY_MISMATCH` | A Udyam certificate uploaded under the GST heading. |
| `IDENTICAL_FILE_REUSE_CROSS_BIDDER` | Byte-identical file submitted by two "independent" bidders. |
| `COMPRESSION_HOTSPOT`, `IMAGE_EDITOR` | Pasted-in regions and editing software in phone photos and scans. |

Every field Bidmark extracts carries its page and bounding box, so a flag is never "trust me";
the officer sees the box on the page. Scanned pages go through Tesseract OCR.

Code: `backend/app/forensics/` (`pdf.py`, `text.py`, `fields.py`, `image.py`, `document.py`).
Demo: Coastal Hydraulics (retyped OEM expiry), Eastline (CA-signed turnover raised from 4.10 to
6.10 crore after signing).

### 2. Verify without the portal

Indian statutory identifiers carry their own structure. Bidmark checks it offline before any
registry is asked:

- **GSTIN check digit** (mod-36). A made-up or mistyped GSTIN fails it; GSTN cannot hold one that does.
- **GSTIN embeds the PAN and the state**: checked against the PAN supplied and the address.
- **PAN holder type** (4th character): a company bidding with a firm or individual PAN is flagged.
- **PAN name initial** (5th character) against the entity name.
- **CIN decode**: listing status, industry code, state, year of incorporation, company class.
  A CIN saying 2012 against a declared incorporation in 2015 is flagged.
- **Digital signatures** validated to a trust root (the CCA India root in production).
  A signed document is the one thing DigiLocker would guarantee, and Bidmark verifies it directly.

Registries are behind one adapter (`providers/government/`). It answers from a sandbox dataset
(`sandbox.py`, which the PS explicitly permits) and falls back to the seeded mock. Swapping in a
real GSTN or MCA21 client touches no caller.

Code: `backend/app/forensics/identifiers.py`, `backend/app/providers/government/sandbox.py`.
Demo: Deccan Pump Works (GSTIN fails its check digit, CIN year contradicts the profile).

### 3. Proxy bidders and cartels

GeM's hardest fraud is not a fake certificate. It is several "competing" companies run by one
operator, taking turns to win. Bidmark links bidders the way fraud-ring detection in lending
does:

- **Submission telemetry**: device, IP and /24 network behind each bidder action, stored only as
  salted hashes. Recorded only for bidder actions, so an officer's laptop never links two bidders.
- **Declared links**: shared director (DIN), phone, email, private mail domain, registered address.
- **Document links**: PDF author metadata ("SURESH-LAPTOP" on two competitors' letters), byte-identical files.
- **Timing**: bids submitted minutes apart.

Links are grouped into rings (union-find over weighted links). On top, published bid-rigging price
screens run per tender: coefficient of variation, relative distance between the two lowest bids,
fixed-step price ladders, identical prices, abnormally low bids (Imhof, Karagok and Rutz 2018; OECD
guidance). Linked bidders who all price above one linked member are flagged as a likely cover bid.

A ring only becomes visible when its second member bids. Bidmark then **re-triages the member
who bid first**, whose case had screened clean.

Code: `backend/app/engines/cartel_engine.py`, `backend/app/services/telemetry_service.py`.
Demo: Eastern Fluid Systems and Eastline Industrial Supplies.

---

## Supporting USPs

4. **No silent overrides.** An officer cannot record a decision until every HIGH finding has a
   ruling: upheld, or dismissed with a written reason. Nothing can be quietly ignored.
5. **The system learns from officers.** Every ruling is a label. `GET /api/v1/rules/reliability`
   shows how often officers uphold each rule, and a rule officers keep dismissing loses weight in
   the queue. This is the path from rules to a supervised model once real outcomes accumulate.
6. **Tamper-evident audit trail.** Each audit row stores the hash of the one before it. Editing or
   deleting any past entry, even directly in the database, breaks the chain at that row, and the
   Auditor sees exactly where. Every decision records the chain head hash as its anchor.
7. **Validity at the bid date, not today.** A certificate that lapsed before the bid was submitted
   never qualified, even if renewed since. Expiry only counts as HIGH for documents the tender requires.
8. **Look-alike entities.** "Bharat Flowtek" on a Bharat Flowtech bid is flagged HIGH, not waved
   through as a spelling variant. "Pvt Ltd" vs "Private Limited" is treated as the same entity;
   "Pvt Ltd" vs "Ltd" as a different legal form.
9. **Unmeasured is not clean.** A check that could not run (no signature, scanned page, no GSTN
   access) is reported as `UNMEASURED`, never as a pass. Fields filled from the profile because a
   file was unreadable are labelled `simulated` everywhere they appear.
10. **Hard evidence caps the recommendation.** The fusion score averages modules, so one failed
    mandatory requirement could hide behind good scores elsewhere. Any unmet mandatory requirement
    means "recommend rejection, clarify first"; any HIGH finding means "review".
11. **Evidence, not the certificate's word.** Turnover eligibility is judged from the CA certificate
    that was read, not the figure typed into the bid form.
12. **No tipping off.** Bidders see requirements, missing documents and clarification questions.
    They never see which edit was spotted or which competitor they were linked to.
13. **Exception-only review.** Cases land in ESCALATED (tampering or cartel), STANDARD or FAST_TRACK
    lanes with an SLA, ordered by priority weighted by rule reliability and tender value.
14. **Clarification loop.** The officer asks about a specific finding; the bidder replies with a
    new document; the case re-screens itself and returns to review.
15. **Four roles, strictly separated.** Admin (tenders, users), Procurement Officer (evaluate,
    decide), Bidder (submit, respond), Auditor (read-only oversight of decisions, overrides and the audit chain).
16. **Privacy by design.** IPs kept only as salted hashes; data processor posture; deployable
    in India-only regions.

---

## "Is it AI or a rule engine?"

Both, on purpose. Eligibility has to be deterministic and explainable: an officer must be able to
say why a bidder failed, and a model's opinion is not a reason under procurement rules. Everything
that is judgement rather than eligibility is statistical or learned:

- OCR of scanned certificates (Tesseract's LSTM recogniser).
- Content similarity between bidders' documents (TF-IDF, cosine similarity).
- Robust statistics for price screens and image compression analysis (median/MAD z-scores).
- Rule reliability learned from officer rulings (Beta-Bernoulli), which reorders the queue.
- Ask Bidmark answers only from computed evidence, deterministically, with citations. No language model is used.

The design goal is the same one a production fraud system follows: start with rules and
unsupervised signals on day one, collect officer outcomes as labels (shadow mode), then train on
them. Bidmark already collects those labels.

---

## Limits we state up front

- Portal lookups run against the sandbox dataset and the mock gateway. Real GSTN/MCA21/EPFO calls
  need authorised API access; the adapter is where they plug in.
- Font and overlap checks need a text layer. For scanned pages Bidmark reports them as unmeasured
  and relies on OCR, compression analysis and cross-document checks.
- Signature trust needs the CCA India root in `TRUST_ROOTS_DIR`. The demo trusts its own synthetic CA.
- Links and price patterns are leads for review. None of them proves collusion, and the UI says so.
