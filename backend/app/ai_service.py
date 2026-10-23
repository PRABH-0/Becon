import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types
from app.schemas import BriefingCardContent, ActionGuidance, ChatResponse, ChatMessage

# 1. Load variables from .env file into OS environment variables
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY is missing from .env file!")

client = genai.Client(api_key=api_key)
MODEL_NAME = "gemini-3.1-flash-lite"


def generate_action_card(
    article_title: str,
    source_url: str,
    raw_summary: str,
    tech_tag: str,
    user_role: str = "Senior Software Engineer",
    user_interests: str = "Modern Systems Architecture",
    custom_prompt: str = ""
) -> BriefingCardContent:
    """
    Leverages Google Gemini with Structured Outputs to transform raw tech news into a 4-part action card
    customized to the developer's exact role, favorite tech stack, and personal AI tuning directives.
    """
    default_directive = "Compare concepts to C#, .NET Core, and Angular where applicable. Emphasize clean architecture and production reliability."
    applied_directive = custom_prompt if custom_prompt else default_directive

    prompt = f"""
    You are 'Becon AI', an expert technical editor for the Daily Developer Gazette.
    Your job is to read a real-time developer news update and translate it into a sharp, distraction-free 4-Part Action Card customized for this specific engineer:

    Reading Engineer Identity & Preferences:
    - Primary Engineering Role: {user_role}
    - Key Tech Stack Interests: {user_interests}
    - Custom AI Personalization Directive: {applied_directive}

    News Item:
    Title: {article_title}
    Source Link: {source_url}
    Tag/Category: {tech_tag}
    Summary / Raw Text: {raw_summary[:1200]}

    Instructions:
    1. what_happened: Give 1 or 2 clear, jargon-free bullet points summarizing the event, release, or technical pattern.
    2. why_it_matters: Explain the architectural, performance, or industry significance in 1-2 concise sentences, highlighting connections to their tech interests ({user_interests}).
    3. how_it_affects_you: Explain the direct personal impact specifically customized for someone working as a '{user_role}'.
    4. what_to_do_next: Provide tactical advice. Choose action_type from 'learn', 'apply', 'avoid', or 'prepare', and write 1 sentence of specific guidance strictly respecting their personalization directive: '{applied_directive}'.
    """

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BriefingCardContent,
                temperature=0.3,
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
        print(f"[AI Service Error] Failed to generate card for '{article_title}': {e}")
        return BriefingCardContent(
            what_happened=[f"Real-time signal reported for {tech_tag}: {article_title}"],
            why_it_matters="New developer tooling, technical pattern, or architectural release announced in the live stream.",
            how_it_affects_you=f"Directly relevant to your role as a {user_role}.",
            what_to_do_next=ActionGuidance(
                action_type="learn",
                guidance="Inspect the original source documentation for implementation guidelines."
            )
        )


def ai_match_topics(query: str, available_topics: list[str] = None, max_results: int = 3) -> list[str]:
    """
    Intelligent developer search autocomplete engine.
    Completes user input with up to `max_results` relevant tech keywords/topics
    matching what the user typed (e.g. 'rus' -> Rust Programming Language, Rust Web Development, Rust Systems).
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

    # 2. Call Gemini to dynamically complete and expand user input into concrete tech keywords
    prompt = f"""You are an intelligent developer search autocomplete assistant for a technical news platform.
The user is typing in a tech stack interest search bar and typed: "{clean_q}".
Generate up to {max_results} relevant, highly-specific developer topics or tech keywords that complete or expand upon what the user typed.

Examples:
- If user typed "rus" -> ["Rust Programming Language", "Rust Web Development (Axum/Actix)", "Rust Systems Programming"]
- If user typed "dock" -> ["Docker & Containerization", "Docker Compose & Multi-Container", "Docker Security & Optimization"]
- If user typed "angu" -> ["Angular Framework & Components", "Angular CLI & Tooling", "Angular Signals & State Management"]
- If user typed "pyt" -> ["Python & FastAPI Setup", "PyTorch & Deep Learning", "Python AsyncIO & Concurrency"]
- If user typed "kube" -> ["Kubernetes & Container Orchestration", "Kubernetes Helm & GitOps", "Kubernetes Networking & Ingress"]

Return ONLY a valid JSON array of up to {max_results} strings. Each string must be a concise, title-cased technology topic name (max 45 characters). Do not return markdown, just raw JSON array."""

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
    
    prompt = f"""You are the Becon AI onboarding assistant. Your job is to warmly chat with a new developer and extract 4 pieces of information to build their profile.
    
    Information needed:
    1. Their Name
    2. Their Job Role (e.g. Frontend Developer, Backend Engineer, Data Scientist)
    3. Their Experience Level (e.g. Junior (1-2y), Mid (3-4y), Senior (5+), Lead/Architect)
    4. Up to 5 tech interests from this exact list: [{topics_list}]. If they say something else, map it to the closest match on this list.

    RULES:
    - You must output JSON according to the schema.
    - Start the conversation warmly by asking for their name.
    - Ask ONE question at a time! Don't overwhelm them.
    - If the user asks you a technical, programming, or unrelated question, ANSWER IT brilliantly using your knowledge, but then gently guide the conversation back to the onboarding question.
    - Do NOT set `onboarding_complete` to true or populate `extracted_data` until you have gathered all 4 pieces of information.
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
