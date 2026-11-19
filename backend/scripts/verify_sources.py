"""Live verification script for Becon candidate official sources.

Fetches each candidate feed via HTTP, validates that it returns HTTP 200,
parses the feed via feedparser, and reports items and latest date.
"""

from typing import Any, Dict, List
import feedparser
import httpx

CANDIDATES: List[Dict[str, Any]] = [
    # Frameworks / Runtimes
    {
        "slug": "react-blog",
        "name": "React Blog",
        "homepage_url": "https://react.dev/blog",
        "feed_url": "https://react.dev/rss.xml",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["react", "javascript"],
        "professions": ["software-development"],
    },
    {
        "slug": "nextjs-releases",
        "name": "Next.js Releases",
        "homepage_url": "https://nextjs.org",
        "feed_url": "https://github.com/vercel/next.js/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["nextjs", "react"],
        "professions": ["software-development"],
    },
    {
        "slug": "nodejs-blog",
        "name": "Node.js Blog",
        "homepage_url": "https://nodejs.org",
        "feed_url": "https://nodejs.org/en/feed/blog.xml",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["nodejs", "javascript"],
        "professions": ["software-development"],
    },
    {
        "slug": "typescript-blog",
        "name": "TypeScript Blog",
        "homepage_url": "https://devblogs.microsoft.com/typescript",
        "feed_url": "https://devblogs.microsoft.com/typescript/feed/",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["typescript", "javascript"],
        "professions": ["software-development"],
    },
    {
        "slug": "python-insider",
        "name": "Python Insider",
        "homepage_url": "https://blog.python.org",
        "feed_url": "https://blog.python.org/feeds/posts/default",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["python"],
        "professions": ["software-development"],
    },
    {
        "slug": "fastapi-releases",
        "name": "FastAPI Releases",
        "homepage_url": "https://fastapi.tiangolo.com",
        "feed_url": "https://github.com/fastapi/fastapi/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["fastapi", "python"],
        "professions": ["software-development"],
    },
    {
        "slug": "dotnet-blog",
        "name": ".NET Blog",
        "homepage_url": "https://devblogs.microsoft.com/dotnet",
        "feed_url": "https://devblogs.microsoft.com/dotnet/feed/",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["dotnet", "csharp", "aspnet-core"],
        "professions": ["software-development"],
    },
    {
        "slug": "golang-blog",
        "name": "The Go Blog",
        "homepage_url": "https://go.dev/blog",
        "feed_url": "https://go.dev/blog/feed.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["golang"],
        "professions": ["software-development"],
    },
    {
        "slug": "rust-blog",
        "name": "Rust Blog",
        "homepage_url": "https://blog.rust-lang.org",
        "feed_url": "https://blog.rust-lang.org/feed.xml",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["rust"],
        "professions": ["software-development"],
    },
    {
        "slug": "inside-java",
        "name": "Inside Java",
        "homepage_url": "https://inside.java",
        "feed_url": "https://inside.java/feed.xml",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["java"],
        "professions": ["software-development"],
    },
    # Cloud / DevOps
    {
        "slug": "kubernetes-blog",
        "name": "Kubernetes Blog",
        "homepage_url": "https://kubernetes.io/blog",
        "feed_url": "https://kubernetes.io/feed.xml",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["kubernetes", "docker"],
        "professions": ["software-development"],
    },
    {
        "slug": "docker-cli-releases",
        "name": "Docker CLI Releases",
        "homepage_url": "https://github.com/docker/cli",
        "feed_url": "https://github.com/docker/cli/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["docker"],
        "professions": ["software-development"],
    },
    {
        "slug": "terraform-releases",
        "name": "Terraform Releases",
        "homepage_url": "https://www.terraform.io",
        "feed_url": "https://github.com/hashicorp/terraform/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["terraform"],
        "professions": ["software-development"],
    },
    {
        "slug": "aws-news-blog",
        "name": "AWS News Blog",
        "homepage_url": "https://aws.amazon.com/blogs/aws",
        "feed_url": "https://aws.amazon.com/blogs/aws/feed/",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["aws"],
        "professions": ["software-development"],
    },
    {
        "slug": "azure-updates-blog",
        "name": "Microsoft Azure Blog",
        "homepage_url": "https://azure.microsoft.com/en-us/blog",
        "feed_url": "https://azure.microsoft.com/en-us/blog/feed/",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["azure"],
        "professions": ["software-development"],
    },
    {
        "slug": "github-changelog",
        "name": "GitHub Changelog",
        "homepage_url": "https://github.blog/changelog",
        "feed_url": "https://github.blog/changelog/feed/",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["github-actions", "git", "ci-cd"],
        "professions": ["software-development"],
    },
    {
        "slug": "github-blog",
        "name": "The GitHub Blog",
        "homepage_url": "https://github.blog",
        "feed_url": "https://github.blog/feed/",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["git", "github-actions"],
        "professions": ["software-development"],
    },
    {
        "slug": "cloudflare-blog",
        "name": "Cloudflare Blog",
        "homepage_url": "https://blog.cloudflare.com",
        "feed_url": "https://blog.cloudflare.com/rss/",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["cloudflare-workers"],
        "professions": ["software-development"],
    },
    {
        "slug": "gitlab-releases",
        "name": "GitLab Releases",
        "homepage_url": "https://about.gitlab.com",
        "feed_url": "https://about.gitlab.com/atom.xml",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["ci-cd", "git"],
        "professions": ["software-development"],
    },
    # Databases
    {
        "slug": "postgresql-news",
        "name": "PostgreSQL News",
        "homepage_url": "https://www.postgresql.org",
        "feed_url": "https://www.postgresql.org/news.rss",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["postgresql"],
        "professions": ["software-development"],
    },
    {
        "slug": "redis-releases",
        "name": "Redis Releases",
        "homepage_url": "https://redis.io",
        "feed_url": "https://github.com/redis/redis/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["redis"],
        "professions": ["software-development"],
    },
    {
        "slug": "mongodb-releases",
        "name": "MongoDB Releases",
        "homepage_url": "https://www.mongodb.com",
        "feed_url": "https://github.com/mongodb/mongo/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["mongodb"],
        "professions": ["software-development"],
    },
    {
        "slug": "sqlite-releases",
        "name": "SQLite Releases",
        "homepage_url": "https://sqlite.org",
        "feed_url": "https://github.com/sqlite/sqlite/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["sqlite"],
        "professions": ["software-development"],
    },
    {
        "slug": "supabase-blog",
        "name": "Supabase Blog",
        "homepage_url": "https://supabase.com/blog",
        "feed_url": "https://supabase.com/blog/rss.xml",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["postgresql", "rest-api"],
        "professions": ["software-development"],
    },
    # Frontend / Ecosystem tools
    {
        "slug": "vite-releases",
        "name": "Vite Releases",
        "homepage_url": "https://vite.dev",
        "feed_url": "https://github.com/vitejs/vite/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["vite", "javascript"],
        "professions": ["software-development"],
    },
    {
        "slug": "tailwindcss-blog",
        "name": "Tailwind CSS Blog",
        "homepage_url": "https://tailwindcss.com/blog",
        "feed_url": "https://tailwindcss.com/feeds/feed.xml",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["tailwindcss"],
        "professions": ["software-development"],
    },
    {
        "slug": "vuejs-releases",
        "name": "Vue.js Releases",
        "homepage_url": "https://vuejs.org",
        "feed_url": "https://github.com/vuejs/core/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["vuejs", "javascript"],
        "professions": ["software-development"],
    },
    {
        "slug": "angular-releases",
        "name": "Angular Releases",
        "homepage_url": "https://angular.dev",
        "feed_url": "https://github.com/angular/angular/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["angular", "typescript"],
        "professions": ["software-development"],
    },
    {
        "slug": "svelte-releases",
        "name": "Svelte Releases",
        "homepage_url": "https://svelte.dev",
        "feed_url": "https://github.com/sveltejs/svelte/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["svelte", "javascript"],
        "professions": ["software-development"],
    },
    {
        "slug": "graphql-blog",
        "name": "GraphQL Blog",
        "homepage_url": "https://graphql.org/blog",
        "feed_url": "https://graphql.org/blog/rss.xml",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["graphql", "rest-api"],
        "professions": ["software-development"],
    },
    {
        "slug": "apache-kafka-releases",
        "name": "Apache Kafka Releases",
        "homepage_url": "https://kafka.apache.org",
        "feed_url": "https://github.com/apache/kafka/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["apache-kafka", "system-design"],
        "professions": ["software-development"],
    },
    # Security
    {
        "slug": "github-security-blog",
        "name": "GitHub Security Blog",
        "homepage_url": "https://github.blog/tag/security",
        "feed_url": "https://github.blog/tag/security/feed/",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["cve-security", "owasp-security"],
        "professions": ["software-development"],
    },
    {
        "slug": "google-security-blog",
        "name": "Google Security Blog",
        "homepage_url": "https://security.googleblog.com",
        "feed_url": "https://security.googleblog.com/feeds/posts/default",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["cve-security", "owasp-security"],
        "professions": ["software-development"],
    },
    # Mobile
    {
        "slug": "flutter-releases",
        "name": "Flutter Releases",
        "homepage_url": "https://flutter.dev",
        "feed_url": "https://github.com/flutter/flutter/releases.atom",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["rest-api"],
        "professions": ["software-development"],
    },
    {
        "slug": "android-developers-blog",
        "name": "Android Developers Blog",
        "homepage_url": "https://android-developers.googleblog.com",
        "feed_url": "https://android-developers.googleblog.com/feeds/posts/default",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["java"],
        "professions": ["software-development"],
    },
    # Systems / Linux
    {
        "slug": "linux-kernel-releases",
        "name": "Linux Kernel Releases",
        "homepage_url": "https://www.kernel.org",
        "feed_url": "https://www.kernel.org/feeds/kdist.xml",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["linux", "cpp"],
        "professions": ["software-development"],
    },
    {
        "slug": "swift-blog",
        "name": "Swift.org Blog",
        "homepage_url": "https://www.swift.org/blog",
        "feed_url": "https://www.swift.org/atom.xml",
        "source_type": "atom",
        "trust_tier": "official",
        "topics": ["system-design"],
        "professions": ["software-development"],
    },
    # AI / LLM Tooling
    {
        "slug": "google-developers-blog",
        "name": "Google Developers Blog",
        "homepage_url": "https://developers.googleblog.com",
        "feed_url": "https://developers.googleblog.com/feeds/posts/default",
        "source_type": "rss",
        "trust_tier": "official",
        "topics": ["ai-llm-tooling", "gcp"],
        "professions": ["software-development"],
    },
]


