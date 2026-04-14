export default function ImageShowcasePage({ title, imageSrc, imageAlt }) {
  return (
    <div className="page-image-wrap">
      <div className="page-image-card">
        <img className="page-image" src={imageSrc} alt={imageAlt || title} />
        <div className="page-image-overlay">
          <span>{title}</span>
        </div>
      </div>
    </div>
  )
}
