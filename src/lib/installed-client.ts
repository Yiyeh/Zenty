import { translateMessage, tr } from "./i18n.ts";
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
      tr("installed_client.b605ae8a76", { v0: APP_NAME }),
    );
  }
  if (!response.ok)
    throw new Error(translateMessage(result.error || tr("installed_client.4d8c09fb8e")));
  return result;
}