def verify_source(source: Dict[str, Any], client: httpx.Client) -> Dict[str, Any]:
    url = source["feed_url"]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 BeconFeedValidator/1.0",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    }
    result = {
        "slug": source["slug"],
        "name": source["name"],
        "type": source["source_type"],
        "feed_url": url,
        "topics": ", ".join(source["topics"]),
        "status_code": None,
        "parsed_items": 0,
        "latest_date": "N/A",
        "error": None,
        "is_valid": False,
    }

    try:
        response = client.get(url, headers=headers, follow_redirects=True, timeout=10.0)
        result["status_code"] = response.status_code
        if response.status_code == 200:
            parsed = feedparser.parse(response.content)
            entries = parsed.entries
            result["parsed_items"] = len(entries)
            if entries:
                first = entries[0]
                date_str = (
                    first.get("published")
                    or first.get("updated")
                    or first.get("pubDate")
                    or parsed.feed.get("published")
                    or parsed.feed.get("updated")
                    or parsed.feed.get("lastBuildDate")
                    or "Unknown"
                )
                result["latest_date"] = str(date_str)[:25]
                result["is_valid"] = len(entries) > 0
            else:
                result["error"] = "0 entries parsed from feed"
        else:
            result["error"] = f"HTTP {response.status_code}"
    except Exception as e:
        result["error"] = str(e)

    return result


def main():
    print(f"Testing {len(CANDIDATES)} candidate sources with live HTTP requests...\n")
    results = []
    with httpx.Client() as client:
        for src in CANDIDATES:
            res = verify_source(src, client)
            results.append(res)
            mark = "[PASS]" if res["is_valid"] else "[FAIL]"
            print(
                f"{mark} {res['slug']:<25} | {res['type']:<6} | {res['feed_url']:<50} | HTTP {res['status_code']} | items: {res['parsed_items']:<4} | latest: {res['latest_date']:<22} | topics: {res['topics']}"
            )

    valid = [r for r in results if r["is_valid"]]
    print(
        f"\nTotal tested: {len(results)}, Valid: {len(valid)}, Failed: {len(results) - len(valid)}"
    )


if __name__ == "__main__":
    main()
