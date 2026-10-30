import { UnitType } from "@/types/template";

export const MM_TO_PT = 72 / 25.4; // ~2.834645669
export const PT_TO_MM = 25.4 / 72; // ~0.352777778
export const PX_TO_PT = 72 / 96;   // 0.75
export const PT_TO_PX = 96 / 72;   // 1.333333

export function toPoints(val: number, unit: UnitType): number {
  switch (unit) {
    case "mm":
      return Math.round(val * MM_TO_PT * 100) / 100;
    case "px":
      return Math.round(val * PX_TO_PT * 100) / 100;
    case "pt":
    default:
      return Math.round(val * 100) / 100;
  }
}

export function fromPoints(pt: number, targetUnit: UnitType): number {
  switch (targetUnit) {
    case "mm":
      return Math.round(pt * PT_TO_MM * 100) / 100;
    case "px":
      return Math.round(pt * PT_TO_PX * 100) / 100;
    case "pt":
    default:
      return Math.round(pt * 100) / 100;
  }
}

export function formatUnit(val: number, unit: UnitType): string {
  const rounded = fromPoints(val, unit);
  return `${rounded}${unit}`;
}
