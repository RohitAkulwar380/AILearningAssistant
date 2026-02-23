import json
import re


def parse_json_response(text: str) -> list:
    """
    Safely parse a JSON array from an AI response.
    Handles markdown code fences and extraneous commentary.
    """
    # Strip markdown fences (```json ... ``` or ``` ... ```)
    text = re.sub(r"```(?:json)?\n?", "", text).strip()
    text = text.rstrip("`").strip()

    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
        # Sometimes the model wraps the array in an object
        for value in result.values():
            if isinstance(value, list):
                return value
        raise ValueError("Parsed JSON is not a list or object containing a list")
    except json.JSONDecodeError:
        # Fallback: extract first [...] block from the string
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not parse AI response as JSON. Raw response:\n{text[:500]}")
