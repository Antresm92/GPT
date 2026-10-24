# Zonas de Vida · GPS + Diagrama de Holdridge

App para Android (y web instalable) que:

- toma puntos con el **GPS** del teléfono o con coordenadas escritas a mano,
- calcula **área y perímetro** del terreno (hectáreas, m², km² y fanegadas),
- entrega un **informe de zona de vida de Holdridge** con su diagrama, región latitudinal, piso altitudinal y provincia de humedad,
- **funciona sin conexión**: los puntos se guardan en el equipo y, cuando hay internet, se pueden completar con altitud y clima de la zona.

---

## 1. Obtener el APK sin instalar nada en tu computador

El APK se compila en la nube gratuita de GitHub. Hace falta una cuenta de GitHub (gratis) y unos 10 minutos.

1. Descomprime este `.zip`.
2. En <https://github.com/new> crea un repositorio (puede ser **privado**). Nómbralo, por ejemplo, `zonas-de-vida`.
3. En el repositorio nuevo pulsa **Add file → Upload files** y arrastra **todo el contenido** de la carpeta descomprimida (incluida la carpeta oculta `.github`). Pulsa **Commit changes**.
   - Si tu sistema no sube la carpeta `.github`, créala a mano: **Add file → Create new file**, escribe como nombre `.github/workflows/android.yml`, pega el contenido del archivo `android.yml` de este proyecto y confirma.
4. Abre la pestaña **Actions**. Si aparece un botón para habilitar los flujos de trabajo, púlsalo.
5. Elige **Compilar APK de Android → Run workflow**. Tarda entre 5 y 15 minutos.
6. Al terminar, entra a la ejecución (marca verde ✓) y baja hasta **Artifacts**: descarga `APK_DiagramaH_iA3`. Es un `.zip` con `APK_DiagramaH_iA3.apk` dentro.
7. Pasa el `.apk` al teléfono, ábrelo y acepta **instalar apps de origen desconocido** cuando Android lo pida.

Si la compilación falla (✗ roja), abre el paso que falló y copia el mensaje de error: con él se puede corregir.

El flujo genera un APK **debug firmado automáticamente por Android**, instalable para pruebas y uso personal. No es un paquete de publicación para Google Play. Cada ejecución de GitHub puede usar una clave de depuración distinta; por eso, para instalar una compilación nueva sobre una anterior podría ser necesario desinstalar la anterior primero (lo que borra sus datos). Exporta una copia de seguridad desde **Proyectos** antes de hacerlo. Para distribuir actualizaciones manteniendo la instalación y sus datos, se debe configurar una clave privada de lanzamiento y compilar un APK release firmado con esa misma clave.

### Alternativa: compilar con Android Studio en Windows

1. Instala Node.js 20 o superior, JDK 21 y Android Studio. Abre la carpeta del proyecto en una terminal de Windows.
2. Ejecuta `npm install` y luego `npm run android:add`. Esto crea la carpeta `android/`, aplica los permisos GPS y sincroniza la app web con Capacitor.
3. Abre en Android Studio la carpeta `android/` (no la carpeta superior) y espera a que termine **Gradle Sync**. Si Android Studio solicita componentes del SDK, acepta instalarlos.
4. En Android Studio, selecciona **Build → Build Bundle(s) / APK(s) → Build APK(s)**. La opción genera un APK debug instalable y muestra una notificación con **Locate** para abrir su ubicación.
5. También puedes compilar desde la terminal de Android Studio con `.\gradlew.bat assembleDebug`. El archivo queda en `android\app\build\outputs\apk\debug\app-debug.apk`.

Este APK debug sirve para pruebas y uso personal, no para publicar en Google Play. Conserva una copia de seguridad desde **Proyectos** antes de reemplazar una instalación, ya que las claves debug pueden diferir entre compilaciones.

### Alternativa: web instalable (sin APK)
Sube la carpeta `www/` a cualquier alojamiento web con HTTPS (por ejemplo GitHub Pages), ábrela en Chrome del teléfono y elige **Instalar app / Añadir a pantalla de inicio**. Después de la primera visita abre sin conexión. Si cambias archivos, sube el número de `CACHE` en `www/sw.js` para que los teléfonos se actualicen.

---

## 2. Cómo se usa

