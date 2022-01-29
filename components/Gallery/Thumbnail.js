// export interface Photo {
//   name: string,
//   alt?: string,
// }

function thumbnailPath(root, filename) {
  return `${root}/${filename}-thumbnail.webp`;
}

export default function Thumbnail({ photosFolder, photo, onClick }) {
  return (
    <div onClick={() => onClick(photo)}>
      <img
        style={{
          borderRadius: "3px",
          maxWidth: "100%",
          height: "auto",
        }}
        src={thumbnailPath(photosFolder, photo.name)}
      />
    </div>
  );
}
