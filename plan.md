# Especificación maestra — Sistema personal de audiolibros y aprendizaje

**Versión:** 1.0
**Estado:** arquitectura funcional congelada
**Plataforma principal:** Windows + Android
**Principio:** offline-first, simple, recuperable ante errores y sin APIs de IA de pago

---

# 1. Objetivo del sistema

Construir un sistema personal que convierta material de estudio en Markdown, en español o inglés, en audiolibros de alta calidad y que permita consumirlos durante aproximadamente cuatro horas diarias de transporte.

El sistema debe:

1. Generar automáticamente audio con la mejor calidad disponible.
2. Priorizar Gemini AI Studio.
3. Utilizar F5-TTS como fallback local.
4. Utilizar Edge TTS como último fallback.
5. Mantener automáticamente material descargado en Android.
6. Funcionar completamente offline en Android.
7. Registrar progreso, notas, bookmarks y repasos.
8. Permitir exámenes escritos.
9. Implementar repetición espaciada mediante FSRS.
10. Integrar manualmente ChatGPT para generación y evaluación intelectual de material.
11. Permitir cheatsheets escritos principalmente por el usuario.
12. Minimizar interacción administrativa diaria.

El sistema se divide conceptualmente en:

`producción → distribución → consumo → aprendizaje → sincronización`

---

# 2. Restricciones no negociables

## 2.1 IA intelectual

No se ejecutará ningún LLM local para:

* resumir;
* reescribir;
* crear preguntas;
* evaluar respuestas;
* crear cheatsheets;
* explicar conceptos;
* aplicar Feynman;
* generar microlecciones intelectuales.

Todo ese trabajo se hará mediante ChatGPT.

No habrá integración mediante API de ChatGPT en el MVP.

La interacción será manual:

`aplicación → copiar contenido → ChatGPT → copiar resultado → aplicación`

La aplicación facilitará este proceso, pero nunca dependerá de una API.

---

## 2.2 Modelos locales permitidos

Que no existan LLM locales no impide utilizar herramientas especializadas.

Se permiten:

* F5-TTS para síntesis;
* Whisper existente para QA/transcripción cuando resulte útil;
* FFmpeg;
* procesamiento determinista de Markdown;
* algoritmos convencionales;
* FSRS.

La RTX 3070 de 8 GB queda principalmente disponible para F5-TTS y, opcionalmente, Whisper.

---

# 3. Responsabilidad de cada dispositivo

## PC Windows

Es el servidor maestro.

Hace:

* importación de Markdown;
* gestión de biblioteca;
* segmentación de texto;
* automatización de Gemini AI Studio;
* F5-TTS;
* Edge TTS;
* conversión WAV → MP3;
* QA del audio;
* almacenamiento maestro;
* preparación de contenido offline;
* sincronización;
* backups;
* interfaz para copiar contenido hacia ChatGPT;
* importación manual de resultados procedentes de ChatGPT.

No necesita permanecer encendido durante el transporte.

---

## Android

Es un cliente offline.

Hace:

* reproducir audiolibros;
* reproducción con pantalla bloqueada;
* cambio de velocidad;
* skip silence;
* selección de capítulo;
* cambio de idioma;
* bookmarks;
* notas;
* cheatsheets;
* exámenes;
* guardar respuestas;
* FSRS;
* registrar progreso;
* mostrar estadísticas;
* sincronizar cuando recupera conexión.

No hace:

* TTS;
* procesamiento de Markdown;
* LLM;
* generación de preguntas;
* evaluación semántica;
* conversión de audio;
* procesamiento pesado.

---

# 4. Arquitectura general

