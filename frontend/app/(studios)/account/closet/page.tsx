"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AddGarmentDialog } from "@/components/closet/AddGarmentDialog";
import { ClosetFilters, type SortOption } from "@/components/closet/ClosetFilters";
import { ClosetTabs, type ClosetTab } from "@/components/closet/ClosetTabs";
import { EditGarmentDialog } from "@/components/closet/EditGarmentDialog";
import { EmptyState } from "@/components/closet/EmptyState";
import { GarmentGrid } from "@/components/closet/GarmentGrid";
import { LooksGallery } from "@/components/closet/LooksGallery";
import { OutfitBuilder } from "@/components/closet/OutfitBuilder";
import { StudioShell } from "@/components/studios/StudioShell";
import { Button } from "@/components/ui/button";
import {
  garmentsApi,
  looksApi,
  tryonApi,
  type Garment,
  type Look,
} from "@/lib/api";

const PROCESSING_REFRESH_MS = 5000;

export default function ClosetPage() {
  const router = useRouter();
  const [garments, setGarments] = useState<Garment[]>([]);
  const [looks, setLooks] = useState<Look[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ClosetTab>("garments");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Garment | null>(null);
  const [editingLook, setEditingLook] = useState<Look | null>(null);
  const [renderingLookIds, setRenderingLookIds] = useState<Set<number>>(
    () => new Set()
  );

  const [search, setSearch] = useState("");
  const [garmentType, setGarmentType] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  useEffect(() => {
    let cancelled = false;
    Promise.all([garmentsApi.list(0, 200, true), looksApi.list(0, 100)])
      .then(([gRes, lRes]) => {
        if (cancelled) return;
        setGarments(gRes.data ?? []);
        setLooks(lRes.data ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load your closet.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll while any garment is still preprocessing so we can swap in the
  // background-removed thumbnail and clear the "Preparing" pill once
  // it's ready.
  useEffect(() => {
    const pending = garments.some(
      (g) =>
        g.preprocess_status === "queued" ||
        g.preprocess_status === "processing" ||
        g.preprocess_status === "pending"
    );
    if (!pending) return;
    const handle = setInterval(async () => {
      try {
        const res = await garmentsApi.list(0, 200, true);
        setGarments(res.data ?? []);
      } catch {
        // Silently ignore; next tick retries.
      }
    }, PROCESSING_REFRESH_MS);
    return () => clearInterval(handle);
  }, [garments]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of garments) {
      if (g.category) set.add(g.category);
    }
    const opts = [{ value: "all", label: "All categories" }];
    Array.from(set)
      .sort()
      .forEach((cat) => opts.push({ value: cat, label: cat }));
    return opts;
  }, [garments]);

  const garmentLookup = useMemo(() => {
    const map = new Map<number, Garment>();
    for (const g of garments) map.set(g.id, g);
    return map;
  }, [garments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = garments.filter((g) => {
      if (garmentType !== "all" && g.garment_type !== garmentType) return false;
      if (category !== "all" && g.category !== category) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        (g.description?.toLowerCase().includes(q) ?? false) ||
        (g.category?.toLowerCase().includes(q) ?? false)
      );
    });
    if (sort === "newest") {
      list = [...list].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (sort === "oldest") {
      list = [...list].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [garments, search, garmentType, category, sort]);

  const handleTryOn = (garment: Garment) => {
    router.push(`/studios/tryon?garmentId=${garment.id}`);
  };

  const handleDelete = async (garment: Garment) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${garment.name}" from your closet?`)
    ) {
      return;
    }
    const previous = garments;
    setGarments((prev) => prev.filter((g) => g.id !== garment.id));
    try {
      await garmentsApi.delete(garment.id);
      toast.success("Removed.");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail || (err as Error).message;
      toast.error(`Could not delete: ${detail}`);
      setGarments(previous);
    }
  };

  const handleCreated = (garment: Garment) => {
    setGarments((prev) => [garment, ...prev]);
  };

  const handleSaved = (garment: Garment) => {
    setGarments((prev) =>
      prev.map((g) => (g.id === garment.id ? garment : g))
    );
  };

  const handleLookSaved = (look: Look) => {
    setLooks((prev) => {
      const idx = prev.findIndex((l) => l.id === look.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = look;
        return next;
      }
      return [look, ...prev];
    });
    setEditingLook(null);
  };

  const handleLookEdit = (look: Look) => {
    setEditingLook(look);
    // OutfitBuilder picks up `editingLook` and hydrates its slots; we
    // don't have to re-mount it.
  };

  const handleLookDelete = async (look: Look) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete the look "${look.name}"?`)
    ) {
      return;
    }
    const previous = looks;
    setLooks((prev) => prev.filter((l) => l.id !== look.id));
    if (editingLook?.id === look.id) setEditingLook(null);
    try {
      await looksApi.delete(look.id);
      toast.success("Look removed.");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail || (err as Error).message;
      toast.error(`Could not delete: ${detail}`);
      setLooks(previous);
    }
  };

  const handleLookRender = async (look: Look) => {
    setRenderingLookIds((prev) => {
      const next = new Set(prev);
      next.add(look.id);
      return next;
    });
    try {
      const res = await looksApi.render(look.id, { quality: "balanced" });
      const tryonId = res.data.data?.tryon_id;
      if (!tryonId) throw new Error("No tryon id returned");

      // Poll status until the result lands; then refetch the look so
      // the cover preview updates from the server-derived image_url.
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        const statusRes = await tryonApi.getStatus(tryonId);
        const status = statusRes.data;
        if (status?.result_image_url) {
          break;
        }
        if (status?.status === "FAILED" || status?.status === "failed") {
          throw new Error(status?.error_message || "Render failed");
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      const refreshed = await looksApi.get(look.id);
      setLooks((prev) =>
        prev.map((l) => (l.id === look.id ? refreshed.data : l))
      );
      toast.success("Re-rendered.");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail || (err as Error).message;
      toast.error(`Render failed: ${detail}`);
    } finally {
      setRenderingLookIds((prev) => {
        const next = new Set(prev);
        next.delete(look.id);
        return next;
      });
    }
  };

  const totalCount = garments.length;
  const filteredCount = filtered.length;
  const lookCount = looks.length;

  return (
    <StudioShell
      eyebrow="Workspace 05"
      numeral="05"
      title="Closet"
      description="Save your pieces, build looks, and try them on in seconds."
      actions={
        tab === "garments" ? (
          <Button onClick={() => setAddOpen(true)} className="rounded-full">
            <Plus className="size-4" />
            Add garment
          </Button>
        ) : null
      }
    >
      {loading ? (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your closet…
        </div>
      ) : totalCount === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <div className="flex flex-col gap-6">
          <ClosetTabs
            value={tab}
            onChange={setTab}
            garmentCount={totalCount}
            lookCount={lookCount}
          />

          {tab === "garments" ? (
            <>
              <ClosetFilters
                search={search}
                onSearchChange={setSearch}
                garmentType={garmentType}
                onGarmentTypeChange={setGarmentType}
                category={category}
                onCategoryChange={setCategory}
                sort={sort}
                onSortChange={setSort}
                categoryOptions={categoryOptions}
                totalCount={totalCount}
                filteredCount={filteredCount}
              />
              {filteredCount === 0 ? (
                <EmptyState
                  onAdd={() => setAddOpen(true)}
                  variant="no-results"
                />
              ) : (
                <GarmentGrid
                  garments={filtered}
                  onTryOn={handleTryOn}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                />
              )}
            </>
          ) : (
            <div className="flex flex-col gap-10">
              <OutfitBuilder
                garments={garments}
                editingLook={editingLook}
                onClearEditing={() => setEditingLook(null)}
                onLookSaved={handleLookSaved}
              />

              {lookCount > 0 ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-display text-lg">Saved looks</h2>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {lookCount}
                    </span>
                  </div>
                  <LooksGallery
                    looks={looks}
                    garmentLookup={garmentLookup}
                    renderingLookIds={renderingLookIds}
                    onEdit={handleLookEdit}
                    onRender={handleLookRender}
                    onDelete={handleLookDelete}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      <AddGarmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={handleCreated}
      />
      <EditGarmentDialog
        garment={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
    </StudioShell>
  );
}
