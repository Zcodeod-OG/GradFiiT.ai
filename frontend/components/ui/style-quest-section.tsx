"use client"

import { motion, useInView } from "framer-motion"
import { Trophy, Flame, Gift, Sparkles, Star } from "lucide-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

const challenges = [
  {
    title: "Complete 3 Outfit Swaps",
    reward: "+120 style XP",
    progress: 66,
    icon: Sparkles,
    tone: "from-fuchsia-400/25 via-pink-300/20 to-amber-200/25",
  },
  {
    title: "Build Your 3D Avatar",
    reward: "Unlock Avatar Studio",
    progress: 40,
    icon: Star,
    tone: "from-cyan-300/25 via-sky-300/20 to-indigo-300/25",
  },
  {
    title: "Try 2 New Categories",
    reward: "+80 fit points",
    progress: 85,
    icon: Gift,
    tone: "from-emerald-300/25 via-lime-200/20 to-yellow-200/25",
  },
]

export function StyleQuestSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-90px" })

  return (
    <section id="style-quest" ref={ref} className="section-spacing relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,oklch(0.83_0.09_315/.2),transparent_48%),radial-gradient(circle_at_88%_20%,oklch(0.82_0.08_210/.18),transparent_52%)]" />

      <div className="container-main relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Style Game Layer</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-balance">
            Build Looks, Earn Rewards, <span className="text-gradient">Level Up Your Avatar</span>
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            A light gamified experience inspired by 3D fashion-tech workflows. Complete quests,
            grow your style score, and unlock richer try-on personalization.
          </p>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <Card className="bg-white/80 border-border/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-5 text-amber-500" />
                Seasonal Style Quest
              </CardTitle>
              <CardDescription>Progress resets monthly. Keep your streak alive.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {challenges.map((challenge, index) => {
                const Icon = challenge.icon
                return (
                  <motion.div
                    key={challenge.title}
                    initial={{ opacity: 0, y: 12 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.45, delay: index * 0.1 + 0.15 }}
                    className="rounded-xl border border-border/70 bg-white/75 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`size-10 rounded-lg bg-gradient-to-br ${challenge.tone} border border-white/70 flex items-center justify-center`}>
                          <Icon className="size-5 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{challenge.title}</p>
                          <p className="text-xs text-muted-foreground">Reward: {challenge.reward}</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{challenge.progress}%</span>
                    </div>
                    <Progress className="mt-3" value={challenge.progress} />
                  </motion.div>
                )
              })}
            </CardContent>
          </Card>

          <Card className="bg-white/80 border-border/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="size-5 text-rose-500" />
                Your Future Style Profile
              </CardTitle>
              <CardDescription>What users unlock as they engage with try-on flows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-gradient-to-br from-sky-50 to-indigo-50 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Style XP</p>
                <p className="mt-1 font-display text-3xl font-bold">860</p>
                <p className="text-xs text-muted-foreground">Next level at 1000 XP</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/70 bg-white/85 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Streak</p>
                  <p className="mt-1 text-2xl font-semibold">7 days</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-white/85 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Avatar Rank</p>
                  <p className="mt-1 text-2xl font-semibold">Silver</p>
                </div>
              </div>

              <Button className="w-full">Start Your First Quest</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
