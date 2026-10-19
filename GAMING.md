# Rincón gamer

Acceso desde el menú lateral, la búsqueda de acciones o `/#gaming`.

- **Juegos gratis:** promociones activas de [GamerPower](https://www.gamerpower.com/api-read), separadas en juegos completos, DLC/contenido y betas/pruebas. Cada ficha permite consultar instrucciones, plataformas y la fecha de cierre publicada. Los enlaces llevan a la ficha de GamerPower con sus requisitos. Una promoción puede requerir cuenta, región, claves limitadas o un juego base; no implica que el juego sea gratuito para siempre.
- **Lanzamientos:** selección de próximos y nuevos títulos publicada por Steam. Las próximas fechas proceden de la ficha del juego; expresiones como «Q1 2027» se conservan como texto, sin inventar un día. Se pueden excluir demos, filtrar próximos/recientes y descargar una cita `.ics` cuando hay una fecha exacta. No es un calendario exhaustivo. La integración usa endpoints públicos de la tienda, sin contrato estable; si cambian, se muestra un error recuperable. Incluye enlaces a los catálogos oficiales de consolas.
- **Ofertas de PC:** selección de [CheapShark](https://apidocs.cheapshark.com/) con tienda, descuento y precios en **USD**. Los enlaces usan la redirección exigida por el proveedor. No se convierten a CLP ni se garantiza disponibilidad regional. El precio definitivo es el que aparece al comprar.
- **Mi juegoteca:** favoritos y juegos añadidos manualmente de cualquier plataforma, estados Pendiente/Jugando/Terminado/Reclamado y notas personales. Al quitar un juego aparece Deshacer. Los juegos siguen guardados aunque la promoción deje de aparecer en la fuente.
- **Personalización:** plataforma favorita, ocultar regalos reclamados, incluir demos y un widget Radar gamer opcional para Mi espacio.

## Datos y conexión

### Juegos instalados y emuladores

**Mis juegos** es la vista inicial. La detección automática funciona en Windows y consulta manifiestos o registros conocidos, sin recorrer discos completos:

| Plataforma | Detección |
| --- | --- |
| Steam | `libraryfolders.vdf` y manifiestos de juegos instalados en todas sus bibliotecas; puede incluir aplicaciones compradas en Steam |
| Epic Games | Manifiestos `.item` completos, con carpetas existentes |
| GOG | Registro de juegos de GOG, con ejecutable verificado |
| Amazon Games | Base local de instalaciones SQLite abierta en modo solo lectura y entradas de instalación identificables |
| Ubisoft Connect | Entradas registradas; se usa el protocolo del launcher cuando hay un ID de Uplay |
| EA, Battle.net, Riot | Entradas de instalación que identifiquen un ejecutable dentro de la carpeta del juego; la cobertura depende del launcher y su versión |
| Xbox / Microsoft Store | Paquetes de juegos accesibles con `MicrosoftGame.config` y manifiesto de aplicación; las carpetas protegidas pueden impedir la detección |
| Cualquier otro | Añadir acceso manual al `.exe`, con argumentos opcionales |

Los clientes y componentes auxiliares identificables se excluyen. No se importan bibliotecas de juegos sin instalar ni credenciales de cuentas. Si falta un juego, se puede añadir manualmente. Cada card permite Jugar, guardar/quitar de la juegoteca y ocultar. Ocultos permite restaurarlo; quitar accesos manuales es reversible desde Compatibilidad → Accesos quitados. Nada desinstala ni borra archivos.

La búsqueda usa un índice local que ignora acentos, combina palabras y busca también launcher/emulador. `/` enfoca la búsqueda. Hay vistas de carátulas y lista, filtros de launcher/favoritos/ocultos y orden por nombre o aperturas recientes. El listado no espera a que lleguen las fichas. Las imágenes se cargan bajo demanda; solo se completan las cards visibles, con concurrencia limitada y prioridad para la ficha que abres. Los datos de Steam tienen caché de 30 días; las coincidencias por nombre deben ser exactas para evitar asignar otra edición o secuela. Si no hay datos se conserva el acceso y se puede indicar una imagen HTTPS propia.

Los launchers pueden cambiar sus formatos locales. El escaneo conserva resultados en memoria durante cinco minutos y se puede repetir con Detectar juegos. La primera detección necesita unos segundos; al volver al apartado se mantiene el listado mientras se actualiza. Antes de abrir se comprueba que el acceso siga disponible. El botón envía una solicitud al launcher o ejecutable; no garantiza que el juego llegue al menú, ni evita DRM, sesiones de cuenta o actualizaciones.

**Emuladores** permite configurar un `.exe`, una carpeta de ROMs, extensiones y argumentos. Hay plantillas para Dolphin, PCSX2, DuckStation, PPSSPP y RetroArch, más una opción libre. `{rom}` representa la ruta del archivo y se pasa como argumento sin intérprete de comandos. RetroArch requiere que indiques el core real. Se pueden incluir subcarpetas hasta cuatro niveles y hasta 2.000 ROMs por emulador; los enlaces simbólicos se omiten. No se incluyen descargas de emuladores, BIOS ni ROMs. Quitar/restaurar un emulador afecta únicamente a Zenty.

La configuración local está en `gaming-data/local-games.json`, fuera de los archivos públicos y del respaldo del dashboard. Para conservar accesos, emuladores y carátulas personalizadas, copia `gaming-data` con Zenty cerrado. El respaldo del dashboard sí incluye favoritos, notas, ocultos y preferencias. Importar ese respaldo no crea instrucciones ejecutables. El servidor solo lanza IDs de accesos detectados/configurados, requiere cabecera local y mismo origen, y no acepta comandos, URIs ni rutas enviadas en una solicitud de lanzamiento. No se ejecutan archivos de consola o scripts como juegos.

No se necesitan claves API ni cuentas para consultar el radar. Reclamar promociones y comprar se hace en sus respectivas webs. No se han conectado ni importado cuentas Steam/Epic/Discord/Twitch; los accesos rápidos abren sus páginas oficiales.

La juegoteca y las preferencias se guardan junto con los demás datos del dashboard en el navegador y se incluyen en su exportación JSON. No se sincronizan con las bibliotecas de las tiendas. Las ofertas guardadas son una captura de la consulta: vuelve a la fuente para comprobar precio y vigencia. Los documentos y su progreso siguen en la carpeta de biblioteca, separados del JSON.

El servidor local ofrece únicamente `GET /api/gaming/giveaways`, `/deals` y `/releases`. Solo consulta URLs fijas; no permite actuar como proxy de direcciones arbitrarias. El mismo servicio funciona con Vite, preview y `npm start`. Se limita a solicitudes locales, valida los enlaces HTTPS y no expone credenciales.

Cada fuente mantiene una caché en disco y memoria de 15 minutos; se carga al abrir su apartado, sin rastreo de catálogos en segundo plano. Actualizar vuelve a consultar el servidor, respetando esa caché. Las peticiones concurrentes comparten consulta y los fallos esperan un minuto antes de reintentar. Si hay un fallo y existe una respuesta previa, se conserva con un aviso y su fecha original. Reiniciar el servidor conserva estas consultas: se reutilizan si siguen vigentes y se mantienen como referencia con un aviso si no hay conexión.

Las carátulas pasan por un servidor local que las guarda al consultarlas por primera vez en `gaming-data/images` (archivo binario y ficha JSON con URL, formato, fecha y checksum). Las siguientes consultas usan esa copia incluso después de reiniciar, sin llamar al servidor externo. La caché del navegador evita además repetir transferencias locales. Si la fuente cambia la URL de una imagen, se descarga una nueva copia; las anteriores se conservan. Los regalos, ofertas y lanzamientos se guardan en `gaming-data/feeds`. Las fichas están en `gaming-data/local-games.json`, con vigencia de 30 días (un día para búsquedas sin coincidencia); vencidas se sirven inmediatamente mientras se intenta renovarlas. Las carátulas personalizadas se conservan. Solo se solicitan imágenes vistas; las que aún no se han consultado requieren conexión la primera vez. Los textos externos se muestran como texto, sin ejecutar HTML. GamerPower no identifica la zona horaria de sus cierres: se muestra el día publicado y no se inventa una cuenta atrás precisa.

## Verificación

`npm test` comprueba regalos, ofertas, fechas, respaldos, caché, fallos y restricciones de las APIs; además, detección de Steam/Epic/GOG/Amazon con instalaciones de prueba, ROMs, búsqueda, configuración persistente, restauración y lanzamiento por ID mediante un lanzador simulado. Las comprobaciones visuales cubren escritorio/móvil y los controles de biblioteca. No se han abierto juegos reales durante las pruebas ni probado cuentas que no estaban disponibles en el equipo.
