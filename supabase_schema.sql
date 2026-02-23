-- ============================================================
-- AI Learning Assistant — Supabase SQL Setup
-- Paste this entire file into the Supabase SQL Editor and run.
-- ============================================================

-- 1. Enable the pgvector extension
create extension if not exists vector;

-- 2. Create the documents table
create table if not exists documents (
  id           uuid        primary key default gen_random_uuid(),
  session_id   text        not null,
  content      text        not null,
  embedding    vector(1536),
  source_type  text        default 'youtube', -- 'youtube' | 'pdf'
  chunk_index  int         default 0,
  created_at   timestamptz default now()
);

-- 3. Index for fast cosine similarity search
create index if not exists documents_embedding_idx
  on documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. Index for fast session filtering
create index if not exists documents_session_id_idx
  on documents (session_id);

-- 5. Similarity search function
create or replace function match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int,
  p_session_id    text
)
returns table (content text, similarity float)
language sql stable
as $$
  select
    content,
    1 - (embedding <=> query_embedding) as similarity
  from documents
  where session_id = p_session_id
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
