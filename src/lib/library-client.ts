import { isRemoteLibrary } from "./remote";
import { APP_NAME } from "./brand.ts";
import type {
  LibraryDocument,
  LibraryState,
  ReadingPosition,
  ReaderPreferences,
} from "./library";
export type LibraryResponse = LibraryState & { storagePath: string };
export async function libraryRequest<T>(
  path = "",
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/library${path}`, {
      ...options,
      headers: { "X-MIA-Library": "1", ...options.headers },
    });
  } catch {
    throw new Error(
      isRemoteLibrary ? "No se pudo contactar con el PC. Comprueba que Zenty esté abierto y que ambos dispositivos estén en la misma red." : `No se pudo contactar la biblioteca local. Inicia ${APP_NAME} con npm run dev o npm start.`,
    );
  }
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new Error(
      `La biblioteca necesita el servidor local de ${APP_NAME}. Usa npm run dev, npm run preview o npm start.`,
    );
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "No se pudo guardar el cambio.");
  return body;
}
export const loadLibrary = () => libraryRequest<LibraryResponse>();
export const updateDocument = (
  id: string,
  patch: Partial<Pick<LibraryDocument, "title" | "favorite" | "totalUnits">> & {
    position?: ReadingPosition;
    restore?: boolean;
    bookmark?: { label: string; position: ReadingPosition };
    removeBookmark?: string;
    manga?: Partial<import("./library").MangaMetadata>;
  },
) =>
  libraryRequest<LibraryDocument>(`/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
export const updateReaderPreferences = (prefs: ReaderPreferences) =>
  libraryRequest<ReaderPreferences>("/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
