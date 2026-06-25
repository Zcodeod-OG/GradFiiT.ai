"use client";

import { Dna } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { brandDnaApi, type BrandDNA } from "@/lib/api";
import { cn } from "@/lib/utils";

type BrandDNAToggleProps = {
  enabled: boolean;
  onChange: (next: boolean) => void;
  className?: string;
};

function isBrandConfigured(data: BrandDNA | null): boolean {
  if (!data) return false;
  const voice = (data.voice || "").trim();
  const palette = (data.palette || []).filter(Boolean);
  const refs = (data.model_references || []).filter(Boolean);
  const lora = (data.lora_uri || "").trim();
  return Boolean(voice || palette.length || refs.length || lora);
}

export function BrandDNAToggle({
  enabled,
  onChange,
  className,
}: BrandDNAToggleProps) {
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    brandDnaApi
      .get()
      .then((res) => setConfigured(isBrandConfigured(res.data)))
      .catch(() => setConfigured(false));
  }, []);

  if (!configured) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No Brand DNA yet.{" "}
        <Link href="/account/brand-dna" className="underline underline-offset-2">
          Configure yours
        </Link>
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wider">
          <Dna className="size-3" />
          Brand DNA active
        </Badge>
        <span className="text-xs text-muted-foreground">
          Voice, palette, LoRA, and model refs apply on generate.
        </span>
      </div>
      <label className="inline-flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 rounded border-border"
        />
        <Label className="cursor-pointer font-normal">Use my Brand DNA</Label>
      </label>
    </div>
  );
}