```text
              ┌────────────────────────────┐
              │       CHATGPT              │
              │                            │
              │ Resumen                    │
              │ Feynman                    │
              │ Preguntas                  │
              │ Evaluación                 │
              │ Mejora cheatsheets         │
              │ Microlecciones             │
              └────────────▲───────────────┘
                           │
                    copiar / pegar
                           │
┌──────────────────────────┴────────────────────────┐
│                    PC WINDOWS                     │
│                                                   │
│ Markdown                                          │
│    ↓                                              │
│ Biblioteca                                        │
│    ↓                                              │
│ Procesamiento determinista                        │
│    ↓                                              │
│ Segmentación                                      │
│    ↓                                              │
│ Cola TTS                                          │
│    ↓                                              │
│ Gemini AI Studio                                  │
│    ↓ fallback                                     │
│ F5-TTS                                            │
│    ↓ fallback                                     │
│ Edge TTS                                          │
│    ↓                                              │
│ QA                                                │
│    ↓                                              │
│ MP3                                               │
│    ↓                                              │
│ Biblioteca maestra + servidor                     │
└───────────────────┬───────────────────────────────┘
                    │
          LAN primero│Tailscale fallback
                    ▼
┌───────────────────────────────────────────────────┐
│                  ANDROID                          │
│                                                   │
│    Biblioteca offline                             │
│    ~12 horas disponibles                          │
│                                                   │
│    Player                                         │
│    Study                                          │
│    Cheatsheets                                    │
│    FSRS                                           │
│    Notas                                          │
│    Exámenes                                       │
│                                                   │
│             100 % usable offline                  │
└───────────────────────────────────────────────────┘
```

---

# 5. Tecnologías

## Backend

* Python
* FastAPI
* SQLite
* SQLAlchemy
* Pydantic
* FFmpeg

No se usarán:

* PostgreSQL;
* Redis;
* RabbitMQ;
* Kafka;
* Kubernetes;
* Celery;
* microservicios.

Para un usuario y un PC serían complejidad innecesaria.

---

## Frontend

* React
* TypeScript
* Vite

La misma interfaz web servirá como base tanto para PC como Android.

---

## Android

* Capacitor
* React
* TypeScript
* SQLite local
* código Kotlin solamente donde sea necesario
* Android Media3 para reproducción

Capacitor funciona como contenedor de la aplicación web.

No desarrollaremos dos interfaces independientes.

---

# 6. Biblioteca

Cada libro tiene una entidad común y una o varias variantes lingüísticas.

```text
Book
│
├── English variant
│   ├── Chapter 1
│   ├── Chapter 2
│   └── Chapter N
│
└── Spanish variant
    ├── Chapter 1
    ├── Chapter 2
    └── Chapter N
```

No se asume que ambas versiones tengan la misma cantidad exacta de palabras.

Sí se presupone que mantienen aproximadamente la misma estructura conceptual.

---

# 7. Estructura del Markdown

Se recomienda utilizar encabezados convencionales:

```markdown
# Libro

## Capítulo 1

### Concepto A

Texto...

### Concepto B

Texto...

## Capítulo 2
```

Los encabezados son importantes porque proporcionan las unidades naturales de:

* navegación;
* alineación EN/ES;
* segmentación;
* cheatsheets;
* preguntas;
* bookmarks;
* progreso.

---

# 8. Fuente original inmutable

El Markdown importado nunca será modificado.

Se distingue:

```text
SOURCE
↓
PREPARED
↓
SPOKEN
```

## SOURCE

Texto original importado.

## PREPARED

Versión que hayas preparado con ChatGPT si quieres condensar, modificar o mejorar el libro.

## SPOKEN

Transformación determinista para TTS.

Por ejemplo:

Markdown:

`**NeRF** utiliza una función...`

Spoken:

`NeRF utiliza una función...`

---

# 9. Dos caminos de producción

## Camino A — narración fiel

```text
SOURCE
↓
limpieza Markdown
↓
segmentación
↓
TTS
```

Ideal cuando quieres escuchar prácticamente el material original.

---

## Camino B — material optimizado

```text
SOURCE
↓
copiar a ChatGPT
↓
ChatGPT genera versión optimizada
↓
usuario revisa
↓
pegar como PREPARED
↓
segmentación
↓
TTS
```

Este segundo camino es apropiado para material:

* redundante;
* demasiado verbal;
* libros de liderazgo;
* explicaciones largas;
* material técnico donde quieras alta densidad.

El programa nunca hará esa condensación utilizando un modelo local.

---

