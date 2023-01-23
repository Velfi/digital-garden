import { Image } from "@/components/Image";
import styles from "./ThumbnailGallery.module.css";
import { useState } from "react";

interface Props {
  images: string[];
}

export default function ThumbnailGallery({ images }: Props) {
  if (images.length == 0) {
    throw Error("must pass at least one image to Thumbnail Gallery!");
  }

  const maxIndex = images.length - 1;
  const [imageIndex, setImageIndex] = useState(0);
  const nextImageIndex = () => {
    if (imageIndex < maxIndex) {
      setImageIndex(imageIndex + 1);
    } else {
      setImageIndex(0);
    }
  };
  const previousImageIndex = () => {
    if (imageIndex == 0) {
      setImageIndex(maxIndex);
    } else {
      setImageIndex(imageIndex - 1);
    }
  };
  const openImageInNewTab = () => {
    window.open(images[imageIndex], "_blank");
  };

  return (
    <div className={styles.gallery}>
      <Image
        src={images[imageIndex]}
        alt="Alice"
        width="800"
        height="800"
        layout="responsive"
      />
      <button
        className={[styles.indexButton, styles.left].join(" ")}
        onClick={previousImageIndex}
      >
        &#706;
      </button>
      <button className={styles.newTabButton} onClick={openImageInNewTab}>&nbsp;</button>
      <button
        className={[styles.indexButton, styles.right].join(" ")}
        onClick={nextImageIndex}
      >
        &#707;
      </button>
    </div>
  );
}
