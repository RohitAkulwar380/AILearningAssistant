
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
    Fetch the English transcript for a YouTube video using Supadata via RapidAPI.
    This bypasses YouTube's bot detection on data center IPs like Railway.
    """
    video_id = extract_video_id(url)
    meta = get_video_metadata(url)
    s = get_settings()

    if not s.rapidapi_key:
        raise HTTPException(
            status_code=500,
            detail="RapidAPI key not configured. Cannot fetch YouTube transcript."
        )

    # YT-API Video Transcript endpoint
    rapid_url = "https://yt-api.p.rapidapi.com/get_transcript"
    headers = {
        "X-RapidAPI-Key": s.rapidapi_key.strip(),
        "X-RapidAPI-Host": "yt-api.p.rapidapi.com"
    }
    # Some URLs might have 'en' or 'en-US'. Specifying 'en' is a safe default.
    params = {"id": video_id, "lang": "en"}

    try:
        response = requests.get(rapid_url, headers=headers, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        
        # Structure: can be {"transcript": [...]} or {"data": {"transcript": [...]}}
        transcript_data = data.get("transcript")
        if not transcript_data and "data" in data and isinstance(data["data"], dict):
            transcript_data = data["data"].get("transcript")

        if not transcript_data:
             # Fallback: check if the whole response is the list (some APIs do this)
             if isinstance(data, list):
                 transcript_data = data
             else:
                 raise HTTPException(
                    status_code=400,
                    detail=f"No transcript found for this video. It might have captions disabled or be in a different language. (Response keys: {list(data.keys())})"
                )

        transcript_text = " ".join(entry.get("text", "") for entry in transcript_data if isinstance(entry, dict))
        if not transcript_text.strip():
            raise HTTPException(status_code=400, detail="Transcript was found but appeared empty.")
        
        header = (
            f"SOURCE METADATA (Use this for general info about the source/author):\n"
            f"- Title: {meta['title']}\n"
            f"- Channel/Author: {meta['channel']}\n"
            f"- Publication/Release Date: {meta['date']}\n"
            f"- Video Duration: {meta['duration']}\n\n"
        )
        return f"{header}TRANSCRIPT CONTEXT:\n{transcript_text}"

    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code
        try:
            err_detail = e.response.json().get("message", str(e))
        except:
            err_detail = str(e)
            
        raise HTTPException(
            status_code=400 if status_code < 500 else 500,
            detail=f"RapidAPI Error ({status_code}): {err_detail}"
        )
    except HTTPException:
        # Re-raise our own validation errors
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch YouTube transcript: {str(e)}")


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
