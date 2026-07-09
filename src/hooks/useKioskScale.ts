import { useEffect, useState } from "react";

export const KIOSK_WIDTH = 1080;
export const KIOSK_HEIGHT = 1920;

/** Escala el marco 1080×1920 para caber en pantallas más pequeñas (dev) o nativo en tótem. */
export function useKioskScale(): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = (): void => {
      const sw = window.innerWidth / KIOSK_WIDTH;
      const sh = window.innerHeight / KIOSK_HEIGHT;
      setScale(Math.min(sw, sh, 1));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return scale;
}
