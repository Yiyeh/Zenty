import { translateMessage, tr } from "./i18n.ts";
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
      isRemoteLibrary ? tr("library_client.071534e757") : tr("library_client.b8c2fbccc4", { v0: APP_NAME }),
    );
  }
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new Error(
      tr("library_client.a5f0baf927", { v0: APP_NAME }),
    );
  const body = await response.json();
  if (!response.ok)
    throw new Error(translateMessage(body.error || tr("library_client.76ae2d7993")));
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
