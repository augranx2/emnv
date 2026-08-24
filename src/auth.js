import { useState, useEffect, useCallback } from "react";
import { login as apiLogin, logout as apiLogout, whoami as apiWhoami } from "./api";

const STORAGE_KEY = "em_non_viable_session";
const ROLE_LEVEL = { Tamu: 1, Staff: 2, Operator: 2, Admin: 2, Supervisor: 3, Manager: 4, "Assistant Manager": 4, Administrator: 5 };

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
  } catch {}
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

export function hasAccess(session, minRole, departemen) {
  if (!session) return false;
  if (session.role === "Administrator") return true;
  if (departemen && session.departemen !== departemen) return false;
  return roleLevel(session.role) >= roleLevel(minRole);
}

// Pengecekan Akses Fasilitas yang Mendukung Akses Spesifik per Gedung
export function hasFacilityAccess(session, minRole, cfg) {
  if (!session) return false;
  if (session.role === "Administrator") return true;
  if (roleLevel(session.role) < roleLevel(minRole)) return false;

  const userPerms = (session.departemen || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const facLabel = (cfg.label || "").toLowerCase();
  const facKey = (cfg.key || "").toLowerCase();
  const facDept = (cfg.department || "").toLowerCase();
  const facAltDept = (cfg.altDepartment || "").toLowerCase();
  const facGroup = (cfg.group || "").toLowerCase();

  return userPerms.some((perm) => {
    // 1. Cocok dengan nama spesifik fasilitas (misal: "nbl kemasan")
    if (perm === facLabel || perm === facKey) return true;
    // 2. Cocok dengan grup (misal: "nbl", "sefa")
    if (perm === facGroup) return true;
    // 3. Cocok dengan departemen umum (misal: "produksi", "kemasan", "qc", "ppic")
    if (perm === facDept || (facAltDept && perm === facAltDept)) return true;
    return false;
  });
}