import CircleScales from "./CircleScales";
import React from "react";
import RectangleScallops from "./RectangleScallops";
import TriangleWaves from "./TriangleWaves";
import styled from "styled-components";

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

const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
`;

const ColorExamples = () => {
  return (
    <>
      <em>Scallops</em>
      <Container>
        {examples.map((example) => (
          <RectangleScallops key={example} />
        ))}
      </Container>
      <em>Scales</em>
      <CircleScales />
      <em>Waves</em>
      <TriangleWaves />
    </>
  );
};

export default ColorExamples;
