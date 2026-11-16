import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, wsUrl, type Auth, type RoomState } from "./api";

export type Conn = "connecting" | "live" | "polling" | "offline";

/** Live room state: WebSocket "changed" pings trigger a refetch; if the socket
 * drops, polls every 2.5 s and keeps retrying the socket. The server is the
 * source of truth for everything, including the timer. */
export function useRoom(code: string, auth: Auth) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const offset = useRef(0);
  const version = useRef(-1);
  const authKey = `${auth.host ?? ""}|${auth.team ?? ""}`;

  const apply = useCallback((s: RoomState) => {
    offset.current = s.server_now_ms - Date.now();
    version.current = s.version;
    setState(s);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.state(code, auth));
    } catch (e) {
      const err = e as ApiError;
      setError(err);
      if (err.status === 0) setConn("offline");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, authKey, apply]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let backoff = 2000;

    const startPolling = () => {
      if (!poll) poll = setInterval(refresh, 2500);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl(code));
      } catch {
        setConn("polling");
        startPolling();
        return;
      }
      ws.onopen = () => {
        backoff = 2000;
        setConn("live");
        stopPolling();
        refresh();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "update" && msg.version !== version.current) refresh();
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (closed) return;
        setConn(navigator.onLine ? "polling" : "offline");
        startPolling();
        retry = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 20000);
      };
    };

    refresh();
    connect();
    const safety = setInterval(refresh, 15000); // belt and braces
    return () => {
      closed = true;
      stopPolling();
      clearInterval(safety);
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [code, refresh]);

  return { state, error, conn, refresh, apply, serverNow: () => Date.now() + offset.current };
}

/** Seconds left on the server's clock; refetches once when it hits zero. */
export function useCountdown(deadline: number | null | undefined, serverNow: () => number, onZero: () => void) {
  const [left, setLeft] = useState<number | null>(null);
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
    if (!deadline) { setLeft(null); return; }
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
      setLeft(s);
      if (s === 0 && !fired.current) {
        fired.current = true;
        setTimeout(onZero, 600);
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);
  return left;
}
