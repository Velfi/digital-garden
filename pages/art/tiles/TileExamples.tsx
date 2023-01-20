import PerspectiveGrid from "./PerspectiveGrid";
import React from "react";

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

const TileExamples = () => {
  return (
    <>
      <em>Does this pattern have a name?</em>
      <div className="flex-wrap-container">
        {examples.map((example) => (
          <PerspectiveGrid key={example} />
        ))}
      </div>
    </>
  );
};

export default TileExamples;
