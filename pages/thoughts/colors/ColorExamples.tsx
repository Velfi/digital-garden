import CircleScales from "./CircleScales";
import React from "react";
import RectangleScallops from "./RectangleScallops";
import TriangleWaves from "./TriangleWaves";

let examples = [
  "bloop",
  "fettucine",
  "croupier",
  "shamshir",

  "conglomerate",
  "stonefruit",
  "futurism",
  "verdigris",

  "metropolis",
  "interface",
  "bizarre",
  "coastline",
];

const ColorExamples = () => (
  <>
    <em>Scallops</em>
    <div className="flex-wrap-container">
      {examples.map((example) => (
        <RectangleScallops key={example} />
      ))}
    </div>
    <em>Scales</em>
    <CircleScales />
    <em>Waves</em>
    <TriangleWaves />
  </>
);

export default ColorExamples;
