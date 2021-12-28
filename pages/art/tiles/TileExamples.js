import PerspectiveGrid from "./PerspectiveGrid";
import React from "react";
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

const TileExamples = () => {
  return (
    <>
      <em>Does this pattern have a name?</em>
      <Container>
        {examples.map((example) => (
          <PerspectiveGrid key={example} />
        ))}
      </Container>
    </>
  );
};

export default TileExamples;
