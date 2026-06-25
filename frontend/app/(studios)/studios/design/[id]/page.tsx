"use client";

import { useParams } from "next/navigation";

import { GenerationDetailView } from "@/components/studios/GenerationDetailView";
import { studiosApi } from "@/lib/api";

export default function DesignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  return (
    <GenerationDetailView
      kind="design"
      id={id}
      backHref="/studios/design"
      title="Design detail"
      load={studiosApi.getDesign}
      setPrimary={studiosApi.setDesignPrimary}
      saveToCloset={studiosApi.saveDesignToCloset}
      onDelete={studiosApi.deleteDesign}
    />
  );
}
