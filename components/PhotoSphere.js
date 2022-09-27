import { ReactPhotoSphereViewer } from 'react-photo-sphere-viewer';
import { useRef } from 'react';

export default function Product({
  subtitle,
  src,
  height = '100vh',
  width = '100%',
}) {
  const photoSphereRef = useRef();
  
  const handleClick = () => {
    photoSphereRef.current.animate({
      latitude: 0,
      longitude: 0,
      zoom: 55,
      speed: '10rpm',
    });
  }

  return (
    <div>
      <ReactPhotoSphereViewer ref={photoSphereRef} src={src} height={height} width={width} onClick={handleClick} />
      {subtitle !== undefined && (
        <p>{subtitle}</p>
      )}
    </div>
  );
}
