
import io
import re
import requests

import pypdf
from fastapi import HTTPException
from config import get_settings


def extract_video_id(url: str) -> str:
    """Parse YouTube video ID from a URL."""
    # Support for standard watch URLs, short links (youtu.be), shorts, live, and embed URLs
    pattern = r"(?:v=|\/v\/|\/embed\/|\/shorts\/|\/live\/|^)([A-Za-z0-9_-]{11})(?:\?|&|$|\/)"
    match = re.search(pattern, url)
    if not match:
        # Fallback for youtu.be links specifically if start of string isn't anchoring well
        pattern_short = r"youtu\.be\/([A-Za-z0-9_-]{11})"
        match = re.search(pattern_short, url)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL. Could not find a video ID.")
    return match.group(1)


def get_video_metadata(url: str) -> dict:
    """Try to fetch the video title, upload date, channel, and duration from the YouTube page."""
    meta = {
        "title": "YouTube Video", 
        "date": "Unknown Date", 
        "channel": "Unknown Channel",
        "duration": "Unknown Duration"
    }
    try:
        response = requests.get(url, timeout=5)
        html = response.text
        
        # Title
        title_match = re.search(r"<title>(.*?)</title>", html)
        if title_match:
            meta["title"] = title_match.group(1).replace(" - YouTube", "").strip()
            
        # Date
        date_match = re.search(r'"uploadDate":"(.*?)"', html) or re.search(r'itemprop="datePublished" content="(.*?)"', html)
        if date_match:
            meta["date"] = date_match.group(1).split("T")[0]
            
        # Channel
        channel_match = re.search(r'"ownerChannelName":"(.*?)"', html) or re.search(r'itemprop="name" content="(.*?)"', html)
        if channel_match:
            meta["channel"] = channel_match.group(1)

        # Duration (ISO 8601 format like PT10M31S)
        dur_match = re.search(r'itemprop="duration" content="(.*?)"', html)
        if dur_match:
            raw_dur = dur_match.group(1).replace("PT", "")
            # Simple conversion for readability
            h = re.search(r'(\d+)H', raw_dur)
            m = re.search(r'(\d+)M', raw_dur)
            s = re.search(r'(\d+)S', raw_dur)
            parts = []
            if h: parts.append(f"{h.group(1)}h")
            if m: parts.append(f"{m.group(1)}m")
            if s: parts.append(f"{s.group(1)}s")
            meta["duration"] = " ".join(parts) if parts else raw_dur
        else:
            # Fallback to approxDurationMs
            ms_match = re.search(r'"approxDurationMs":"(\d+)"', html)
            if ms_match:
                total_seconds = int(ms_match.group(1)) // 1000
                mm = total_seconds // 60
                ss = total_seconds % 60
                meta["duration"] = f"{mm}m {ss}s"
            
    except:
        pass
    return meta


def get_transcript(url: str) -> str:
    """
    Fetch the English transcript for a YouTube video using a multi-stage fallback approach.
    1. Try direct 'get_transcript' endpoint.
    2. Fallback to 'subtitles' list + 'convert' endpoint for auto-generated captions.
    """
    video_id = extract_video_id(url)
    meta = get_video_metadata(url)
    s = get_settings()

    if not s.rapidapi_key:
        raise HTTPException(
            status_code=500,
            detail="RapidAPI key not configured. Cannot fetch YouTube transcript."
        )

    headers = {
        "X-RapidAPI-Key": s.rapidapi_key.strip(),
        "X-RapidAPI-Host": "yt-api.p.rapidapi.com"
    }

    # --- STAGE 1: Try direct GET /get_transcript ---
    try:
        resp = requests.get(
            "https://yt-api.p.rapidapi.com/get_transcript",
            headers=headers,
            params={"id": video_id, "lang": "en"},
            timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            transcript_data = data.get("transcript")
            if not transcript_data and "data" in data and isinstance(data["data"], dict):
                transcript_data = data["data"].get("transcript")

            if transcript_data:
                transcript_text = " ".join(entry.get("text", "") for entry in transcript_data if isinstance(entry, dict))
                if transcript_text.strip():
                    return _format_transcript_result(meta, transcript_text)

    except Exception as e:
        print(f"Stage 1 (Direct) failed: {str(e)}")

    # --- STAGE 2: Try GET /subtitles (List) + GET /convert_translate_download_subtitle ---
    try:
        # Step A: List available subtitles
        sub_resp = requests.get(
            "https://yt-api.p.rapidapi.com/subtitles",
            headers=headers,
            params={"id": video_id},
            timeout=10
        )
        if sub_resp.status_code == 200:
            subtitles = sub_resp.json()
            if isinstance(subtitles, list) and len(subtitles) > 0:
                # Priority: Manual English (.en) > Auto English (a.en) > Any English (en*)
                target_sub = None
                
                # Check for manual English
                target_sub = next((s for s in subtitles if s.get("vssId") == ".en"), None)
                # Check for auto-generated English
                if not target_sub:
                    target_sub = next((s for s in subtitles if s.get("vssId") == "a.en"), None)
                # Check for any English variant
                if not target_sub:
                    target_sub = next((s for s in subtitles if "en" in s.get("vssId", "").lower()), None)
                
                if target_sub and target_sub.get("url"):
                    # Step B: Convert chosen subtitle track to text
                    conv_resp = requests.get(
                        "https://yt-api.p.rapidapi.com/convert_translate_download_subtitle",
                        headers=headers,
                        params={"url": target_sub["url"], "format": "json3"},
                        timeout=15
                    )
                    if conv_resp.status_code == 200:
                        conv_data = conv_resp.json()
                        # YT JSON3 structure: {"events": [{"segs": [{"utf8": "..."}]}]}
                        text_parts = []
                        events = conv_data.get("events", [])
                        for event in events:
                            for seg in event.get("segs", []):
                                if seg.get("utf8"):
                                    text_parts.append(seg["utf8"])
                        
                        final_text = "".join(text_parts).replace("\n", " ")
                        if final_text.strip():
                            return _format_transcript_result(meta, final_text)

    except Exception as e:
        print(f"Stage 2 (Fallback) failed: {str(e)}")

    # --- FINAL ERROR ---
    raise HTTPException(
        status_code=400,
        detail="Could not find a transcript for this video. Most likely, it has captions disabled "
               "or is in a language other than English. Please try a different video."
    )


def _format_transcript_result(meta: dict, text: str) -> str:
    header = (
        f"SOURCE METADATA (Use this for general info about the source/author):\n"
        f"- Title: {meta['title']}\n"
        f"- Channel/Author: {meta['channel']}\n"
        f"- Publication/Release Date: {meta['date']}\n"
        f"- Video Duration: {meta['duration']}\n\n"
    )
    return f"{header}TRANSCRIPT CONTEXT:\n{text.strip()}"


def extract_pdf_text(file_bytes: bytes) -> str:
    """
    Extract plain text from a PDF file.
    Raises HTTP 400 if the PDF appears to be scanned (no extractable text).
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the PDF. It may be corrupted or password-protected.")

    pages_text = [page.extract_text() for page in reader.pages if page.extract_text()]
    if not pages_text:
        raise HTTPException(
            status_code=400,
            detail="No text could be extracted from this PDF. It may be a scanned image. "
                   "Please use a text-based PDF.",
        )
    return "\n".join(pages_text)
