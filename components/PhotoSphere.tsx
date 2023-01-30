import ReactPannellum from "react-pannellum";

interface Props {
  subtitle?: string;
  src: string;
}

export const PhotoSphere: React.FC<Props> = ({ subtitle, src }) => (
  <div>
    <ReactPannellum
      id={subtitle}
      sceneId={subtitle}
      imageSource={src}
      config={{
        autoLoad: true,
      }}
    />
    {subtitle !== undefined && <p>{subtitle}</p>}
  </div>
);
