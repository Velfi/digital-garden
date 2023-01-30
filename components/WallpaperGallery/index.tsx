import styles from "./index.module.css";
import Image, { StaticImageData } from "next/image";

type Src = StaticImageData | string;
type FileName = string;
type Subtitle = string;

interface Props {
  year: number;
  images: [[Src, FileName, Subtitle]];
}

export const WallpaperGallery: React.FC<Props> = ({ images, year }) => (
  <>
  <p className={styles.newTabNotice}>Click on an image to open it in a new tab.</p>
  <div className={styles.gallery}>
    {images.map((image) => {
      const [src, filename, subtitle] = image;
      const href = `/images/wallpapers/${year}/${filename}`;
      
      return (
        <a href={href} key={href} className={styles.link}>
          <Image
            src={src}
            placeholder="blur"
            alt="A decorative desktop wallpaper"
            width={1000}
            style={{ width: "100%", height: "auto" }}
            />
          <p className={styles.subtitle}>{subtitle}</p>
        </a>
      );
    })}
  </div>
    </>
);
