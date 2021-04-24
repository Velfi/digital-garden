import NextImage from "next/image";

export default function Image(props) {
  let {
    src,
    alt,
    width = 600,
    height = 460,
    layout = "intrinsic",
    subtitle,
  } = props;
  if (src.includes("?")) {
    const dimensions = src.split("?");
    const widthHeight = dimensions[1].split("x");
    width = widthHeight[0];
    height = widthHeight[1];
  }

  return (
    <>
      <NextImage
        src={src}
        alt={alt}
        width={width}
        height={height}
        layout={layout}
      />
      {subtitle !== undefined && (
        <p className="nextImageSubtitle">{subtitle}</p>
      )}
    </>
  );
}
