import html
import logging
import re
import socket
import time
import urllib.parse
from datetime import UTC, datetime
from typing import Dict, List, Tuple

import feedparser
from fastapi import BackgroundTasks
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    Card,
    Event,
    EventTopic,
    FocusTopic,
)
from app.schemas import ActionGuidance, BriefingCard, BriefingCardContent

logger = logging.getLogger(__name__)

# Set socket timeout to prevent hanging feeds from stalling generation
socket.setdefaulttimeout(7.0)

# Comprehensive mapping from popular topics and industries to live RSS feeds
TOPIC_FEED_MAP: Dict[str, Tuple[str, str]] = {
    # Beauty, Cosmetics & Fashion
    "beauty": ("Beauty & Cosmetics", "https://news.google.com/rss/search?q=Beauty+Cosmetics+Trends&hl=en-US&gl=US&ceid=US:en"),
    "fashion": ("Fashion & Style", "https://news.google.com/rss/search?q=Fashion+Apparel+Trends&hl=en-US&gl=US&ceid=US:en"),
    "cosmetics": ("Cosmetics & Skincare", "https://news.google.com/rss/search?q=Cosmetics+Skincare+Industry&hl=en-US&gl=US&ceid=US:en"),
    "apparel": ("Fashion & Apparel", "https://news.google.com/rss/search?q=Apparel+Fashion+Retail&hl=en-US&gl=US&ceid=US:en"),
    "hair": ("Hair Care & Styling", "https://news.google.com/rss/search?q=Hair+Care+Styling+Trends&hl=en-US&gl=US&ceid=US:en"),
    "skincare": ("Skincare & Wellness", "https://news.google.com/rss/search?q=Skincare+Dermatology+Trends&hl=en-US&gl=US&ceid=US:en"),

    # Accounting, Finance & Tax
    "tax regulations & gst compliance": ("Tax & Compliance", "https://news.google.com/rss/search?q=Tax+Compliance+GST+Regulations&hl=en-US&gl=US&ceid=US:en"),
    "tax": ("Tax & Regulations", "https://news.google.com/rss/search?q=Tax+Regulations+Accounting&hl=en-US&gl=US&ceid=US:en"),
    "gst": ("GST & Tax", "https://news.google.com/rss/search?q=GST+Tax+Compliance&hl=en-US&gl=US&ceid=US:en"),
    "corporate accounting & audit standards": ("Accounting & Audit", "https://news.google.com/rss/search?q=Corporate+Accounting+Audit+Standards&hl=en-US&gl=US&ceid=US:en"),
    "accounting": ("Accounting", "https://news.google.com/rss/search?q=Corporate+Accounting+Standards&hl=en-US&gl=US&ceid=US:en"),
    "audit": ("Audit & Compliance", "https://news.google.com/rss/search?q=Financial+Auditing+Compliance&hl=en-US&gl=US&ceid=US:en"),
    "financial forecasting & cash flow": ("Finance & Cash Flow", "https://news.google.com/rss/search?q=Financial+Forecasting+Cash+Flow+Business&hl=en-US&gl=US&ceid=US:en"),
    "finance": ("Finance", "https://news.google.com/rss/search?q=Corporate+Finance+Banking+Markets&hl=en-US&gl=US&ceid=US:en"),
    "banking, payments & fintech": ("Fintech & Payments", "https://news.google.com/rss/search?q=Fintech+Digital+Banking+Payments&hl=en-US&gl=US&ceid=US:en"),
    "fintech": ("Fintech", "https://news.google.com/rss/search?q=Fintech+Payments+Innovation&hl=en-US&gl=US&ceid=US:en"),

    # Retail, Shop Owner & Inventory
    "retail & shop inventory management": ("Retail & Inventory", "https://news.google.com/rss/search?q=Retail+Store+Inventory+Management&hl=en-US&gl=US&ceid=US:en"),
    "retail": ("Retail Operations", "https://news.google.com/rss/search?q=Retail+Store+Commerce+POS&hl=en-US&gl=US&ceid=US:en"),
    "shop": ("Shop Management", "https://news.google.com/rss/search?q=Retail+Shop+Operations+Storefront&hl=en-US&gl=US&ceid=US:en"),
    "inventory": ("Inventory & Supply", "https://news.google.com/rss/search?q=Inventory+Management+Supply+Chain&hl=en-US&gl=US&ceid=US:en"),
    "customer retention & retail pos": ("Retail POS", "https://news.google.com/rss/search?q=Customer+Retention+Retail+POS&hl=en-US&gl=US&ceid=US:en"),
    "pos": ("POS & Retail", "https://news.google.com/rss/search?q=Point+of+Sale+Retail+Tech&hl=en-US&gl=US&ceid=US:en"),
    
    # Business, E-Commerce & Growth
    "small business growth & finance": ("Small Business", "https://news.google.com/rss/search?q=Small+Business+Growth+Finance&hl=en-US&gl=US&ceid=US:en"),
    "small business": ("Small Business", "https://news.google.com/rss/search?q=Small+Business+Strategy+Revenue&hl=en-US&gl=US&ceid=US:en"),
    "business": ("Business Intelligence", "https://news.google.com/rss/search?q=Business+Strategy+Markets+Commerce&hl=en-US&gl=US&ceid=US:en"),
    "e-commerce & digital sales": ("E-Commerce", "https://news.google.com/rss/search?q=Ecommerce+Digital+Sales+Trends&hl=en-US&gl=US&ceid=US:en"),
    "e-commerce": ("E-Commerce", "https://news.google.com/rss/search?q=Ecommerce+Online+Retail+Store&hl=en-US&gl=US&ceid=US:en"),
    "ecommerce": ("E-Commerce", "https://news.google.com/rss/search?q=Ecommerce+Online+Retail+Store&hl=en-US&gl=US&ceid=US:en"),
    "digital marketing & social selling": ("Marketing & Sales", "https://news.google.com/rss/search?q=Digital+Marketing+Social+Selling+Retail&hl=en-US&gl=US&ceid=US:en"),
    "supply chain & vendor management": ("Supply Chain", "https://news.google.com/rss/search?q=Supply+Chain+Logistics+Management&hl=en-US&gl=US&ceid=US:en"),
    "business law & regulatory filings": ("Business Law", "https://news.google.com/rss/search?q=Business+Law+Corporate+Regulations&hl=en-US&gl=US&ceid=US:en"),

    # Gemini & Generative AI
    "google gemini & generative ai": ("Generative AI", "https://dev.to/feed/tag/ai"),
    "generative ai": ("Generative AI", "https://dev.to/feed/tag/ai"),
    "ai": ("AI Systems", "https://dev.to/feed/tag/ai"),
    "gemini": ("Generative AI", "https://dev.to/feed/tag/ai"),
    "machine learning": ("Machine Learning", "https://dev.to/feed/tag/machinelearning"),
    
    # Cloud & Azure & AWS
    "cloud infrastructure & azure": ("Azure & Cloud", "https://dev.to/feed/tag/azure"),
    "azure": ("Azure", "https://dev.to/feed/tag/azure"),
    "cloud infrastructure": ("Cloud Infrastructure", "https://dev.to/feed/tag/cloud"),
    "cloud": ("Cloud Infrastructure", "https://dev.to/feed/tag/cloud"),
    "aws": ("AWS Cloud", "https://dev.to/feed/tag/aws"),
    
    # SQL & Databases & Vector DB
    "sql & vector databases": ("SQL & Vector DB", "https://dev.to/feed/tag/database"),
    "database": ("Databases", "https://dev.to/feed/tag/database"),
    "sql": ("SQL & Data", "https://dev.to/feed/tag/database"),
    "postgres": ("PostgreSQL", "https://dev.to/feed/tag/postgres"),
    "postgresql": ("PostgreSQL", "https://dev.to/feed/tag/postgres"),
    
    # Micro-Frontends & Module Federation
    "micro-frontends & module federation": ("Micro-Frontends", "https://dev.to/feed/tag/microfrontends"),
    "micro-frontends": ("Micro-Frontends", "https://dev.to/feed/tag/microfrontends"),
    "microfrontends": ("Micro-Frontends", "https://dev.to/feed/tag/microfrontends"),
    "module federation": ("Module Federation", "https://dev.to/feed/tag/microfrontends"),
    
    # Security & Zero-Trust
    "zero-trust cloud security": ("Cloud Security", "https://dev.to/feed/tag/security"),
    "zero-trust": ("Zero-Trust Security", "https://dev.to/feed/tag/security"),
    "security": ("Security", "https://dev.to/feed/tag/security"),
    "cybersecurity": ("Cybersecurity", "https://dev.to/feed/tag/security"),
    
    # .NET & C#
    ".net core & minimal apis": (".NET Core", "https://devblogs.microsoft.com/dotnet/feed/"),
    ".net core": (".NET Core", "https://devblogs.microsoft.com/dotnet/feed/"),
    ".net": (".NET Core", "https://devblogs.microsoft.com/dotnet/feed/"),
    "c# architecture & microservices": ("C# Systems", "https://dev.to/feed/tag/csharp"),
    "c#": ("C#", "https://dev.to/feed/tag/csharp"),
    
    # Angular & Signals
    "angular & signals architecture": ("Angular", "https://dev.to/feed/tag/angular"),
    "angular": ("Angular", "https://dev.to/feed/tag/angular"),
    
    # Next.js & Server Components
    "next.js & server components": ("Next.js", "https://dev.to/feed/tag/nextjs"),
    "next.js": ("Next.js", "https://dev.to/feed/tag/nextjs"),
    "nextjs": ("Next.js", "https://dev.to/feed/tag/nextjs"),
    "react": ("React", "https://dev.to/feed/tag/react"),
    
    # Python & FastAPI
    "python & fastml": ("Python & AI", "https://dev.to/feed/tag/python"),
    "python": ("Python", "https://dev.to/feed/tag/python"),
    "fastapi": ("FastAPI", "https://dev.to/feed/tag/fastapi"),
    
    # Docker, Kubernetes & DevSecOps
    "docker & kubernetes systems": ("Containers", "https://dev.to/feed/tag/docker"),
    "docker": ("Docker", "https://dev.to/feed/tag/docker"),
    "kubernetes": ("Kubernetes", "https://dev.to/feed/tag/kubernetes"),
    "k8s": ("Kubernetes", "https://dev.to/feed/tag/kubernetes"),
    
    # Rust & Systems Programming
    "rust systems & memory safety": ("Rust", "https://dev.to/feed/tag/rust"),
    "rust": ("Rust", "https://dev.to/feed/tag/rust"),
    
    # Kafka & Event-Driven Architecture
    "apache kafka & event streaming": ("Kafka & Events", "https://dev.to/feed/tag/kafka"),
    "kafka": ("Kafka", "https://dev.to/feed/tag/kafka"),
    "event-driven": ("Event Architecture", "https://dev.to/feed/tag/architecture"),
    
    # eBPF & Observability
    "ebpf & system observability": ("Observability", "https://dev.to/feed/tag/observability"),
    "observability": ("Observability", "https://dev.to/feed/tag/observability"),
    "ebpf": ("eBPF", "https://dev.to/feed/tag/linux"),
}

