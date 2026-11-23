"""Email templates for Becon daily intelligence digest (Task F7).

Provides:
- Table-based inline-CSS HTML email with mobile responsiveness and dark mode support.
- Clean, readable ASCII broadsheet plain-text fallback.
- Strict HTML escaping on all dynamic text.
"""

from __future__ import annotations

import html
from typing import List

from app.schemas import BriefingCard

ACTION_COLORS = {
    "apply": {"bg": "#ecfdf5", "text": "#065f46", "border": "#a7f3d0", "label": "APPLY"},
    "avoid": {"bg": "#fff1f2", "text": "#9f1239", "border": "#fecdd3", "label": "AVOID"},
    "prepare": {"bg": "#fffbeb", "text": "#92400e", "border": "#fde68a", "label": "PREPARE"},
    "learn": {"bg": "#f0f9ff", "text": "#0369a1", "border": "#bae6fd", "label": "LEARN"},
}


def render_digest_html(
    user_name: str,
    user_role: str,
    cards: List[BriefingCard],
    today_str: str,
    reading_time_minutes: int,
    unsubscribe_url: str,
    preferences_url: str,
    base_url: str,
) -> str:
    """Render a responsive, table-based, mobile-friendly HTML daily digest email."""
    safe_user_name = html.escape(user_name or "Reader")
    safe_user_role = html.escape(user_role or "Professional")
    safe_today = html.escape(today_str)
    safe_unsub_url = html.escape(unsubscribe_url)
    safe_pref_url = html.escape(preferences_url)
    total_cards = len(cards)

    cards_html = []
    for idx, card in enumerate(cards, 1):
        safe_title = html.escape(card.title)
        safe_source_url = html.escape(card.source_url)
        card_app_url = f"{base_url.rstrip('/')}/?card={html.escape(card.id or '')}"

        # Action Badge
        act_type = (card.card_content.what_to_do_next.action_type or "apply").lower()
        badge_style = ACTION_COLORS.get(act_type, ACTION_COLORS["apply"])
        badge_label = badge_style["label"]

        # Bullets
        bullets = card.card_content.what_happened
        if isinstance(bullets, list):
            bullets_html = "".join(f"<li style='margin-bottom: 6px; line-height: 1.5;'>{html.escape(b)}</li>" for b in bullets)
        else:
            bullets_html = f"<li style='margin-bottom: 6px; line-height: 1.5;'>{html.escape(str(bullets))}</li>"

        safe_why = html.escape(card.card_content.why_it_matters)
        safe_how = html.escape(card.card_content.how_it_affects_you)
        safe_guidance = html.escape(card.card_content.what_to_do_next.guidance)
        safe_match = html.escape(card.match_reason or "")

        is_lead = getattr(card, "is_lead", False) or idx == 1
        card_border = "#0f172a" if is_lead else "#e2e8f0"
        card_bg = "#ffffff"

        lead_pill = ""
        if is_lead:
            lead_pill = (
                "<span style='display: inline-block; background-color: #0f172a; color: #f8fafc; "
                "font-size: 10px; font-weight: 800; font-family: monospace; letter-spacing: 0.1em; "
                "padding: 3px 8px; border-radius: 4px; text-transform: uppercase; margin-right: 8px;'>"
                "LEAD STORY</span>"
            )

        match_line = ""
        if safe_match:
            match_line = (
                f"<div style='font-family: monospace; font-size: 11px; color: #64748b; "
                f"margin-bottom: 10px;'>&#9670; {safe_match}</div>"
            )

        card_block = f"""
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: {card_bg}; border: 1px solid {card_border}; border-radius: 8px; margin-bottom: 24px; overflow: hidden;">
          <tr>
            <td style="padding: 24px;">
              <div style="margin-bottom: 12px;">
                {lead_pill}
                <span style="display: inline-block; background-color: {badge_style['bg']}; color: {badge_style['text']}; border: 1px solid {badge_style['border']}; font-size: 10px; font-weight: 800; font-family: monospace; letter-spacing: 0.1em; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">
                  {badge_label}
                </span>
              </div>
              <h2 style="font-family: Georgia, Cambria, 'Times New Roman', Times, serif; font-size: 20px; font-weight: 800; line-height: 1.3; color: #0f172a; margin: 0 0 8px 0;">
                {safe_title}
              </h2>
              {match_line}
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #334155; margin-bottom: 16px;">
                <p style="margin: 0 0 6px 0; font-weight: 700; color: #0f172a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">What Happened</p>
                <ul style="margin: 0 0 16px 0; padding-left: 20px; color: #334155;">
                  {bullets_html}
                </ul>

                <p style="margin: 0 0 4px 0; font-weight: 700; color: #0f172a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Why It Matters</p>
                <p style="margin: 0 0 16px 0; line-height: 1.5;">{safe_why}</p>

                <p style="margin: 0 0 4px 0; font-weight: 700; color: #0f172a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">How It Affects You ({safe_user_role})</p>
                <p style="margin: 0 0 16px 0; line-height: 1.5;">{safe_how}</p>

                <div style="background-color: #f8fafc; border-left: 3px solid {badge_style['text']}; padding: 12px 16px; border-radius: 0 6px 6px 0; margin-bottom: 16px;">
                  <p style="margin: 0 0 2px 0; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: {badge_style['text']};">Recommended Action</p>
                  <p style="margin: 0; line-height: 1.4; color: #1e293b; font-weight: 500;">{safe_guidance}</p>
                </div>
              </div>

              <div style="border-top: 1px solid #f1f5f9; padding-top: 14px; font-family: monospace; font-size: 12px;">
                <a href="{safe_source_url}" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: none; font-weight: 600; margin-right: 16px;">Read source &rarr;</a>
                <a href="{card_app_url}" target="_blank" rel="noopener noreferrer" style="color: #64748b; text-decoration: none; font-weight: 500;">Open in Becon</a>
              </div>
            </td>
          </tr>
        </table>
        """
        cards_html.append(card_block)

    all_cards_str = "".join(cards_html)

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Becon Daily Intelligence Gazette - {safe_today}</title>
  <style>
    body, table, td, p, a, li {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
    body {{ margin: 0; padding: 0; background-color: #f8fafc; width: 100% !important; }}
    @media only screen and (max-width: 600px) {{
      .wrapper {{ width: 100% !important; padding: 12px !important; }}
      .header-title {{ font-size: 24px !important; }}
    }}
    @media (prefers-color-scheme: dark) {{
      .email-body {{ background-color: #0b0f19 !important; }}
      .content-cell {{ background-color: #0b0f19 !important; color: #f1f5f9 !important; }}
    }}
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; background-color: #f8fafc;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <!-- Container table -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="wrapper" style="max-width: 640px; margin: 0 auto;">
          <!-- Header Bar -->
          <tr>
            <td style="background-color: #020617; border-radius: 8px 8px 0 0; padding: 24px; text-align: center; border-bottom: 3px solid #d97706;">
              <h1 class="header-title" style="margin: 0; font-family: Georgia, Cambria, 'Times New Roman', Times, serif; font-size: 28px; font-weight: 900; letter-spacing: 0.15em; color: #ffffff; text-transform: uppercase;">
                B E C O N
              </h1>
              <div style="font-family: monospace; font-size: 11px; letter-spacing: 0.15em; color: #94a3b8; text-transform: uppercase; margin-top: 4px;">
                THE DAILY INTELLIGENCE GAZETTE
              </div>
              <div style="border-top: 1px solid #1e293b; margin-top: 14px; padding-top: 10px; font-family: monospace; font-size: 11px; color: #f59e0b; letter-spacing: 0.05em; text-transform: uppercase;">
                {safe_today} &bull; {total_cards} updates &bull; ~{reading_time_minutes} min read
              </div>
            </td>
          </tr>

          <!-- Subheading Greeting -->
          <tr>
            <td style="background-color: #ffffff; padding: 20px 24px 10px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #475569; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
              Good morning, <strong>{safe_user_name}</strong>. Here is your personalized technical briefing curated for your work as a <strong>{safe_user_role}</strong>.
            </td>
          </tr>

          <!-- Cards Stack -->
          <tr>
            <td style="background-color: #ffffff; padding: 12px 24px 24px 24px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
              {all_cards_str}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 24px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 10px 0;">
                You are receiving this digest because your account preferences are set to receive the daily intelligence briefing.
              </p>
              <p style="margin: 0; font-family: monospace; font-size: 11px;">
                <a href="{safe_pref_url}" style="color: #0284c7; text-decoration: underline; margin-right: 12px;">Manage Preferences</a>
                <span style="color: #cbd5e1;">|</span>
                <a href="{safe_unsub_url}" style="color: #64748b; text-decoration: underline; margin-left: 12px;">Unsubscribe</a>
              </p>
              <p style="margin: 12px 0 0 0; font-size: 11px; color: #94a3b8;">
                &copy; 2026 Becon. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return full_html


def render_digest_text(
    user_name: str,
    user_role: str,
    cards: List[BriefingCard],
    today_str: str,
    reading_time_minutes: int,
    unsubscribe_url: str,
    preferences_url: str,
    base_url: str,
) -> str:
    """Render clean, readable ASCII broadsheet plain-text fallback for email."""
    name = user_name or "Reader"
    role = user_role or "Professional"
    total_cards = len(cards)

    divider = "=" * 80
    subdivider = "-" * 80

    lines = [
        divider,
        "                                B E C O N",
        "                     THE DAILY INTELLIGENCE GAZETTE",
        divider,
        f"{today_str.upper()} | {total_cards} UPDATES | ~{reading_time_minutes} MIN READ",
        f"Curated for {name} ({role})",
        divider,
        "",
    ]

    for idx, card in enumerate(cards, 1):
        is_lead = getattr(card, "is_lead", False) or idx == 1
        prefix = "[LEAD STORY] " if is_lead else f"[{idx}/{total_cards}] "
        act_type = (card.card_content.what_to_do_next.action_type or "apply").upper()

        lines.append(f"{prefix}{card.title}")
        lines.append(f"ACTION: {act_type} | MATCH: {card.match_reason or 'Stack Update'}")
        lines.append(subdivider)

        # What happened
        lines.append("WHAT HAPPENED:")
        bullets = card.card_content.what_happened
        if isinstance(bullets, list):
            for b in bullets:
                lines.append(f"  * {b}")
        else:
            lines.append(f"  * {bullets}")
        lines.append("")

        # Why it matters
        lines.append("WHY IT MATTERS:")
        lines.append(f"  {card.card_content.why_it_matters}")
        lines.append("")

        # How it affects you
        lines.append(f"HOW IT AFFECTS YOU ({role}):")
        lines.append(f"  {card.card_content.how_it_affects_you}")
        lines.append("")

        # What to do next
        lines.append(f"RECOMMENDED ACTION ({act_type}):")
        lines.append(f"  {card.card_content.what_to_do_next.guidance}")
        lines.append("")

        # Links
        lines.append(f"  Source:  {card.source_url}")
        lines.append(f"  Becon:   {base_url.rstrip('/')}/?card={card.id or ''}")
        lines.append("")
        lines.append(subdivider)
        lines.append("")

    lines.extend([
        "",
        divider,
        "WHY YOU RECEIVED THIS:",
        "You are subscribed to the Becon daily intelligence briefing.",
        "",
        f"Manage Preferences: {preferences_url}",
        f"Unsubscribe:        {unsubscribe_url}",
        divider,
    ])

    return "\n".join(lines)
