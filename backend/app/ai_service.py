import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types
from app.schemas import BriefingCardContent, ActionGuidance

# 1. Load variables from .env file into OS environment variables
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY is missing from .env file!")

client = genai.Client(api_key=api_key)
MODEL_NAME = "gemini-1.5-flash"


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


def ai_match_topics(query: str, available_topics: list[str], max_results: int = 3) -> list[str]:
    """
    Uses Gemini to semantically match a user's search query against the available topic list.
    Returns up to `max_results` related topic strings from the list.
    """
    topics_numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(available_topics))
    prompt = f"""You are a smart topic matching assistant for a developer news platform.

A user typed "{query}" in a search box. Your job is to find which of the following numbered topics are semantically related to their search.

Here are ALL available topics:
{topics_numbered}

Think broadly about what the user might mean:
- "aws" or "cloud" → Cloud Infrastructure & Azure
- "docker" or "containers" → Kubernetes & DevOps Pipelines  
- "security" or "auth" → Zero-Trust Cloud Security
- "ai" or "ml" or "llm" → Google Gemini & Generative AI
- "database" or "sql" or "mongo" → SQL & Vector Databases
- "react" or "nextjs" → React & Next.js Systems
- "angular" or "frontend" → Angular & Web Frameworks
- "csharp" or "dotnet" or ".net" → .NET Core & Minimal APIs, C# Architecture & Microservices
- "python" or "fastapi" → Python & FastAPI Setup
- "monitoring" or "tracing" → eBPF & System Observability
- "microfrontend" or "webpack" → Micro-Frontends & Module Federation

Return the NUMBERS (indices) of up to {max_results} matching topics as a JSON array of integers.
If nothing matches, return an empty array [].

Example: if the query is "aws", return [8] because topic 8 is "Cloud Infrastructure & Azure".
Example: if the query is "docker", return [7] because topic 7 is "Kubernetes & DevOps Pipelines".

IMPORTANT: Return ONLY a JSON array of integers, nothing else."""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        raw = response.text.strip()
        print(f"[AI Topic Match] query='{query}', raw_response='{raw}'")
        
        if raw.startswith("```json"):
            raw = raw[7:]
        if raw.startswith("```"):
            raw = raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        
        indices = json.loads(raw.strip())
        # Convert 1-based indices to actual topic strings
        results = []
        for idx in indices:
            if isinstance(idx, int) and 1 <= idx <= len(available_topics):
                results.append(available_topics[idx - 1])
        
        print(f"[AI Topic Match] query='{query}', matched_topics={results}")
        return results[:max_results]
    except Exception as e:
        print(f"[AI Topic Match Error] query='{query}': {e}")
        return []

