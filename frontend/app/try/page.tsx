"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useDropzone, type FileRejection } from "react-dropzone"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
  Upload,
  Camera,
  X,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Loader2,
  Share2,
  Image as ImageIcon,
  FileImage,
  LogIn,
  Box,
  Trophy,
  Flame,
  Target,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { uploadApi, garmentsApi, tryonApi, userApi } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-error"
import { useAuth } from "@/lib/auth"
import { TIER_LABELS, TIER_TO_ALLOWED_MODES, type SubscriptionTier, type TryOnMode } from "@/lib/plans"
import { ProcessingStatus, type ProcessingStep } from "@/components/ProcessingStatus"
import { ResultsModal } from "@/components/ResultsModal"
import { MouseFollowGradient } from "@/components/ui/mouse-follow-gradient"
import { PhotoWizard } from "@/components/onboarding/PhotoWizard"

type ImageInfo = {
  url: string
  file: File
  width: number
  height: number
  size: number
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MIN_DIMENSION = 512
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"]

type QualityOption = "fast" | "balanced" | "best"

type QuotaSnapshot = {
  tier: string
  tier_label: string
  period: string
  limit: number | null
  used: number
  remaining: number | null
}

const qualityOptions: Array<{
  value: QualityOption
  label: string
  time: string
  description: string
  costUsd: string
  xp: number
}> = [
  // Cost / time figures track Fashn pricing + our Layer-2 stack:
  // fast = single sample, no postprocess; balanced = 2 samples + identity
  // check + GFPGAN + Real-ESRGAN; best = tryon-max + full Layer-2.
  { value: "fast", label: "Fast", time: "8-15s", description: "One pass, instant preview", costUsd: "$0.04", xp: 10 },
  { value: "balanced", label: "Balanced", time: "30-45s", description: "Multi-sample + identity match", costUsd: "$0.08", xp: 20 },
  { value: "best", label: "Best", time: "60-90s", description: "Highest fidelity, hero-ready", costUsd: "$0.18", xp: 30 },
]

const fastProcessingSteps: ProcessingStep[] = [
  {
    id: 0,
    name: "Uploading images",
    description: "Preparing your photos...",
    icon: Upload,
    completed: false,
    inProgress: false,
  },
  {
    id: 1,
    name: "Analyzing garment",
    description: "Preparing garment input...",
    icon: FileImage,
    completed: false,
    inProgress: false,
  },
  {
    id: 2,
    name: "Generating try-on",
    description: "Running OOTDiffusion only...",
    icon: Star,
    completed: false,
    inProgress: false,
  },
  {
    id: 3,
    name: "Complete!",
    description: "Your try-on is ready",
    icon: Trophy,
    completed: false,
    inProgress: false,
  },
]

// Helper functions
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}

const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = reject
    img.src = url
  })
}