DEFAULT_FEED_SOURCES = {
    "Business & Markets": "https://feeds.bbci.co.uk/news/business/rss.xml",
    "Generative AI": "https://dev.to/feed/tag/ai",
    "Finance & Accounting": "https://news.google.com/rss/search?q=Corporate+Finance+Accounting&hl=en-US&gl=US&ceid=US:en",
    "Retail & Commerce": "https://news.google.com/rss/search?q=Retail+Store+Commerce+POS&hl=en-US&gl=US&ceid=US:en",
    "Technology": "https://feeds.bbci.co.uk/news/technology/rss.xml",
    "Cloud & Systems": "https://dev.to/feed/tag/cloud",
}


def clean_html_tags(text: str) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    clean_text = re.sub(r"<[^>]+>", " ", text)
    clean_text = re.sub(r"\s+", " ", clean_text).strip()
    return clean_text


def get_topic_default_image(tag_name: str, title: str) -> str:
    combined = (tag_name + " " + title).lower()
    if any(k in combined for k in ["beauty", "hair", "nail", "skin", "cosmetic", "makeup", "curler", "manicure", "salon", "spa"]):
        return "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["fashion", "apparel", "clothing", "hoodie", "dress", "style", "wear", "shoes", "outfit", "runway"]):
        return "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["tax", "accounting", "audit", "gst", "bookkeeping", "ledger", "invoice"]):
        return "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["finance", "banking", "fintech", "stock", "invest", "cash"]):
        return "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["retail", "shop", "store", "pos", "inventory", "merchandising", "ecommerce", "e-commerce"]):
        return "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["food", "restaurant", "cafe", "coffee", "dining", "chef", "bakery"]):
        return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["health", "medical", "clinic", "doctor", "wellness", "fitness"]):
        return "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["real estate", "property", "architecture", "housing"]):
        return "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["ai", "gemini", "artificial intelligence", "machine learning"]):
        return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["cloud", "azure", "aws", "devops", "kubernetes", "docker"]):
        return "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["security", "cyber", "privacy", "zero-trust"]):
        return "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=800&auto=format&fit=crop"
    if any(k in combined for k in ["software", "code", "programming", "react", "angular", "python", "rust", ".net", "c#"]):
        return "https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=800&auto=format&fit=crop"
    return "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=800&auto=format&fit=crop"


