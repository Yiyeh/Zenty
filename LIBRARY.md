# Biblioteca y lectura en Zenty

Abre **Mi biblioteca** en la barra lateral o entra a `http://127.0.0.1:5173/#library`.

## Guardar y organizar

Sube uno o varios archivos o arrástralos a la biblioteca. Se guardan copias reales de sus originales en `library-data/documents/`, con nombres internos únicos. `library-data/library.json` conserva sus títulos, favoritos, marcadores, posiciones y preferencias del lector. No se publican ni se envían a terceros.

Los formatos disponibles son PDF, DOCX, EPUB sin DRM, CBZ con imágenes JPG/PNG/WebP/GIF, TXT, MD y las imágenes individuales JPG/JPEG, PNG y WebP. El límite es **150 MB por archivo**. No se admiten DOC antiguos, MOBI, CBR/RAR ni libros cifrados. Un archivo con extensión válida pero contenido dañado mostrará un error al abrirlo y podrá quitarse desde la biblioteca. Los duplicados exactos se detectan por SHA-256, aunque su nombre cambie.

Puedes buscar por título o nombre de archivo, ordenar, filtrar por formato, marcar favoritos y renombrar la ficha sin modificar el original. «Descargar archivo original» permite recuperar la copia importada.

«Mover a la papelera» oculta un documento sin borrar su archivo, progreso ni marcadores. Se puede restaurar desde Papelera. «Eliminar definitivamente» requiere confirmación y elimina el original guardado en Zenty y su registro; no modifica el archivo que utilizaste para importarlo desde otra carpeta.

## Continuar leyendo

- **PDF:** conserva la página original. Se renderiza localmente con PDF.js. Permite zoom y ajuste al ancho o a la página completa. Esta versión no incluye edición, formularios ni búsqueda de texto dentro del PDF.
- **CBZ e imágenes:** conserva la página; el orden es natural (`1, 2, 10`, no `1, 10, 2`). El modo manga invierte las flechas de navegación y su disposición. Las imágenes originales mantienen sus colores.
- **Manga (MangaDex):** conserva el capítulo y la página exactos en los que te quedaste, actualizando el progreso tanto en la biblioteca como en la tarjeta de lectura continua. Permite lectura en modo Manga (derecha a izquierda / RTL japonés), Occidental (izquierda a derecha / LTR) o Cascada continua (Webtoon), selector y búsqueda de capítulos, precarga automática de páginas, marcadores y selector de idioma de traducción.
- **EPUB:** sigue el orden de lectura del libro, muestra sus capítulos y conserva el bloque de texto y la posición dentro de él. El índice EPUB 3 se aprovecha cuando está disponible; en otros casos se usan etiquetas de capítulo.
- **DOCX:** convierte el contenido a una lectura adaptable con Mammoth. No reproduce exactamente el diseño ni la paginación de Word; conserva el original descargable.
- **TXT y MD:** se muestran como texto seguro y se dividen en secciones estables para documentos largos. Markdown no ejecuta ni interpreta HTML incrustado.

En la lectura adaptable el tamaño de letra no cambia el lugar guardado: se recuerda un bloque y su fracción, en lugar de una cantidad fija de píxeles. PDF y CBZ recuerdan la página, pero no la posición vertical dentro de una página ampliada.

El progreso se guarda en disco después de moverte, al salir del lector y al ocultar/cerrar la pestaña cuando el navegador permite completar la petición. Un cierre forzado del navegador puede perder los últimos instantes. Si el servidor falla, el lector lo indica y ofrece reintentar o salir explícitamente sin guardar. La tarjeta «Continuar leyendo» facilita retomar la última lectura.

## Lectura cómoda

El botón **Aa** permite elegir Papel, Sepia o Noche y regular el brillo. EPUB, DOCX y texto permiten elegir serifas/sin serifas, tamaño, interlineado y ancho de columna. PDF e imágenes ofrecen zoom y ajuste a página; sus colores originales no se invierten. Hay modo de pantalla completa cuando el navegador lo admite.