const validateImage = (file: File): { valid: boolean; error?: string } => {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${formatFileSize(MAX_FILE_SIZE)}. Your file is ${formatFileSize(file.size)}.`,
    }
  }

  // Check file type
  const fileExtension = "." + file.name.split(".").pop()?.toLowerCase()
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
    return {
      valid: false,
      error: "Invalid file format. Please use JPG, PNG, or WEBP images.",
    }
  }

  return { valid: true }
}

const validateImageDimensions = async (url: string): Promise<{ valid: boolean; error?: string; width?: number; height?: number }> => {
  try {
    const { width, height } = await getImageDimensions(url)
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      return {
        valid: false,
        error: `Image dimensions too small. Minimum ${MIN_DIMENSION}x${MIN_DIMENSION}px. Your image is ${width}x${height}px.`,
        width,
        height,
      }
    }
    return { valid: true, width, height }
  } catch {
    return {
      valid: false,
      error: "Failed to load image. Please try another file.",
    }
  }
}

// Sample images (SVG data URIs)
const createSampleImage = (width: number, height: number, label: string): string => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#8b5cf6;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad)"/>
      <text x="50%" y="45%" text-anchor="middle" font-family="system-ui" font-size="24" font-weight="bold" fill="white">Sample ${label}</text>
      <text x="50%" y="55%" text-anchor="middle" font-family="system-ui" font-size="16" fill="rgba(255,255,255,0.8)">${width}x${height}px</text>
    </svg>
  `
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

const samplePersonImage = createSampleImage(512, 768, "Person")
const sampleGarmentImage = createSampleImage(512, 512, "Garment")

export default function TryOnPage() {
  const [personImage, setPersonImage] = useState<ImageInfo | null>(null)
  const [garmentImage, setGarmentImage] = useState<ImageInfo | null>(null)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [resultModelUrl, setResultModelUrl] = useState<string | null>(null)
  const [resultTurntableUrl, setResultTurntableUrl] = useState<string | null>(null)
  // Track the garment + try-on ids so the results modal can render the
  // "Buy this" affiliate CTA for the exact item that was tried on.
  const [resultGarmentId, setResultGarmentId] = useState<number | null>(null)
  const [resultTryonId, setResultTryonId] = useState<number | null>(null)
  const [tryonMode, setTryonMode] = useState<TryOnMode>("2d")
  const [quality, setQuality] = useState<QualityOption>("balanced")
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [showResult, setShowResult] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [personRotation, setPersonRotation] = useState(0)
  const [personZoom, setPersonZoom] = useState(1)
  const [garmentRotation, setGarmentRotation] = useState(0)
  const [garmentZoom, setGarmentZoom] = useState(1)
  const [, setStatusMessage] = useState("")
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0)
  const [isSavingMode, setIsSavingMode] = useState(false)
  const [quotaSnapshot, setQuotaSnapshot] = useState<QuotaSnapshot | null>(null)
  const estimatedTimeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auth
  const { isAuthenticated, user, login, register, logout, loadUser } = useAuth()
  const [photoWizardOpen, setPhotoWizardOpen] = useState(false)
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginFullName, setLoginFullName] = useState("")
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [registerTier, setRegisterTier] = useState<SubscriptionTier>("free_2d")
  const [registerPreferredMode, setRegisterPreferredMode] = useState<TryOnMode>("2d")
  const [registerAvatarFile, setRegisterAvatarFile] = useState<File | null>(null)
  const [registerAvatarHeightCm, setRegisterAvatarHeightCm] = useState("")
  const [registerAvatarBodyType, setRegisterAvatarBodyType] = useState("")
  const [registerAvatarGender, setRegisterAvatarGender] = useState("")
  const [registerAvatarNotes, setRegisterAvatarNotes] = useState("")

  // Chrome extension query params
  const searchParams = useSearchParams()

  const currentTier = (user?.subscription_tier || "free_2d") as SubscriptionTier
  const allowedModes = TIER_TO_ALLOWED_MODES[currentTier] || ["2d"]
  const savedPersonPhotoUrl = user?.default_person_image_url ?? null
  const savedPersonThumbUrl =
    user?.default_person_smart_crop_url ?? user?.default_person_image_url ?? null
  // When a saved photo exists and the user hasn't explicitly uploaded a
  // different one, we hide the person dropzone entirely. The backend
  // automatically substitutes `default_person_image_url` when the
  // request omits `person_image_url`.
  const usingSavedPhoto =
    isAuthenticated && tryonMode === "2d" && !!savedPersonPhotoUrl && !personImage
  const registerAllowedModes = TIER_TO_ALLOWED_MODES[registerTier] || ["2d"]
  const registerHas3d = registerAllowedModes.includes("3d")
  const sessionXp =
    (personImage ? 20 : 0) +
    (garmentImage ? 20 : 0) +
    (tryonMode === "3d" ? 35 : 20) +
    (quality === "best" ? 30 : quality === "balanced" ? 20 : 10)
  const sessionLevel = Math.max(1, Math.floor(sessionXp / 40) + 1)
  const nextSessionLevelXp = sessionLevel * 40
  const sessionLevelProgress = Math.round(((sessionXp - (sessionLevel - 1) * 40) / 40) * 100)

  const missionSteps = [
    {
      label: "Upload person image",
      done: !!personImage,
    },
    {
      label: "Upload garment image",
      done: !!garmentImage,
    },
    {
      label: "Generate your look",
      done: !!resultImage,
    },
  ]

  const missionProgress = Math.round(
    (missionSteps.filter((step) => step.done).length / missionSteps.length) * 100
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Handle ?image= query param from Chrome extension
  useEffect(() => {
    const imageUrl = searchParams.get("image")
    if (imageUrl && !garmentImage) {
      setGarmentImage({
        url: imageUrl,
        file: new File([], "from-extension.jpg"),
        width: 0,
        height: 0,
        size: 0,
      })
      toast.success("Garment image loaded from extension!")
    }

    const requestedMode = searchParams.get("mode")
    if (requestedMode === "2d" || requestedMode === "3d") {
      setTryonMode(requestedMode)
      return
    }

    if (isAuthenticated && user?.preferred_tryon_mode) {
      setTryonMode(user.preferred_tryon_mode)
    }
  }, [searchParams, garmentImage, isAuthenticated, user?.preferred_tryon_mode])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      if (estimatedTimeIntervalRef.current) {
        clearInterval(estimatedTimeIntervalRef.current)
      }
    }
  }, [])

  // Keyboard shortcuts -- F/B/Q switch the quality lane, Enter
  // submits when both inputs are ready. We bail out when the user is
  // typing into an input so we never hijack normal text entry.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName?.toLowerCase()
        if (tag === "input" || tag === "textarea" || target.isContentEditable) {
          return
        }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === "q") {
        event.preventDefault()
        setQuality("balanced")
      } else if (key === "f") {
        event.preventDefault()
        setQuality("fast")
      } else if (key === "b") {
        event.preventDefault()
        setQuality("best")
      } else if (key === "enter" && !isProcessing) {
        if (garmentImage && (personImage || savedPersonPhotoUrl)) {
          event.preventDefault()
          void handleGenerate()
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, garmentImage, personImage, savedPersonPhotoUrl])

  // Handle login/register
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    try {
      if (isRegisterMode) {
        if (registerPreferredMode === "3d" && !registerAvatarFile) {
          toast.error("Please upload a person image for 3D avatar setup")
          setLoginLoading(false)
          return
        }

        await register({
          email: loginEmail,
          password: loginPassword,
          fullName: loginFullName || undefined,
          subscriptionTier: registerTier,
          preferredMode: registerPreferredMode,
        })

        if (registerPreferredMode === "3d" && registerAvatarFile) {
          const uploaded = await uploadApi.uploadImage(registerAvatarFile)
          await userApi.buildAvatar({
            person_image_url: uploaded.data.url,
            quality: "best",
            height_cm: registerAvatarHeightCm ? Number(registerAvatarHeightCm) : undefined,
            body_type: registerAvatarBodyType || undefined,
            gender: registerAvatarGender || undefined,
            notes: registerAvatarNotes || undefined,
          })
          await loadUser()
          toast.success("3D avatar created")
        }

        toast.success("Account created! Welcome!")
      } else {
        await login(loginEmail, loginPassword)
        toast.success("Logged in!")
      }
      setShowLoginForm(false)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Authentication failed"))
    } finally {
      setLoginLoading(false)
    }
  }

  const handleModeSelection = async (mode: TryOnMode) => {
    if (!isAuthenticated) {
      setShowLoginForm(true)
      toast.info("Log in to choose 2D or 3D mode")
      return
    }

    if (!allowedModes.includes(mode)) {
      toast.error(`Your ${TIER_LABELS[currentTier]} plan does not include ${mode.toUpperCase()} mode`)
      return
    }

    setTryonMode(mode)
    setIsSavingMode(true)
    try {
      await userApi.updatePreferences({ preferred_tryon_mode: mode })
      toast.success(`Switched to ${mode.toUpperCase()} mode`)
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Could not save mode preference"))
    } finally {
      setIsSavingMode(false)
    }
  }

  // Handle image upload with validation
  const handleImageUpload = async (
    file: File,
    type: "person" | "garment"
  ): Promise<void> => {
    // Validate file
    const validation = validateImage(file)
    if (!validation.valid) {
      toast.error(validation.error || "Invalid image file")
      return
    }

    // Read file
    const reader = new FileReader()
    reader.onload = async () => {
      const url = reader.result as string
      
      // Validate dimensions
      const dimensionValidation = await validateImageDimensions(url)
      if (!dimensionValidation.valid) {
        toast.error(dimensionValidation.error || "Invalid image dimensions")
        return
      }

      // Set image info
      const imageInfo: ImageInfo = {
        url,
        file,
        width: dimensionValidation.width!,
        height: dimensionValidation.height!,
        size: file.size,
      }

      if (type === "person") {
        setPersonImage(imageInfo)
        toast.success("Person image uploaded successfully!")
      } else {
        setGarmentImage(imageInfo)
        toast.success("Garment image uploaded successfully!")
      }
      setError(null)
    }
    reader.readAsDataURL(file)
  }

  // Person image dropzone
  const onDropPerson = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0]
        if (rejection.errors[0]?.code === "file-too-large") {
          toast.error(`File is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`)
        } else if (rejection.errors[0]?.code === "file-invalid-type") {
          toast.error("Invalid file type. Please use JPG, PNG, or WEBP.")
        } else {
          toast.error("Failed to upload image. Please try again.")
        }
        return
      }

      const file = acceptedFiles[0]
      if (file) {
        handleImageUpload(file, "person")
      }
    },
    []
  )

  const { getRootProps: getPersonRootProps, getInputProps: getPersonInputProps, isDragActive: isPersonDragActive } = useDropzone({
    onDrop: onDropPerson,
    accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] },
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  })

  // Garment image dropzone
  const onDropGarment = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0]
        if (rejection.errors[0]?.code === "file-too-large") {
          toast.error(`File is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`)
        } else if (rejection.errors[0]?.code === "file-invalid-type") {
          toast.error("Invalid file type. Please use JPG, PNG, or WEBP.")
        } else {
          toast.error("Failed to upload image. Please try again.")
        }
        return
      }

      const file = acceptedFiles[0]
      if (file) {
        handleImageUpload(file, "garment")
      }
    },
    []
  )

  const { getRootProps: getGarmentRootProps, getInputProps: getGarmentInputProps, isDragActive: isGarmentDragActive } = useDropzone({
    onDrop: onDropGarment,
    accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] },
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  })

  // Camera capture
  const handleTakePhoto = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImageUpload(file, "person")
    }
  }

  // Load sample images
  const handleLoadSample = async (type: "person" | "garment") => {
    const sampleUrl = type === "person" ? samplePersonImage : sampleGarmentImage
    const dimensions = await getImageDimensions(sampleUrl)
    
    // Create a fake File object for sample images
    const response = await fetch(sampleUrl)
    const blob = await response.blob()
    const file = new File([blob], `sample-${type}.svg`, { type: "image/svg+xml" })

    const imageInfo: ImageInfo = {
      url: sampleUrl,
      file,
      width: dimensions.width,
      height: dimensions.height,
      size: blob.size,
    }

    if (type === "person") {
      setPersonImage(imageInfo)
      toast.success("Sample person image loaded!")
    } else {
      setGarmentImage(imageInfo)
      toast.success("Sample garment image loaded!")
    }
  }

  // Image controls
  const handleRotate = (type: "person" | "garment") => {
    if (type === "person") {
      setPersonRotation((prev) => (prev + 90) % 360)
    } else {
      setGarmentRotation((prev) => (prev + 90) % 360)
    }
  }

  const handleZoom = (type: "person" | "garment", delta: number) => {
    if (type === "person") {
      setPersonZoom((prev) => Math.max(0.5, Math.min(3, prev + delta)))
    } else {
      setGarmentZoom((prev) => Math.max(0.5, Math.min(3, prev + delta)))
    }
  }

  // Generate try-on
  const handleGenerate = async () => {
    const canReuseAvatar = tryonMode === "3d" && user?.avatar_status === "ready"
    const canReuseSavedPhoto = tryonMode === "2d" && !!savedPersonPhotoUrl
    const needsPersonImage =
      (tryonMode === "2d" && !canReuseSavedPhoto) ||
      (tryonMode === "3d" && !canReuseAvatar)
    const personImageMissing = needsPersonImage && !personImage

    if (!garmentImage || personImageMissing) {
      const message = personImageMissing
        ? "Please upload both person and garment images"
        : "Please upload a garment image"
      toast.error(message)
      setError(message)
      return
    }

    if (!isAuthenticated) {
      setShowLoginForm(true)
      toast.error("Please log in to generate try-ons")
      return
    }

    if (!allowedModes.includes(tryonMode)) {
      toast.error(`Your ${TIER_LABELS[currentTier]} plan does not include ${tryonMode.toUpperCase()} mode`)
      return
    }

    setIsProcessing(true)
    setProcessingProgress(0)
    setCurrentStep(0)
    setError(null)

    // Set estimated time based on quality
    const timeEstimates: Record<QualityOption, number> = { fast: 30, balanced: 60, best: 120 }
    const totalTime = timeEstimates[quality]
    setEstimatedTimeRemaining(totalTime)

    // Start countdown
    if (estimatedTimeIntervalRef.current) clearInterval(estimatedTimeIntervalRef.current)
    estimatedTimeIntervalRef.current = setInterval(() => {
      setEstimatedTimeRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)

    setStatusMessage("Uploading images...")

    try {
      // Step 1: Upload person image only when we don't already have a
      // saved default photo. With a saved photo we leave the field
      // undefined and the backend route fills it in.
      setCurrentStep(0)
      setProcessingProgress(5)
      let personImageUrl: string | undefined = undefined
      if (needsPersonImage && personImage) {
        const personUpload = await uploadApi.uploadImage(personImage.file)
        personImageUrl = personUpload.data.url
      } else if (personImage) {
        // User explicitly uploaded a different photo; honour their
        // override even when a saved default exists.
        const personUpload = await uploadApi.uploadImage(personImage.file)
        personImageUrl = personUpload.data.url
      }

      // Step 2: Upload garment and create garment record
      setCurrentStep(1)
      setProcessingProgress(15)
      setStatusMessage("Processing garment...")
      const garmentUpload = await uploadApi.uploadGarment(garmentImage.file)
      const garmentRecord = await garmentsApi.create({
        name: garmentImage.file.name || "Garment",
        image_url: garmentUpload.data.url,
        s3_key: garmentUpload.data.s3_key,
        saved_to_closet: false,
      })
      setResultGarmentId(garmentRecord.data.id)

      // Step 3: Start try-on generation
      setCurrentStep(2)
      setProcessingProgress(25)
      setStatusMessage("Starting AI pipeline...")
      const generateResponse = await tryonApi.generate(
        garmentRecord.data.id,
        personImageUrl,
        quality,
        tryonMode
      )
      const initialQuota = generateResponse?.data?.data?.quota
      if (initialQuota) {
        setQuotaSnapshot(initialQuota)
      }
      const tryonId = generateResponse.data.data.tryon_id
      setResultTryonId(tryonId)

      // Step 4: Poll for status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusResponse = await tryonApi.getStatus(tryonId)
          const statusData = statusResponse.data.data

          setProcessingProgress(statusData.progress)
          setStatusMessage(statusData.current_stage)

          // Map progress to step index. Fast 2D stays OOT-only with no enhance step.
          const effectiveQuality = (statusData?.pipeline_metadata?.quality_effective as QualityOption | undefined) || quality
          const isFast2DExecution = tryonMode === "2d" && effectiveQuality === "fast"
          if (isFast2DExecution) {
            if (statusData.progress < 20) setCurrentStep(1)
            else if (statusData.progress < 100) setCurrentStep(2)
            else setCurrentStep(3)
          } else {
            if (statusData.progress < 25) setCurrentStep(2)
            else if (statusData.progress < 50) setCurrentStep(2)
            else if (statusData.progress < 75) setCurrentStep(3)
            else if (statusData.progress < 100) setCurrentStep(3)
            else setCurrentStep(4)
          }

          if (statusData.status === "completed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            if (estimatedTimeIntervalRef.current) clearInterval(estimatedTimeIntervalRef.current)
            setCurrentStep(isFast2DExecution ? 3 : 4)
            setResultImage(statusData.result_image_url)
            setResultModelUrl(statusData.result_model_url || null)
            setResultTurntableUrl(statusData.result_turntable_url || null)
            setShowResult(true)
            setIsProcessing(false)
            setEstimatedTimeRemaining(0)
            toast.success("Try-on complete!")
          } else if (statusData.status === "failed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            if (estimatedTimeIntervalRef.current) clearInterval(estimatedTimeIntervalRef.current)
            setError(statusData.error_message || "Generation failed")
            setIsProcessing(false)
            setEstimatedTimeRemaining(0)
            toast.error(statusData.error_message || "Generation failed")
          }
        } catch {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          if (estimatedTimeIntervalRef.current) clearInterval(estimatedTimeIntervalRef.current)
          setError("Lost connection to server")
          setIsProcessing(false)
          setEstimatedTimeRemaining(0)
        }
      }, 3000)

    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to start generation"))
      setIsProcessing(false)
      setEstimatedTimeRemaining(0)
      if (estimatedTimeIntervalRef.current) clearInterval(estimatedTimeIntervalRef.current)
      toast.error("Failed to start generation")
    }
  }

  const handleClear = (type: "person" | "garment") => {
    if (type === "person") {
      setPersonImage(null)
      setPersonRotation(0)
      setPersonZoom(1)
      toast.info("Person image removed")
    } else {
      setGarmentImage(null)
      setGarmentRotation(0)
      setGarmentZoom(1)
      toast.info("Garment image removed")
    }
  }


  const handleCancelGeneration = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (estimatedTimeIntervalRef.current) {
      clearInterval(estimatedTimeIntervalRef.current)
      estimatedTimeIntervalRef.current = null
    }
    setIsProcessing(false)
    setProcessingProgress(0)
    setCurrentStep(0)
    setStatusMessage("")
    setEstimatedTimeRemaining(0)
    toast.info("Generation cancelled")
  }

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_8%,oklch(0.76_0.09_250/.24),transparent_52%),radial-gradient(circle_at_88%_16%,oklch(0.76_0.08_190/.2),transparent_56%)]" />
      <MouseFollowGradient />
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-2">
            Virtual Try-On
          </h1>
          <p className="text-muted-foreground text-base md:text-lg">
            Upload your photo and a garment to see how it looks on you
          </p>
        </motion.div>

        {/* Auth Bar */}
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-white/80 px-3 py-2 shadow-sm">
            <Box className="size-4 text-primary" />
            <span className="text-xs text-muted-foreground">{TIER_LABELS[currentTier]}</span>
            <div className="flex items-center gap-1">
              {(["2d", "3d"] as TryOnMode[]).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={tryonMode === mode ? "default" : "outline"}
                  disabled={!allowedModes.includes(mode) || isSavingMode}
                  onClick={() => void handleModeSelection(mode)}
                  className="h-7 px-2 uppercase"
                >
                  {mode}
                </Button>
              ))}
            </div>
          </div>

          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {user?.email}
              </span>
              <Button variant="outline" size="sm" onClick={logout}>
                Log Out
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setShowLoginForm(true)}>
              <LogIn className="size-4 mr-2" />
              Log In to Generate
            </Button>
          )}
        </div>

        {quotaSnapshot && quotaSnapshot.limit !== null ? (
          <div className="mb-6 text-xs text-muted-foreground">
            Usage: {quotaSnapshot.used}/{quotaSnapshot.limit} this {quotaSnapshot.period}. Remaining {quotaSnapshot.remaining}.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card className="bg-gradient-to-br from-fuchsia-50 to-pink-50 border-fuchsia-200/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.13em] text-fuchsia-700/80">Session XP</p>
                <Trophy className="size-4 text-amber-500" />
              </div>
              <p className="mt-1 text-2xl font-semibold text-fuchsia-900">{sessionXp}</p>
              <p className="text-xs text-muted-foreground mt-1">Level {sessionLevel} · next at {nextSessionLevelXp}</p>
              <Progress className="mt-2" value={Math.max(0, Math.min(100, sessionLevelProgress))} />
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-sky-50 to-cyan-50 border-sky-200/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.13em] text-sky-700/80">Mission Board</p>
                <Target className="size-4 text-sky-600" />
              </div>
              <div className="mt-2 space-y-2">
                {missionSteps.map((step) => (
                  <div key={step.label} className="flex items-center justify-between text-sm">
                    <span>{step.label}</span>
                    <Badge className={step.done ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-white/80 text-muted-foreground border-border/70"}>
                      {step.done ? "Done" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Progress {missionProgress}%</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.13em] text-amber-700/80">Avatar Track</p>
                <Flame className="size-4 text-rose-500" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {tryonMode === "3d"
                  ? "3D mode selected. You are in avatar pipeline mode."
                  : "2D mode selected. Switch to 3D for avatar-based fitting."}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Badge className="bg-white/80 text-foreground border-border/70">{TIER_LABELS[currentTier]}</Badge>
                <Badge className="bg-white/80 text-foreground border-border/70">
                  <Star className="size-3 mr-1" />
                  {tryonMode.toUpperCase()} Active
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Left Column - Person Photo */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Your Photo</h2>

              {usingSavedPhoto ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-4 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4">
                    <div className="size-16 overflow-hidden rounded-lg border border-border/70 bg-muted">
                      {savedPersonThumbUrl ? (
                        <img
                          src={savedPersonThumbUrl}
                          alt="Your saved photo"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Using your saved photo</p>
                      <p className="text-xs text-muted-foreground">
                        We pre-cached your face crop so this run skips the
                        input gate.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPhotoWizardOpen(true)}
                    >
                      Change saved photo
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleTakePhoto}
                    >
                      Use a different photo just for this run
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCameraCapture}
                    className="hidden"
                  />
                </motion.div>
              ) : !personImage ? (
                <div className="space-y-4">
                  <div
                    {...getPersonRootProps()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300",
                      isPersonDragActive
                        ? "border-primary bg-primary/10 scale-[1.02] shadow-lg ring-2 ring-primary/20"
                        : "border-border hover:border-primary/50 hover:bg-muted/50 hover:scale-[1.01]"
                    )}
                  >
                    <input {...getPersonInputProps()} />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleCameraCapture}
                      className="hidden"
                    />
                    <AnimatePresence mode="wait">
                      {isPersonDragActive ? (
                        <motion.div
                          key="drag-active"
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.9, opacity: 0 }}
                        >
                          <motion.div
                            animate={{ y: [0, -8, 0], rotate: [0, 3, -3, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
                          >
                            <Upload className="size-12 mx-auto mb-4 text-primary" />
                          </motion.div>
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm font-semibold mb-2 text-primary"
                          >
                            Drop your photo here
                          </motion.p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="drag-idle"
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.9, opacity: 0 }}
                        >
                          <Upload className="size-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="text-sm font-medium mb-2">
                            Drag & drop your photo or click to browse
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <p className="text-xs text-muted-foreground mb-4">
                      JPG, PNG, WEBP • Max {formatFileSize(MAX_FILE_SIZE)} • Min {MIN_DIMENSION}x{MIN_DIMENSION}px
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTakePhoto()
                        }}
                        className="flex-1"
                      >
                        <Camera className="size-4 mr-2" />
                        Take Photo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleLoadSample("person")
                        }}
                        className="flex-1"
                      >
                        <FileImage className="size-4 mr-2" />
                        Sample Image
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  {/* Thumbnail Preview with Info */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative group"
                  >
                    <div
                      {...getPersonRootProps()}
                      className={cn(
                        "relative border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all duration-300",
                        isPersonDragActive
                          ? "border-primary bg-primary/10 scale-[1.02]"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <input {...getPersonInputProps()} />
                      <div className="flex items-center gap-4">
                        {/* Thumbnail */}
                        <div className="relative flex-shrink-0">
                          <div className="relative w-20 h-24 rounded-md overflow-hidden bg-muted border border-border">
                            <img
                              src={personImage.url}
                              alt="Person thumbnail"
                              className="w-full h-full object-cover"
                              style={{
                                transform: `rotate(${personRotation}deg) scale(${personZoom})`,
                                transition: "transform 0.3s ease",
                              }}
                            />
                          </div>
                          {/* Remove button */}
                          <motion.button
                            className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full shadow-lg z-10"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleClear("person")
                            }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            title="Remove image"
                          >
                            <X className="size-3" />
                          </motion.button>
                        </div>
                        
                        {/* Image Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="size-4 text-primary flex-shrink-0" />
                            <p className="text-sm font-medium truncate">Your Photo</p>
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center justify-between gap-2">
                              <span>Dimensions:</span>
                              <span className="font-medium text-foreground">
                                {personImage.width} × {personImage.height}px
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>Size:</span>
                              <span className="font-medium text-foreground">
                                {formatFileSize(personImage.size)}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Click or drag to replace
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                  
                  {/* Image Controls */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRotate("person")}
                        title="Rotate"
                      >
                        <RotateCw className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleZoom("person", -0.1)}
                        disabled={personZoom <= 0.5}
                        title="Zoom Out"
                      >
                        <ZoomOut className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleZoom("person", 0.1)}
                        disabled={personZoom >= 3}
                        title="Zoom In"
                      >
                        <ZoomIn className="size-4" />
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.click()
                        }
                      }}
                    >
                      <Upload className="size-4 mr-2" />
                      Replace
                    </Button>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Right Column - Garment Photo */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Garment</h2>
              
              {!garmentImage ? (
                <>
                  <div
                    {...getGarmentRootProps()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300 mb-4",
                      isGarmentDragActive
                        ? "border-primary bg-primary/10 scale-[1.02] shadow-lg ring-2 ring-primary/20"
                        : "border-border hover:border-primary/50 hover:bg-muted/50 hover:scale-[1.01]"
                    )}
                  >
                    <input {...getGarmentInputProps()} />
                    <AnimatePresence mode="wait">
                      {isGarmentDragActive ? (
                        <motion.div
                          key="drag-active"
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.9, opacity: 0 }}
                        >
                          <motion.div
                            animate={{ y: [0, -8, 0], rotate: [0, 3, -3, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
                          >
                            <Upload className="size-12 mx-auto mb-4 text-primary" />
                          </motion.div>
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm font-semibold mb-2 text-primary"
                          >
                            Drop garment image here
                          </motion.p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="drag-idle"
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.9, opacity: 0 }}
                        >
                          <Upload className="size-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="text-sm font-medium mb-2">
                            Drag & drop garment or click to browse
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <p className="text-xs text-muted-foreground mb-4">
                      JPG, PNG, WEBP • Max {formatFileSize(MAX_FILE_SIZE)} • Min {MIN_DIMENSION}x{MIN_DIMENSION}px
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLoadSample("garment")
                      }}
                      className="w-full"
                    >
                      <FileImage className="size-4 mr-2" />
                      Use Sample Image
                    </Button>
                  </div>
                  
                  {/* Browser Extension Callout */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Share2 className="size-5 text-primary mt-0.5" />
                          <div className="flex-1">
                            <h3 className="font-semibold text-sm mb-1">
                              Use our browser extension
                            </h3>
                            <p className="text-xs text-muted-foreground mb-3">
                              Try on clothes directly from any online store
                            </p>
                            <Button variant="outline" size="sm" className="w-full">
                              Install Extension
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  {/* Thumbnail Preview with Info */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative group"
                  >
                    <div
                      {...getGarmentRootProps()}
                      className={cn(
                        "relative border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all duration-300",
                        isGarmentDragActive
                          ? "border-primary bg-primary/10 scale-[1.02]"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <input {...getGarmentInputProps()} />
                      <div className="flex items-center gap-4">
                        {/* Thumbnail */}
                        <div className="relative flex-shrink-0">
                          <div className="relative w-20 h-20 rounded-md overflow-hidden bg-muted border border-border">
                            <img
                              src={garmentImage.url}
                              alt="Garment thumbnail"
                              className="w-full h-full object-cover"
                              style={{
                                transform: `rotate(${garmentRotation}deg) scale(${garmentZoom})`,
                                transition: "transform 0.3s ease",
                              }}
                            />
                          </div>
                          {/* Remove button */}
                          <motion.button
                            className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full shadow-lg z-10"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleClear("garment")
                            }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            title="Remove image"
                          >
                            <X className="size-3" />
                          </motion.button>
                        </div>
                        
                        {/* Image Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="size-4 text-primary flex-shrink-0" />
                            <p className="text-sm font-medium truncate">Garment</p>
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center justify-between gap-2">
                              <span>Dimensions:</span>
                              <span className="font-medium text-foreground">
                                {garmentImage.width} × {garmentImage.height}px
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>Size:</span>
                              <span className="font-medium text-foreground">
                                {formatFileSize(garmentImage.size)}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Click or drag to replace
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Section - Quality Selector & Generate Button */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* Quality Selector */}
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Label className="text-base font-semibold">
                    Quality lane
                  </Label>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Press Q · B · F to switch
                  </span>
                </div>
                <div className="relative grid grid-cols-3 gap-3">
                  {qualityOptions.map((option) => {
                    const active = quality === option.value
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "relative isolate flex flex-col items-start gap-1 p-4 border-2 rounded-xl cursor-pointer transition-colors",
                          active
                            ? "border-transparent text-primary"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        {active ? (
                          <motion.span
                            layoutId="quality-lane-bg"
                            className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-primary/15 via-sky-400/10 to-emerald-300/10 ring-2 ring-primary/40"
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                          />
                        ) : null}
                        <input
                          type="radio"
                          name="quality"
                          value={option.value}
                          checked={active}
                          onChange={(e) =>
                            setQuality(e.target.value as QualityOption)
                          }
                          className="sr-only"
                        />
                        <span className="font-semibold text-foreground">{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="rounded-md bg-white/70 px-1.5 py-0.5 font-medium text-foreground">
                            {option.time}
                          </span>
                          <span className="rounded-md bg-white/70 px-1.5 py-0.5 font-medium text-foreground">
                            {option.costUsd}
                          </span>
                        </div>
                        <span className="mt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          +{option.xp} XP
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={
                  !garmentImage ||
                  isProcessing ||
                  (tryonMode === "2d"
                    ? !(personImage || savedPersonPhotoUrl)
                    : !(personImage || user?.avatar_status === "ready"))
                }
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary via-sky-500 to-emerald-400 hover:opacity-95"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="size-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  tryonMode === "3d" ? "Generate 3D Try-On + Earn XP" : "Generate 2D Try-On + Earn XP"
                )}
              </Button>

              <p className="text-xs text-muted-foreground">
                {tryonMode === "3d"
                  ? "3D mode uses SMPL + PIFuHD avatar fitting with 360 model output."
                  : "2D mode uses OOTDiffusion pipeline for fast photorealistic try-ons."}
              </p>

              {/* Processing Status */}
              <AnimatePresence>
                {isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <ProcessingStatus
                      progress={processingProgress}
                      currentStep={currentStep}
                      estimatedTimeRemaining={estimatedTimeRemaining}
                      onCancel={handleCancelGeneration}
                      steps={tryonMode === "2d" && quality === "fast" ? fastProcessingSteps : undefined}
                      isCompleted={!isProcessing && resultImage !== null}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Modal */}
      <ResultsModal
        open={showResult}
        onOpenChange={setShowResult}
        beforeImage={personImage?.url || savedPersonThumbUrl || ""}
        afterImage={resultImage || ""}
        resultMode={tryonMode}
        modelUrl={resultModelUrl || undefined}
        turntableUrl={resultTurntableUrl || undefined}
        garmentId={resultGarmentId ?? undefined}
        tryonId={resultTryonId ?? undefined}
        onTryAnother={() => {
          // "Try another outfit" only resets the garment slot when the
          // user has a saved photo -- the whole point of the persistent
          // photo is they shouldn't have to re-upload between runs.
          if (!savedPersonPhotoUrl) {
            handleClear("person")
          }
          handleClear("garment")
          setResultImage(null)
          setResultModelUrl(null)
          setResultTurntableUrl(null)
          setResultGarmentId(null)
          setResultTryonId(null)
          setShowResult(false)
        }}
        isAuthenticated={isAuthenticated}
        onLogin={() => setShowLoginForm(true)}
      />

      <PhotoWizard
        open={photoWizardOpen}
        onOpenChange={setPhotoWizardOpen}
        initialPhoto={
          user?.default_person_image_url
            ? {
                url: user.default_person_image_url,
                smart_crop_url: user.default_person_smart_crop_url ?? null,
                face_url: user.default_person_face_url ?? null,
                uploaded_at: user.default_person_uploaded_at ?? null,
                gate: (user.default_person_input_gate_metrics as
                  | {
                      passed: boolean
                      reasons: string[]
                      smart_cropped: boolean
                      metrics: Record<string, unknown>
                    }
                  | null) ?? null,
                has_embedding: false,
              }
            : null
        }
      />
      {/* Login Dialog */}
      <Dialog open={showLoginForm} onOpenChange={setShowLoginForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRegisterMode ? "Create Account" : "Log In"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAuth} className="space-y-4">
            {isRegisterMode && (
              <>
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <input
                    id="fullName"
                    type="text"
                    value={loginFullName}
                    onChange={(e) => setLoginFullName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <Label htmlFor="signupTier">Plan Tier</Label>
                  <select
                    id="signupTier"
                    value={registerTier}
                    onChange={(e) => {
                      const tier = e.target.value as SubscriptionTier
                      setRegisterTier(tier)
                      const nextModes = TIER_TO_ALLOWED_MODES[tier] || ["2d"]
                      if (!nextModes.includes(registerPreferredMode)) {
                        setRegisterPreferredMode(nextModes[0])
                      }
                    }}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  >
                    {(Object.keys(TIER_LABELS) as SubscriptionTier[]).map((tier) => (
                      <option key={tier} value={tier}>
                        {TIER_LABELS[tier]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="signupMode">Preferred Try-On Mode</Label>
                  <select
                    id="signupMode"
                    value={registerPreferredMode}
                    onChange={(e) => setRegisterPreferredMode(e.target.value as TryOnMode)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  >
                    {registerAllowedModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {registerHas3d && registerPreferredMode === "3d" ? (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-sm font-medium">3D Avatar Setup</p>
                    <div>
                      <Label htmlFor="signupAvatarImage">Person Image</Label>
                      <input
                        id="signupAvatarImage"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setRegisterAvatarFile(e.target.files?.[0] ?? null)}
                        className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                      />
                    </div>
                    <div>
                      <Label htmlFor="signupAvatarHeight">Height (cm)</Label>
                      <input
                        id="signupAvatarHeight"
                        type="number"
                        min="100"
                        max="250"
                        value={registerAvatarHeightCm}
                        onChange={(e) => setRegisterAvatarHeightCm(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                        placeholder="170"
                      />
                    </div>
                    <div>
                      <Label htmlFor="signupAvatarBodyType">Body Type</Label>
                      <input
                        id="signupAvatarBodyType"
                        type="text"
                        value={registerAvatarBodyType}
                        onChange={(e) => setRegisterAvatarBodyType(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                        placeholder="athletic / slim / regular"
                      />
                    </div>
                    <div>
                      <Label htmlFor="signupAvatarGender">Gender</Label>
                      <input
                        id="signupAvatarGender"
                        type="text"
                        value={registerAvatarGender}
                        onChange={(e) => setRegisterAvatarGender(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                        placeholder="woman / man / non-binary"
                      />
                    </div>
                    <div>
                      <Label htmlFor="signupAvatarNotes">Fit Notes</Label>
                      <input
                        id="signupAvatarNotes"
                        type="text"
                        value={registerAvatarNotes}
                        onChange={(e) => setRegisterAvatarNotes(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                        placeholder="broad shoulders, longer torso, etc."
                      />
                    </div>
                  </div>
                ) : null}
              </>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <input
                id="email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <input
                id="password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                placeholder="Enter password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loginLoading}>
              {loginLoading ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : null}
              {isRegisterMode ? "Create Account" : "Log In"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {isRegisterMode ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setIsRegisterMode(!isRegisterMode)}
              >
                {isRegisterMode ? "Log In" : "Sign Up"}
              </button>
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