# 10. AI Workspace manual para ChatGPT

La interfaz PC tendrá una sección denominada aproximadamente:

**AI Workspace**

Su función no es llamar ninguna API.

Mostrará:

```text
SOURCE

[Copiar capítulo]

PROMPT

[Copiar prompt]

RESULTADO

[Pegar resultado]

[Validar]

[Guardar]
```

Existirán plantillas reutilizables para:

* condensar capítulo;
* extraer conceptos;
* Feynman;
* preguntas;
* why-chain;
* mejorar cheatsheet;
* evaluar respuesta;
* crear microlección.

De esta forma no habrá que reconstruir cada prompt manualmente.

---

# 11. Cheatsheets

La versión principal será escrita por el usuario.

Estructura recomendada:

```text
🧠 concepto
⚡ disparador
📐 regla/fórmula
→ procedimiento
⚠ error
🔗 asociación
```

Ningún campo salvo el resumen principal será necesariamente obligatorio.

Ejemplo:

```text
🧠 Gaussian Splatting
⚡ novel views rápidas
→ gaussianas 3D → splatting
⚠ memoria ↑ con #gaussianas
🔗 NeRF / raster
```

---

# 12. Flujo cheatsheet

```text
Estudiar concepto
↓
usuario escribe resumen mínimo
↓
guardar USER VERSION
↓
copiar a ChatGPT
↓
ChatGPT propone mejora
↓
usuario compara
↓
aceptar / modificar / rechazar
```

ChatGPT jamás reemplazará silenciosamente tu resumen.

La versión original siempre permanece disponible.

---

# 13. Condición de aprendizaje

Escuchar algo no significa haberlo aprendido.

Un concepto tendrá estados separados:

```text
heard
summary_written
selected_for_memory
reviewed
```

Para considerarlo aprendido inicialmente:

`summary_written = true`

Es decir, necesitas haber producido personalmente alguna síntesis.

---

# 14. Selección de memorización

El programa no decide automáticamente qué debes memorizar.

Podrás marcar:

```text
☑ quiero memorizar
☐ no memorizar
```

Solamente los conceptos seleccionados entran en FSRS.

---

# 15. Preguntas

Las preguntas se crearán mediante ChatGPT y después se importarán a la aplicación.

Tipos principales:

### Feynman

Explicar sin depender de la terminología original.

### Why-chain

```text
¿Por qué?
↓
¿Por qué ocurre eso?
↓
¿Qué propiedad lo produce?
↓
¿Cuál es el fundamento?
```

### Aplicación

“¿En qué situación utilizarías X?”

### Contraste

“¿Por qué usarías X en vez de Y?”

### Relación

“Relaciona X con Y.”

### Contraejemplo

“¿Cuándo dejaría de funcionar X?”

---

# 16. Respuestas

En Android escribes la respuesta.

La respuesta se almacena completamente offline.

Estados:

```text
ANSWERED
↓
PENDING_REVIEW
↓
REVIEWED
```

La evaluación intelectual no será realizada por Android.

---

# 17. Evaluación mediante ChatGPT

Cuando se sincronice con el PC:

```text
pregunta
+
fuente
+
tu respuesta
+
rúbrica
```

aparecerán en AI Workspace.

La interfaz ofrecerá:

`[Copiar para evaluar en ChatGPT]`

Pegas en ChatGPT.

Después copias la evaluación recibida.

La aplicación puede almacenar:

```text
score
correct_points
missing_points
misconceptions
feedback
```

Nada de esto requiere API.

---

# 18. FSRS

FSRS funciona localmente y no necesita IA.

Cada tarjeta contiene:

```text
due
stability
difficulty
state
last_review
```

Las respuestas pueden clasificarse:

```text
Again
Hard
Good
Easy
```

Podrás poner una clasificación provisional inmediatamente.

Después de evaluar con ChatGPT puedes corregirla si lo consideras necesario.

---

# 19. Dimensiones de comprensión

Opcionalmente se registrará:

```text
Reconozco
Entiendo
Puedo explicar
Puedo aplicar
Puedo relacionar
```

