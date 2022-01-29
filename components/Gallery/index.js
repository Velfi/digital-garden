import Thumbnail from "./Thumbnail";

let photosFolder = "/images/photography/2021/Christmas";
let photos = [
  { name: "ZLH03463" },
  { name: "ZLH03496" },
  { name: "ZLH03502" },
  { name: "ZLH03691" },
  { name: "ZLH03695" },
  { name: "ZLH03707" },
  { name: "ZLH03727" },
  { name: "ZLH03731" },
  { name: "ZLH03734" },
  { name: "ZLH03751" },
  { name: "ZLH03762" },
  { name: "ZLH03781" },
];

export default function Gallery() {
  return (
    <div
      style={{
        display: "grid",
        gap: "10px",
        gridTemplateRows: "300px",
        gridTemplateColumns: "repeat(3, 1fr);",
      }}
    >
      {photos.map((photo) => (
        <Thumbnail photosFolder={photosFolder} photo={photo} />
      ))}
    </div>
  );
}
