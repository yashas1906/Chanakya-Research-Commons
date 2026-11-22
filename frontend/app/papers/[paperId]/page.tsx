import { PaperDetail } from "@/components/paper/PaperDetail";

export default function PaperPage({ params }: { params: { paperId: string } }) {
  return <PaperDetail paperId={params.paperId} />;
}