No es necesario obtener un porcentaje artificialmente preciso.

Lo importante es identificar dónde está la debilidad.

---

# 20. Motor TTS

Interfaz conceptual:

```text
TTSProvider

├── GeminiStudioProvider
├── F5Provider
└── EdgeProvider
```

El libro nunca depende directamente de un proveedor.

---

# 21. Prioridad de TTS

Orden:

```text
1. Gemini 2.5 Pro Preview TTS
2. F5-TTS
3. Edge TTS
```

El modelo de AI Studio queda definido inicialmente como:

`gemini-2.5-pro-preview-tts`

Es el modelo indicado explícitamente en la URL suministrada.

---

# 22. Segmentación Gemini

Aunque el modelo técnicamente admite contextos mayores, para nuestro sistema la regla operacional será más conservadora.

Tu observación práctica es:

`1000 palabras o menos`

Por seguridad:

```text
target: 800–900 palabras
soft max: 900
hard max: 950
```

Jamás generaremos automáticamente un chunk de 1000+ palabras.

---

# 23. Algoritmo de segmentación

Orden de preferencia para cortar:

```text
1. final de sección
2. final de párrafo
3. final de lista
4. final de oración
```

Nunca cortar deliberadamente:

* a mitad de oración;
* a mitad de expresión;
* entre título y primer párrafo;
* entre elementos estrechamente relacionados.

---

# 24. Chunk

Cada fragmento tiene identidad propia:

```text
chunk_id
book_id
variant_id
chapter_id
sequence
source_text
spoken_text
word_count
language
```

Posteriormente:

```text
provider
model
voice
generation_status
attempts
wav_path
mp3_status
qa_status
```

---

# 25. AI Studio no se automatizará de una sola vez

El desarrollo del `GeminiStudioProvider` será un subproyecto independiente realizado mediante iteraciones.

No empezaremos intentando resolver toda la interfaz.

---

# 26. Iteración G0 — documentación manual

Objetivo:

entender exactamente el flujo humano.

Se documentará:

```text
URL
↓
estado inicial esperado
↓
campo de texto
↓
selector de modelo
↓
selector de voz
↓
configuración necesaria
↓
Generate
↓
estado generando
↓
estado terminado
↓
Download
↓
WAV descargado
```

También registraremos:

* textos visibles;
* atributos ARIA;
* estructura DOM relevante;
* cambios de estado;
* mensajes de error;
* comportamiento ante generación incompleta.

Esta fase se completará cuando proporciones la descripción de AI Studio que mencionaste.

---

# 27. Iteración G1 — detección de página

La extensión únicamente:

* detecta AI Studio;
* confirma que está en Generate Speech;
* confirma modelo esperado;
* muestra `READY`.

No introduce texto.

No genera.

Criterio de aceptación:

100 aperturas manuales razonables sin falsos positivos importantes.

---

# 28. Iteración G2 — inserción de texto

La extensión recibe un texto de prueba.

Hace:

```text
local server
↓
extension
↓
textarea AI Studio
```

Después verifica que el contenido introducido coincide.

Todavía no pulsa Generate.

---

# 29. Iteración G3 — configuración

Añadiremos:

* modelo;
* idioma cuando corresponda;
* voz;
* parámetros necesarios.

La extensión comprueba la configuración antes de continuar.

---

# 30. Iteración G4 — generación

Añadimos:

`Generate`

Después reconoce:

```text
GENERATING
GENERATED
ERROR
```

No descargará todavía.

---

# 31. Iteración G5 — descarga

Una vez generada correctamente la voz:

```text
Download
↓
WAV
```

La extensión debe detectar que la descarga realmente finalizó.

Chrome dispone de APIs de extensión para observar y gestionar descargas, por lo que esta parte debe apoyarse en el estado real de descarga y no en temporizadores arbitrarios.

---

# 32. Iteración G6 — job completo

Primer flujo completo:

```text
server
↓
claim job
↓
AI Studio
↓
texto
↓
voz
↓
generate
↓
download
↓
WAV
↓
report success
```

Solo un worker.

Solo un capítulo de prueba.

