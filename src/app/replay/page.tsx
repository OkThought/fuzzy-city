import type { Metadata } from "next";
import ReplayViewer from "../../components/ReplayViewer";

export const metadata: Metadata = {
  title: "Fuzzy City — Interactive Replay",
  description: "Inspect a recorded JevK5 simulation, its probabilities, sampled outcomes, and programmed rules.",
};

export default function ReplayPage() {
  return <ReplayViewer />;
}
