"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import {
  Sparkles,
  Shirt,
  History,
  Settings,
  Camera,
  Plus,
  LogOut,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { garmentsApi, tryonApi, uploadApi } from "@/lib/api"
import { toast } from "sonner"

export default function Page() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()

  const [garments, setGarments] = useState<any[]>([])
  const [tryons, setTryons] = useState<any[]>([])
  const [newFile, setNewFile] = useState<File | null>(null)
  const [name, setName] = useState("")

  const loadData = useCallback(async () => {
    try {
      const g = await garmentsApi.list(0, 20)
      const t = await tryonApi.list(0, 10)
      setGarments(g.data || [])
      setTryons(t.data?.tryons || [])
    } catch {
      toast.error("Failed to load data")
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) loadData()
  }, [isAuthenticated, loadData])

  const upload = async () => {
    if (!newFile) return toast.error("Select file")
    if (!name) return toast.error("Enter name")

    try {
      const up = await uploadApi.uploadGarment(newFile)
      await garmentsApi.create({
        name,
        image_url: up.data.url,
        s3_key: up.data.s3_key,
      })
      toast.success("Uploaded")
      setName("")
      setNewFile(null)
      loadData()
    } catch {
      toast.error("Upload failed")
    }
  }

  if (isLoading) {
    return (
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
    )
  }

  if (!isAuthenticated) {
    return (
        <div className="relative min-h-screen overflow-hidden">

          {/* 🌈 Background blobs */}
          <div className="absolute top-0 left-0 w-96 h-96 bg-purple-300 rounded-full blur-3xl opacity-30"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-300 rounded-full blur-3xl opacity-30"></div>

          <div className="relative z-10">
            <Navbar />

            <main className="space-y-20 pt-10">
              <HeroSection />
              <FeaturesSection />
              <DemoSection />
              <HowItWorksSection />
              <PricingSection />
            </main>

            <Footer />
          </div>
        </div>
    )
  }

  return (
      <div className="min-h-screen p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* HEADER */}
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-semibold">
              Welcome, {user?.full_name || "User"}
            </h1>
            <Button variant="outline" onClick={logout}>
              <LogOut className="size-4 mr-2" />
              Logout
            </Button>
          </div>

          {/* ACTIONS */}
          <div className="flex gap-3">
            <Link href="/try">
              <Button className="bg-gradient-to-r from-purple-400 to-pink-400 text-white">
                <Camera className="mr-2 size-4" />
                Try-On
              </Button>
            </Link>
          </div>

          {/* STATS */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-md">
              <CardContent className="p-6">
                Closet: {garments.length}
              </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-md">
              <CardContent className="p-6">
                Try-ons: {tryons.length}
              </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-md">
              <CardContent className="p-6">
                Ready Items: {garments.filter(g => g.preprocess_status === "ready").length}
              </CardContent>
            </Card>
          </div>

          {/* UPLOAD */}
          <Card className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-md">
            <CardContent className="p-6 space-y-3">
              <Input
                  placeholder="Garment name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
              />
              <Input type="file" onChange={(e) => setNewFile(e.target.files?.[0] || null)} />
              <Button onClick={upload} className="w-full">
                <Plus className="mr-2 size-4" />
                Add Garment
              </Button>
            </CardContent>
          </Card>

          {/* CLOSET */}
          <div className="grid md:grid-cols-3 gap-4">
            {garments.map((g) => (
                <motion.div key={g.id} whileHover={{ scale: 1.05 }}>
                  <Card className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-md">
                    <CardContent className="p-4">
                      <img src={g.image_url} className="rounded-xl mb-2" />
                      <p className="font-medium">{g.name}</p>
                    </CardContent>
                  </Card>
                </motion.div>
            ))}
          </div>

        </div>
      </div>
  )
}