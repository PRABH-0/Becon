import time
from datetime import datetime
import re
import html
import urllib.parse
import socket
from typing import List, Dict, Tuple
import feedparser
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.schemas import BriefingCard
from app.ai_service import generate_action_card

# Set socket timeout to prevent any hanging feeds from stalling generation
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
    
    # Angular
    "angular & web frameworks": ("Angular", "https://dev.to/feed/tag/angular"),
    "angular": ("Angular", "https://dev.to/feed/tag/angular"),
    
    # React & Next.js
    "react & next.js systems": ("React & Next.js", "https://dev.to/feed/tag/react"),
    "react": ("React", "https://dev.to/feed/tag/react"),
    "next.js": ("Next.js", "https://dev.to/feed/tag/nextjs"),
    
    # Python & FastAPI
    "python & fastapi setup": ("Python & FastAPI", "https://dev.to/feed/tag/python"),
    "python": ("Python", "https://dev.to/feed/tag/python"),
    "fastapi": ("FastAPI", "https://dev.to/feed/tag/fastapi"),
    
    # Rust
    "rust programming language": ("Rust", "https://dev.to/feed/tag/rust"),
    "rust": ("Rust", "https://dev.to/feed/tag/rust"),
    
    # Go
    "go & high-performance services": ("Go Systems", "https://dev.to/feed/tag/go"),
    "go": ("Go", "https://dev.to/feed/tag/go"),
    "golang": ("Go", "https://dev.to/feed/tag/go"),
    
    # Docker & Containers
    "docker & containerization": ("Docker", "https://dev.to/feed/tag/docker"),
    "docker": ("Docker", "https://dev.to/feed/tag/docker"),
    "containers": ("Containers", "https://dev.to/feed/tag/docker"),
    
    # Kubernetes & DevOps
    "kubernetes & devops pipelines": ("Kubernetes & DevOps", "https://dev.to/feed/tag/devops"),
    "kubernetes": ("Kubernetes", "https://dev.to/feed/tag/kubernetes"),
    "devops": ("DevOps", "https://dev.to/feed/tag/devops"),
    
    # TypeScript & Modern Tooling
    "typescript & modern tooling": ("TypeScript", "https://dev.to/feed/tag/typescript"),
    "typescript": ("TypeScript", "https://dev.to/feed/tag/typescript"),
    
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

# Multi-tenant cache dictionary: key -> {"data": [...], "timestamp": float}
_USER_CACHES: Dict[str, dict] = {}
CACHE_TTL_SECONDS = 1800  # 30 minutes

