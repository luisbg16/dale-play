# Dale Play — MVP

Juego web para adivinar canciones por fragmentos cortos. Esta primera versión incluye:

- Juego en español/inglés y filtro por dificultad.
- Fragmentos progresivos de 0.5 s, 1 s, 2 s, 4 s y 7 s.
- Búsqueda/autocompletado por canción y artista.
- Puntos según qué tan rápido se acierte.
- Botones Saltar y Rendirse.
- Panel de administración protegido con Supabase Auth.
- Subida de clips de audio a Supabase Storage.
- Biblioteca de canciones y eliminación desde Admin.
- Diseño responsive para escritorio y móvil.

## 1. Crear proyecto en Supabase

1. Crea un proyecto nuevo en Supabase.
2. Ve a **SQL Editor**.
3. Copia y ejecuta todo el contenido de `supabase/schema.sql`.
4. Ve a **Authentication > Users** y crea manualmente un usuario administrador con email y contraseña.

## 2. Configurar el proyecto local

Duplica `.env.example` y llámalo `.env`.

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

Los valores están en **Supabase > Project Settings > API**.

## 3. Instalar y ejecutar

```bash
npm install
npm run dev
```

Vite mostrará una dirección local, normalmente `http://localhost:5173`.

## 4. Cargar las primeras canciones

1. Abre `/admin`.
2. Inicia sesión con el usuario creado en Supabase Auth.
3. Escribe título y artista.
4. Selecciona idioma, dificultad, género y año.
5. Sube un clip de audio corto.
6. Guarda.

Para el MVP recomiendo 10–30 canciones y clips de aproximadamente 10–15 segundos. No necesitas cinco archivos por canción: el juego reproduce solo la cantidad de segundos correspondiente a cada intento.

`clip_start` permite elegir desde qué segundo del archivo comienza la pista. Por ejemplo, si el fragmento interesante empieza en el segundo 4.5, guarda `4.5`.


## Ruta de trabajo del MVP

Trabajaremos en este orden para evitar construir funciones grandes antes de validar que el juego sea divertido:

1. **Configurar Supabase** y comprobar conexión, Auth, tabla `songs` y Storage.
2. **Cargar 10 canciones de prueba** con clips cortos y metadatos correctos.
3. **Probar el gameplay base**: Play, fragmentos progresivos, búsqueda, Adivinar, Saltar y Rendirse.
4. **Ajustar dificultad y puntuación** según las primeras partidas reales.
5. **Mejorar diseño y marca Dale Play** una vez validada la mecánica.
6. **Agregar categorías y playlists** después de validar el catálogo inicial.
7. **Modo fiesta/multijugador** como segunda etapa, no dentro del MVP inicial.

### Objetivo de la primera sesión

Dejar Supabase conectado, iniciar sesión en `/admin`, subir la primera canción y jugar una ronda completa desde la pantalla principal.

## Derechos de música

El código permite subir audio, pero eso no concede derechos sobre las canciones. Para pruebas privadas puedes usar material sobre el que tengas permiso. Antes de publicar un catálogo de música comercial, conviene usar previews/licencias permitidas por un proveedor o gestionar los derechos correspondientes.

## Próximas mejoras recomendadas

- Modo fiesta por equipos.
- Categorías: reggaetón, rock en español, baladas, 2000s, clásicos, etc.
- Selección de décadas.
- Ranking por jugadores.
- Temporizador por ronda.
- QR para que cada jugador responda desde su teléfono.
- Importación masiva por CSV.
- Pantalla de resultados y estadísticas.
- Evitar repetir canciones recientemente jugadas.
- Sistema de playlists/partidas personalizadas.
