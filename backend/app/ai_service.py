import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types
from app.schemas import BriefingCardContent, ActionGuidance, ChatResponse, ChatMessage

# 1. Load variables from .env file into OS environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path)
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY is missing from .env file!")

client = genai.Client(api_key=api_key)
MODEL_NAME = "gemini-flash-lite-latest"


def generate_action_card(
    article_title: str,
    source_url: str,
    raw_summary: str,
    tech_tag: str,
    user_role: str = "Professional",
    user_interests: str = "Business, Finance & Tech",
    custom_prompt: str = ""
) -> BriefingCardContent:
    """
    Leverages Google Gemini with Structured Outputs to transform raw news & industry signals into a 4-part action card
    customized to the user's exact role, interests, and personal AI tuning directives.
    """
    default_directive = "Provide actionable insights, practical takeaways, and relevant context tailored specifically to the user's role and selected interests."
    applied_directive = custom_prompt if custom_prompt else default_directive

    prompt = f"""
    You are 'Becon AI', an expert intelligence editor for the Daily Intelligence Gazette.
    Your job is to read a real-time news update and translate it into a sharp, distraction-free 4-Part Action Card customized for this specific professional:

    Reader Identity & Preferences:
    - Primary Profession / Role: {user_role}
    - Key Interests & Focus Areas: {user_interests}
    - Custom AI Personalization Directive: {applied_directive}

    News Item:
    Title: {article_title}
    Source Link: {source_url}
    Tag/Category: {tech_tag}
    Summary / Raw Text: {raw_summary[:1200]}

    Instructions:
    1. what_happened: Give 1 or 2 clear, jargon-free bullet points summarizing the event, announcement, update, or development.
    2. why_it_matters: Explain the operational, financial, strategic, or industry significance in 1-2 concise sentences, highlighting connections to their interests ({user_interests}).
    3. how_it_affects_you: Explain the direct practical impact specifically customized for someone working as a '{user_role}'.
    4. what_to_do_next: Provide tactical advice. Choose action_type from 'learn', 'apply', 'avoid', or 'prepare', and write 1 sentence of specific guidance strictly respecting their personalization directive: '{applied_directive}'.
    """
    import time
    last_err = None
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=BriefingCardContent,
                    temperature=0.2,
                    max_output_tokens=650,
                ),
            )
            
            raw_json = response.text.strip()
            if raw_json.startswith("```json"):
                raw_json = raw_json[7:]
            if raw_json.startswith("```"):
                raw_json = raw_json[3:]
            if raw_json.endswith("```"):
                raw_json = raw_json[:-3]
                
            card_content = BriefingCardContent.model_validate_json(raw_json.strip())
            return card_content

        except Exception as e:
            last_err = e
            time.sleep(0.5)

    print(f"[AI Service Error] Failed to generate card for '{article_title}': {last_err}")
    clean_headline = article_title.split(" - ")[0].strip() if " - " in article_title else article_title.strip()
    return BriefingCardContent(
        what_happened=[
            f"Key industry update for {tech_tag}: {clean_headline}.",
            raw_summary[:160].strip() if raw_summary and len(raw_summary) > 20 else f"Live market monitoring detected priority signals around {clean_headline}."
        ],
        why_it_matters=f"Directly impacts operational workflows, market trends, and consumer standards within the {tech_tag} domain.",
        how_it_affects_you=f"As a {user_role}, tracking updates in {clean_headline} allows you to adapt strategy and maintain a strong competitive edge.",
        what_to_do_next=ActionGuidance(
            action_type="apply",
            guidance=f"Assess how current developments in {clean_headline} can be leveraged in your daily {user_role} operations."
        )
    )


