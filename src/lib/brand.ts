/** Cambia solo este valor para renombrar la interfaz y la próxima compilación. */
export const APP_NAME = "Zenty";

export const APP_SLUG =
  APP_NAME.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "personal-dashboard";

export const APP_ID = `com.${APP_SLUG}.personal-dashboard`;
