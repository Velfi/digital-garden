import NextImage from "next/image";
import styles from "./styles.module.css";

export default function Image(props) {
  let {
    src,
    alt,
    width = 600,
    height = 460,
    /*
    When fixed, the image dimensions will not change as the viewport changes (no responsiveness) similar to the native img element.
    When intrinsic, the image will scale the dimensions down for smaller viewports but maintain the original dimensions for larger viewports.
    When responsive, the image will scale the dimensions down for smaller viewports and scale up for larger viewports.
    When fill, the image will stretch both width and height to the dimensions of the parent element, provided the parent element is relative. This is usually paired with the objectFit property.
    */
    layout = "intrinsic",
    subtitle,
  } = props;
  if (src.includes("?")) {
    const dimensions = src.split("?");
    const widthHeight = dimensions[1].split("x");
    width = widthHeight[0];
    height = widthHeight[1];
  }

  let className;

  if (src.includes(".svg")) {
    className = styles.filter;
  }

  return (
    <>
      <NextImage
        src={src}
        alt={alt}
        width={width}
        height={height}
        layout={layout}
        className={className}
      />
      {subtitle !== undefined && (
        <p className="nextImageSubtitle">{subtitle}</p>
      )}
    </>
  );
}