---

# 33. Iteración G7 — resiliencia

Se añaden casos:

* botón no encontrado;
* campo no encontrado;
* página sin cargar;
* sesión caducada;
* error visible;
* generación eterna;
* WAV no descargado;
* descarga cancelada;
* WAV vacío;
* worker cerrado.

Cada caso termina en un estado conocido.

Nunca en un job “fantasma”.

---

# 34. Iteración G8 — cola real

Después se conecta con la cola completa:

```text
JOB 1
JOB 2
JOB 3
...
```

Un job solamente puede pertenecer a un worker simultáneamente.

---

# 35. Iteración G9 — tres perfiles

Solamente después de que un worker sea estable.

```text
Chrome Profile A
Gemini Worker A

Chrome Profile B
Gemini Worker B

Chrome Profile C
Gemini Worker C
```

Cada uno tiene:

```text
worker_id
profile_alias
AI Studio URL
voice
status
current_job
heartbeat
```

Máximo inicial:

`3 generaciones simultáneas`

No se utilizarán técnicas de fingerprint spoofing, CAPTCHA bypass ni ocultación de automatización. Los perfiles simplemente actúan como sesiones normales independientes controladas por la extensión.

---

# 36. Extensión Chrome

Tecnología:

`Manifest V3`

Chrome continúa proporcionando en extensiones modernas APIs para scripts, interacción con páginas y descargas.

Componentes:

```text
manifest.json

service-worker.ts

content-script.ts

aistudio-adapter.ts

worker-client.ts

popup/
```

---

# 37. Separación fundamental del adaptador AI Studio

Todo lo dependiente del DOM debe residir exclusivamente en:

`aistudio-adapter.ts`

Ejemplo conceptual:

```text
findTextInput()
findGenerateButton()
findVoiceSelector()
isGenerating()
isComplete()
findDownloadButton()
readError()
```

Cuando Google cambie AI Studio:

**no modificamos la cola ni el backend.**

Solo actualizamos ese adaptador.

---

# 38. Selección de elementos

Prioridad:

```text
1. role
2. aria-label
3. atributos semánticos
4. texto visible
5. relación estructural estable
6. CSS
7. XPath como último recurso
```

No depender prioritariamente de clases CSS generadas.

No depender de posiciones absolutas.

Ejemplo que evitaremos:

```text
div:nth-child(14) > div:nth-child(3) > button
```

---

# 39. Worker Gemini

Estados:

```text
OFFLINE
READY
CLAIMING
PREPARING
GENERATING
DOWNLOADING
REPORTING
PAUSED
ERROR
```

---

# 40. TTS Job

Estados:

```text
NEW
PREPARED
QUEUED
CLAIMED
GENERATING
DOWNLOADED
QA_PENDING
ENCODING
READY
```

Errores:

```text
RETRY_WAIT
WAITING_PROVIDER
FAILED
CANCELLED
```

---

# 41. Lease

Cuando un worker toma un job:

```text
job → CLAIMED
lease_until = timestamp futuro
```

El worker envía heartbeat.

Si desaparece:

```text
lease expira
↓
job vuelve a QUEUED
```

Así cerrar Chrome no destruye la cola.

---

# 42. Reintentos Gemini

Política inicial:

```text
fallo 1
↓
5 minutos

fallo 2
↓
30 minutos

fallo 3
↓
WAITING_PROVIDER
```

El fallo no produce automáticamente una pérdida de calidad si existe suficiente buffer offline.

---

# 43. Política dependiente del buffer

## Más de 8 horas disponibles

Priorizar calidad.

```text
Gemini falla
→ esperar Gemini
```

## Entre 4 y 8 horas

Se permite:

```text
Gemini
↓
F5
```

## Menos de 4 horas

Priorizar disponibilidad:

```text
Gemini
↓
F5
↓
Edge
```

---

# 44. Modos por libro

### QUALITY

Gemini solamente.

### AUTO

Gemini → F5 → Edge dependiendo de urgencia.

### LOCAL

F5.

Default:

`AUTO`

---

# 45. F5-TTS

