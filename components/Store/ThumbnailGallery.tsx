import styles from "./ThumbnailGallery.module.css";
import { useState } from "react";
import Image, { StaticImageData } from "next/image";

interface Props {
  images: (string | StaticImageData)[];
}

export const ThumbnailGallery: React.FC<Props> = ({ images }) => {
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

  return (
    <div className={styles.gallery}>
      <Image
        alt="a product thumbnail"
        src={images[imageIndex]}
        style={{ height: "auto", maxWidth: "100%" }}
      />
      <button
        className={[styles.indexButton, styles.left].join(" ")}
        onClick={previousImageIndex}
      >
        &#706;
      </button>
      <button
        className={[styles.indexButton, styles.right].join(" ")}
        onClick={nextImageIndex}
      >
        &#707;
      </button>
    </div>
  );
};