Puedes guardar marcadores de pasajes, abrirlos desde el índice y quitarlos. Las flechas izquierda/derecha cambian de página o sección. Los controles están disponibles también en móvil. El lector es un diálogo que mantiene el foco y separa su navegación del dashboard.

## Carpeta y respaldos

La biblioteca necesita el servidor local de Zenty para escribir en una carpeta real:

```sh
npm install
npm run dev
```

Para usar la compilación, sin el servidor de desarrollo:

```sh
npm run build
npm start
```

También funciona con `npm run preview`. No basta con abrir `dist/index.html` directamente o publicarlo en un alojamiento solo estático: faltaría la API local. El servidor de producción se limita a `127.0.0.1`; la API rechaza clientes remotos y orígenes ajenos. Usa una sola instancia de Zenty por carpeta de biblioteca.

**Para respaldar la biblioteca, cierra Zenty y copia toda la carpeta `library-data`.** Incluye el índice y la subcarpeta `documents`. Para restaurar, con Zenty cerrado, repón la carpeta completa. Limpiar el navegador no borra estos archivos. El respaldo JSON del dashboard sigue siendo independiente y no incluye documentos ni el progreso de la biblioteca.

La carpeta está excluida de Git y del acceso estático de Vite; los documentos se sirven exclusivamente por identificador a través de la API local. Si el índice está dañado se muestra un error sin reemplazarlo silenciosamente. Los originales siguen en disco para su recuperación.

## Descubrir lecturas gratuitas

La biblioteca ofrece accesos a catálogos oficiales:

- **MangaDex (integrado):** búsqueda y lectura integrada a través de la API oficial de MangaDex. Permite filtrar por idioma (español, inglés, etc.), añadir mangas a tu colección y leer capítulos en la aplicación con guardado local de progreso.
- [Project Gutenberg](https://www.gutenberg.org/browse/languages/es): clásicos y libros en español y otros idiomas. Descarga los formatos que permita la ficha, comprueba los derechos aplicables en tu país e importa el EPUB o texto a Zenty. [Condiciones y permisos](https://www.gutenberg.org/policy/permission).
- [Standard Ebooks](https://standardebooks.org/ebooks): ediciones de clásicos de dominio público en EE. UU., principalmente en inglés. Se descargan desde su catálogo y se importan manualmente.
- [MANGA Plus de Shueisha](https://mangaplus.shueisha.co.jp/): lectura oficial de capítulos gratuitos según título, idioma, región y condiciones del servicio. Abre su sitio o aplicación para leer. Zenty no descarga sus capítulos ni sincroniza su progreso. [Preguntas frecuentes oficiales](https://mangaplus.shueisha.co.jp/faq/eng/).

Estos accesos no simulan una integración ni eluden restricciones de los proveedores. No hay scraping, proxy de descargas arbitrarias ni contenido comercial copiado.

## Dependencias y verificaciones

PDF.js usa su worker y recursos de fuentes/CMaps locales, copiados automáticamente por `postinstall`, `predev` y `prebuild`. Mammoth y PDF.js se cargan al abrir el formato correspondiente; la biblioteca y el lector son módulos diferidos. El contenido adaptable se sanea con DOMPurify y se muestra en un iframe sin permiso de scripts, con una política que bloquea conexiones y recursos remotos.

Las pruebas cubren importación real a disco, recuperación tras reiniciar la API, duplicados, cambios concurrentes, marcadores, papelera, eliminación, validación y protección del acceso local. Los cinco formatos principales se comprobaron con archivos originales de prueba generados por `scripts/create-reader-fixtures.mjs`; no se usaron documentos personales.

## Paletas de la página

**Personalizar → Tu estilo → Paleta de toda la página** ofrece Neutra, Arena, Azul, Lavanda, Rosa, Verde y Grafito, en modo claro y oscuro. La paleta modifica fondos, paneles y ambiente; el acento se puede ajustar después con los colores predefinidos o el selector libre. La base inicial ahora es neutra. Las preferencias del lector son independientes de la apariencia del dashboard.
