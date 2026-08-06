import time
import re
import html
from typing import List, Dict
import feedparser
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.schemas import BriefingCard
from app.ai_service import generate_action_card

FEED_SOURCES = {
    ".NET Core": "https://devblogs.microsoft.com/dotnet/feed/",
    "React Architecture": "https://dev.to/feed/tag/react",
    "Next.js & Vercel": "https://dev.to/feed/tag/nextjs",
    "DevOps & K8s": "https://dev.to/feed/tag/devops",
    "AI & Systems": "https://dev.to/feed/tag/architecture",
    "Cloud Security": "https://dev.to/feed/tag/security",
}

_CACHE = {
    "data": [],
    "timestamp": 0.0,
    "ttl_seconds": 1800,
    "cache_key": ""
}

def clean_html_tags(text: str) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    clean_text = re.sub(r'<[^>]+>', ' ', text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    return clean_text

def fetch_raw_feed_items(limit_per_source: int = 3) -> List[Dict[str, str]]:
    articles = []
    for stack_tag, url in FEED_SOURCES.items():
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:limit_per_source]:
                title = entry.get("title", "No Title")
                link = entry.get("link", url)
                summary_raw = entry.get("summary", entry.get("description", ""))
                summary = clean_html_tags(summary_raw)
                if not summary:
                    summary = f"Latest production updates regarding {stack_tag}."
                articles.append({
                    "title": title,
                    "link": link,
                    "summary": summary,
                    "tag": stack_tag
                })
        except Exception as e:
            print(f"[Feed Ingestion Error] Could not connect to '{stack_tag}': {e}")
            continue
    return articles

def worker_generate_card(index: int, item: Dict[str, str], role: str, interests: str, prompt: str) -> dict:
    if index == 0:
        priority = "lead"
    elif index in [1, 2, 3, 4]:
        priority = "major"
    elif index in [5, 6, 7]:
        priority = "watch"
    elif index in [8, 9]:
        priority = "spotlight"
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
        target_role=role,
        target_stack=[item["tag"].split()[0], "AI Customized", "Live Wire"],
        priority=priority,
        card_content=card_content
    )
    return card.model_dump()

def get_live_briefings(
    force_refresh: bool = False,
    user_role: str = "Senior Software Engineer",
    user_interests: str = "",
    custom_prompt: str = ""
) -> List[dict]:
    current_time = time.time()
    current_key = f"{user_role}|{user_interests}|{custom_prompt}"
    
    # Return cache if valid, matching the exact developer personalization profile
    if not force_refresh and _CACHE["data"] and _CACHE["cache_key"] == current_key and (current_time - _CACHE["timestamp"] < _CACHE["ttl_seconds"]):
        print("[Cache Hit] Serving customized AI cards from cache.")
        return _CACHE["data"]
        
    print(f"[Cache Miss / Customizing] Running Gemini AI pipeline for role: {user_role}...")
    raw_articles = fetch_raw_feed_items(limit_per_source=3)
    if not raw_articles:
        return _CACHE["data"]

    target_articles = raw_articles[:16]
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
        _CACHE["data"] = cards_list
        _CACHE["timestamp"] = current_time
        _CACHE["cache_key"] = current_key
        print(f"[Pipeline Complete] Cached {len(cards_list)} personalized AI cards.")

    return cards_list
