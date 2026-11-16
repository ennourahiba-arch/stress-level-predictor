"""Duels: two players, first correct answer wins the point, the game runs itself."""
import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.main import app
from app.pack import get_exercise

IDS = ["yt-int-01", "yt-crt-01", "yt-chn-01"]


@pytest.fixture()
def client(tmp_path):
    db.reset_for_tests(str(tmp_path / "t.db"))
    with TestClient(app) as c:
        yield c


def ok(i):
    return get_exercise(IDS[i])["mcq"]["correct"]


def start_duel(c):
    r = c.post("/api/rooms", json={"mode": "duel", "player_name": "Hiba", "exercise_ids": IDS, "seconds_per_question": 20})
    assert r.status_code == 200, r.text
    d = r.json()
    me = {"X-Host-Token": d["host_token"], "X-Team-Token": d["team_token"]}
    assert c.post(f"/api/rooms/{d['code']}/start", headers=me).status_code == 409  # alone
    friend = {"X-Team-Token": c.post(f"/api/rooms/{d['code']}/join", json={"team_name": "Sami"}).json()["team_token"]}
    assert c.post(f"/api/rooms/{d['code']}/join", json={"team_name": "Third"}).status_code == 409  # two players only
    assert c.post(f"/api/rooms/{d['code']}/start", headers=me).status_code == 200
    return d["code"], me, friend


def answer(c, code, who, qi, choice):
    return c.post(f"/api/rooms/{code}/answer", json={"q_index": qi, "choice": choice}, headers=who).json()


def test_first_correct_answer_wins_and_game_advances(client):
    c = client
    code, me, friend = start_duel(c)
    answer(c, code, friend, 0, ok(0))          # friend right first
    s = answer(c, code, me, 0, ok(0))           # me right, but second
    assert s["status"] == "reveal"              # both answered: revealed without waiting for the clock
    assert s["point_to"] == "Sami"
    # the reveal ends on its own and the next question opens
    db.ex("UPDATE quiz_rooms SET reveal_until = ? WHERE code = ?", (db.now_ms() - 1, code))
    s = c.get(f"/api/rooms/{code}/state", headers=me).json()
    assert s["status"] == "question" and s["q_index"] == 1
    answer(c, code, me, 1, ok(1))
    s = answer(c, code, friend, 1, (ok(1) + 1) % 4)
    assert s["point_to"] == "Hiba"
    db.ex("UPDATE quiz_rooms SET reveal_until = ? WHERE code = ?", (db.now_ms() - 1, code))
    c.get(f"/api/rooms/{code}/state", headers=me)
    answer(c, code, me, 2, (ok(2) + 1) % 4)
    s = answer(c, code, friend, 2, (ok(2) + 2) % 4)
    assert s["point_to"] is None                # both wrong: nobody scores
    db.ex("UPDATE quiz_rooms SET reveal_until = ? WHERE code = ?", (db.now_ms() - 1, code))
    s = c.get(f"/api/rooms/{code}/state", headers=friend).json()
    assert s["status"] == "finished" and s["winner"] is None
    assert sorted(p["score"] for p in s["players"]) == [1, 1]
    assert [p["is_you"] for p in s["players"]] == [False, True]


def test_time_out_reveals_with_hold(client):
    c = client
    code, me, friend = start_duel(c)
    answer(c, code, me, 0, ok(0))
    db.ex("UPDATE quiz_rooms SET deadline_ms = ? WHERE code = ?", (db.now_ms() - 1, code))
    s = c.get(f"/api/rooms/{code}/state", headers=me).json()
    assert s["status"] == "reveal" and s["point_to"] == "Hiba" and s["reveal_until"] > db.now_ms()


def test_duel_needs_a_name(client):
    assert client.post("/api/rooms", json={"mode": "duel", "exercise_ids": IDS}).status_code == 422
