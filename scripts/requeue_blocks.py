#!/usr/bin/env python3
"""
Script simple para re-encolar bloques de audio en SPAA.

Permite devolver bloques terminados (READY) o fallidos de vuelta a la cola (QUEUED)
para que el worker los re-sintetice con las nuevas mejoras (micro-pasadas de <=45 palabras,
normalización de comillas y siglas, e instruct de pronunciación pausada y clara en español).

Uso:
  # Re-encolar un rango de secuencias (ej: bloques 1 al 12):
  uv run python scripts/requeue_blocks.py --range 1 12

  # Re-encolar secuencias específicas:
  uv run python scripts/requeue_blocks.py --sequences 1 2 5 9

  # Re-encolar todos los bloques de un capítulo:
  uv run python scripts/requeue_blocks.py --chapter 1

  # Re-encolar todos los bloques que aún tengan el instruct acelerado/antiguo:
  uv run python scripts/requeue_blocks.py --old-instruct
"""

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "spaa_master.sqlite"

DEFAULT_QWEN_INSTRUCT = (
    "Voz clara, pausada y profesional con dicción nítida en español. Ritmo natural, "
    "entonación atractiva y comprensible, pronunciando cada palabra con precisión sin acelerar."
)


def main():
    parser = argparse.ArgumentParser(description="Re-encolar bloques para re-síntesis en SPAA")
    parser.add_argument("--sequences", type=int, nargs="+", help="Lista de números de bloque a re-encolar (ej: --sequences 1 2 3)")
    parser.add_argument("--range", type=int, nargs=2, metavar=("DESDE", "HASTA"), help="Rango inclusivo de bloques (ej: --range 1 12)")
    parser.add_argument("--chapter", type=int, default=None, help="Número de secuencia del capítulo (ej: --chapter 1)")
    parser.add_argument("--old-instruct", action="store_true", help="Re-encolar todos los bloques con el instruct viejo/acelerado")
    parser.add_argument("--all-ready", action="store_true", help="Re-encolar TODOS los bloques READY del libro")

    args = parser.parse_args()

    if not any([args.sequences, args.range, args.chapter is not None, args.old_instruct, args.all_ready]):
        parser.print_help()
        sys.exit(1)

    if not DB_PATH.exists():
        print(f"[ERROR] Base de datos no encontrada en {DB_PATH}")
        sys.exit(1)

    con = sqlite3.connect(str(DB_PATH))
    cur = con.cursor()

    # Construir cláusulas de filtrado para tts_chunks
    where_clauses = []
    params = []

    if args.chapter is not None:
        cur.execute("SELECT id, title FROM chapters WHERE sequence = ? OR sequence = ?", (args.chapter, args.chapter + 2))
        # Nota: en algunos libros los primeros capítulos son portada/intro, buscamos el capítulo exacto
        cur.execute("SELECT id, title FROM chapters WHERE sequence = ?", (args.chapter,))
        ch_row = cur.fetchone()
        if not ch_row:
            # Buscar si el título contiene "Capítulo X"
            cur.execute("SELECT id, title FROM chapters WHERE title LIKE ?", (f"%Capítulo {args.chapter}:%",))
            ch_row = cur.fetchone()

        if ch_row:
            ch_id, ch_title = ch_row
            print(f"[Capítulo] Filtrando por: {ch_title} (ID: {ch_id})")
            where_clauses.append("chapter_id = ?")
            params.append(ch_id)
        else:
            print(f"[AVISO] No se encontró el capítulo {args.chapter}, filtrando sin restricción de capítulo.")

    if args.range:
        start_seq, end_seq = args.range
        where_clauses.append("sequence BETWEEN ? AND ?")
        params.extend([start_seq, end_seq])

    if args.sequences:
        placeholders = ",".join("?" * len(args.sequences))
        where_clauses.append(f"sequence IN ({placeholders})")
        params.extend(args.sequences)

    if args.old_instruct:
        where_clauses.append("instruct LIKE '%energética%'")

    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

    # Seleccionar chunks que coinciden
    query = f"SELECT id, sequence, status, instruct FROM tts_chunks WHERE {where_sql} ORDER BY sequence"
    cur.execute(query, params)
    chunks = cur.fetchall()

    if not chunks:
        print("No se encontraron bloques que coincidan con los criterios especificados.")
        con.close()
        return

    print(f"\nSe encontraron {len(chunks)} bloques para re-encolar:")
    seq_list = [c[1] for c in chunks]
    print(f"Secuencias: {seq_list}")

    chunk_ids = [c[0] for c in chunks]
    placeholders_ids = ",".join("?" * len(chunk_ids))

    # 1. Actualizar tts_chunks a QUEUED con nuevo instruct
    cur.execute(f"""
        UPDATE tts_chunks 
        SET status = 'QUEUED',
            qa_status = 'PENDING',
            instruct = ?,
            updated_at = datetime('now')
        WHERE id IN ({placeholders_ids})
    """, [DEFAULT_QWEN_INSTRUCT] + chunk_ids)
    chunks_updated = cur.rowcount

    # 2. Actualizar tts_jobs asociados a QUEUED
    cur.execute(f"""
        UPDATE tts_jobs 
        SET status = 'QUEUED',
            attempts = 0,
            last_error = NULL,
            next_retry_at = NULL,
            worker_id = NULL,
            claimed_at = NULL,
            lease_until = NULL,
            updated_at = datetime('now')
        WHERE chunk_id IN ({placeholders_ids})
    """, chunk_ids)
    jobs_updated = cur.rowcount

    con.commit()
    con.close()

    print(f"\n✅ ÉXITO:")
    print(f"   - {chunks_updated} bloques pasados a estado 'QUEUED' con instruct de dicción pausada.")
    print(f"   - {jobs_updated} trabajos de cola listos para ser tomados por el worker GPU.")
    print("\nEl worker GPU los procesará en orden con micro-pasadas de <= 45 palabras.")


if __name__ == "__main__":
    main()
