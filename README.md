# Zenty · Un espacio muy tuyo

Aplicación de escritorio y página de inicio personal construida con React, TypeScript y Vite. Diseño adaptable, datos locales y conexiones opcionales con servicios externos.

También disponible como **aplicación de escritorio Electron**: pantalla completa, barra de título propia y controles de ventana. Ejecuta `npm run desktop` o genera la aplicación portátil con `npm run desktop:package`. [Guía de escritorio y ubicación de datos](DESKTOP.md).

El nombre se cambia en una sola constante: `APP_NAME`, en `src/lib/brand.ts`. La compilación queda en `releases/Zenty/Zenty.exe`; después de renombrar la constante y recompilar se utiliza automáticamente el nuevo nombre.

## Ejecutar

Requiere Node.js 24 para ejecutar directamente las pruebas TypeScript.

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
npm run preview
```

Abre `http://127.0.0.1:5173/` durante el desarrollo si usarás Spotify. Conserva un mismo origen: `localhost`, `127.0.0.1`, puertos y dominios distintos tienen almacenamiento independiente. Exporta tu espacio antes de cambiar de dirección.

La biblioteca guarda documentos en una carpeta real del equipo. Consulta [formatos, lector, respaldos y funcionamiento local](LIBRARY.md). Para ejecutar la compilación con acceso a los archivos, usa `npm run build` y después `npm start`.

## Qué puedes hacer