Se implementará después de tener Gemini estable.

Usará:

* el repositorio exacto que proporcionarás;
* tu muestra limpia de aproximadamente 15 segundos;
* una configuración de voz persistente.

No adaptaremos F5 hasta disponer de tu implementación real.

---

# 46. WAV temporal

Gemini genera WAV.

Pipeline:

```text
Gemini
↓
chunk.wav
↓
QA
↓
normalización
↓
concatenación
↓
MP3 capítulo
```

Los WAV son temporales.

Pueden eliminarse después de producir correctamente el MP3.

---

# 47. Audio final

Formato:

`MP3`

Unidad:

`un archivo por capítulo`

No un MP3 gigantesco por libro.

---

# 48. Calidad MP3 inicial

Configuración razonable para voz:

```text
mono
96 kbps
44.1 kHz
```

Será configurable.

---

# 49. QA básico

Sin IA intelectual.

Comprobaciones:

```text
archivo existe
tamaño > mínimo
FFmpeg puede abrirlo
duración > mínimo
no silencio total
no duración absurda
```

---

# 50. QA con Whisper

Opcional pero recomendado:

```text
audio
↓
Whisper
↓
transcripción
↓
comparación aproximada
```

Objetivo:

detectar:

* audio truncado;
* comienzo perdido;
* final perdido;
* generación parcialmente vacía.

Whisper no decide si el contenido es intelectualmente correcto.

Solo verifica cobertura aproximada.

---

# 51. Reproducción incremental

No hace falta terminar un libro.

```text
Capítulo 1 READY
→ escuchable

Capítulo 2 READY
→ descargable

Capítulo 3 GENERATING
```

Esto es obligatorio.

---

# 52. Android offline

La prueba fundamental será:

```text
PC apagado
+
Wi-Fi apagado
+
datos móviles apagados
```

Y deben seguir funcionando:

* biblioteca descargada;
* reproducción;
* background playback;
* velocidad;
* skip silence;
* capítulos;
* bookmarks;
* notas;
* cheatsheets;
* preguntas;
* respuestas;
* FSRS;
* progreso;
* estadísticas locales.

---

# 53. Buffer offline

Objetivo:

`12 horas`

Usaremos histéresis para evitar sincronización continua.

```text
high = 14 h
target = 12 h
low = 10 h
critical = 4 h
```

Cuando baja de 10 h:

`rellenar hasta aproximadamente 14 h`

---

# 54. Prioridad de contenido

Orden normal:

```text
1. capítulo siguiente del libro actual
2. siguientes capítulos
3. microlecciones pendientes
4. repasos
5. otros libros en cola
```

El usuario puede cambiar manualmente prioridades.

---

# 55. Espacio Android

Presupuesto inicial:

```text
máximo aplicación: ~8 GB
reserva teléfono: ~2 GB
```

El límite será configurable.

---

# 56. Garbage collection

Se puede borrar audio si:

```text
escuchado
+
progreso sincronizado
+
no favorito
+
no pinneado
```

Prioridad:

`más antiguo primero`

No borrar nunca automáticamente:

* cheatsheets;
* respuestas;
* notas;
* bookmarks;
* eventos FSRS no sincronizados.

---

# 57. Sincronización

No copiar bases SQLite entre PC y Android.

Cada dispositivo tiene su propia base.

Se sincronizan mediante API.

---

# 58. Prioridad de red

```text
1. LAN
2. Tailscale
3. offline
```

El sistema intenta LAN primero.

Si falla, intenta dirección Tailscale conocida.

Si ambas fallan:

`OFFLINE`

Sin mensajes molestos.

---

# 59. Sincronización automática

Cuando Android detecta conectividad adecuada:

```text
subir cambios
↓
descargar metadata
↓
descargar contenido requerido
↓
rellenar buffer
```

No debe exigirte pulsar Sync diariamente.

---

# 60. Eventos

Android registra:

```text
PlaybackChanged
ChapterCompleted
BookmarkCreated
NoteCreated
NoteChanged
CheatsheetChanged
QuestionAnswered
ReviewCompleted
```

