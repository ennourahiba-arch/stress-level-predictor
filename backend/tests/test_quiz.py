"""Live class quiz: full flow, privacy, anti-cheat, timer."""
import json

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.pack import get_exercise

IDS = ["yt-int-01", "yt-crt-01", "yt-chn-01"]


@pytest.fixture()
def client(tmp_path):
    db.reset_for_tests(str(tmp_path / "t.db"))
    with TestClient(app) as c:
        yield c


def make(c, ids=IDS, secs=45):
    r = c.post("/api/rooms", json={"exercise_ids": ids, "seconds_per_question": secs})
    assert r.status_code == 200, r.text
    return r.json()["code"], {"X-Host-Token": r.json()["host_token"]}


def join(c, code, name):
    r = c.post(f"/api/rooms/{code}/join", json={"team_name": name})
    assert r.status_code == 200, r.text
    return {"X-Team-Token": r.json()["team_token"]}


def correct(i):
    return get_exercise(IDS[i])["mcq"]["correct"]


def wrong(i):
    return (correct(i) + 1) % 4


def test_full_quiz_with_three_teams(client):
    c = client
    code, host = make(c)
    teams = [join(c, code, n) for n in ("Tangents", "Limits", "Epsilons")]
    s = c.post(f"/api/rooms/{code}/start", headers=host).json()
    assert s["status"] == "question" and s["question"]["index"] == 0
    for qi in range(3):
        c.post(f"/api/rooms/{code}/answer", json={"q_index": qi, "choice": correct(qi)}, headers=teams[0])
        c.post(f"/api/rooms/{code}/answer", json={"q_index": qi, "choice": correct(qi) if qi else wrong(qi)}, headers=teams[1])
        c.post(f"/api/rooms/{code}/answer", json={"q_index": qi, "choice": wrong(qi)}, headers=teams[2])
        r = c.post(f"/api/rooms/{code}/next", headers=host).json()  # close early -> reveal
        assert r["status"] == "reveal" and r["result"]["correct"] == correct(qi)
        if qi == 0:
            assert r["result"]["pct_correct"] == 33 and r["result"]["top_wrong"]["label"]
        c.post(f"/api/rooms/{code}/next", headers=host)  # next question or finish
    out = c.get(f"/api/rooms/{code}/state", headers=host).json()
    assert out["status"] == "finished"
    sm = out["summary"]
    assert [t["score"] for t in sm["scoreboard"]] == [3, 2, 0]
    assert sm["insights"][0]["key"].startswith("On average") and sm["insights"][0]["params"]["pct"] >= 0
    team_view = c.get(f"/api/rooms/{code}/state", headers=teams[1]).json()
    assert team_view["you"]["score"] == 2 and len(team_view["you"]["history"]) == 3


def test_answer_key_hidden_until_reveal(client):
    c = client
    code, host = make(c)
    t = join(c, code, "Peekers")
    c.post(f"/api/rooms/{code}/start", headers=host)
    raw = json.dumps(c.get(f"/api/rooms/{code}/state", headers=t).json())
    for leak in ('"correct"', "labels", "solution", "mcq"):
        assert leak not in raw, leak


def test_one_answer_per_question(client):
    c = client
    code, host = make(c)
    t = join(c, code, "Double")
    c.post(f"/api/rooms/{code}/start", headers=host)
    c.post(f"/api/rooms/{code}/answer", json={"q_index": 0, "choice": wrong(0)}, headers=t)
    s = c.post(f"/api/rooms/{code}/answer", json={"q_index": 0, "choice": correct(0)}, headers=t).json()
    assert s["you"]["answer"] == wrong(0)


def test_only_host_controls(client):
    c = client
    code, _ = make(c)
    t = join(c, code, "Sneaky")
    assert c.post(f"/api/rooms/{code}/start", headers=t).status_code == 403
    assert c.post(f"/api/rooms/{code}/next", headers={"X-Host-Token": "guess"}).status_code == 403


def test_closed_and_future_questions_rejected(client):
    c = client
    code, host = make(c)
    t = join(c, code, "Late")
    assert c.post(f"/api/rooms/{code}/answer", json={"q_index": 0, "choice": 0}, headers=t).status_code == 409
    c.post(f"/api/rooms/{code}/start", headers=host)
    assert c.post(f"/api/rooms/{code}/answer", json={"q_index": 1, "choice": 0}, headers=t).status_code == 409
    db.ex("UPDATE quiz_rooms SET deadline_ms = ? WHERE code = ?", (db.now_ms() - 1, code))
    assert c.post(f"/api/rooms/{code}/answer", json={"q_index": 0, "choice": 0}, headers=t).status_code == 409
    assert c.get(f"/api/rooms/{code}/state", headers=t).json()["status"] == "reveal"


def test_privacy_threshold(client):
    c = client
    code, host = make(c, IDS[:1])
    t1, t2 = join(c, code, "One"), join(c, code, "Two")
    c.post(f"/api/rooms/{code}/start", headers=host)
    c.post(f"/api/rooms/{code}/answer", json={"q_index": 0, "choice": 0}, headers=t1)
    c.post(f"/api/rooms/{code}/answer", json={"q_index": 0, "choice": 1}, headers=t2)
    r = c.post(f"/api/rooms/{code}/next", headers=host).json()["result"]
    assert r["locked"] and "counts" not in r
    c.post(f"/api/rooms/{code}/next", headers=host)
    sm = c.get(f"/api/rooms/{code}/state", headers=host).json()["summary"]
    assert sm["locked"] and "scoreboard" not in sm
    sample = c.get(f"/api/rooms/{code}/sample", headers=host).json()
    assert sample["sample"] is True and sample["locked"] is False


def test_custom_questions_validated(client):
    c = client
    q = {"id": "u1", "prompt": "What does a context switch save?", "options": [{"text": "Registers"}, {"text": "Files"}],
         "correct": 0, "labels": [None, "Confused with I/O"], "solution": [{"text": "It saves registers."}]}
    assert c.post("/api/rooms", json={"questions": [q]}).status_code == 200
    assert c.post("/api/rooms", json={"questions": [{**q, "correct": 3}]}).status_code == 422
    assert c.post("/api/rooms", json={"questions": []}).status_code == 422
    assert c.post("/api/rooms", json={"exercise_ids": ["nope"]}).status_code == 404


def test_websocket_updates(client):
    c = client
    code, host = make(c)
    with c.websocket_connect(f"/api/rooms/{code}/ws") as ws:
        first = ws.receive_json()
        join(c, code, "Listener")
        assert ws.receive_json()["version"] > first["version"]


def test_calculus_quiz_in_french_and_italian(client):
    for lang, word in (("fr", "maximum absolu"), ("it", "massimo assoluto")):
        r = client.post("/api/rooms", json={"exercise_ids": ["yt-int-01"], "lang": lang})
        code, host = r.json()["code"], {"X-Host-Token": r.json()["host_token"]}
        join(client, code, "Équipe")
        s = client.post(f"/api/rooms/{code}/start", headers=host).json()
        assert word in s["question"]["prompt"] and word in json.dumps(s["question"]["options"], ensure_ascii=False)
        assert s["title"] in ("Max et min sur un intervalle fermé", "Max e min su intervalli chiusi")
