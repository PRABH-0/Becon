import time
from datetime import datetime
import re
import html
from typing import List, Dict, Tuple
import feedparser
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.schemas import BriefingCard
from app.ai_service import generate_action_card

# Comprehensive mapping from popular topics and developer domains to live RSS feeds
TOPIC_FEED_MAP: Dict[str, Tuple[str, str]] = {
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
    "Architecture": "https://dev.to/feed/tag/architecture",
    "Cloud & Azure": "https://dev.to/feed/tag/azure",
    "Generative AI": "https://dev.to/feed/tag/ai",
    "Security": "https://dev.to/feed/tag/security",
    "Databases": "https://dev.to/feed/tag/database",
    "Micro-Frontends": "https://dev.to/feed/tag/microfrontends",
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

def resolve_feed_for_topic(topic: str) -> Tuple[str, str]:
    t_clean = topic.strip().lower()
    if t_clean in TOPIC_FEED_MAP:
        return TOPIC_FEED_MAP[t_clean]
    
    # Try partial substring match against known topics
    for k, v in TOPIC_FEED_MAP.items():
        if k in t_clean or t_clean in k:
            return v
            
    # Fallback to dev.to dynamic tag endpoint
    slug = re.sub(r'[^a-z0-9]', '', t_clean)
    if not slug:
        slug = "programming"
    display_name = topic.strip().title()
    return (display_name, f"https://dev.to/feed/tag/{slug}")

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

    return {
        "title": title,
        "link": link,
        "summary": summary,
        "tag": tag_name,
        "image_url": image_url,
        "published_at": published_at
    }

def fetch_topic_feed_items(topic: str, limit: int = 8) -> Tuple[str, List[Dict[str, str]]]:
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

def fetch_raw_feed_items(user_interests: str = "", limit_per_source: int = 4) -> List[Dict[str, str]]:
    """
    Fetches raw articles dynamically matching the user's selected interests.
    If user_interests contains topics, pulls articles from those specific topic feeds first.
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
        
        # If user picked fewer than 3 topics, backfill with general engineering feeds
        if len(feed_sources_to_use) < 3:
            for fallback_tag, fallback_url in DEFAULT_FEED_SOURCES.items():
                if fallback_url not in seen_urls:
                    seen_urls.add(fallback_url)
                    feed_sources_to_use.append((fallback_tag, fallback_url))
                if len(feed_sources_to_use) >= 4:
                    break
    else:
        feed_sources_to_use = list(DEFAULT_FEED_SOURCES.items())

    print(f"[Feed Fetcher] Querying {len(feed_sources_to_use)} live feeds for interests: {user_interests[:60]}...")

    def fetch_single_feed(tag_name: str, url: str) -> List[Dict[str, str]]:
        try:
            feed = feedparser.parse(url)
            items = []
            for entry in feed.entries[:limit_per_source]:
                item = parse_feed_entry(entry, tag_name, url)
                items.append(item)
            return items
        except Exception as e:
            print(f"[Feed Ingestion Error] Failed to fetch '{tag_name}' ({url}): {e}")
            return []

    # Parallelize feed fetching
    articles: List[Dict[str, str]] = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        future_map = {executor.submit(fetch_single_feed, tag, url): tag for tag, url in feed_sources_to_use}
        for future in future_map:
            feed_items = future.result()
            articles.extend(feed_items)

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
        published_at=item.get("published_at") or datetime.now().strftime("%b %d, %Y"),
        target_role=role,
        target_stack=[item["tag"], "AI Customized"],
        priority=priority,
        card_content=card_content
    )
    return card.model_dump()

def get_live_briefings(
    force_refresh: bool = False,
    user_role: str = "Senior Software Engineer",
    user_interests: str = "",
    custom_prompt: str = "",
    page: int = 1,
    limit: int = 16,
    scope: str = "all"
) -> List[dict]:
    current_time = time.time()
    cache_key = f"{user_role.strip().lower()}|{user_interests.strip().lower()}|{custom_prompt.strip().lower()}"
    cached = _USER_CACHES.get(cache_key)

    # 1. SCOPE = "TOP" (FAST RENDER TOP 5 CARDS IN ~1.8 SECONDS)
    if scope == "top":
        if not force_refresh and cached and (current_time - cached["timestamp"] < CACHE_TTL_SECONDS):
            cards = cached.get("data", [])
            if len(cards) >= 5:
                print(f"[Cache Hit - Top 5] Serving top 5 AI cards for: {cache_key[:50]}...")
                return cards[:5]

        print(f"[Fast Render - Top 5] Ingesting feeds & generating top 5 cards for: {cache_key[:50]}...")
        raw_articles = fetch_raw_feed_items(user_interests=user_interests, limit_per_source=4)
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

        # Cache top 5 and the raw articles for the subsequent lazy-loaded "remaining" request
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
            # If already generated full cards, return remaining
            if not cached.get("top_only", False) and len(cached.get("data", [])) > 5:
                print(f"[Cache Hit - Remaining] Serving {len(cached['data'][5:])} remaining cards.")
                return cached["data"][5:]

        print(f"[Lazy Load - Remaining] Generating remaining cards for: {cache_key[:50]}...")
        raw_articles = cached.get("raw_articles") if cached else None
        if not raw_articles:
            raw_articles = fetch_raw_feed_items(user_interests=user_interests, limit_per_source=4)

        if not raw_articles or len(raw_articles) <= 5:
            return []

        target_articles = raw_articles[5:20]
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
        print(f"[Lazy Load Complete] Generated & cached {len(remaining_cards)} remaining cards.")
        return remaining_cards

    # 3. SCOPE = "ALL" (DEFAULT / FULL FETCH)
    else:
        if not force_refresh and cached and (current_time - cached["timestamp"] < CACHE_TTL_SECONDS):
            if not cached.get("top_only", False):
                all_data = cached["data"]
                start = (page - 1) * limit
                paged_cards = all_data[start : start + limit]
                print(f"[Cache Hit] Serving {len(paged_cards)} customized AI cards (page {page})...")
                return paged_cards

        raw_articles = cached.get("raw_articles") if cached else None
        if not raw_articles:
            raw_articles = fetch_raw_feed_items(user_interests=user_interests, limit_per_source=4)
        if not raw_articles:
            if cached and cached.get("data"):
                return cached["data"]
            return []

        target_articles = raw_articles[:20]
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
    user_role: str = "Senior Software Engineer",
    limit: int = 6
) -> List[dict]:
    """
    Synthesizes real-time developer news cards tailored to any specific favorite subject or topic using Gemini AI.
    """
    clean_topic = topic.strip()
    if not clean_topic:
        return []

    current_time = time.time()
    cache_key = f"search|{clean_topic.lower()}|{user_role.strip().lower()}"
    cached = _USER_CACHES.get(cache_key)
    if cached and (current_time - cached["timestamp"] < CACHE_TTL_SECONDS):
        print(f"[Search Cache Hit] Serving cached AI cards for topic: {clean_topic}")
        return cached["data"][:limit]

    print(f"[Search Topic AI] Ingesting & synthesizing news for favorite subject: '{clean_topic}'...")
    tag_name, raw_articles = fetch_topic_feed_items(clean_topic, limit=limit)
    if not raw_articles:
        slug = re.sub(r'[^a-z0-9]', '', clean_topic.lower())
        if slug and slug != clean_topic.lower():
            tag_name, raw_articles = fetch_topic_feed_items(slug, limit=limit)

    if not raw_articles:
        general = fetch_raw_feed_items(user_interests="", limit_per_source=4)
        filtered = [
            a for a in general
            if clean_topic.lower() in a["title"].lower() or clean_topic.lower() in a["summary"].lower()
        ]
        raw_articles = filtered if filtered else general[:limit]

    target = raw_articles[:limit]
    results = []
    with ThreadPoolExecutor(max_workers=min(6, len(target)) if len(target) > 0 else 1) as executor:
        future_map = {
            executor.submit(
                worker_generate_card,
                idx,
                item,
                user_role,
                clean_topic,
                f"Highlight specific practical applications and architectural impact of {clean_topic}."
            ): idx
            for idx, item in enumerate(target)
        }
        res_list = []
        for future in as_completed(future_map):
            idx = future_map[future]
            try:
                card_data = future.result()
                res_list.append((idx, card_data))
            except Exception as e:
                print(f"[Search Worker Error] Item {idx}: {e}")
        res_list.sort(key=lambda x: x[0])
        results = [r[1] for r in res_list]

    if results:
        _USER_CACHES[cache_key] = {
            "data": results,
            "raw_articles": raw_articles,
            "timestamp": current_time,
            "top_only": False
        }
        print(f"[Search Topic Complete] Generated {len(results)} AI cards for '{clean_topic}'.")

    return results
