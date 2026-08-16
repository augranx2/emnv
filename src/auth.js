import { useState, useEffect, useCallback } from "react";
import { login as apiLogin, logout as apiLogout, whoami as apiWhoami } from "./api";

const STORAGE_KEY = "em_non_viable_session";

// Sengaja tidak ada role level 0 (konsisten dengan Code.gs — lihat catatan di sana).
const ROLE_LEVEL = { Tamu: 1, Staff: 2, Supervisor: 3, Manager: 4, "Assistant Manager": 4, Administrator: 5 };

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage tidak tersedia — sesi hanya bertahan di memori
  }
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const stored = readStored();
      if (!stored || !stored.token) {
        setChecking(false);
        return;
      }
      try {
        const res = await apiWhoami(stored.token);
        if (cancelled) return;
        if (res.ok) setSession({ ...stored, ...res });
        else writeStored(null);
      } catch {
        if (!cancelled) writeStored(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    restore();
    return () => { cancelled = true; };
  }, []);

  const doLogin = useCallback(async (username, password) => {
    const res = await apiLogin(username, password);
    const next = { token: res.token, username: res.username, nama: res.nama, role: res.role, departemen: res.departemen };
    setSession(next);
    writeStored(next);
    return next;
  }, []);

  const doLogout = useCallback(async () => {
    if (session?.token) apiLogout(session.token);
    setSession(null);
    writeStored(null);
  }, [session]);

  return { session, checking, login: doLogin, logout: doLogout };
}

export function roleLevel(role) {
  return ROLE_LEVEL[role] || 0;
}

// Akses generik (tidak terikat fasilitas) — mis. Pengkajian QA, Riwayat Aktivitas.
export function hasAccess(session, minRole, departemen) {
  if (!session) return false;
  if (session.role === "Administrator") return true;
  if (departemen && session.departemen !== departemen) return false;
  return roleLevel(session.role) >= roleLevel(minRole);
}

// Akses KHUSUS FASILITAS: departemen sesi harus sama dengan cfg.department,
// ATAU cfg.altDepartment (mis. "PPIC") dengan syarat levelnya Manager ke atas.
export function hasFacilityAccess(session, minRole, cfg) {
  if (!session) return false;
  if (session.role === "Administrator") return true;
  if (session.departemen === cfg.department) return roleLevel(session.role) >= roleLevel(minRole);
  if (cfg.altDepartment && session.departemen === cfg.altDepartment) return roleLevel(session.role) >= roleLevel("Manager");
  return false;
}
