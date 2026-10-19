import { APP_NAME } from "./brand.ts";
export async function installedRequest<T>(
  action: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(`/api/installed/${action}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "X-MIA-Games": "1",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      `No se pudo conectar con tus juegos. Comprueba que ${APP_NAME} esté en ejecución.`,
    );
  }
  if (!response.ok)
    throw new Error(result.error || "No se pudo completar la acción.");
  return result;
}
