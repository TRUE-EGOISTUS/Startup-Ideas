import re


def normalize_skill_tags(value: str | None) -> str | None:
    if not value:
        return None

    tags: dict[str, str] = {}
    for raw_tag in value.split(","):
        tag = re.sub(r"\s+", " ", raw_tag.strip())
        if tag:
            tags.setdefault(tag.casefold(), tag.casefold())

    return ", ".join(tags.values()) or None


def skill_tag_list(value: str | None) -> list[str]:
    normalized = normalize_skill_tags(value)
    return normalized.split(", ") if normalized else []