1. **Puntos**: pulsa *Activar GPS* y luego *Marcar punto aquí* en cada vértice del terreno. Quédate quieto unos 10 segundos: la app promedia las lecturas. También puedes *Escribir coordenadas* (decimales o grados-minutos-segundos) o *Pegar varias*.
2. **Polígono**: el control circular transparente de la esquina superior izquierda del mapa activa o desactiva el trazado. Desactivado, se muestran e informan solo las coordenadas de los puntos, sin área ni perímetro; activado, con 3 o más puntos se muestra el contorno y se calculan sus medidas. El ajuste se guarda por proyecto. El menú ⋮ de la esquina superior derecha permite agregar vértices tocando el mapa, por coordenadas o caminando el lindero con GPS; finaliza desde el botón inferior. El recorrido registra un vértice aproximadamente cada 5 m y filtra lecturas con precisión superior a 30 m. Si los lados se cruzan, avisa y ofrece reordenar los puntos.
3. **Información-DH**: reúne los datos climáticos del sitio y del diagrama de Holdridge; muestra la altitud, la temperatura y la precipitación, su procedencia y permite corregirlas.
4. **Informe**: muestra y permite compartir un informe parcial con los datos disponibles aunque falte temperatura o precipitación. Indica cuál dato falta y aclara que, por ello, no se determina la zona de vida ni se entrega el diagrama de Holdridge hasta completar los datos necesarios.

Cuando el clima descargado incluye las 12 medias mensuales de temperatura y precipitación, la pestaña **Clima** y el informe muestran el diagrama ombrotérmico Walter-Lieth. Conserva la escala común 1 °C = 2 mm; el sombreado naranja marca meses con P < 2T y el azul, meses con P > 2T. La fuente y el año se identifican cuando están disponibles; el gráfico solo aparece si ambas series mensuales están completas.

La navegación principal contiene **Puntos**, **Polígono**, **Información-DH**, **Informe** y **Herramientas**. Herramientas incluye conversores de área, distancia, peso, volumen, energía, temperatura, velocidad y potencia; Distancia permite medir una línea con toques en el mapa, coordenadas o GPS, y ofrece mapa/croquis y capas OpenStreetMap/Satélite. GPS muestra las coordenadas y precisión actuales, permite copiarlas y convertir grados decimales a grados-minutos-segundos.

En **Herramientas > Clima** se puede consultar el tiempo actual del centro del proyecto o de otro lugar, buscándolo por nombre o seleccionándolo en el mapa. La consulta requiere internet y se realiza con Open-Meteo. La última consulta se conserva en el proyecto y aparece en la pestaña **Informe** y en el informe compartido; se identifica como una observación puntual, distinta de los promedios anuales y mensuales utilizados para la clasificación de Holdridge. Sin conexión no se actualiza el tiempo actual; los datos ya consultados permanecen visibles.

Al abrir **Polígono**, se muestra directamente el mapa interactivo (OpenStreetMap o imágenes satelitales de Esri); desde el selector superior puedes cambiar a Croquis. En el borde inferior izquierdo, los controles van apilados verticalmente en este orden: **Crear polígono**, **Último punto** y **Marcar punto**. El primero activa/desactiva el modo polígono: apagado, cada coordenada queda como punto independiente y el informe no calcula área ni perímetro; encendido, se dibuja el contorno semitransparente y, con tres vértices o más, se calculan las medidas. **Último punto** centra el mapa en el vértice añadido más recientemente. **Marcar punto** toma una lectura GPS promediada y guarda la ubicación actual como el siguiente punto. El primer punto de la lista es la referencia inicial del recorrido; al eliminarlo, el siguiente punto pasa a ser la referencia. El botón circular de ubicación GPS, abajo a la derecha, solo centra el mapa en la ubicación actual y no activa el modo polígono ni inicia seguimiento continuo. Cuando el menú ⋮ está abierto, los controles flotantes se ocultan para despejar el mapa. Al agregar un punto tocando el mapa, las coordenadas aparecen como un dato de solo lectura; **Modificar coordenadas** abre el campo editable sin activar el teclado automáticamente. Desde **Puntos** o al elegir **Editar punto** en el mapa, primero se muestra una ficha de solo lectura con los datos guardados; pulsa **Editar información** para abrir los campos. La edición tampoco enfoca automáticamente ningún campo: toca el dato que quieras cambiar para abrir el teclado. Mantén un punto presionado durante **0,5 segundos** y arrástralo para cambiar su ubicación; haz doble toque o doble clic en un punto para abrir sus opciones: cambiar nombre y color, corregir la ubicación con coordenadas manuales, tomar/elegir o quitar una foto y eliminar el punto (con confirmación). En las opciones del punto, el campo **Historia breve de la foto** permite guardar hasta 300 caracteres. Desde **Puntos**, pulsa el botón de foto junto a un punto para verla, reemplazarla o quitarla. Tras seleccionar o tomar una imagen, aparece una vista previa con **Aceptar y guardar foto** y **Cancelar**; al aceptar, se guarda en el punto y se cierra el flujo de foto. La ficha también tiene **Aceptar y volver a Puntos**, para salir sin depender de la X. Las fotos se comprimen y se guardan localmente con el punto; no se envían a internet y también forman parte del respaldo del proyecto. En el informe HTML, debajo de los datos de cada punto aparecen su foto y la historia asociada; al imprimir o guardar como PDF se incluyen junto con el resto del informe. El menú ⋮ de arriba a la derecha permite elegir entre colocar vértices tocando el mapa, escribir coordenadas o caminar el lindero con el GPS; el botón inferior finaliza la captura y guarda los vértices del recorrido. Leaflet 1.9.4 y sus recursos se incluyen localmente (licencia BSD-2-Clause), por lo que la interfaz del mapa abre sin internet. Los mosaicos de OSM y Esri sí necesitan conexión y no se descargan ni almacenan; sin red, el mapa conserva los puntos y el polígono sobre un fondo vacío y muestra un aviso, y el croquis permanece disponible.

