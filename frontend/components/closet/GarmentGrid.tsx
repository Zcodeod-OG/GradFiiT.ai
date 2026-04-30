"use client";

import { motion } from "framer-motion";

import { fadeUp, staggerContainer } from "@/lib/motion";
import { type Garment } from "@/lib/api";

import { GarmentCard } from "./GarmentCard";

type GarmentGridProps = {
  garments: Garment[];
  onTryOn: (garment: Garment) => void;
  onEdit: (garment: Garment) => void;
  onDelete: (garment: Garment) => void;
};

export function GarmentGrid({
  garments,
  onTryOn,
  onEdit,
  onDelete,
}: GarmentGridProps) {
  return (
    <motion.div
      key={garments.length}
      initial="hidden"
      animate="show"
      variants={staggerContainer(0.04, 0.04)}
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {garments.map((garment) => (
        <motion.div key={garment.id} variants={fadeUp}>
          <GarmentCard
            garment={garment}
            onTryOn={onTryOn}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
