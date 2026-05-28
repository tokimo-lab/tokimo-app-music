import { Spin } from "@tokimo/ui";
import { Suspense } from "react";
import MusicApp from "./components/MusicApp";

const LoadingFallback = (
  <div className="flex h-full items-center justify-center">
    <Spin />
  </div>
);

export default function MusicContent() {
  return (
    <Suspense fallback={LoadingFallback}>
      <MusicApp />
    </Suspense>
  );
}
