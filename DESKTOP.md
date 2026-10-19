# Zenty para Windows

La aplicación Electron abre Zenty sin pestañas ni barra de direcciones. El primer inicio es a pantalla completa; después recuerda el modo y tamaño usados al cerrar. Una barra de 35 px permite arrastrar la ventana, minimizar, maximizar/restaurar, alternar pantalla completa y cerrar. **F11** alterna pantalla completa; doble clic sobre la barra maximiza/restaura. Los controles siguen accesibles al abrir ajustes o el lector. El icono de carpeta abre tus datos.

## Abrir y generar la aplicación

Para trabajar desde el proyecto, con Node.js 24:

```sh
npm install
npm run desktop
```

Para generar una carpeta portátil de Windows x64:

```sh
npm run desktop:package
```

Abre `releases/Zenty/Zenty.exe`. Conserva **toda esa carpeta**: el ejecutable necesita los archivos que lo acompañan. La versión empaquetada incluye su propio runtime y servidor; no requiere Node, una terminal abierta ni Vite. No instala servicios ni configura el arranque de Windows. Es una compilación local sin firma de distribución.

## Cambiar el nombre

Edita únicamente `APP_NAME` en `src/lib/brand.ts` y vuelve a ejecutar `npm run desktop:package`. Esa constante alimenta la interfaz, títulos, notificaciones, archivos exportados y metadatos del ejecutable. La salida será `releases/<APP_NAME>/<APP_NAME>.exe`. Si ya existe una compilación con ese nombre, se conserva en `releases/.previous` antes de reemplazarla. Cierra la aplicación antes de reemplazar una compilación en uso.

La carpeta de perfil conserva el nombre histórico `MIA Personal` y las claves internas de almacenamiento se mantienen estables para que cambiar la marca no borre tus datos ni ajustes.

## Datos que sobreviven a las actualizaciones

El perfil está en `%APPDATA%\MIA Personal`. Los datos están en su subcarpeta `data`:

- `dashboard-data/dashboard.json`: ajustes, accesos, tareas, notas y juegoteca. `previous.json` conserva la escritura anterior.
- `library-data`: documentos originales, índice, progreso y preferencias del lector.
- `gaming-data`: accesos de juegos, emuladores, fichas, imágenes descargadas y consultas del radar.

El primer inicio desde el proyecto copia esas tres carpetas a este perfil, sin borrar los originales ni sobrescribir carpetas que ya existan en el destino. Para trasladar el dashboard del navegador, abre primero la web actualizada para que guarde su copia en disco, o usa Exportar/Importar respaldo en Personalizar. Las sesiones de Spotify/Google no se trasladan. El navegador y la app mantienen perfiles separados después de esta copia inicial.

Cerrar Zenty detiene su servidor local. La aplicación inicia una sola instancia y usa `http://127.0.0.1:17731/`, accesible únicamente en este equipo. Si ese puerto está ocupado por otro proceso, muestra un error conservando los datos; no cambia de puerto. Reemplazar la carpeta del programa conserva el perfil. Para un respaldo completo, cierra Zenty y copia toda la carpeta `data`, además del respaldo JSON exportable.

## Conexiones y seguridad

El modo predeterminado **Controlar app / navegador** usa Spotify Connect: maneja Spotify de Windows o el reproductor web con la misma cuenta Premium y permiso de control de reproducción. Incluye selección de dispositivo, anterior/siguiente, reproducir/pausar, posición y volumen del dispositivo compatible. El sonido se reproduce en ese cliente, sin depender del audio protegido de Electron. Abre Spotify, reproduce algo y actualiza los dispositivos desde el widget. La conexión real debe autorizarla el usuario.

En el modo **Integrado**, el widget de música incluye **Volumen de Zenty** y silencio sin iniciar sesión. Regula las sesiones de audio de los procesos de esta aplicación con Windows Core Audio, incluyendo el iframe de Spotify; no cambia el volumen maestro de Windows ni otras aplicaciones. Conserva la preferencia en `audio.json` del perfil y la aplica al comenzar el audio. El auxiliar nativo se ejecuta solo al consultar o modificar volumen, sin un proceso residente de PowerShell ni permisos de administrador.

El reproductor integrado se mantiene montado al navegar, cambiar tamaño o mover el widget. Fuera de su sección queda disponible en un minirreproductor flotante. Si Spotify indica «Muestra», el contenido se está ofreciendo como fragmento aunque la playlist tenga canciones completas: Electron puede no disponer de las capacidades de reproducción protegida que Spotify requiere. [Explicación oficial de las muestras](https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting).

**Mi agenda → Alarmas y avisos** incluye alarmas y recordatorios de tareas o eventos. El proceso principal conserva la programación y los avisos enviados en `%APPDATA%\MIA Personal\reminders`, evita duplicados y sigue funcionando minimizado. Cerrar por completo Zenty detiene el temporizador; no se configura inicio automático ni tareas del sistema. **Probar aviso** solicita una notificación real a Windows. Para respaldar también estas preferencias y el historial de avisos, copia el perfil completo.

Spotify requiere registrar `http://127.0.0.1:17731/` como Redirect URI en su aplicación de desarrollador. Google requiere registrar el origen `http://127.0.0.1:17731`. Algunos proveedores pueden restringir la autenticación en navegadores embebidos; no se alteran sus políticas ni se simula una sesión. La autorización de una cuenta real requiere el consentimiento del usuario.

Los enlaces normales abren el navegador predeterminado. Las páginas remotas de autorización se abren aisladas, sin acceso a controles del sistema. El contenido de Zenty usa sandbox, aislamiento de contexto, Node desactivado en el renderer, CSP y operaciones IPC concretas con verificación de origen y ventana. Los juegos se lanzan mediante el servicio local validado que ya usa la biblioteca; el renderer no recibe acceso genérico al sistema.

## Verificación

`npm test` incluye controles de ventana, límites de enlaces/IPC, persistencia del dashboard, conservación ante datos corruptos y aislamiento de archivos personales del servidor estático. `npm run desktop:build` comprueba y compila también el servidor que se incluye en Electron. La app carga la compilación de producción, sin depender del servidor de desarrollo.
