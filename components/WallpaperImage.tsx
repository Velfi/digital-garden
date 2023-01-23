import Image from "next/image";

interface WallpaperImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

export const WallpaperImage = (props: WallpaperImageProps) => {
  const { src, alt, width, height, className } = props;

  return (
    <div className="wallpaper-image">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
      />
    </div>
  );
};
