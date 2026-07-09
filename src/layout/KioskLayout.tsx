import { useEffect } from "react";
import { KIOSK_HEIGHT, KIOSK_WIDTH, useKioskScale } from "../hooks/useKioskScale";

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  const scale = useKioskScale();

  useEffect(() => {
    document.documentElement.classList.add("kiosk-viewport");
    return () => document.documentElement.classList.remove("kiosk-viewport");
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-slate-950">
      <div
        className="relative flex flex-col overflow-hidden bg-gray-50 shadow-2xl dark:bg-gray-950"
        style={{
          width: KIOSK_WIDTH,
          height: KIOSK_HEIGHT,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
