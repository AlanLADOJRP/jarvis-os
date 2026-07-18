"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardDataPayload } from "@/types/dashboard";

type DashboardCache = {
  value: DashboardDataPayload | null;
  fetchedAt: number;
  inFlight: Promise<DashboardDataPayload> | null;
};

const DASHBOARD_TTL_MS = 30_000;

const cache: DashboardCache = {
  value: null,
  fetchedAt: 0,
  inFlight: null,
};

async function requestDashboardData(): Promise<DashboardDataPayload> {
  const response = await fetch("/api/dashboard", { cache: "no-store" });
  const payload = (await response.json()) as DashboardDataPayload & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load dashboard data.");
  }

  return payload;
}

export async function getDashboardData(options?: { force?: boolean }): Promise<DashboardDataPayload> {
  const force = options?.force ?? false;

  if (!force && cache.value && Date.now() - cache.fetchedAt < DASHBOARD_TTL_MS) {
    return cache.value;
  }

  if (!force && cache.inFlight) {
    return cache.inFlight;
  }

  cache.inFlight = requestDashboardData()
    .then((data) => {
      cache.value = data;
      cache.fetchedAt = Date.now();
      return data;
    })
    .finally(() => {
      cache.inFlight = null;
    });

  return cache.inFlight;
}

export function invalidateDashboardCache() {
  cache.value = null;
  cache.fetchedAt = 0;
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardDataPayload | null>(() => cache.value);
  const [loading, setLoading] = useState<boolean>(() => cache.value === null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    try {
      const next = await getDashboardData({ force });
      setData(next);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard data.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(false);
  }, [refresh]);

  return { data, loading, error, refresh };
}
