"use client";

import { useParams } from "next/navigation";

import { GenerationDetailView } from "@/components/studios/GenerationDetailView";
import { studiosApi } from "@/lib/api";

export default function StylistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  return (
    <GenerationDetailView
      kind="stylist"
      id={id}
      backHref="/studios/stylist"
      title="Look detail"
      load={studiosApi.getOutfit}
      setPrimary={studiosApi.setOutfitPrimary}
      saveToCloset={studiosApi.saveOutfitToCloset}
      onDelete={studiosApi.deleteOutfit}
    />
  );
}