def resolve_feed_for_topic(topic: str) -> Tuple[str, str]:
    t_clean = topic.strip().lower()
    if t_clean in TOPIC_FEED_MAP:
        return TOPIC_FEED_MAP[t_clean]

    # Substring match
    for k, v in TOPIC_FEED_MAP.items():
        if k in t_clean or t_clean in k:
            return v

    encoded = urllib.parse.quote(topic.strip())
    display_name = topic.strip().title()
    return (display_name, f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en")


def parse_feed_entry(entry: dict, tag_name: str, fallback_url: str) -> Dict[str, str]:
    title = entry.get("title", "No Title")
    link = entry.get("link", fallback_url)
    content_raw = ""
    if entry.get("content") and isinstance(entry["content"], list) and len(entry["content"]) > 0:
        c0 = entry["content"][0]
        content_raw = c0.get("value", "") if isinstance(c0, dict) else str(c0)

    summary_raw = entry.get("summary", entry.get("description", ""))
    if not summary_raw or len(summary_raw) < 120:
        if content_raw:
            summary_raw = content_raw

    summary = clean_html_tags(summary_raw)
    if not summary:
        summary = f"Latest production updates regarding {tag_name}."

    image_url = None
    img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', summary_raw)
    if img_match:
        image_url = img_match.group(1)

    if not image_url and entry.get("content"):
        for c in entry.get("content", []):
            val = c.get("value", "") if isinstance(c, dict) else str(c)
            c_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', val)
            if c_match:
                image_url = c_match.group(1)
                break

    if not image_url and entry.get("media_content") and isinstance(entry["media_content"], list) and len(entry["media_content"]) > 0:
        image_url = entry["media_content"][0].get("url")

    if not image_url and entry.get("media_thumbnail") and isinstance(entry["media_thumbnail"], list) and len(entry["media_thumbnail"]) > 0:
        image_url = entry["media_thumbnail"][0].get("url")

    if not image_url and entry.get("enclosures") and isinstance(entry["enclosures"], list) and len(entry["enclosures"]) > 0:
        image_url = entry["enclosures"][0].get("href")

    published_at = None
    if entry.get("published_parsed"):
        try:
            published_at = time.strftime("%b %d, %Y", entry["published_parsed"])
        except Exception:
            pass
    elif entry.get("updated_parsed"):
        try:
            published_at = time.strftime("%b %d, %Y", entry["updated_parsed"])
        except Exception:
            pass
    elif entry.get("published"):
        published_at = str(entry.get("published"))[:16].strip()
    elif entry.get("pubDate"):
        published_at = str(entry.get("pubDate"))[:16].strip()

    if not published_at:
        published_at = datetime.now().strftime("%b %d, %Y")

    is_real = False
    clean_image_url = None
    if image_url and isinstance(image_url, str):
        candidate = image_url.strip()
        if candidate.startswith("//"):
            candidate = "https:" + candidate
        if candidate.startswith("http://") or candidate.startswith("https://"):
            lower = candidate.lower()
            if not any(bad in lower for bad in ["1x1", "pixel", "spacer", "tracking", "feedburner", "favicon.ico", "transparent.gif"]):
                is_real = True
                clean_image_url = candidate

    return {
        "title": title,
        "link": link,
        "summary": summary,
        "content_raw": content_raw,
        "tag": tag_name,
        "image_url": clean_image_url,
        "is_real_image": is_real,
        "published_at": published_at,
    }


def fetch_topic_feed_items(topic: str, limit: int = 30) -> Tuple[str, List[Dict[str, str]]]:
    tag_name, url = resolve_feed_for_topic(topic)
    try:
        feed = feedparser.parse(url)
        items = []
        for entry in feed.entries[:limit]:
            item = parse_feed_entry(entry, tag_name, url)
            items.append(item)
        return tag_name, items
    except Exception as e:
        logger.error(f"Failed to fetch '{tag_name}' ({url}): {e}")
        return tag_name, []


def _db_card_to_briefing_card(
    db: Session,
    card: Card,
    rank: int,
    user_role: str = "Professional",
    allow_variant_generation: bool = False,
    user_key: str | None = None,
) -> BriefingCard:
    """Transform an ORM Card row and its shared variant into the public BriefingCard DTO.

    Never passes user free-text prompts into shared `CardVariant` cache rows.
    """
    from app.ingestion import get_or_create_card_variant

    how_it_affects_you, action_type, action_guidance = get_or_create_card_variant(
        db=db,
        card=card,
        user_role=user_role,
        allow_generate=allow_variant_generation,
        user_key=user_key,
    )

    if rank == 1:
        priority = "lead"
    elif rank in (2, 3, 4):
        priority = "brief"
    elif rank in (5, 6, 7):
        priority = "major"
    elif rank in (8, 9):
        priority = "spotlight"
    else:
        priority = "watch"

    # Stack tags
    stack_tags: List[str] = []
    if card.event and card.event.event_topics:
        stack_tags = [et.topic.name for et in card.event.event_topics if et.topic]
    if not stack_tags:
        stack_tags = [card.event.category.title()] if card.event else ["Technology"]
    stack_tags.append("AI Customized")

    # Image resolution
    image_url = None
    is_real_image = False
    if card.event and card.event.raw_items:
        for r in card.event.raw_items:
            img_m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', r.summary or "")
            if img_m:
                image_url = img_m.group(1)
                is_real_image = True
                break

    primary_tag = stack_tags[0] if stack_tags else "General"
    title_text = card.event.canonical_title if card.event else "Update"
    if not image_url:
        image_url = get_topic_default_image(primary_tag, title_text)
        is_real_image = False

    pub_at = (
        card.published_at.strftime("%b %d, %Y")
        if card.published_at
        else datetime.now().strftime("%b %d, %Y")
    )

    return BriefingCard(
        id=str(card.id),
        rank=rank,
        title=title_text,
        source_url=card.source_url,
        target_role=user_role,
        target_stack=stack_tags,
        priority=priority,
        image_url=image_url,
        is_real_image=is_real_image,
        published_at=pub_at,
        card_content=BriefingCardContent(
            what_happened=card.what_happened if isinstance(card.what_happened, list) else [str(card.what_happened)],
            why_it_matters=card.why_it_matters,
            how_it_affects_you=how_it_affects_you,
            what_to_do_next=ActionGuidance(
                action_type=action_type if action_type in ("learn", "apply", "avoid", "prepare") else "apply",
                guidance=action_guidance,
            ),
        ),
    )


def _trigger_background_ingest_safely(user_interests: str) -> None:
    """Background task runner that manages its own DB session."""
    with SessionLocal() as session:
        try:
            from app.ingestion import run_ingestion_pipeline
            run_ingestion_pipeline(db=session, user_interests=user_interests)
        except Exception as e:
            logger.error(f"Background ingestion task failed: {e}")


def get_live_briefings(
    force_refresh: bool = False,
    user_role: str = "Professional",
    user_interests: str = "",
    custom_prompt: str = "",
    page: int = 1,
    limit: int = 16,
    scope: str = "all",
    offset: int | None = None,
    db: Session | None = None,
    background_tasks: BackgroundTasks | None = None,
    allow_ingestion: bool = False,
    allow_variant_generation: bool = False,
    user_key: str | None = None,
) -> List[BriefingCard]:
    """Retrieve personalized Action Cards from the database.

    Features:
    - Zero in-memory cache: All cards, variants, and events persist in the database.
    - Unauthenticated / guest callers read persisted cards only (allow_ingestion=False,
      allow_variant_generation=False) and never trigger ingestion or Gemini calls.
    - Stale-while-revalidate: Triggers background refresh for authenticated non-guests
      when cards exceed TTL.
    - Scope slicing: 'top' (top 5), 'remaining' (5-17), or direct offset.
    """
    if db is None:
        with SessionLocal() as local_db:
            return get_live_briefings(
                force_refresh=force_refresh,
                user_role=user_role,
                user_interests=user_interests,
                custom_prompt=custom_prompt,
                page=page,
                limit=limit,
                scope=scope,
                offset=offset,
                db=local_db,
                background_tasks=background_tasks,
                allow_ingestion=allow_ingestion,
                allow_variant_generation=allow_variant_generation,
                user_key=user_key,
            )

    from app.ingestion import run_ingestion_pipeline

    total_published = db.query(func.count(Card.id)).filter(Card.status == "published").scalar() or 0

    # 1. Synchronous bootstrap on empty database or explicit force_refresh (authenticated non-guests only)
    if allow_ingestion and (total_published == 0 or force_refresh):
        logger.info(
            "Sync ingestion required (total_published=%d, force_refresh=%s)...",
            total_published,
            force_refresh,
        )
        run_ingestion_pipeline(db=db, user_interests=user_interests, user_key=user_key)
    elif allow_ingestion and total_published > 0:
        # 2. Stale-while-revalidate check (authenticated non-guests only)
        newest = (
            db.query(Card)
            .filter(Card.status == "published")
            .order_by(Card.created_at.desc())
            .first()
        )
        if newest and newest.created_at:
            created_tz = newest.created_at.replace(tzinfo=UTC) if newest.created_at.tzinfo is None else newest.created_at
            age = (datetime.now(UTC) - created_tz).total_seconds()
            if age > settings.FEED_CACHE_TTL_SECONDS:
                if background_tasks:
                    logger.info("Scheduling background re-ingestion (card age: %.1fs > TTL %ds)...", age, settings.FEED_CACHE_TTL_SECONDS)
                    background_tasks.add_task(_trigger_background_ingest_safely, user_interests)

    # 3. Build query filtered by user focus topics if provided
    base_query = (
        db.query(Card)
        .join(Event, Card.event_id == Event.id)
        .filter(Card.status == "published")
    )

    topics_list = [t.strip() for t in user_interests.split(",") if t.strip()]
    if topics_list:
        topic_clauses = []
        for t in topics_list:
            clean_t = t.lower()
            topic_clauses.append(Event.canonical_title.ilike(f"%{clean_t}%"))
            topic_clauses.append(Card.why_it_matters.ilike(f"%{clean_t}%"))
            topic_clauses.append(
                Event.event_topics.any(
                    EventTopic.topic.has(
                        or_(
                            func.lower(FocusTopic.name).contains(clean_t),
                            func.lower(FocusTopic.slug).contains(clean_t),
                        )
                    )
                )
            )
        matched_query = base_query.filter(or_(*topic_clauses))
        if matched_query.count() > 0:
            query = matched_query
        else:
            query = base_query
    else:
        query = base_query

    query = query.order_by(Event.published_at.desc(), Card.created_at.desc())

    # 4. Apply scope / pagination
    if scope == "top":
        target_cards = query.limit(5).all()
        start_rank = 1
    elif scope == "remaining":
        target_cards = query.offset(5).limit(limit if limit else 12).all()
        start_rank = 6
    elif offset is not None:
        target_cards = query.offset(offset).limit(limit).all()
        start_rank = offset + 1
    else:
        req_offset = (page - 1) * limit
        target_cards = query.offset(req_offset).limit(limit).all()
        start_rank = req_offset + 1

    results: List[BriefingCard] = []
    for idx, c in enumerate(target_cards):
        card_dto = _db_card_to_briefing_card(
            db=db,
            card=c,
            rank=start_rank + idx,
            user_role=user_role,
            allow_variant_generation=allow_variant_generation,
            user_key=user_key,
        )
        results.append(card_dto)

    return results

