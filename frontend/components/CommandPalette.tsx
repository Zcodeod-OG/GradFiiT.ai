"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import {
  Camera,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  Shirt,
  Sparkles,
  Trophy,
  Wand2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"

type CommandItem = {
  id: string
  label: string
  hint?: string
  icon: typeof Sparkles
  keywords: string[]
  shortcut?: string
  run: () => void
}

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  onOpenPhotoWizard?: () => void
  onJumpToTab?: (tab: "overview" | "closet" | "history" | "settings") => void
}

/**
 * Cmd-K / Ctrl-K command palette.
 *
 * Scopes:
 *  - Navigation (Try studio, Closet, History, Settings, Sign out)
 *  - Quick actions (Open photo wizard)
 *
 * Search is a simple weighted prefix match over `keywords`. The palette
 * traps focus inside the modal and exposes keyboard navigation (Up/Down
 * arrows, Enter to run, Esc to close). Honors prefers-reduced-motion by
 * skipping the entrance/exit transitions.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onOpenPhotoWizard,
  onJumpToTab,
}: Props) {
  const router = useRouter()
  const { logout } = useAuth()
  const reduce = useReducedMotion()
  const [query, setQuery] = useState("")
  const [activeIdx, setActiveIdx] = useState(0)

  const items = useMemo<CommandItem[]>(() => {
    return [
      {
        id: "try",
        label: "Open the studio",
        hint: "Generate a new try-on",
        icon: Wand2,
        keywords: ["try", "studio", "generate", "new", "look"],
        shortcut: "G",
        run: () => router.push("/try"),
      },
      {
        id: "overview",
        label: "Go to overview",
        hint: "Dashboard home",
        icon: LayoutDashboard,
        keywords: ["overview", "home", "dashboard", "feed"],
        shortcut: "1",
        run: () => onJumpToTab?.("overview"),
      },
      {
        id: "closet",
        label: "Open closet",
        hint: "Saved garments",
        icon: Shirt,
        keywords: ["closet", "wardrobe", "garments", "saved"],
        shortcut: "2",
        run: () => onJumpToTab?.("closet"),
      },
      {
        id: "history",
        label: "Open history",
        hint: "Past try-ons",
        icon: History,
        keywords: ["history", "past", "previous", "tryons"],
        shortcut: "3",
        run: () => onJumpToTab?.("history"),
      },
      {
        id: "settings",
        label: "Open settings",
        hint: "Profile, plan, photo",
        icon: Settings,
        keywords: ["settings", "preferences", "profile", "account"],
        shortcut: "4",
        run: () => onJumpToTab?.("settings"),
      },
      {
        id: "photo",
        label: "Manage saved photo",
        hint: "Upload or replace your default photo",
        icon: Camera,
        keywords: ["photo", "selfie", "upload", "wizard", "default"],
        run: () => onOpenPhotoWizard?.(),
      },
      {
        id: "rewards",
        label: "View Style Journey",
        hint: "XP, missions and unlocks",
        icon: Trophy,
        keywords: ["xp", "rewards", "missions", "level", "journey"],
        run: () => onJumpToTab?.("overview"),
      },
      {
        id: "logout",
        label: "Sign out",
        icon: LogOut,
        keywords: ["sign out", "logout", "leave"],
        run: () => {
          logout()
          router.push("/login")
        },
      },
    ]
  }, [router, onJumpToTab, onOpenPhotoWizard, logout])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase().trim()
    return items.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q))
    )
  }, [items, query])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setActiveIdx(0)
    }
  }, [open])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  useEffect(() => {
    if (!open) return undefined
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onOpenChange(false)
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIdx((idx) => Math.min(filtered.length - 1, idx + 1))
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIdx((idx) => Math.max(0, idx - 1))
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        const target = filtered[activeIdx]
        if (target) {
          target.run()
          onOpenChange(false)
        }
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, filtered, activeIdx, onOpenChange])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="cmdk-backdrop"
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            key="cmdk-shell"
            initial={reduce ? false : { opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-white/95 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center gap-2 border-b border-border/60 px-4">
              <Sparkles className="size-4 text-primary" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type a command or search..."
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="hidden rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                Esc
              </kbd>
            </div>

            <ul className="max-h-[50vh] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No matches for "{query}"
                </li>
              ) : (
                filtered.map((item, idx) => {
                  const Icon = item.icon
                  const isActive = idx === activeIdx
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => {
                          item.run()
                          onOpenChange(false)
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm",
                          isActive
                            ? "bg-primary/10 text-foreground"
                            : "text-foreground/85 hover:bg-muted/40"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex size-8 items-center justify-center rounded-lg",
                            isActive
                              ? "bg-primary text-white"
                              : "bg-muted/60 text-muted-foreground"
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="flex-1">
                          <span className="block font-medium">{item.label}</span>
                          {item.hint ? (
                            <span className="block text-xs text-muted-foreground">
                              {item.hint}
                            </span>
                          ) : null}
                        </span>
                        {item.shortcut ? (
                          <kbd className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            G {item.shortcut}
                          </kbd>
                        ) : null}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>

            <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
              <span>
                <kbd className="rounded border border-border/60 bg-white px-1 py-0.5">↑</kbd>{" "}
                <kbd className="rounded border border-border/60 bg-white px-1 py-0.5">↓</kbd>{" "}
                navigate
              </span>
              <span>
                <kbd className="rounded border border-border/60 bg-white px-1 py-0.5">↵</kbd>{" "}
                run
              </span>
              <span>
                <kbd className="rounded border border-border/60 bg-white px-1 py-0.5">Esc</kbd>{" "}
                close
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * Hook that wires a global Cmd/Ctrl+K listener to a useState pair. Drop into
 * an authenticated layout once and the palette opens from anywhere.
 */
export function useCommandPaletteToggle(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMacCmd = event.metaKey && !event.ctrlKey
      const isCtrl = event.ctrlKey && !event.metaKey
      if ((isMacCmd || isCtrl) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])
  return [open, setOpen]
}
