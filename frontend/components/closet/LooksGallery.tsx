"use client";

import { motion } from "framer-motion";

import { fadeUp, staggerContainer } from "@/lib/motion";
import { type Garment, type Look } from "@/lib/api";

import { LookCard } from "./LookCard";

type LooksGalleryProps = {
  looks: Look[];
  garmentLookup: Map<number, Garment>;
  renderingLookIds: Set<number>;
  onEdit: (look: Look) => void;
  onRender: (look: Look) => void;
  onDelete: (look: Look) => void;
};

export function LooksGallery({
  looks,
  garmentLookup,
  renderingLookIds,
  onEdit,
  onRender,
  onDelete,
}: LooksGalleryProps) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer(0.04, 0.04)}
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {looks.map((look) => (
        <motion.div key={look.id} variants={fadeUp}>
          <LookCard
            look={look}
            garmentLookup={garmentLookup}
            rendering={renderingLookIds.has(look.id)}
            onEdit={onEdit}
            onRender={onRender}
            onDelete={onDelete}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
