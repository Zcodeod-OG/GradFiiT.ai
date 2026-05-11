"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

export type SortOption = "newest" | "oldest" | "name";

type Option = { value: string; label: string };

type ClosetFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  categoryOptions: Option[];
  totalCount: number;
  filteredCount: number;
};

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "A-Z" },
];

// Category navigation (garment_type) now lives in `CategorySidebar`,
// so this bar only keeps the controls that are orthogonal to it —
// search, free-form category, sort.
export function ClosetFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  categoryOptions,
  totalCount,
  filteredCount,
}: ClosetFiltersProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-background/60 p-4 backdrop-blur-md lg:flex-row lg:items-center">
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

        <span className="ml-1 text-[11px] text-muted-foreground">
          {filteredCount} of {totalCount}
        </span>
      </div>
    </div>
  );
}
