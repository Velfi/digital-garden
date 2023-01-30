import styles from "./styles.module.css";
import NextImage, { StaticImageData } from "next/image";
import cn from "classnames";

export interface Props {
  subtitle?: string;
  src: string | StaticImageData;
  alt?: string;
}

export const Image: React.FC<Props> = ({
  src,
  // An empty string is a valid alt attribute value for decorative images.
  alt = "",
  subtitle,
  ...props
}) => {
  let isSvg;

  if (typeof src === "string") {
    isSvg = src.endsWith(".svg");
  } else {
    isSvg = (src as any).src.endsWith(".svg");
  }

  return (
    <div className={styles.container}>
      <NextImage
        src={src}
        alt={alt}
        className={cn(styles.image, { svgFilter: isSvg })}
        {...props}
      />
      {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
};
