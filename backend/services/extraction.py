
import io
import re
import requests

import pypdf
from fastapi import HTTPException
from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)


def extract_video_id(url: str) -> str:
    """Parse YouTube video ID from a URL."""
    pattern = r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})"
    match = re.search(pattern, url)
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
    Fetch the English transcript for a YouTube video.
    Raises HTTP 400 if no transcript is available.
    """
    video_id = extract_video_id(url)
    meta = get_video_metadata(url)
    
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        # Try to find English specifically or just fetch the first one
        try:
            entries = transcript_list.find_transcript(["en", "en-US"]).fetch()
        except:
            # Fallback to the first available transcript
            entries = next(iter(transcript_list)).fetch()
            
        transcript_text = " ".join(entry.text for entry in entries)
        # Prepend rich metadata so RAG can answer identity/date/duration questions
        header = (
            f"SOURCE METADATA (Use this for general info about the source/author):\n"
            f"- Title: {meta['title']}\n"
            f"- Channel/Author: {meta['channel']}\n"
            f"- Publication/Release Date: {meta['date']}\n"
            f"- Video Duration: {meta['duration']}\n\n"
        )
        return f"{header}TRANSCRIPT CONTEXT:\n{transcript_text}"
    except TranscriptsDisabled:
        raise HTTPException(
            status_code=400,
            detail="This video has transcripts disabled. Please try a different video.",
        )
    except NoTranscriptFound:
        raise HTTPException(
            status_code=400,
            detail="No English transcript found for this video.",
        )
    except Exception as e:
        msg = str(e)
        if "no element found" in msg or "xml" in msg.lower():
            raise HTTPException(
                status_code=400, 
                detail="YouTube blocked the transcript request or returned empty data. Please try a different video."
            )
        raise HTTPException(status_code=400, detail=f"Could not fetch transcript: {msg}")


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