### Archivos SIG y copias de seguridad

En **Informe**, pulsa **Exportar informe** para elegir entre guardar/compartir una página HTML autocontenida o abrir la vista de impresión y seleccionar **Guardar como PDF**. El PDF se prepara en formato A4 con el diagrama y las tablas; la opción puede variar según las capacidades del navegador o del dispositivo. En **Polígono** puedes importar un polígono `.geojson`, `.json` GeoJSON o `.kml`; la app valida todos los vértices, avisa antes de agregarlos y conserva los puntos existentes. Los nuevos vértices aparecen en rojo y los puntos existentes en azul. Al crear o editar puntos puedes elegir el color que se muestra en la lista y en el croquis del terreno.

También puedes exportar el levantamiento como KML (polígono y marcadores con altitud), GeoJSON WGS84 (FeatureCollection con polígono y puntos), GPX (waypoints y track) o CSV (coordenadas, altitud, rumbo y distancia al siguiente vértice). Las opciones para guardar/compartir aparecen en Área e Informe.

En **Proyectos** puedes exportar o restaurar una copia JSON de todos los proyectos, puntos, preferencias y datos climáticos guardados en el dispositivo. La restauración valida el archivo y pide confirmación porque reemplaza los datos actuales.

Al pulsar **Exportar informe**, primero se revisan localmente los puntos, coordenadas y altitudes existentes, y se muestran los resultados antes de hacer cualquier consulta. Elige **Usar datos actuales (sin consultas)** para generar el informe sin esperar a internet, o **Buscar o contrastar cotas por internet** para intentar completar altitudes faltantes y preparar el croquis satelital. Esta segunda opción es experimental: depende de Open-Meteo, de Esri y de la conexión; puede tardar o no estar disponible. Si falla, el informe se genera con los datos guardados y explica qué sección no pudo completarse.

El informe incluye tres vistas del terreno: croquis tradicional (disponible offline), croquis sobre imagen satelital y perfil del relieve. El perfil solo se dibuja si todos los puntos tienen coordenadas válidas y altitud; si falta alguna, el informe sigue adelante y enumera los puntos incompletos. Con el polígono activo se muestra el contorno cerrado y el área sombreada; con el modo desactivado, los puntos se conectan como recorrido abierto y se conserva el aviso de que no se calculan área ni perímetro. En ambos modos se informa la distancia desde el primer hasta el último punto.

La app abre con un video de presentación local de seis segundos y una tarjeta final de un segundo con los créditos; se puede omitir desde la pantalla. El video se incluye en la caché offline. La versión actual de la app es **27.6**; cada modificación publicada incrementará 0.1 (27.7, 27.8…). El `versionCode` de Android se genera a partir de esa versión. El número de caché del Service Worker es independiente y solo cambia para renovar recursos offline.

### De dónde sale cada dato

| Dato | Por defecto | Cómo corregirlo |
|---|---|---|
| **Altitud** | La del **GPS** cuando el sistema de ubicación del teléfono entrega ese dato (mediana de las lecturas válidas) | El dato es opcional y no todos los teléfonos/receptores lo reportan en cada lectura. La señal puede omitirlo por interiores, mala vista del cielo o falta de una solución vertical fiable. Si falta, ingrésalo al editar el punto o elige la búsqueda experimental por internet al exportar. El modelo de elevación puede diferir de la altura GPS y se muestra como complemento/contraste, no como medición de campo. |
| **Temperatura** | **Estimada** con la altitud y la latitud: `T ≈ 28,2 − 0,009·lat² − 0,00533·altitud` (lat ≤ 40°). Error esperado ≈ ±2 °C en el trópico | Escribir una temperatura medida; manda sobre cualquier estimación |
| **Precipitación** | No se deduce del GPS. Puede venir de un dato manual/CSV, memoria cercana (≤ 25 km), NASA POWER o estimarse con la suma de lluvia diaria del último año completo de Open-Meteo | Si cuentas con una estación confiable o un promedio de varios años, ingrésalo manualmente; tiene prioridad sobre las fuentes automáticas |

