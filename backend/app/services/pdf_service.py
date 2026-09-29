"""
PDF generation for the two documents the platform lets people download:
a bidder's compliance report for a tender, and a bid submission receipt.

Built with reportlab (Platypus) rather than hand-rolled layout so both
documents share one consistent, government-procurement-appropriate look:
a plain title block, a details table, and clearly labeled sections, no
external assets, so this works offline and byte-for-byte the same in dev
and in any deployment.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.bid import BidSubmission
from app.models.bidder import Bidder
from app.models.compliance import ComplianceReport
from app.models.tender import Tender

_styles = getSampleStyleSheet()
_TITLE = ParagraphStyle("DocTitle", parent=_styles["Title"], fontSize=16, spaceAfter=2)
_SUBTITLE = ParagraphStyle("DocSubtitle", parent=_styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748b"), spaceAfter=12)
_SECTION = ParagraphStyle("Section", parent=_styles["Heading2"], fontSize=12, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#0f172a"))
_BODY = _styles["Normal"]
_MOCK_NOTE = ParagraphStyle("MockNote", parent=_styles["Normal"], fontSize=8, textColor=colors.HexColor("#b45309"), spaceBefore=10)

_HEADER_BG = colors.HexColor("#1e3a8a")
_ROW_ALT = colors.HexColor("#f8fafc")
_BORDER = colors.HexColor("#e2e8f0")

_STATUS_COLORS = {
    "VERIFIED": colors.HexColor("#059669"),
    "COMPLIANT": colors.HexColor("#059669"),
    "FAILED": colors.HexColor("#dc2626"),
    "MISSING_INFORMATION": colors.HexColor("#dc2626"),
    "PENDING": colors.HexColor("#d97706"),
    "REQUIRES_REVIEW": colors.HexColor("#d97706"),
    "EXPIRED": colors.HexColor("#dc2626"),
}


def _kv_table(rows: list[tuple[str, str]]) -> Table:
    data = [[Paragraph(f"<b>{k}</b>", _BODY), Paragraph(str(v), _BODY)] for k, v in rows]
    t = Table(data, colWidths=[55 * mm, 110 * mm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
        ("BACKGROUND", (0, 0), (0, -1), _ROW_ALT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def _header(title: str, subtitle: str) -> list:
    return [
        Paragraph("GeM Bid Compliance Verification Platform", _SUBTITLE),
        Paragraph(title, _TITLE),
        Paragraph(subtitle, _SUBTITLE),
    ]


def _footer_note() -> Paragraph:
    return Paragraph(
        "Government verification referenced in this document is served by a Mock Government Verification "
        "API Gateway (source=MOCK_GOVERNMENT_API) for demonstration purposes and does not represent a live "
        "connection to any real government registry.",
        _MOCK_NOTE,
    )


def build_compliance_report_pdf(bidder: Bidder, tender: Tender, report: ComplianceReport | None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm)
    story: list = []
    story += _header("Compliance Report", f"Generated {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}")

    story.append(Paragraph("Tender & Bidder", _SECTION))
    story.append(_kv_table([
        ("Tender", tender.title),
        ("Tender reference", tender.tender_number),
        ("GeM Tender ID", tender.gem_tender_id or "-"),
        ("Department", tender.department),
        ("Bidder / Company", bidder.company_name),
        ("GSTIN", bidder.gstin or "-"),
        ("PAN", bidder.pan_number or "-"),
    ]))

    story.append(Paragraph("Compliance Summary", _SECTION))
    if not report:
        story.append(Paragraph("No compliance evaluation has been run yet for this bidder and tender.", _BODY))
    else:
        story.append(_kv_table([
            ("Overall compliance score", f"{report.overall_score}%"),
            ("Risk level", report.risk_level),
            ("Requirements verified", str(report.verified_count)),
            ("Requirements failed", str(report.failed_count)),
            ("Pending", str(report.pending_count)),
            ("Requires review", str(report.requires_review_count)),
            ("Report generated at", report.created_at.strftime("%d %b %Y, %H:%M UTC") if report.created_at else "-"),
        ]))

        story.append(Paragraph("Requirement-by-requirement status", _SECTION))
        header = ["Requirement", "Status", "Notes"]
        rows = [header]
        for ev in report.requirement_evaluations:
            rows.append([
                ev.requirement_type.replace("_", " ").title(),
                ev.status,
                Paragraph((ev.explanation or "-")[:180], _BODY),
            ])
        t = Table(rows, colWidths=[45 * mm, 30 * mm, 90 * mm], repeatRows=1)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]
        for i, ev in enumerate(report.requirement_evaluations, start=1):
            color = _STATUS_COLORS.get(ev.status, colors.black)
            style.append(("TEXTCOLOR", (1, i), (1, i), color))
            if i % 2 == 0:
                style.append(("BACKGROUND", (0, i), (-1, i), _ROW_ALT))
        t.setStyle(TableStyle(style))
        story.append(t)

    story.append(_footer_note())
    doc.build(story)
    return buf.getvalue()


def build_bid_receipt_pdf(bidder: Bidder, tender: Tender, submission: BidSubmission) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm)
    story: list = []
    story += _header("Bid Submission Receipt", f"Receipt generated {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}")

    story.append(Paragraph("Submission Details", _SECTION))
    story.append(_kv_table([
        ("Bid submission ID", submission.id),
        ("Status", submission.status),
        ("Submitted at", submission.submitted_at.strftime("%d %b %Y, %H:%M UTC") if submission.submitted_at else "-"),
        ("Quoted price (₹)", f"{submission.quoted_price:,.2f}" if submission.quoted_price is not None else "-"),
        ("Local content declared (%)", f"{submission.local_content_percent}" if submission.local_content_percent is not None else "-"),
        ("Declared turnover (₹ crore)", f"{submission.declared_turnover_crore}" if submission.declared_turnover_crore is not None else "-"),
    ]))

    story.append(Paragraph("Tender", _SECTION))
    story.append(_kv_table([
        ("Tender title", tender.title),
        ("Tender reference", tender.tender_number),
        ("GeM Tender ID", tender.gem_tender_id or "-"),
        ("Department", tender.department),
        ("Submission deadline", tender.deadline.strftime("%d %b %Y, %H:%M UTC") if tender.deadline else "-"),
    ]))

    story.append(Paragraph("Bidder", _SECTION))
    story.append(_kv_table([
        ("Company name", bidder.company_name),
        ("GSTIN", bidder.gstin or "-"),
        ("PAN", bidder.pan_number or "-"),
    ]))

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "This receipt confirms that the above bid details were recorded by the platform at the time shown. "
        "It is not a certificate of compliance or eligibility, see the separate Compliance Report for that.",
        _MOCK_NOTE,
    ))
    doc.build(story)
    return buf.getvalue()
