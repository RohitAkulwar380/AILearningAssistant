from langchain_text_splitters import RecursiveCharacterTextSplitter

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=150,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def chunk_text(text: str) -> list[str]:
    """
    Split text into overlapping chunks suitable for embedding.
    Uses RecursiveCharacterTextSplitter to respect natural boundaries.
    """
    chunks = _splitter.split_text(text)
    # Filter out trivially short chunks that add noise
    return [c.strip() for c in chunks if len(c.strip()) > 50]
