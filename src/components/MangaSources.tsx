import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { ExternalLink } from "lucide-react";

const sources = ([
  { name: "MANGA Plus", url: "https://mangaplus.shueisha.co.jp/", get language() { return tr("MangaSources.88a844be0d"); }, get detail() { return tr("MangaSources.e74ba4c16b"); } },
  { get name() { return tr("MangaSources.3f818c966a"); }, url: "https://www.webtoons.com/es/", get language() { return tr("MangaSources.06738c8bc5"); }, get detail() { return tr("MangaSources.bc70e5f78b"); } },
  { get name() { return tr("MangaSources.5bfb253f60"); }, url: "https://comikey.com/", get language() { return tr("MangaSources.1c121124a1"); }, get detail() { return tr("MangaSources.dcc6ed32c5"); } },
  { get name() { return tr("MangaSources.f94a48819e"); }, url: "https://globalcomix.com/", get language() { return tr("MangaSources.add6fee096"); }, get detail() { return tr("MangaSources.db9b989dac"); } },
]);
export function MangaSources({ title = "" }: { title?: string }) {
  useInterfaceLocale();
  return <details className="manga-other-sources" onClick={(event) => event.stopPropagation()}>
    <summary>{tr("MangaSources.36a0164783")}</summary>
    <p>{title ? tr("MangaSources.c32c29f792", { v0: title }) : tr("MangaSources.3cb1e4ef29")} {tr("MangaSources.74b42fcde2")}</p>
    <div className="manga-sources-grid">{sources.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">
      <span><strong>{source.name}</strong><ExternalLink size={15} aria-hidden="true" /></span>
      <small>{source.language}</small><p>{source.detail}</p>
    </a>)}</div>
    <p>{tr("MangaSources.cfcbe52f8d")}</p>
  </details>;
}
