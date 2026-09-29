# Roles and workflow

## Roles

| Role | Does | Cannot |
|---|---|---|
| **Admin** | Create and publish tenders, set eligibility requirements, manage users, reopen a decided case | Evaluate or decide bids |
| **Procurement Officer** | Review the queue, rule on findings, ask for clarification, record QUALIFIED / DISQUALIFIED | Create tenders or users |
| **Bidder** | Keep the profile current, upload documents, submit bids, answer clarifications | See forensic or cartel findings, or other bidders |
| **Auditor** | Read decisions, overrides, dismissed findings, case timelines; verify the audit chain | Change anything |

Demo accounts (after `python -m app.seed`):

| Role | Email | Password |
|---|---|---|
| Admin | admin@cpcl.gov.in | Admin@123 |
| Procurement Officer | officer@cpcl.gov.in | Officer@123 |
| Auditor | auditor@cpcl.gov.in | Auditor@123 |
| Bidder, clean | alpha@alphaindia.in | Bidder@123 |
| Bidder, flagged | bharat@bharatflowtech.in | Bidder@123 |
| Other bidders | coastal@, deccan@, eastern@, eastline@, kaveri@ `bidder.example.in` | Bidder@123 |

## Case lifecycle

One case per bidder per tender (`BidCase`).

```
DRAFT ──submit──▶ SUBMITTED ──screen──▶ SCREENED ──start review──▶ IN_REVIEW ──decide──▶ DECIDED
                                            │                        │   ▲                    │
                                            │                 ask    ▼   │ re-screen          │ Admin
                                            └────────────▶ CLARIFICATION_REQUESTED            │ reopens
                                                                     │ bidder replies         ▼
                                                                     ▼                     IN_REVIEW
                                                          CLARIFICATION_RECEIVED
```

- **Submit** happens when a bidder submits the bid form. Screening runs straight away.
- **Screening** runs every engine: extraction and forensics per document, registry lookups,
  cross-document checks, requirement evaluation, cartel links and price screens. The output is one
  list of findings, each with its source, severity and evidence pin (document, page, box).
- **Lane** is set from the findings: ESCALATED if any HIGH tampering or cartel finding, STANDARD if
  any MEDIUM or HIGH, otherwise FAST_TRACK. SLA: 1, 2 and 3 days.
- **Rulings**: each HIGH finding must be UPHELD or DISMISSED (dismissals need a reason) before a
  decision is accepted. Rulings are labels for rule reliability.
- **Decision** records the reason, the AI recommendation it agreed or disagreed with, and the audit
  chain head hash. The bidder is notified.
- When a later bid links to a bidder who already screened clean, that earlier case is re-triaged.

## User flows

**Bidder**
1. Home shows tasks first: missing profile fields, documents to upload, clarifications to answer,
   certificates about to expire. Then open tenders and their own bids.
2. Open a tender, upload required documents, submit the bid.
3. The case reads UNDER_EVALUATION. If the officer asks a question, it becomes a task with a due
   date; they reply with text and, usually, a replacement document.
4. The outcome and the officer's reason appear when decided.

**Procurement Officer**
1. Home shows counts by lane, SLA breaches, linked bidders, cases waiting on bidders, then the
   queue sorted escalated first, by priority.
2. Open a case: findings grouped by severity; clicking a finding opens the document page with the
   box drawn on it and, for an overlap, both the covered and visible text.
3. Rule on each HIGH finding, or ask the bidder for clarification about a specific one.
4. Decide. The decision is refused while any HIGH finding lacks a ruling.
5. Tender view: the ring graph and price screens for all bidders on one tender.

**Admin**
1. Home shows tenders by status, users by role, cases by stage, tenders missing requirements, the
   least reliable rules, and the audit chain status.
2. Create tender, add requirements (type, mandatory, threshold, evidence category), publish.
3. Manage users. Reopen a decided case with a reason.

**Auditor**
1. Home shows the audit chain status, decisions made against the AI recommendation, and HIGH
   findings that were dismissed, each linking to the case.
2. Case timeline: every event with its hash; the chain check names the first altered entry if any.