Cada evento:

```text
event_id UUID
device_id
timestamp
entity_id
payload
```

---

# 61. Idempotencia

Un `event_id` solo se procesa una vez.

Enviar accidentalmente un evento dos veces no duplica:

* respuestas;
* bookmarks;
* reviews;
* notas.

---

# 62. Descargas

Proceso:

```text
chapter.mp3.part
↓
download
↓
verificar tamaño
↓
verificar SHA-256
↓
rename atómico
↓
chapter.mp3
```

Una descarga incompleta nunca aparecerá como capítulo válido.

---

# 63. Posición

Se almacena:

```text
chapter_id
position_ms
updated_at
```

El progreso se sincroniza entre PC y Android.

---

# 64. Modo transporte

Interfaz extremadamente simple:

```text
┌─────────────────────────┐
│      LIBRO ACTUAL       │
│                         │
│       Capítulo 6        │
│                         │
│           ▶             │
│                         │
│    -15s        +30s     │
│                         │
│   1.4x    Skip silence  │
│                         │
│ ⭐ Bookmark   🧠 Study  │
│                         │
│ Offline: 12h 08m        │
└─────────────────────────┘
```

---

# 65. Velocidad

Rango:

`0.8x – 3.0x`

Por contenido:

```text
normal
advanced
question
microlesson
```

Cada categoría puede tener su propia preferencia.

---

# 66. Bluetooth

Los controles multimedia normales se soportarán mediante Android.

Acciones personalizadas como:

```text
doble toque → bookmark
mantener → estudiar
```

quedan en backlog.

---

# 67. Backups

La prioridad del backup son datos irreemplazables:

```text
SQLite
cheatsheets
notas
respuestas
FSRS
configuración
```

Audio puede regenerarse.

Política inicial:

```text
7 diarios
4 semanales
```

---

# 68. Datos físicos

Estructura aproximada:

```text
data/
│
├── library/
│   └── <book_uuid>/
│       ├── source/
│       │   ├── en.md
│       │   └── es.md
│       ├── prepared/
│       ├── audio/
│       │   ├── en/
│       │   └── es/
│       └── assets/
│
├── temporary/
│
├── gemini-inbox/
│   ├── worker-a/
│   ├── worker-b/
│   └── worker-c/
│
└── backups/
```

---

# 69. Base de datos

Entidades principales:

```text
Book
BookVariant
Chapter
Section

TtsChunk
TtsJob
TtsAttempt
TtsWorker
AudioAsset

Concept
ConceptSource
CheatEntry

Question
Answer
Evaluation

FsrsCard
ReviewEvent

PlaybackState
Bookmark
Note

Device
SyncEvent
```

---

# 70. Reanudación ante errores

Todo proceso importante debe sobrevivir:

```text
reinicio Windows
cierre backend
cierre Chrome
cierre AI Studio
reinicio Android
pérdida Wi-Fi
descarga incompleta
WAV inválido
F5 crash
```

La regla es:

**ninguna operación importante depende exclusivamente de memoria RAM.**

Los estados se persisten antes de iniciar cada paso importante.

---

# 71. Logs

Existirán logs humanos y técnicos.

Ejemplo:

```text
14:03 Worker A claimed chunk 183
14:04 AI Studio generating
14:06 Download complete
14:06 QA passed
14:06 Chunk READY
```

Error:

```text
14:15 Worker B
Generate button not found
Adapter version: 0.3.1
Page state captured
Job returned to retry queue
```

---

# 72. Diagnóstico AI Studio

Ante fallo de DOM guardaremos opcionalmente:

* URL;
* timestamp;
* estado detectado;
* elementos encontrados;
* HTML reducido relevante;
* screenshot manual o automatizable si posteriormente resulta conveniente.

Nunca guardar contraseñas o cookies.

Esto facilitará adaptar la extensión cuando AI Studio cambie.

---

# 73. Seguridad de Google

La extensión no almacenará:

* contraseña;
* cookies;
* credenciales;
* tokens de Google.

La autenticación pertenece exclusivamente al perfil normal de Chrome.

