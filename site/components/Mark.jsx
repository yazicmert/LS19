// lookstar19 işareti: çizgi üstünde üç ayaklı teleskop, eksenindeki yıldıza bakıyor. 32 birimlik ızgarada çizildi (public/icon.svg ile aynı
// geometri); tüp ağzına doğru genişler, yıldız 45° dönmüş kare (köşeler sitenin her yerinde olduğu gibi keskin), taban sirkülerin
// bölüm çizgisi. Tek renk (currentColor): kobalt bantta beyaz, kâğıtta mürekkep. viewBox çizime sıkı; alt kenar yazı çizgisine oturur.
export const MARK_PATHS = (
  <>
    <path transform="translate(12.5 19) rotate(-44)" d="M-9 -2.2 L7.5 -3.2 V-4 H11.5 V4 H7.5 V3.2 L-9 2.2 Z" />
    <path d="M12.5 19.5 L7.6 28 M12.5 19.5 L17.4 28" fill="none" stroke="currentColor" strokeWidth="2.6" />
    <rect x="3" y="28" width="20" height="2" />
    <path d="M25.5 2.5 L29.5 6.5 L25.5 10.5 L21.5 6.5 Z" />
  </>
);

export default function Mark({ className = 'mark' }) {
  return (
    <svg className={className} viewBox="3 2.5 26.5 27.5" aria-hidden="true" focusable="false" fill="currentColor">{MARK_PATHS}</svg>
  );
}
