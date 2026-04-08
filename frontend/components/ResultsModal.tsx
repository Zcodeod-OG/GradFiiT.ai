"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import ReactCompareImage from "react-compare-image"
import Script from "next/script"
import {
  X,
  Download,
  Share2,
  Twitter,
  Facebook,
  Instagram,
  ChevronLeft,
  ChevronRight,
  Save,
  RefreshCw,
  ChevronDown,
  Check,
  LogIn,
  Bookmark,
} from "lucide-react"

// Use Bookmark as fallback for Pinterest if not available
const Pinterest = Bookmark
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ResultsModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  beforeImage: string
  afterImage: string
  resultMode?: "2d" | "3d"
  modelUrl?: string
  turntableUrl?: string
  onTryAnother?: () => void
  onSaveToWardrobe?: () => void
  isAuthenticated?: boolean
  onLogin?: () => void
}

type DownloadFormat = "jpg" | "png"

export function ResultsModal({
  open,
  onOpenChange,
  beforeImage,
  afterImage,
  resultMode = "2d",
  modelUrl,
  turntableUrl,
  onTryAnother,
  onSaveToWardrobe,
  isAuthenticated = false,
  onLogin,
}: ResultsModalProps) {
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>("png")
  const [isDownloading, setIsDownloading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to close
      if (e.key === "Escape") {
        e.preventDefault()
        onOpenChange(false)
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  // Download image
  const handleDownload = useCallback(
    async (format: DownloadFormat) => {
      if (!afterImage) return

      setIsDownloading(true)
      try {
        // Create canvas to convert image format if needed
        const img = new Image()
        img.crossOrigin = "anonymous"

        img.onload = () => {
          const canvas = document.createElement("canvas")
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext("2d")

          if (!ctx) {
            setIsDownloading(false)
            return
          }

          ctx.drawImage(img, 0, 0)

          // Convert to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                setIsDownloading(false)
                return
              }

              const url = URL.createObjectURL(blob)
              const link = document.createElement("a")
              link.href = url
              link.download = `try-on-result.${format}`
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              URL.revokeObjectURL(url)
              setIsDownloading(false)
            },
            format === "jpg" ? "image/jpeg" : "image/png",
            format === "jpg" ? 0.92 : 1
          )
        }

        img.onerror = () => {
          setIsDownloading(false)
        }

        img.src = afterImage
      } catch (error) {
        console.error("Download failed:", error)
        setIsDownloading(false)
      }
    },
    [afterImage]
  )

  // Share functions
  const handleShare = useCallback(
    (platform: "twitter" | "facebook" | "pinterest" | "instagram") => {
      const text = encodeURIComponent("Check out my virtual try-on!")
      const url = encodeURIComponent(window.location.href)
      const imageUrl = encodeURIComponent(afterImage)

      const shareUrls: Record<string, string> = {
        twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
        pinterest: `https://pinterest.com/pin/create/button/?url=${url}&description=${text}&media=${imageUrl}`,
        instagram: `https://www.instagram.com/`, // Instagram doesn't support direct share URLs
      }

      if (platform === "instagram") {
        // Copy image to clipboard or provide instructions
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(afterImage).then(() => {
            alert("Image URL copied to clipboard! Paste it in Instagram.")
          })
        } else {
          alert("Please save the image and upload it to Instagram manually.")
        }
        return
      }

      window.open(shareUrls[platform], "_blank", "width=600,height=400")
    },
    [afterImage]
  )

  const handleTryAnother = () => {
    onOpenChange(false)
    onTryAnother?.()
  }

  const handleSaveToWardrobe = () => {
    if (!isAuthenticated) {
      onLogin?.()
      return
    }
    onSaveToWardrobe?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogContent
            ref={containerRef}
            className="max-w-7xl max-h-[95vh] w-full h-full p-0 gap-0 overflow-hidden"
            showCloseButton={false}
          >
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center justify-between p-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
            >
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  {resultMode === "3d" ? "Your 3D Try-On Result" : "Your Try-On Result"}
                </DialogTitle>
              </DialogHeader>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="rounded-full"
              >
                <X className="size-5" />
                <span className="sr-only">Close</span>
              </Button>
            </motion.div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
              <div className="relative w-full h-full min-h-[500px] bg-muted/30">
                {resultMode === "3d" ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="grid gap-4 p-4 md:grid-cols-2"
                  >
                    <Script
                      src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"
                      strategy="afterInteractive"
                    />
                    <div className="rounded-xl border bg-background p-3">
                      <p className="mb-2 text-sm font-medium">360 Mannequin Viewer</p>
                      {modelUrl ? (
                        // @ts-expect-error Custom element provided by @google/model-viewer script.
                        <model-viewer
                          src={modelUrl}
                          camera-controls
                          auto-rotate
                          auto-rotate-delay="0"
                          shadow-intensity="1"
                          exposure="1"
                          style={{ width: "100%", height: "420px", background: "#0b1020", borderRadius: "12px" }}
                        />
                      ) : (
                        <div className="flex h-[420px] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                          3D model URL not available yet.
                        </div>
                      )}
                      {turntableUrl ? (
                        <a
                          href={turntableUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs text-primary hover:underline"
                        >
                          Open dedicated 360 turntable
                        </a>
                      ) : null}
                    </div>

                    <div className="rounded-xl border bg-background p-3">
                      <p className="mb-2 text-sm font-medium">Rendered Fit Preview</p>
                      {afterImage ? (
                        <img src={afterImage} alt="3D try-on preview" className="h-[420px] w-full rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-[420px] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                          Preview image not available.
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="relative w-full h-full min-h-[500px] max-h-[calc(95vh-200px)]"
                  >
                    <ReactCompareImage
                      leftImage={beforeImage}
                      rightImage={afterImage}
                      leftImageLabel="Before"
                      rightImageLabel="After"
                      sliderLineColor="rgb(139, 92, 246)"
                      sliderLineWidth={2}
                    />

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground pointer-events-none"
                    >
                      <ChevronLeft className="size-3" />
                      <span>Drag slider to compare • Press ESC to close</span>
                      <ChevronRight className="size-3" />
                    </motion.div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-6 space-y-4"
            >
              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Download Button with Format Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="lg"
                      disabled={isDownloading}
                      className="bg-primary hover:bg-primary/90"
                    >
                      {isDownloading ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          >
                            <Download className="size-4 mr-2" />
                          </motion.div>
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="size-4 mr-2" />
                          Download ({downloadFormat.toUpperCase()})
                        </>
                      )}
                      <ChevronDown className="size-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => {
                        setDownloadFormat("png")
                        handleDownload("png")
                      }}
                    >
                      {downloadFormat === "png" && (
                        <Check className="size-4 mr-2" />
                      )}
                      PNG (High Quality)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDownloadFormat("jpg")
                        handleDownload("jpg")
                      }}
                    >
                      {downloadFormat === "jpg" && (
                        <Check className="size-4 mr-2" />
                      )}
                      JPG (Compressed)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Save to Wardrobe */}
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleSaveToWardrobe}
                  className="flex-1 sm:flex-initial"
                >
                  {isAuthenticated ? (
                    <>
                      <Save className="size-4 mr-2" />
                      Save to Wardrobe
                    </>
                  ) : (
                    <>
                      <LogIn className="size-4 mr-2" />
                      Login to Save
                    </>
                  )}
                </Button>

                {/* Try Another */}
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleTryAnother}
                  className="flex-1 sm:flex-initial"
                >
                  <RefreshCw className="size-4 mr-2" />
                  Try Another Outfit
                </Button>
              </div>

              {/* Share Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground mr-2">
                  Share:
                </span>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleShare("twitter")}
                    className="flex items-center gap-2"
                  >
                    <Twitter className="size-4" />
                    <span className="hidden sm:inline">Twitter</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleShare("facebook")}
                    className="flex items-center gap-2"
                  >
                    <Facebook className="size-4" />
                    <span className="hidden sm:inline">Facebook</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleShare("pinterest")}
                    className="flex items-center gap-2"
                  >
                    <Pinterest className="size-4" />
                    <span className="hidden sm:inline">Pinterest</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleShare("instagram")}
                    className="flex items-center gap-2"
                  >
                    <Instagram className="size-4" />
                    <span className="hidden sm:inline">Instagram</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </DialogContent>
        )}
      </AnimatePresence>
    </Dialog>
  )
}

