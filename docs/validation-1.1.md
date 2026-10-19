# Validación de Zenty 1.1

- 95 pruebas: 94 pasan; la consulta en vivo a MangaDex se omite en el conjunto determinista.
- Respaldo completo, retención, rechazo de rutas/manipulación y recuperación después de interrumpir realmente un proceso durante la restauración.
- Conflictos de dos clientes: conserva el dashboard anterior, descarga autorizada, confirmación y renovación de ETag. El servidor espera las escrituras en curso antes de restaurar.
- Dispositivos: sesiones independientes, cambio de permisos, bloqueo de escrituras/comandos, revocación individual y continuidad del otro dispositivo. Persistencia de dispositivos recordados y QR local sin credenciales.
- Perfiles y aspecto por dispositivo sobreviven a exportación/importación. Ajustes por documento y metadatos persisten sin cambiar las preferencias generales.
- Navegador con perfiles temporales: cambio de espacio; una tarea creada sin conexión permanece tras recargar y llega al archivo del anfitrión al recuperar conexión; edición de autor/colección/serie; descarga de tres imágenes de prueba a CBZ y apertura local; registro y cierre de una sesión de juego simulada; cambio inmediato a inglés.
- Pruebas a 390 × 844: controles del lector accesibles y barra superior sin desbordamiento horizontal. Fuentes, juegos y documentos usados en estas pruebas son fixtures, no archivos personales.
- Nueve idiomas, 1.853 mensajes por idioma: claves, interpolaciones y atributos accesibles verificados. Los catálogos de traducción automática requieren revisión lingüística adicional para publicación comercial.

La ejecución de la nueva aplicación nativa fue bloqueada por la revisión automática de herramientas («bloqueado por política»). No se eludió ese bloqueo. Las pruebas de escritorio cubren el servidor, persistencia y controles por código; no se ejecutó una instalación real de una actualización ni una prueba con un mando físico. El tiempo de juego se registra por sesiones que se terminan explícitamente.

Publicación final: [Zenty 1.1.1](https://github.com/Yiyeh/Zenty/releases/tag/v1.1.1). Se descargaron los archivos públicos y se verificó que el SHA-512 de latest.yml coincide con el instalador. La copia en releases/Zenty-Installer corresponde a esos mismos archivos. La revisión 1.1.1 permite recorrer y cerrar las fichas de juegos con el mando.
