import { ExternalLink } from "lucide-react";

const sources = [
  { name: "MANGA Plus", url: "https://mangaplus.shueisha.co.jp/", language: "Español y otros idiomas", detail: "Publicaciones de Shueisha. Los capítulos disponibles dependen del título, la región y el plan." },
  { name: "WEBTOON", url: "https://www.webtoons.com/es/", language: "Catálogo en español", detail: "Historias de lectura vertical. Algunas entregas requieren cuenta, espera o pago." },
  { name: "Comikey", url: "https://comikey.com/", language: "Principalmente inglés y portugués", detail: "Manga, manhwa y manhua. Acceso gratuito y capítulos con desbloqueo según la serie." },
  { name: "GlobalComix", url: "https://globalcomix.com/", language: "Varios idiomas", detail: "Manga y cómics de editoriales y creadores. Contenido gratuito y de suscripción." },
];
export function MangaSources({ title = "" }: { title?: string }) {
  return <details className="manga-other-sources" onClick={(event) => event.stopPropagation()}>
    <summary>Explorar otras fuentes</summary>
    <p>{title ? `Si faltan capítulos de «${title}», comprueba otras ediciones o idiomas en estos catálogos.` : "Amplía tu búsqueda con otros catálogos de manga y cómics."} MangaDex se lee dentro de Zenty; estas fuentes abren su propio lector en el navegador. Su disponibilidad y progreso se gestionan allí.</p>
    <div className="manga-sources-grid">{sources.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">
      <span><strong>{source.name}</strong><ExternalLink size={15} aria-hidden="true" /></span>
      <small>{source.language}</small><p>{source.detail}</p>
    </a>)}</div>
    <p>Una obra finalizada puede tener traducciones incompletas. Cambia el idioma o consulta la editorial; otra fuente no garantiza disponer de todos los capítulos.</p>
  </details>;
}