Al exportar un informe, las consultas de internet solo se realizan si se elige expresamente **Buscar o contrastar cotas por internet**. Esa opción consulta Open-Meteo para altitudes puntuales de todos los vértices, completa solo las altitudes que falten y contrasta las registradas; mantiene las cotas GPS o manuales. También intenta preparar la imagen satelital. No interviene en la opción **Usar datos actuales (sin consultas)**. La sección *Completar con internet* de la pestaña Información-DH es independiente: consulta fuentes climáticas y puede guardar sus resultados. NASA POWER aporta climatología mensual; Open-Meteo aporta también datos históricos; un solo año puede diferir del promedio climático de largo plazo.

El informe puede compartirse aunque falten datos: presenta área, coordenadas, altitud y valores climáticos disponibles, y especifica qué falta. Sin temperatura y precipitación anuales no se determina la zona de vida ni se entrega el diagrama de Holdridge.

*Importar CSV*: columnas `lat, lon` y `temp` y/o `prec` (opcional `alt`, `nombre`), con coma, punto y coma o tabulador. Reconoce `bio1`/`bio12` de WorldClim.

La altitud del GPS puede venir medida desde el elipsoide y no desde el nivel del mar; la diferencia puede llegar a unos 100 m en el peor lugar del planeta, y aun así equivale a menos de 1 °C de temperatura estimada.

---

## 3. Qué está verificado y qué no

**Verificado aquí (pruebas automáticas, `npm test`, y navegador simulado):**
- Distancias (caso de referencia de Vincenty) y áreas en el elipsoide WGS84 contra una integración numérica independiente, incluyendo hemisferio sur, 60° de latitud y cruce del meridiano 180°.
- La geometría del diagrama de Holdridge (36 hexágonos, escalas de biotemperatura y evapotranspiración, línea de escarcha) comparada con la imagen de referencia, y las zonas de vida de Bogotá (bh-MB), Medellín (bh-PM), Santa Marta (bms-T), Amazonía (bh-T) y Chocó (bp-T).
- La app completa en un navegador de escritorio con un GPS simulado: marcar puntos con altitud, corregirla a mano y restaurarla, área, informe y diagrama, y funcionamiento **sin red** (recarga, guardado de puntos y avisos).

**No verificado:**
- **El APK no se compiló aquí** (el entorno donde se hizo bloquea los servidores de Android y npm). El flujo de GitHub es estándar, pero es la primera vez que se ejecuta.
- **No se probó en un teléfono real:** permisos de ubicación, precisión del GPS y compartir archivos con el sistema.
- Los controles nuevos del menú del mapa, el recorrido GPS del polígono y la gestión de fotos aún requieren una comprobación de interfaz en un teléfono Android.
- **La consulta histórica de Open-Meteo** se comprobó con un punto de ejemplo. La respuesta de NASA POWER y las consultas desde un teléfono real aún no se han validado en campo.
- La estimación de temperatura se ajustó con valores aproximados de ciudades colombianas, no con una serie de estaciones; fuera del trópico es solo una referencia.

El resultado es una **clasificación bioclimática orientativa**: no reemplaza un estudio de campo ni los datos de una estación meteorológica cercana.

---

## 4. Estructura

```
www/                 la app (HTML, CSS y JavaScript sin dependencias)
  js/geo.js          coordenadas, distancias, área, centroide
  js/gis.js          importación/exportación KML, GeoJSON, GPX y CSV
  js/holdridge.js    biotemperatura, hexágonos, provincias de humedad, sensibilidad
  js/climate.js      altitud → temperatura, memoria offline, CSV, descargas
  js/analysis.js     une todo para un proyecto
  js/gps.js          lecturas del GPS promediadas
  js/diagram.js      diagrama interactivo y versión para el informe
  js/walter-lieth.js gráfico ombrotérmico mensual en SVG
  lib/leaflet/        Leaflet 1.9.4 local y licencia (BSD-2-Clause)
tests/               pruebas automáticas (npm test)
android-res/         íconos de Android
scripts/             parche de configuración Android
.github/workflows/   compilación del APK
```
