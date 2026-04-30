"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SortOption = "newest" | "oldest" | "name";

type Option = { value: string; label: string };

type ClosetFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  garmentType: string;
  onGarmentTypeChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  categoryOptions: Option[];
  totalCount: number;
  filteredCount: number;
};

const TYPE_OPTIONS: Option[] = [
  { value: "all", label: "All" },
  { value: "upper_body", label: "Upper" },
  { value: "lower_body", label: "Lower" },
  { value: "full_body", label: "Full" },
  { value: "outerwear", label: "Outerwear" },
  { value: "accessory", label: "Accessory" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "A-Z" },
];

export function ClosetFilters({
  search,
  onSearchChange,
  garmentType,
  onGarmentTypeChange,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  categoryOptions,
  totalCount,
  filteredCount,
}: ClosetFiltersProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-background/60 p-4 backdrop-blur-md">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by name or description"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {categoryOptions.length > 1 ? (
            <select
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              aria-label="Filter by category"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : null}

          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortOption)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            aria-label="Sort"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TYPE_OPTIONS.map((opt) => {
          const active = garmentType === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onGarmentTypeChange(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] uppercase tracking-wider transition-colors",
                active
                  ? "border-transparent bg-foreground text-background"
                  : "border-border/60 bg-muted/30 text-foreground/70 hover:bg-muted/60"
              )}
            >
              {opt.label}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {filteredCount} of {totalCount}
        </span>
      </div>
    </div>
  );
}
