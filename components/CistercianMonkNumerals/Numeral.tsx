import { Image } from "../Image";

export interface DigitProps {
  value: string;
  strokeLinecap?: string;
  strokeWidth: number;
  width: number;
  height: number;
  scale?: number;
}

const MAG_XY = {
  ones: [1, -1],
  tens: [-1, -1],
  hundreds: [1, 1],
  thousands: [-1, 1],
};

export function svgStrForVal(val: string, mag: keyof typeof MAG_XY): string {
  const [x, y] = MAG_XY[mag];

  switch (val) {
    case "1": {
      return `<line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 1.5}cm"
            y2="${2 + y * 1.5}cm"
          />`;
    }
    case "2": {
      return `<line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 0.5}cm"
            y2="${2 + y * 0.5}cm"
          />`;
    }
    case "3": {
      return `<line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 1.5}cm"
            y2="${2 + y * 0.5}cm"
          />`;
    }
    case "4": {
      return `<line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y2="${2 + y * 1.5}cm"
            y1="${2 + y * 0.5}cm"
          />`;
    }
    case "5": {
      return `<line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 1.5}cm"
            y2="${2 + y * 1.5}cm"
          />
          <line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y2="${2 + y * 1.5}cm"
            y1="${2 + y * 0.5}cm"
          />`;
    }
    case "6": {
      return `<line
            x1="${1.5 + x}cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 1.5}cm"
            y2="${2 + y * 0.5}cm"
          />`;
    }
    case "7": {
      return `<line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 1.5}cm"
            y2="${2 + y * 1.5}cm"
          />
          <line
            x1="${1.5 + x}cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 1.5}cm"
            y2="${2 + y * 0.5}cm"
          />`;
    }
    case "8": {
      return `<line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 0.5}cm"
            y2="${2 + y * 0.5}cm"
          />
          <line
            x1="${1.5 + x}cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 1.5}cm"
            y2="${2 + y * 0.5}cm"
          />`;
    }
    case "9": {
      return `<line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 0.5}cm"
            y2="${2 + y * 0.5}cm"
          />
          <line
            x1="${1.5 + x}cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 1.5}cm"
            y2="${2 + y * 0.5}cm"
          />
          <line
            x1="1.5cm"
            x2="${1.5 + x}cm"
            y1="${2 + y * 1.5}cm"
            y2="${2 + y * 1.5}cm"
          />`;
    }
  }

  return "";
}

export const Numeral = (props: DigitProps) => {
  const value = props.value.padStart(4, "0");
  console.assert(value.length === 4);
  if (value === "0000") return null;
  const [n1, n2, n3, n4] = value.split("");
  const width = props.width ?? "3cm";
  const height = props.height ?? "4cm";
  const scale = props.scale ?? 1;

  const src = `data:image/svg+xml,<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  stroke="currentColor"
  stroke-linejoin="round"
  stroke-linecap="${props.strokeLinecap ?? "round"}"
  stroke-width="${props.strokeWidth}"
>
  <title>
    The number ${value} represented as a Cistercian Monk numeral
  </title>
  <g transform="scale(${scale} ${scale})">
  <line x1="1.5cm" x2="1.5cm" y1="0.5cm" y2="3.5cm" />
  ${svgStrForVal(n4, "ones")}
  ${svgStrForVal(n3, "tens")}
  ${svgStrForVal(n2, "hundreds")}
  ${svgStrForVal(n1, "thousands")}
  </g>
</svg>`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <Image
      height={height}
      width={width}
      src={src}
      alt={`The number ${value} represented as a Cistercian Monk numeral`}
    />
  );
};
