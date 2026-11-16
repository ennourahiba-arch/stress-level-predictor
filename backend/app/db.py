"""SQLite storage for temporary classroom sessions.

Stores only: room code, a hash of the host token, the round id, timing, team
nicknames with hashed tokens, and each team's choices. No names, emails, IPs
or chat. Rooms are deleted ROOM_TTL_MINUTES after creation.
"""
from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
import threading
import time
from typing import Any

DB_PATH = os.environ.get("DB_PATH", "catchai.db")
ROOM_TTL_MINUTES = int(os.environ.get("ROOM_TTL_MINUTES", "180"))
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L
MAX_TEAMS = 60

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS quiz_rooms (
  code TEXT PRIMARY KEY,
  host_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  quiz_json TEXT NOT NULL,          -- the questions with their answer keys (deleted with the room)
  status TEXT NOT NULL,             -- lobby | question | reveal | finished
  q_index INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'class',   -- class | duel
  reveal_until INTEGER,                 -- duel: when the reveal ends and the next question opens
  per_q_s INTEGER NOT NULL,
  deadline_ms INTEGER,
  created_ms INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quiz_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL REFERENCES quiz_rooms(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  joined_ms INTEGER NOT NULL,
  UNIQUE (room_code, name_key)
);
CREATE TABLE IF NOT EXISTS answers (
  team_id INTEGER NOT NULL REFERENCES quiz_teams(id) ON DELETE CASCADE,
  q_index INTEGER NOT NULL,
  choice INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  PRIMARY KEY (team_id, q_index)    -- one answer per team per question
);
"""


def now_ms() -> int:
    return int(time.time() * 1000)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA foreign_keys = ON")
        _conn.executescript(SCHEMA)
        cols = {r[1] for r in _conn.execute("PRAGMA table_info(quiz_rooms)")}
        for col, decl in (("mode", "TEXT NOT NULL DEFAULT 'class'"), ("reveal_until", "INTEGER")):
            if col not in cols:  # databases created before duels existed
                _conn.execute(f"ALTER TABLE quiz_rooms ADD COLUMN {col} {decl}")
    return _conn


def reset_for_tests(path: str) -> None:
    global _conn, DB_PATH
    if _conn is not None:
        _conn.close()
    _conn, DB_PATH = None, path


def q(sql: str, args: tuple = ()) -> list[sqlite3.Row]:
    with _lock:
        return conn().execute(sql, args).fetchall()


def ex(sql: str, args: tuple = ()) -> sqlite3.Cursor:
    with _lock:
        return conn().execute(sql, args)


# --- rooms -----------------------------------------------------------------

def create_room(title: str, quiz_json: str, per_q_s: int, mode: str = "class") -> tuple[str, str]:
    host_token = secrets.token_urlsafe(24)
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))
        try:
            ex("INSERT INTO quiz_rooms (code, host_hash, title, quiz_json, status, per_q_s, created_ms, mode) VALUES (?,?,?,?,?,?,?,?)",
               (code, hash_token(host_token), title, quiz_json, "lobby", per_q_s, now_ms(), mode))
            return code, host_token
        except sqlite3.IntegrityError:
            continue
    raise RuntimeError("could not allocate a room code")


def get_room(code: str) -> dict[str, Any] | None:
    rows = q("SELECT * FROM quiz_rooms WHERE code = ?", (code.upper(),))
    return dict(rows[0]) if rows else None


def is_host(room: dict[str, Any], token: str | None) -> bool:
    return bool(token) and secrets.compare_digest(room["host_hash"], hash_token(token))


def bump(code: str) -> int:
    ex("UPDATE quiz_rooms SET version = version + 1 WHERE code = ?", (code,))
    return q("SELECT version FROM quiz_rooms WHERE code = ?", (code,))[0]["version"]


def open_question(code: str, index: int, per_q_s: int) -> None:
    ex("UPDATE quiz_rooms SET status='question', q_index=?, deadline_ms=? WHERE code=?",
       (index, now_ms() + per_q_s * 1000, code))


def reveal(code: str, hold_ms: int | None = None) -> bool:
    """Close the current question. Duels pass hold_ms: the reveal then ends on its own."""
    until = now_ms() + hold_ms if hold_ms else None
    return ex("UPDATE quiz_rooms SET status='reveal', deadline_ms=NULL, reveal_until=? WHERE code=? AND status='question'",
              (until, code)).rowcount > 0


def finish(code: str) -> None:
    ex("UPDATE quiz_rooms SET status='finished', deadline_ms=NULL WHERE code=?", (code,))


def duel_reveals_done() -> list[dict[str, Any]]:
    return [dict(r) for r in q("SELECT code, q_index, per_q_s, quiz_json FROM quiz_rooms WHERE mode='duel' AND status='reveal' "
                               "AND reveal_until IS NOT NULL AND reveal_until <= ?", (now_ms(),))]


def overdue_rooms() -> list[str]:
    return [r["code"] for r in q("SELECT code FROM quiz_rooms WHERE status='question' AND deadline_ms <= ?", (now_ms(),))]


def purge_expired() -> int:
    cutoff = now_ms() - ROOM_TTL_MINUTES * 60_000
    return ex("DELETE FROM quiz_rooms WHERE created_ms < ?", (cutoff,)).rowcount


# --- teams -----------------------------------------------------------------

class JoinError(ValueError):
    pass


def add_team(code: str, name: str, limit: int = MAX_TEAMS) -> tuple[int, str]:
    if q("SELECT COUNT(*) AS n FROM quiz_teams WHERE room_code=?", (code,))[0]["n"] >= limit:
        raise JoinError("This duel already has two players." if limit == 2 else "This room is full.")
    token = secrets.token_urlsafe(24)
    try:
        cur = ex("INSERT INTO quiz_teams (room_code, name, name_key, token_hash, joined_ms) VALUES (?,?,?,?,?)",
                 (code, name, name.casefold(), hash_token(token), now_ms()))
    except sqlite3.IntegrityError:
        raise JoinError("Another team already uses that name. Pick a different one.")
    return cur.lastrowid, token


def team_by_token(code: str, token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    rows = q("SELECT * FROM quiz_teams WHERE room_code=? AND token_hash=?", (code, hash_token(token)))
    return dict(rows[0]) if rows else None


def teams_with_answers(code: str) -> list[dict[str, Any]]:
    teams = {t["id"]: {"id": t["id"], "name": t["name"], "answers": {}}
             for t in q("SELECT id, name FROM quiz_teams WHERE room_code=? ORDER BY joined_ms", (code,))}
    for a in q("SELECT a.team_id, a.q_index, a.choice, a.correct, a.ms FROM answers a JOIN quiz_teams t ON t.id=a.team_id WHERE t.room_code=?", (code,)):
        teams[a["team_id"]]["answers"][a["q_index"]] = {"choice": a["choice"], "correct": bool(a["correct"]), "ms": a["ms"]}
    return list(teams.values())


def add_answer(team_id: int, q_index: int, choice: int, correct: bool) -> bool:
    """False if this team already answered this question (answers never change)."""
    return ex("INSERT OR IGNORE INTO answers (team_id, q_index, choice, correct, ms) VALUES (?,?,?,?,?)",
              (team_id, q_index, choice, int(correct), now_ms())).rowcount > 0