def ai_match_topics(query: str, available_topics: list[str] = None, max_results: int = 3) -> list[str]:
    """
    Intelligent search autocomplete engine.
    Completes user input with up to `max_results` relevant topics or keywords
    matching what the user typed (e.g. 'tax' -> Tax Regulations & GST, 'ret' -> Retail & Inventory, 'rus' -> Rust).
    """
    clean_q = query.strip()
    if not clean_q:
        return []

    # 1. First check if any available_topics directly match the prefix or substring
    local_hits = []
    if available_topics:
        q_lower = clean_q.lower()
        for t in available_topics:
            if q_lower in t.lower():
                local_hits.append(t)
                if len(local_hits) >= max_results:
                    return local_hits

    # 2. Call Gemini to dynamically complete and expand user input into concrete keywords
    prompt = f"""You are an intelligent search autocomplete assistant for an industry intelligence and news platform.
The user is typing in a topic/profession interest search bar and typed: "{clean_q}".
Generate up to {max_results} relevant, highly-specific topics or keywords that complete or expand upon what the user typed.

Examples:
- If user typed "tax" -> ["Tax Regulations & GST Compliance", "Income Tax Returns & Auditing", "Corporate Tax Planning"]
- If user typed "acc" -> ["Corporate Accounting Standards", "Bookkeeping & Tally / QuickBooks", "Financial Auditing & Reporting"]
- If user typed "shop" -> ["Shop & Retail Store Operations", "Retail Inventory Management", "Retail POS & Cash Flow"]
- If user typed "ret" -> ["Retail Merchandising & Pricing", "Customer Retention & Loyalty", "Retail Supply Chain Management"]
- If user typed "ai" -> ["Artificial Intelligence & Productivity Tools", "Generative AI Automation", "AI Business Solutions"]
- If user typed "pyt" -> ["Python & Data Analytics", "Python Automation Scripts", "Machine Learning with Python"]
- If user typed "rus" -> ["Rust Programming Language", "Rust Web Development", "Rust Systems Programming"]

Return ONLY a valid JSON array of up to {max_results} strings. Each string must be a concise, title-cased topic name (max 45 characters). Do not return markdown, just raw JSON array."""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        raw = response.text.strip()
        print(f"[AI Topic Complete] query='{clean_q}', raw_response='{raw}'")
        
        if raw.startswith("```json"):
            raw = raw[7:]
        if raw.startswith("```"):
            raw = raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            results = [str(item).strip() for item in parsed if isinstance(item, (str, int, float)) and str(item).strip()]
            if results:
                return results[:max_results]
        return local_hits
    except Exception as e:
        print(f"[AI Topic Complete Error] query='{clean_q}': {e}")
        return local_hits


def ai_onboarding_chat(history: list[ChatMessage], available_topics: list[str]) -> ChatResponse:
    topics_list = ", ".join(available_topics)
    
    prompt = f"""You are the Becon AI onboarding assistant. Your job is to warmly chat with a new user and extract 4 pieces of information to build their profile.
    
    Information needed:
    1. Their Name
    2. Their Profession / Role (e.g. Accountant, Shop Owner, Retail Manager, Software Engineer, Business Owner)
    3. Their Experience Level (e.g. Beginner (1-2y), Established (3-5y), Senior (5+), Business Owner / Director)
    4. Up to 5 topics from this exact list: [{topics_list}]. If they say something else, map it to the closest match on this list.

    RULES:
    - You must output JSON according to the schema.
    - Start the conversation warmly by asking for their name.
    - Ask ONE question at a time! Don't overwhelm them.
    - Once you have all 4, set `onboarding_complete` to true, output the `extracted_data` with the exact fields, and thank them in `reply_text`. Make sure `interests` is a comma-separated string of the exact matched topic names.

    Chat History:
"""
    for msg in history:
        prompt += f"{msg.role}: {msg.content}\n"
        
    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ChatResponse,
                temperature=0.7,
            ),
        )
        
        raw_json = response.text.strip()
        if raw_json.startswith("```json"):
            raw_json = raw_json[7:]
        if raw_json.startswith("```"):
            raw_json = raw_json[3:]
        if raw_json.endswith("```"):
            raw_json = raw_json[:-3]
            
        return ChatResponse.model_validate_json(raw_json.strip())
    except Exception as e:
        print(f"[AI Onboarding Error] {e}")
        from app.schemas import ExtractedProfile
        return ChatResponse(
            reply_text="I'm having trouble thinking right now. Let's try again in a moment.",
            onboarding_complete=False,
            extracted_data=None
        )
