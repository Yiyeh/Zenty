export function mangaSwipe(input: {dx:number; dy:number; elapsed:number; mode:"rtl"|"ltr"|"webtoon"; inverted:boolean; zoom:number}): "next" | "previous" | null {
  if (input.mode === "webtoon" || input.zoom > 1.05 || input.elapsed > 800 || input.elapsed < 0 || Math.abs(input.dx) < 55 || Math.abs(input.dx) < Math.abs(input.dy) * 1.7) return null;
  const reversed = (input.mode === "rtl") !== input.inverted;
  return (input.dx > 0) === reversed ? "next" : "previous";
}
