import "./MpasatWordmark.css";

export default function MpasatWordmark() {
  return (
    <div className="mpasat-wordmark" role="banner" aria-label="MPASAT">
      <div className="mpasat-wordmark__stack" aria-hidden>
        <span className="mpasat-wordmark__letter mpasat-wordmark__letter--base">MPASAT</span>
        <span className="mpasat-wordmark__letter mpasat-wordmark__letter--shadow">MPASAT</span>
        <span className="mpasat-wordmark__letter mpasat-wordmark__letter--amber">MPASAT</span>
        <span className="mpasat-wordmark__letter">MPASAT</span>
      </div>
      <div className="mpasat-wordmark__rule" />
    </div>
  );
}