def clean_html_tags(text: str) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    clean_text = re.sub(r'<[^>]+>', ' ', text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
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
    
    # Try partial substring match against known topics
    for k, v in TOPIC_FEED_MAP.items():
        if k in t_clean or t_clean in k:
            return v
            
    # Universal Google News RSS feed for ANY custom topic or industry!
    encoded = urllib.parse.quote(topic.strip())
    display_name = topic.strip().title()
    return (display_name, f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en")

def parse_feed_entry(entry: dict, tag_name: str, fallback_url: str) -> Dict[str, str]:
    title = entry.get("title", "No Title")
    link = entry.get("link", fallback_url)
    summary_raw = entry.get("summary", entry.get("description", ""))
    summary = clean_html_tags(summary_raw)
    if not summary:
        summary = f"Latest production updates regarding {tag_name}."

    image_url = None
    # 1. Check summary HTML for <img>
    img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', summary_raw)
    if img_match:
        image_url = img_match.group(1)

    # 2. Check content blocks for <img>
    if not image_url and entry.get("content"):
        for c in entry.get("content", []):
            val = c.get("value", "") if isinstance(c, dict) else str(c)
            c_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', val)
            if c_match:
                image_url = c_match.group(1)
                break

    # 3. Check media_content
    if not image_url and entry.get("media_content") and isinstance(entry["media_content"], list) and len(entry["media_content"]) > 0:
        image_url = entry["media_content"][0].get("url")

    # 4. Check media_thumbnail
    if not image_url and entry.get("media_thumbnail") and isinstance(entry["media_thumbnail"], list) and len(entry["media_thumbnail"]) > 0:
        image_url = entry["media_thumbnail"][0].get("url")

    # 5. Check enclosures and links
    if not image_url and entry.get("enclosures") and isinstance(entry["enclosures"], list) and len(entry["enclosures"]) > 0:
        image_url = entry["enclosures"][0].get("href")
    if not image_url and entry.get("links") and isinstance(entry["links"], list):
        for l in entry.get("links"):
            if isinstance(l, dict) and ("image" in l.get("type", "") or l.get("rel") == "enclosure"):
                image_url = l.get("href")
                break

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

    is_real = bool(image_url and image_url.strip())

    return {
        "title": title,
        "link": link,
        "summary": summary,
        "tag": tag_name,
        "image_url": image_url if is_real else None,
        "is_real_image": is_real,
        "published_at": published_at
    }

def fetch_topic_feed_items(topic: str, limit: int = 30) -> Tuple[str, List[Dict[str, str]]]:
    tag_name, url = resolve_feed_for_topic(topic)
    print(f"[Topic Feed Fetcher] Querying '{url}' for subject '{topic}'...")
    try:
        feed = feedparser.parse(url)
        items = []
        for entry in feed.entries[:limit]:
            item = parse_feed_entry(entry, tag_name, url)
            items.append(item)
        return tag_name, items
    except Exception as e:
        print(f"[Topic Ingestion Error] Failed to fetch '{tag_name}' ({url}): {e}")
        return tag_name, []

def fetch_raw_feed_items(user_interests: str = "", limit_per_source: int = 15) -> List[Dict[str, str]]:
    """
    Fetches raw articles dynamically matching the user's selected interests.
    If user_interests contains topics, pulls articles from those specific topic feeds first.
    Interleaves articles evenly so all selected topics get fair representation.
    """
    topics = [t.strip() for t in user_interests.split(",") if t.strip()]
    feed_sources_to_use: List[Tuple[str, str]] = []
    
    if topics:
        seen_urls = set()
        for t in topics:
            tag_name, url = resolve_feed_for_topic(t)
            if url not in seen_urls:
                seen_urls.add(url)
                feed_sources_to_use.append((tag_name, url))
        actual_limit = max(15, 30 // len(feed_sources_to_use))
    else:
        feed_sources_to_use = list(DEFAULT_FEED_SOURCES.items())
        actual_limit = max(6, limit_per_source)

    print(f"[Feed Fetcher] Querying {len(feed_sources_to_use)} live feeds (limit {actual_limit}/feed) for interests: {user_interests[:60]}...")

    def fetch_single_feed(tag_name: str, url: str) -> List[Dict[str, str]]:
        try:
            feed = feedparser.parse(url)
            items = []
            for entry in feed.entries[:actual_limit]:
                item = parse_feed_entry(entry, tag_name, url)
                items.append(item)
            return items
        except Exception as e:
            print(f"[Feed Ingestion Error] Failed to fetch '{tag_name}' ({url}): {e}")
            return []

    # Parallelize feed fetching
    topic_results: List[List[Dict[str, str]]] = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        future_map = {executor.submit(fetch_single_feed, tag, url): tag for tag, url in feed_sources_to_use}
        for future in future_map:
            feed_items = future.result()
            if feed_items:
                topic_results.append(feed_items)

    # Interleave items across feeds so topics are evenly distributed
    articles: List[Dict[str, str]] = []
    if topic_results:
        max_len = max(len(it) for it in topic_results)
        for i in range(max_len):
            for it in topic_results:
                if i < len(it):
                    articles.append(it[i])

    print(f"[Feed Fetcher] Successfully gathered {len(articles)} raw articles matching user topics.")
    return articles

def worker_generate_card(index: int, item: Dict[str, str], role: str, interests: str, prompt: str) -> dict:
    if index == 0:
        priority = "lead"
    elif index in [1, 2, 3, 4]:
        priority = "brief"  # Top 4 quick wire stories
    elif index in [5, 6, 7]:
        priority = "major"
    elif index in [8, 9]:
        priority = "spotlight"
    elif index in [10, 11]:
        priority = "watch"
    else:
        priority = "brief"

    card_content = generate_action_card(
        article_title=item["title"],
        source_url=item["link"],
        raw_summary=item["summary"],
        tech_tag=item["tag"],
        user_role=role,
        user_interests=interests,
        custom_prompt=prompt
    )

    card = BriefingCard(
        id=f"live-{index+1}",
        rank=index + 1,
        title=item["title"],
        source_url=item["link"],
        image_url=item.get("image_url"),
        is_real_image=bool(item.get("is_real_image", False)),
        published_at=item.get("published_at") or datetime.now().strftime("%b %d, %Y"),
        target_role=role,
        target_stack=[item["tag"], "AI Customized"],
        priority=priority,
        card_content=card_content
    )
    return card.model_dump()

def get_live_briefings(
    force_refresh: bool = False,
    user_role: str = "Professional",
    user_interests: str = "",
    custom_prompt: str = "",
    page: int = 1,
    limit: int = 16,
    scope: str = "all",
    offset: int = None
) -> List[dict]:
    current_time = time.time()
    cache_key = f"v3|{user_role.strip().lower()}|{user_interests.strip().lower()}|{custom_prompt.strip().lower()}"
    cached = _USER_CACHES.get(cache_key)

    # 1. SCOPE = "TOP" (FAST RENDER TOP 5 CARDS IN ~1.8 SECONDS)
    if scope == "top":
        if not force_refresh and cached and (current_time - cached["timestamp"] < CACHE_TTL_SECONDS):
            cards = cached.get("data", [])
            has_fallback = any(
                "Real-time signal reported for" in str(c.get("card_content", {}).get("what_happened", []))
                for c in cards
            )
            if not has_fallback and len(cards) >= 5:
                print(f"[Cache Hit - Top 5] Serving top 5 AI cards for: {cache_key[:50]}...")
                return cards[:5]

        print(f"[Fast Render - Top 5] Ingesting feeds & generating top 5 cards for: {cache_key[:50]}...")
        raw_articles = fetch_raw_feed_items(user_interests=user_interests, limit_per_source=15)
        if not raw_articles:
            if cached and cached.get("data"):
                return cached["data"][:5]
            return []

        top_articles = raw_articles[:5]
        top_cards = []
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_map = {
                executor.submit(worker_generate_card, idx, item, user_role, user_interests, custom_prompt): idx
                for idx, item in enumerate(top_articles)
            }
            results = []
            for future in as_completed(future_map):
                idx = future_map[future]
                try:
                    data = future.result()
                    results.append((idx, data))
                except Exception as e:
                    print(f"[Top Worker Exception] Item {idx} failed: {e}")
            results.sort(key=lambda x: x[0])
            top_cards = [res[1] for res in results]

        # Cache top 5 and the raw articles for subsequent requests
        _USER_CACHES[cache_key] = {
            "data": top_cards,
            "raw_articles": raw_articles,
            "timestamp": current_time,
            "top_only": True
        }
        print(f"[Fast Render Complete] Generated {len(top_cards)} top cards in parallel.")
        return top_cards

    # 2. SCOPE = "REMAINING" (LAZY LOAD REMAINING CARDS FOR BENTO DECK)
    elif scope == "remaining":
        if not force_refresh and cached and (current_time - cached["timestamp"] < CACHE_TTL_SECONDS):
            if not cached.get("top_only", False) and len(cached.get("data", [])) > 5:
                print(f"[Cache Hit - Remaining] Serving {len(cached['data'][5:17])} remaining cards.")
                return cached["data"][5:17]

        print(f"[Lazy Load - Remaining] Generating remaining cards for: {cache_key[:50]}...")
        raw_articles = cached.get("raw_articles") if cached else None
        if not raw_articles or len(raw_articles) < 10:
            raw_articles = fetch_raw_feed_items(user_interests=user_interests, limit_per_source=15)

        if not raw_articles:
            return []

        target_articles = raw_articles[5:17]
        remaining_cards = []
        with ThreadPoolExecutor(max_workers=6) as executor:
            future_map = {
                executor.submit(worker_generate_card, idx + 5, item, user_role, user_interests, custom_prompt): idx + 5
                for idx, item in enumerate(target_articles)
            }
            results = []
            for future in as_completed(future_map):
                idx = future_map[future]
                try:
                    data = future.result()
                    results.append((idx, data))
                except Exception as e:
                    print(f"[Remaining Worker Exception] Item {idx} failed: {e}")
            results.sort(key=lambda x: x[0])
            remaining_cards = [res[1] for res in results]

        existing_top = cached.get("data", [])[:5] if cached else []
        full_cards = existing_top + remaining_cards
        _USER_CACHES[cache_key] = {
            "data": full_cards,
            "raw_articles": raw_articles,
            "timestamp": current_time,
            "top_only": False
        }
        print(f"[Lazy Load Complete] Generated & cached {len(remaining_cards)} remaining cards for Bento deck.")
        return remaining_cards

    # 3. DIRECT OFFSET / INFINITE SCROLL (GIVES EXACTLY UNSEEN CARDS MATCHING TOPICS)
    elif offset is not None or (page and page > 1):
        req_offset = offset if offset is not None else ((page - 1) * limit)
        print(f"[Infinite Scroll] Requesting offset {req_offset}, limit {limit} for {cache_key[:50]}...")
        
        cached_cards = cached.get("data", []) if cached else []
        if len(cached_cards) >= req_offset + limit:
            print(f"[Cache Hit - Infinite Scroll] Serving existing cards {req_offset}..{req_offset + limit}")
            return cached_cards[req_offset : req_offset + limit]

        raw_articles = cached.get("raw_articles") if cached else None
        if not raw_articles or len(raw_articles) < req_offset + limit:
            fresh = fetch_raw_feed_items(user_interests=user_interests, limit_per_source=20)
            if not raw_articles:
                raw_articles = fresh
            else:
                seen_titles = {a["title"].lower().strip() for a in raw_articles}
                for a in fresh:
                    if a["title"].lower().strip() not in seen_titles:
                        raw_articles.append(a)
                        seen_titles.add(a["title"].lower().strip())

        target_articles = raw_articles[req_offset : req_offset + limit]
        if not target_articles:
            # If still short, slice from beginning or cycle
            target_articles = raw_articles[:limit]

        new_cards = []
        with ThreadPoolExecutor(max_workers=6) as executor:
            future_map = {
                executor.submit(worker_generate_card, req_offset + idx, item, user_role, user_interests, custom_prompt): req_offset + idx
                for idx, item in enumerate(target_articles)
            }
            results = []
            for future in as_completed(future_map):
                idx = future_map[future]
                try:
                    data = future.result()
                    results.append((idx, data))
                except Exception as e:
                    print(f"[Infinite Worker Exception] Item {idx} failed: {e}")
            results.sort(key=lambda x: x[0])
            new_cards = [res[1] for res in results]

        if cached:
            cached["data"] = cached_cards + new_cards
            cached["raw_articles"] = raw_articles
        else:
            _USER_CACHES[cache_key] = {
                "data": new_cards,
                "raw_articles": raw_articles,
                "timestamp": current_time,
                "top_only": False
            }

        return new_cards

    # 4. SCOPE = "ALL" (DEFAULT / FULL FETCH)
    else:
        if not force_refresh and cached and (current_time - cached["timestamp"] < CACHE_TTL_SECONDS):
            cards = cached.get("data", [])
            has_fallback = any(
                "Real-time signal reported for" in str(c.get("card_content", {}).get("what_happened", []))
                for c in cards
            )
            if not has_fallback and not cached.get("top_only", False):
                all_data = cached["data"]
                start = (page - 1) * limit
                paged_cards = all_data[start : start + limit]
                print(f"[Cache Hit] Serving {len(paged_cards)} customized AI cards (page {page})...")
                return paged_cards

        raw_articles = cached.get("raw_articles") if cached else None
        if not raw_articles:
            raw_articles = fetch_raw_feed_items(user_interests=user_interests, limit_per_source=15)
        if not raw_articles:
            if cached and cached.get("data"):
                return cached["data"]
            return []

        target_articles = raw_articles[:17]
        cards_list = []
        with ThreadPoolExecutor(max_workers=6) as executor:
            future_map = {
                executor.submit(worker_generate_card, idx, item, user_role, user_interests, custom_prompt): idx
                for idx, item in enumerate(target_articles)
            }
            results = []
            for future in as_completed(future_map):
                idx = future_map[future]
                try:
                    data = future.result()
                    results.append((idx, data))
                except Exception as e:
                    print(f"[Worker Exception] Item {idx} failed: {e}")
            results.sort(key=lambda x: x[0])
            cards_list = [res[1] for res in results]

        if cards_list:
            _USER_CACHES[cache_key] = {
                "data": cards_list,
                "raw_articles": raw_articles,
                "timestamp": current_time,
                "top_only": False
            }
            print(f"[Pipeline Complete] Cached {len(cards_list)} personalized AI cards for user topics.")

        start = (page - 1) * limit
        return cards_list[start : start + limit]

def search_topic_briefings(
    topic: str,
    user_role: str = "Professional",
    limit: int = 6,
    offset: int = 0,
    page: int = 1
) -> List[dict]:
    """
    Synthesizes real-time intelligence cards tailored to any specific favorite subject or topic using Gemini AI.
    Supports continuous pagination through offset and page numbers.
    """
    clean_topic = topic.strip()
    if not clean_topic:
        return []

    current_time = time.time()
    cache_key = f"search|{clean_topic.lower()}|{user_role.strip().lower()}"
    cached = _USER_CACHES.get(cache_key)

    # 1. If we already generated and cached cards covering this offset, return them immediately
    if cached and (current_time - cached["timestamp"] < CACHE_TTL_SECONDS):
        cached_cards = cached.get("data", [])
        if len(cached_cards) >= offset + limit:
            print(f"[Search Cache Hit] Serving cached AI cards for '{clean_topic}' (slice {offset}..{offset+limit})")
            return cached_cards[offset : offset + limit]

    # 2. Retrieve or fetch raw articles
    raw_articles = []
    if cached and cached.get("raw_articles"):
        raw_articles = cached["raw_articles"]
    else:
        print(f"[Search Topic AI] Ingesting & synthesizing news for favorite subject: '{clean_topic}'...")
        tag_name, raw_articles = fetch_topic_feed_items(clean_topic, limit=30)
        if not raw_articles:
            slug = re.sub(r'[^a-z0-9]', '', clean_topic.lower())
            if slug and slug != clean_topic.lower():
                tag_name, raw_articles = fetch_topic_feed_items(slug, limit=30)

        if not raw_articles:
            general = fetch_raw_feed_items(user_interests="", limit_per_source=6)
            filtered = [
                a for a in general
                if clean_topic.lower() in a["title"].lower() or clean_topic.lower() in a["summary"].lower()
            ]
            raw_articles = filtered if filtered else general

    # 3. Determine target slice for synthesis
    if len(raw_articles) > offset:
        target = raw_articles[offset : offset + limit]
    else:
        # Wrap around raw articles if more editions are pulled than feed length
        if raw_articles:
            wrap_offset = offset % len(raw_articles)
            target = (raw_articles + raw_articles)[wrap_offset : wrap_offset + limit]
        else:
            target = []

    results = []
    if target:
        with ThreadPoolExecutor(max_workers=min(6, len(target))) as executor:
            future_map = {
                executor.submit(
                    worker_generate_card,
                    offset + idx,
                    item,
                    user_role,
                    clean_topic,
                    f"Highlight specific practical applications, operational impact, and actionable takeaways of {clean_topic} for a {user_role} (Edition {page})."
                ): idx
                for idx, item in enumerate(target)
            }
            res_list = []
            for future in as_completed(future_map):
                idx = future_map[future]
                try:
                    card_data = future.result()
                    clean_slug = re.sub(r'[^a-z0-9]', '', clean_topic.lower()) or "topic"
                    card_data["id"] = f"search-{clean_slug}-ed{page}-{offset + idx}"
                    res_list.append((idx, card_data))
                except Exception as e:
                    print(f"[Search Worker Error] Item {idx}: {e}")
            res_list.sort(key=lambda x: x[0])
            results = [r[1] for r in res_list]

    if results:
        existing_cards = cached.get("data", []) if cached else []
        all_cards = existing_cards + results
        _USER_CACHES[cache_key] = {
            "data": all_cards,
            "raw_articles": raw_articles,
            "timestamp": current_time,
            "top_only": False
        }
        print(f"[Search Topic Complete] Generated {len(results)} new cards for '{clean_topic}' (total: {len(all_cards)}).")

    return results
