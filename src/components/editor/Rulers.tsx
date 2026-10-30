"use client";

import React from "react";
import { UnitType } from "@/types/template";
import { fromPoints } from "@/lib/units";

interface RulersProps {
  width: number;
  height: number;
  zoom: number;
  unit: UnitType;
  cursorPos?: { x: number; y: number } | null;
}

export const Rulers: React.FC<RulersProps> = ({ width, height, zoom, unit, cursorPos }) => {
  const RULER_THICKNESS = 20;
  const step = unit === "mm" ? 28.346 : unit === "px" ? 20 : 25; // 25pt steps
  const majorStep = step * 2;

  // Horizontal marks
  const hTicks: { pos: number; label?: string }[] = [];
  for (let pt = 0; pt <= width; pt += step) {
    const isMajor = pt % majorStep === 0;
    const label = isMajor ? `${fromPoints(pt, unit)}` : undefined;
    hTicks.push({ pos: pt, label });
  }

  // Vertical marks
  const vTicks: { pos: number; label?: string }[] = [];
  for (let pt = 0; pt <= height; pt += step) {
    const isMajor = pt % majorStep === 0;
    const label = isMajor ? `${fromPoints(pt, unit)}` : undefined;
    vTicks.push({ pos: pt, label });
  }

  return (
    <>
      {/* Corner box */}
      <div
        className="absolute top-0 left-0 bg-neutral-100 border-r border-b border-neutral-300 z-30 flex items-center justify-center text-[9px] font-mono text-neutral-500 font-bold select-none"
        style={{ width: RULER_THICKNESS, height: RULER_THICKNESS }}
      >
        {unit}
      </div>

      {/* Horizontal Ruler */}
      <div
        className="absolute top-0 left-5 overflow-hidden bg-neutral-100 border-b border-neutral-300 z-20 select-none"
        style={{ width: width * zoom, height: RULER_THICKNESS }}
      >
        {hTicks.map((tick, i) => (
          <div
            key={`h-${i}`}
            className="absolute top-0 border-l border-neutral-300"
            style={{
              left: tick.pos * zoom,
              height: tick.label ? RULER_THICKNESS : RULER_THICKNESS / 2,
            }}
          >
            {tick.label && (
              <span className="text-[8px] font-mono text-neutral-500 pl-0.5 leading-none block pt-0.5">
                {tick.label}
              </span>
            )}
          </div>
        ))}
        {cursorPos && cursorPos.x >= 0 && cursorPos.x <= width && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-30 pointer-events-none"
            style={{ left: cursorPos.x * zoom }}
          />
        )}
      </div>

      {/* Vertical Ruler */}
      <div
        className="absolute top-5 left-0 overflow-hidden bg-neutral-100 border-r border-neutral-300 z-20 select-none"
        style={{ width: RULER_THICKNESS, height: height * zoom }}
      >
        {vTicks.map((tick, i) => (
          <div
            key={`v-${i}`}
            className="absolute left-0 border-t border-neutral-300"
            style={{
              top: tick.pos * zoom,
              width: tick.label ? RULER_THICKNESS : RULER_THICKNESS / 2,
            }}
          >
            {tick.label && (
              <span className="text-[8px] font-mono text-neutral-500 pl-0.5 leading-none block pt-0.5">
                {tick.label}
              </span>
            )}
          </div>
        ))}
        {cursorPos && cursorPos.y >= 0 && cursorPos.y <= height && (
          <div
            className="absolute left-0 right-0 h-0.5 bg-blue-500 z-30 pointer-events-none"
            style={{ top: cursorPos.y * zoom }}
          />
        )}
      </div>
    </>
  );
};