Cada perfil mantiene su propia sesión.

---

# 74. MVP real

La primera versión usable contiene solamente:

```text
Markdown
↓
capítulos
↓
segmentación <=950
↓
Gemini AI Studio automático
↓
WAV
↓
QA
↓
MP3
↓
Android
↓
sync
↓
offline player
```

Nada más debe bloquear esta primera cadena.

---

# 75. Segunda etapa

Después:

```text
F5
Edge
buffer inteligente
retries avanzados
tres workers
hardening
```

---

# 76. Tercera etapa

Después de que audiolibros y sincronización sean fiables:

```text
Concepts
Cheatsheets
Questions
FSRS
AI Workspace
ChatGPT manual workflow
```

---

# 77. Cuarta etapa

Mejoras:

```text
microlecciones
mastery dimensions
why chains
Feynman avanzado
cross-book concepts
```

---

# 78. Backlog explícito

No implementar todavía:

```text
LLM local
ChatGPT API
STT Android propio
vocabulario inglés automático
pronunciación especializada
matemáticas avanzadas
generación matemática
custom Bluetooth
knowledge graph visual
RAG
OCR
PDF
EPUB
import móvil
voice cloning fuera de F5
```

---

# 79. Pruebas obligatorias

Antes de considerar el sistema robusto:

### Gemini

* texto corto;
* texto 900 palabras;
* caracteres especiales;
* español;
* inglés;
* Chrome cerrado;
* AI Studio recargado;
* sesión perdida;
* error de generación;
* descarga cancelada;
* WAV incompleto.

### Cola

* servidor reiniciado;
* dos workers intentando mismo job;
* worker desaparecido;
* job duplicado;
* retry después de crash.

### Android

* modo avión;
* teléfono reiniciado;
* app terminada;
* pantalla bloqueada;
* 4 h continuas de reproducción;
* 0.8x;
* 3x;
* almacenamiento casi lleno.

### Sync

* LAN;
* Tailscale;
* conexión interrumpida;
* descarga a mitad;
* archivo corrupto;
* evento duplicado.

---

# 80. Definition of Done del núcleo

El núcleo solamente se considera completo cuando pueda ocurrir esto sin intervención manual:

```text
1. Dejas un Markdown preparado.

2. El PC lo detecta/importa.

3. Divide capítulos.

4. Divide chunks.

5. Cola Gemini.

6. Uno de los perfiles Chrome toma un trabajo.

7. AI Studio recibe texto.

8. Configura voz/modelo.

9. Genera.

10. Descarga WAV.

11. PC verifica.

12. Genera MP3 del capítulo.

13. Android aparece en casa.

14. Detecta servidor.

15. Descarga automáticamente.

16. Sales de casa.

17. El PC puede apagarse.

18. Escuchas todo offline.

19. Tu posición queda guardada.

20. Regresas.

21. Android sincroniza progreso automáticamente.
```

Si cualquiera de estos pasos requiere rutinariamente que intervengas, el núcleo todavía no está terminado.

---

# 81. Principio de desarrollo

Para este proyecto:

**simplicidad > sofisticación**

pero:

**recuperabilidad > simplicidad extrema**

Es aceptable añadir una tabla de estados, hashes o leases si con ello evitamos perder horas de generación.

No es aceptable añadir infraestructura compleja solamente porque sea arquitectónicamente elegante.

---

# 82. Decisiones congeladas

A partir de esta especificación considero cerradas estas decisiones:

```text
Windows
Android
Capacitor
React + TypeScript
FastAPI
SQLite
MP3 por capítulo
Markdown
EN/ES independientes
Gemini 2.5 Pro Preview TTS
<=950 palabras por chunk
extensión Chrome
desarrollo Gemini iterativo
hasta tres workers
F5 segundo
Edge tercero
12 h offline
LAN primero
Tailscale segundo
100 % offline Android
sin LLM local
ChatGPT manual
cheatsheet usuario primero
preguntas Feynman
FSRS
procesamiento pesado solo PC
```

No deberían reabrirse salvo que aparezca una limitación técnica demostrable.