- Personalizar nombre, tema claro/oscuro/sistema, siete paletas completas, color libre, ambiente, densidad, reloj y buscador.
- Añadir aplicaciones y enlaces con grupos, colores, edición y orden propio.
- Distribuir diez widgets en tres columnas; arrastrarlos desde Organizar o moverlos con los controles de ajustes. Hay distribuciones Equilibrado, Esencial y Productivo.
- Gestionar tareas con prioridades, fechas, subtareas, filtros y selección para enfoque.
- Usar sesiones de enfoque y pausas configurables. El temporizador conserva su estado al navegar y recargar esta pestaña y calcula el tiempo por fecha de finalización. Saltar no concede minutos.
- Registrar hábitos, escribir notas, capturar ideas y convertirlas en tareas.
- Organizar bloques personales y consultar los eventos de Google Calendar.
- Guardar lecturas reales, añadir un reproductor oficial de Spotify y consultar el tiempo de una ciudad con Open-Meteo.
- Buscar accesos, tareas, notas y acciones con **Ctrl/Cmd K**. **/** enfoca el buscador web; **Esc** cierra ventanas y sale del enfoque.
- Exportar y restaurar respaldos JSON, recuperar el estado anterior a la última importación y descargar datos originales si se detecta corrupción.

## Conectar cuentas

En **Personalizar → Conexiones** hay instrucciones y campos para los Client ID públicos. No se deben introducir contraseñas, Client Secret ni tokens manualmente.

### Spotify

1. Crea una aplicación en [Spotify for Developers](https://developer.spotify.com/dashboard), con Web API.
2. Registra exactamente `http://127.0.0.1:5173/` como Redirect URI para desarrollo; en producción, registra tu dirección HTTPS. Spotify no acepta `localhost` como sustituto de la IP de loopback.
3. Copia su Client ID público a Zenty y añade tu cuenta como usuario autorizado de la aplicación cuando corresponda.
4. Pulsa **Ingresar con Spotify** y autoriza en Spotify.

Se usa Authorization Code con PKCE, un estado aleatorio y verificador de diez minutos. En escritorio, la sesión se conserva cifrada mediante Electron safeStorage en `%APPDATA%\Zenty\connections\spotify-session.enc`; Windows protege el cifrado con DPAPI. La conexión se recupera al abrir y el token se renueva cuando hace falta. En navegador, la sesión se conserva en localStorage. Desconectar elimina el guardado persistente. Las credenciales se excluyen de los respaldos JSON y completos; no se guardan sin cifrar en escritorio si el cifrado no está disponible. El estado temporal de autorización PKCE sigue en sessionStorage. Spotify Connect controla la app o el reproductor web de la misma cuenta; el modo embebido tiene controles independientes y puede reproducir muestras. Spotify puede requerir otra autorización si vence o se revoca el refresh token; un fallo temporal de red conserva el guardado para reintentar.

Puedes usar el reproductor sin Client ID: pega un enlace público de playlist, álbum, canción o podcast en el widget. Zenty comprueba su disponibilidad antes de mostrar el iframe y permite elegir vista ampliada (352 px) o compacta (152 px). Las consultas de existencia se reutilizan durante 30 minutos; un fallo temporal no bloquea el reproductor. La reproducción completa depende de Spotify, su sesión y las capacidades del navegador.

El Client ID de Spotify y Google se oculta por defecto, con botón Mostrar/Ocultar y ocultación automática después de 30 segundos. Es una protección visual; los Client ID siguen siendo identificadores públicos y se incluyen en respaldos.

En la app de Windows, **Volumen de Zenty** aparece sin conectar una cuenta: regula el audio local de esta aplicación, incluido el reproductor integrado, con silencio y preferencia persistente. El reproductor permanece abierto al navegar y dispone de una vista flotante. Si Spotify muestra «Muestra», ofrece un fragmento incluso cuando la playlist contiene canciones completas; la reproducción protegida puede no estar disponible en Electron. [Información oficial sobre muestras](https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting).

El modo predeterminado **Controlar app / navegador** utiliza Spotify Connect: audio completo en el cliente de Windows o el reproductor web abierto con la misma cuenta, con selección de dispositivo, reproducción, pausa, anterior/siguiente, posición y volumen cuando el dispositivo lo admite. Requiere Premium y autorizar los permisos de control; puedes activarlos desde el widget. No transmite audio dentro de Electron. Actualiza la reproducción cada 15 segundos mientras el widget está visible, los dispositivos como máximo una vez por minuto automáticamente y el perfil una vez por sesión. Actualizar permite redetectar dispositivos manualmente. También permite iniciar un álbum, playlist o canción por enlace. La autorización y la reproducción con una cuenta real requieren que el usuario conecte su sesión.

**Activar control de volumen** solicita explícitamente `user-read-playback-state` y `user-modify-playback-state`. El selector cambia el volumen del dispositivo activo de Spotify, requiere Premium y que el dispositivo permita ese control. Envía el cambio al terminar de mover el selector, sin una llamada por cada paso. El audio del iframe tiene controles propios; el selector no modifica el volumen de Windows ni el de otras aplicaciones. No se solicitan estos permisos en la conexión inicial de solo lectura. [Requisitos oficiales del volumen](https://developer.spotify.com/documentation/web-api/reference/set-volume-for-users-playback).

Documentación oficial: [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [cuotas y modo de desarrollo](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [embeds](https://developer.spotify.com/documentation/embeds).

### Google Calendar

1. Habilita Google Calendar API en [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Configura el consentimiento OAuth y los usuarios de prueba cuando corresponda.
3. Crea un Client ID de tipo Aplicación web, con el origen JavaScript autorizado exacto: por ejemplo `http://127.0.0.1:5173`.
4. Copia el Client ID y pulsa **Ingresar con Google**. Permite la lectura de eventos.

Se usa Google Identity Services con `calendar.events.readonly`. Se muestran hasta 50 eventos del calendario principal durante los próximos siete días, actualizados cada cinco minutos. El widget presenta los seis primeros y enlaza a Google para abrirlos. Los bloques creados en Zenty son locales, no se escriben en Google. El token se mantiene en memoria: se vuelve a autorizar después de recargar o vencer la sesión. Desconectar revoca el acceso. No hay sincronización de los datos de Zenty a tu cuenta de Google.

Documentación oficial: [modelo de tokens](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [listar eventos](https://developers.google.com/calendar/api/v3/reference/events/list).

## Biblioteca personal

Importa PDF, DOCX, EPUB, CBZ, TXT, MD e imágenes, conserva tu página o pasaje y organiza favoritos y marcadores. Hay papelera recuperable, descarga de originales y lector con temas Papel, Sepia y Noche. Los archivos y su progreso están en `library-data`, separados del respaldo del dashboard. [Guía completa](LIBRARY.md).

## Rincón gamer

Mis juegos detecta las instalaciones locales y permite buscarlas por nombre, launcher o emulador, ver carátulas, abrirlas, ocultarlas y guardarlas en la juegoteca. Puedes añadir accesos manuales y emuladores con carpetas de ROMs. Incluye regalos, ofertas y lanzamientos desde fuentes reales. [Compatibilidad, límites, datos y funcionamiento](GAMING.md).

## Inicio y noticias

La cabecera compacta reúne saludo, reloj, búsqueda y accesos, y permite desplegar la intención del día. En **Personalizar → Tu estilo → Cabecera del inicio** puedes recuperar la vista panorámica. Los widgets siguen pudiendo ocultarse, moverse y ordenarse.

El widget Noticias muestra cuatro titulares, un tema seleccionable y lecturas guardadas. Comparte consultas con el quiosco; las lecturas se mantienen en su grupo y no se mezclan con los accesos rápidos. El quiosco carga 24 artículos por tanda y permite buscar sin acentos, filtrar fuentes y gestionar temas con teclado y Escape. Los titulares se almacenan en `dashboard-data/news-cache.json` y las imágenes en `dashboard-data/news-images`; en escritorio, dentro de la carpeta de datos del perfil. Al fallar las fuentes se conserva el contenido anterior con su fecha, mostrando que no se pudo actualizar. Las noticias y las imágenes consultan fuentes externas al abrir estos apartados.

## Datos y privacidad

Las **Alarmas y avisos** aparecen en Mi agenda y como widget configurable. Admiten avisos puntuales, diarios, semanales y de lunes a viernes, antelación de 0 a 10.080 minutos y sonido opcional. Las tareas pueden tener fecha, hora y aviso; los eventos de agenda también admiten antelación. Completar o eliminar una tarea cancela su aviso. Las alarmas y opciones se conservan en el respaldo del dashboard.

En Windows el temporizador funciona en el proceso principal, incluso minimizado o durante una recarga de la interfaz; conserva la programación y los avisos enviados en `%APPDATA%\MIA Personal\reminders`. Cerrar la aplicación por completo o apagar el PC detiene los avisos. Al volver se recuperan avisos de los últimos 15 minutos, sin repetir los entregados; no se acumulan avisos antiguos. Si se programa un aviso anticipado que ya pasó pero su cita sigue pendiente, se avisa inmediatamente. En navegador hay avisos internos y notificaciones tras pulsar **Permitir y probar** y conceder permiso; deben mantenerse la página y el navegador abiertos, y el navegador puede retrasarlos en segundo plano. **Probar aviso** comprueba el envío a Windows. Los ajustes de notificaciones y No molestar del sistema siguen aplicándose.

Con el servidor local, el dashboard mantiene también una copia validada en `dashboard-data/dashboard.json` y una versión anterior en `previous.json`. En Electron, esta carpeta, los documentos y la caché gamer se guardan dentro de `%APPDATA%\MIA Personal\data`, fuera de la carpeta del programa. El perfil de escritorio se conserva al reemplazar el ejecutable. [Migración inicial y respaldo completo](DESKTOP.md).

Los datos del dashboard se guardan en `localStorage` bajo `mia_dashboard_v2`. La primera carga migra las claves `dash_*` del proyecto anterior sin borrarlas. Los cambios de otras pestañas del mismo origen se actualizan automáticamente; la última escritura prevalece, no hay resolución de conflictos simultáneos.

Un respaldo incluye datos y ajustes, incluidos los Client ID públicos; nunca las sesiones OAuth. Al importar se valida todo el documento antes de aplicarlo. La importación requiere confirmación y conserva una copia previa en `mia_before_import`. Si se detectan datos corruptos al iniciar, se bloquea la escritura automática hasta restaurar un respaldo válido. **Limpiar los datos del navegador elimina el espacio local: exporta respaldos regularmente.**

Las integraciones contactan servicios externos cuando se configuran: Google Identity, Spotify y Open-Meteo. El Rincón gamer consulta GamerPower, CheapShark y Steam al abrir sus apartados; completar fichas puede enviar el nombre público o ID del juego a Steam. Las carátulas se descargan una vez al consultarlas y se conservan en `gaming-data/images`; las consultas del radar también se guardan en disco. No se envían rutas de instalación, notas ni archivos personales. Las fuentes se solicitan a Google Fonts, con fuentes del sistema como alternativa. Los accesos usan iniciales locales, sin solicitar favicons a terceros. No hay analítica ni sincronización entre dispositivos. La biblioteca utiliza un servidor Node local para conservar archivos y posiciones en disco. Los accesos ejecutables y emuladores están en `gaming-data`, separados del respaldo JSON; copia también esa carpeta para conservarlos. El clima usa la ciudad elegida manualmente y no solicita geolocalización precisa.

## Comprobaciones

`npm test` cubre migración, validación completa de respaldos, duplicados, fechas, horarios, normalización de ajustes, seguridad de enlaces y embeds, rachas locales y recuperación de datos corruptos. `npm run build` comprueba TypeScript y genera el sitio en `dist/`. `npm run lint` revisa el código.

La autorización real de Spotify y Google requiere aplicaciones registradas y consentimiento humano. No puede verificarse una cuenta real sin esos datos. Revisa también las restricciones del proveedor y bloqueos de ventanas emergentes de tu navegador.

El análisis del proyecto y las siguientes mejoras están en [PRODUCT_REVIEW.md](PRODUCT_REVIEW.md).


## Instalación y actualizaciones

Descarga el instalador de Windows en [GitHub Releases](https://github.com/Yiyeh/Zenty/releases/latest). Instálalo por primera vez; después usa **Personalizar → Actualizaciones**. La aplicación instalada comprueba versiones al iniciar y cada seis horas, permite descargar con progreso y reiniciar para instalar. La carpeta portable no dispone de actualización interna.

El save continúa en `%APPDATA%\Zenty`, independiente del instalador. Antes de actualizar se guardan los cambios y se copian ajustes, índices y progreso a `backups` dentro de ese perfil. Esta copia de metadatos no duplica los documentos originales; para un respaldo completo usa **Tus datos → Exportar save completo**.

### Publicar una versión

1. Cambia `version` en `package.json`, la única versión del proyecto, y ejecuta `npm install --package-lock-only`.
2. Ejecuta las pruebas y confirma los cambios en Git.
3. Crea y sube el tag correspondiente, por ejemplo `git tag v1.0.1` y `git push origin v1.0.1`.
4. GitHub Actions compila en Windows, sube el instalador, su blockmap y `latest.yml` a un borrador y publica la release cuando todos los archivos están listos. El tag debe coincidir con `package.json`.

El workflow utiliza `GITHUB_TOKEN` temporal de Actions. No hay tokens de GitHub incrustados en la app. Para compilar sin publicar: `npm run desktop:installer`; el instalador queda en `releases/Zenty-Installer`. La versión portable sigue generándose con `npm run desktop:package`.

Los datos personales, documentos, sesiones, cachés, artefactos y compilaciones se excluyen de Git. Las releases distribuyen únicamente el programa. Las primeras compilaciones no tienen certificado Authenticode; la firma de Windows puede configurarse posteriormente en el proceso de publicación.

## Idiomas

La primera bienvenida pregunta el idioma y el nombre. El idioma también se cambia desde **Personalizar → Tu estilo**. Se guarda en el perfil y en los respaldos; la interfaz cambia sin reiniciar el lector o Spotify. Se incluyen español, inglés, portugués, francés, alemán, italiano, japonés, chino simplificado y coreano.

Los catálogos están organizados en `src/locales/{es,en,pt,fr,de,it,ja,zh,ko}/`, con archivos `common`, `home`, `settings`, `reader`, `gaming`, `services` y `system`. Cada idioma se carga bajo demanda desde archivos locales. `src/lib/i18n.ts` resuelve mensajes, variables, plurales y formatos regionales. Los componentes usan claves, sin cadenas de interfaz en JSX. Los identificadores técnicos y los valores antiguos del save conservan su forma para mantener la compatibilidad. El contenido de libros, mangas, noticias, nombres de juegos y textos escritos por el usuario conserva su idioma original.

`npm run locales:check` comprueba claves, variables y textos/atributos JSX; también forma parte de la compilación. Al añadir un mensaje, utiliza una clave descriptiva y agrégala en todos los idiomas. Las traducciones iniciales se han generado con asistencia automática y necesitan revisión lingüística para pulir matices, especialmente en los idiomas asiáticos. El programa no llama a servicios de traducción al utilizarse.

## PIN opcional

En escritorio, **Personalizar → Seguridad** permite activar, cambiar, desactivar y bloquear la app con un PIN de 6 a 12 dígitos. Está desactivado por defecto. Al reiniciar se exige el PIN; tras cinco fallos hay una espera creciente, conservada en disco. Cada configuración genera un código de recuperación que se muestra una sola vez; guardarlo permite quitar un PIN olvidado sin borrar documentos.

El perfil guarda únicamente hashes scrypt con sal aleatoria en `%APPDATA%\Zenty\security\pin.json`. El PIN no cifra los documentos ni sustituye la protección de Windows. Sus credenciales y el código de recuperación se excluyen de las exportaciones. Al bloquear se guardan los cambios, se detiene el acceso Wi-Fi y las API de datos rechazan peticiones; al desbloquear se puede volver a activar el servidor local desde sus opciones.

El icono geométrico de Zenty se define en `public/favicon.svg`. La compilación genera `desktop/icon.ico` y `public/favicon.ico` con ocho tamaños entre 16 y 256 píxeles, además de un PNG de 512 píxeles. Se utiliza en la ventana, el ejecutable, el instalador y los accesos directos.
