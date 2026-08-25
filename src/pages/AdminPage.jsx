import {
  useEffect,
  useState
} from 'react'

import {
  LogIn,
  LogOut,
  Music2,
  Trash2,
  Search,
  Check,
  ExternalLink,
  ListMusic,
  WandSparkles,
  Plus,
  X
} from 'lucide-react'

import {
  supabase,
  supabaseReady
} from '../lib/supabase'


const emptyForm = {
  title: '',
  artist: '',
  album_name: '',
  spotify_id: '',
  spotify_url: '',
  album_image_url: '',
  genre: 'Urbano',
  year: ''
}


const LATIN_STARTER_LIST = `Tití Me Preguntó - Bad Bunny
Me Porto Bonito - Bad Bunny
MONACO - Bad Bunny
Callaíta - Bad Bunny
Provenza - Karol G
TQG - Karol G, Shakira
Si Antes Te Hubiera Conocido - Karol G
Despechá - Rosalía
Todo de Ti - Rauw Alejandro
Desesperados - Rauw Alejandro
Classy 101 - Feid, Young Miko
Luna - Feid, ATL Jacob
Ella Baila Sola - Eslabon Armado, Peso Pluma
Lady Gaga - Peso Pluma, Gabito Ballesteros, Junior H
Qlona - Karol G, Peso Pluma
Hawái - Maluma
Felices los 4 - Maluma
La Bachata - Manuel Turizo
Una Lady Como Tú - Manuel Turizo
Tacones Rojos - Sebastián Yatra
Traicionera - Sebastián Yatra
Me Rehúso - Danny Ocean
Fuera del Mercado - Danny Ocean
Despacito - Luis Fonsi, Daddy Yankee
Gasolina - Daddy Yankee
Lo Que Pasó, Pasó - Daddy Yankee
Danza Kuduro - Don Omar, Lucenzo
Salió el Sol - Don Omar
Rakata - Wisin & Yandel
Noche de Sexo - Wisin & Yandel, Romeo Santos
Obsesión - Aventura
Propuesta Indecente - Romeo Santos
Vivir Mi Vida - Marc Anthony
Valió la Pena - Marc Anthony
La Camisa Negra - Juanes
A Dios le Pido - Juanes
Rayando el Sol - Maná
Labios Compartidos - Maná
Colgando en Tus Manos - Carlos Baute, Marta Sánchez
Entra en Mi Vida - Sin Bandera
Mientes - Camila
Kilómetros - Sin Bandera
Corre - Jesse & Joy
Limón y Sal - Julieta Venegas
Antología - Shakira
Ojos Así - Shakira
La Tortura - Shakira, Alejandro Sanz
Torero - Chayanne
Dejaría Todo - Chayanne
Ahora Te Puedes Marchar - Luis Miguel
La Incondicional - Luis Miguel
Burbujas de Amor - Juan Luis Guerra
La Bilirrubina - Juan Luis Guerra
Como la Flor - Selena
Amor Prohibido - Selena`


function normalizeText(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}


function similarity(a = '', b = '') {

  const first =
    normalizeText(a)

  const second =
    normalizeText(b)

  if (!first || !second) {
    return 0
  }

  if (first === second) {
    return 1
  }

  if (
    first.includes(second) ||
    second.includes(first)
  ) {
    return 0.9
  }

  const wordsA =
    new Set(
      first.split(' ')
    )

  const wordsB =
    new Set(
      second.split(' ')
    )

  const intersection =
    [...wordsA].filter(
      word =>
        wordsB.has(word)
    )

  const union =
    new Set([
      ...wordsA,
      ...wordsB
    ])

  return (
    intersection.length /
    union.size
  )
}


function getTrackScore(
  wantedTitle,
  wantedArtist,
  track
) {

  const titleScore =
    similarity(
      wantedTitle,
      track.title
    )

  const artistScore =
    similarity(
      wantedArtist,
      track.artist
    )

  return (
    titleScore * 0.7 +
    artistScore * 0.3
  )
}


function parseBulkLine(line) {

  const clean =
    line.trim()

  if (!clean) {
    return null
  }

  const separator =
    clean.includes(' — ')
      ? ' — '
      : clean.includes(' - ')
        ? ' - '
        : null

  if (!separator) {

    return {
      title: clean,
      artist: ''
    }
  }

  const parts =
    clean.split(separator)

  return {
    title:
      parts[0]?.trim() || '',

    artist:
      parts
        .slice(1)
        .join(separator)
        .trim()
  }
}


function delay(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  )
}


export default function AdminPage() {

  const [session, setSession] =
    useState(null)

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [form, setForm] =
    useState(emptyForm)

  const [songs, setSongs] =
    useState([])

  const [message, setMessage] =
    useState('')

  const [busy, setBusy] =
    useState(false)


  /*
  =========================================
  BUSCADOR INDIVIDUAL
  =========================================
  */

  const [
    spotifyQuery,
    setSpotifyQuery
  ] = useState('')

  const [
    spotifyResults,
    setSpotifyResults
  ] = useState([])

  const [
    spotifyLoading,
    setSpotifyLoading
  ] = useState(false)

  const [
    spotifyError,
    setSpotifyError
  ] = useState('')


  /*
  =========================================
  CARGA MASIVA
  =========================================
  */

  const [bulkText, setBulkText] =
    useState('')

  const [
    bulkResults,
    setBulkResults
  ] = useState([])

  const [
    bulkSearching,
    setBulkSearching
  ] = useState(false)

  const [
    bulkProgress,
    setBulkProgress
  ] = useState('')

  const [
    bulkSaving,
    setBulkSaving
  ] = useState(false)


  /*
  =========================================
  SESIÓN
  =========================================
  */

  useEffect(() => {

    if (!supabaseReady) {
      return
    }


    supabase.auth
      .getSession()
      .then(
        ({ data }) => {

          setSession(
            data.session
          )
        }
      )


    const {
      data: subscription
    } =
      supabase.auth
        .onAuthStateChange(
          (
            _event,
            currentSession
          ) => {

            setSession(
              currentSession
            )
          }
        )


    loadSongs()


    return () => {

      subscription
        .subscription
        .unsubscribe()
    }

  }, [])


  /*
  =========================================
  CARGAR BIBLIOTECA
  =========================================
  */

  async function loadSongs() {

    if (!supabaseReady) {
      return
    }


    const {
      data,
      error
    } =
      await supabase
        .from('songs')
        .select('*')
        .order(
          'created_at',
          {
            ascending:
              false
          }
        )


    if (error) {

      setMessage(
        error.message
      )

      return
    }


    setSongs(
      data || []
    )
  }


  /*
  =========================================
  LOGIN
  =========================================
  */

  async function login(e) {

    e.preventDefault()

    setMessage('')


    const {
      error
    } =
      await supabase.auth
        .signInWithPassword({
          email,
          password
        })


    setMessage(
      error
        ? error.message
        : 'Sesión iniciada.'
    )
  }


  async function logout() {

    await supabase.auth
      .signOut()
  }


  /*
  =========================================
  BUSCAR UNA CANCIÓN
  =========================================
  */

  async function searchSpotify(e) {

    e.preventDefault()


    if (
      spotifyQuery
        .trim()
        .length < 2
    ) {

      setSpotifyError(
        'Escribe al menos 2 caracteres.'
      )

      return
    }


    setSpotifyLoading(true)

    setSpotifyError('')

    setSpotifyResults([])


    try {

      const {
        data,
        error
      } =
        await supabase
          .functions
          .invoke(
            'spotify-search',
            {
              body: {
                query:
                  spotifyQuery.trim()
              }
            }
          )


      if (error) {
        throw error
      }


      const tracks =
        data?.tracks || []


      setSpotifyResults(
        tracks
      )


      if (!tracks.length) {

        setSpotifyError(
          'No encontré canciones.'
        )
      }


    } catch (error) {

      console.error(error)

      setSpotifyError(
        error.message ||
        'No se pudo buscar.'
      )


    } finally {

      setSpotifyLoading(false)
    }
  }


  function selectSpotifyTrack(track) {

    setForm(
      current => ({
        ...current,

        title:
          track.title || '',

        artist:
          track.artist || '',

        album_name:
          track.album_name || '',

        year:
          track.year || '',

        spotify_id:
          track.spotify_id || '',

        spotify_url:
          track.spotify_url || '',

        album_image_url:
          track.album_image_url || ''
      })
    )


    setSpotifyResults([])


    setSpotifyQuery(
      `${track.title} — ${track.artist}`
    )


    setMessage(
      'Canción seleccionada. Revisa el género y guarda.'
    )
  }


  /*
  =========================================
  GUARDAR UNA CANCIÓN
  =========================================
  */

  async function saveSong(e) {

    e.preventDefault()


    if (!form.spotify_id) {

      setMessage(
        'Primero selecciona una canción.'
      )

      return
    }


    const alreadyExists =
      songs.some(
        song =>
          song.spotify_id ===
          form.spotify_id
      )


    if (alreadyExists) {

      setMessage(
        'Esa canción ya está en Dale Play.'
      )

      return
    }


    setBusy(true)

    setMessage('')


    try {

      const {
        error
      } =
        await supabase
          .from('songs')
          .insert({
            title:
              form.title.trim(),

            artist:
              form.artist.trim(),

            album_name:
              form.album_name ||
              null,

            spotify_id:
              form.spotify_id,

            spotify_url:
              form.spotify_url ||
              null,

            album_image_url:
              form.album_image_url ||
              null,

            language:
              'es',

            genre:
              form.genre.trim() ||
              null,

            year:
              form.year
                ? Number(
                    form.year
                  )
                : null,

            active:
              true
          })


      if (error) {
        throw error
      }


      setForm(
        emptyForm
      )

      setSpotifyQuery('')

      setSpotifyResults([])


      setMessage(
        'Canción agregada correctamente.'
      )


      await loadSongs()


    } catch (error) {

      console.error(error)

      setMessage(
        error.message ||
        'No se pudo guardar.'
      )


    } finally {

      setBusy(false)
    }
  }


  /*
  =========================================
  BUSCAR MUCHAS CANCIONES
  =========================================
  */

  async function searchBulkSongs() {

    const parsed =
      bulkText
        .split('\n')
        .map(
          parseBulkLine
        )
        .filter(Boolean)


    if (!parsed.length) {

      setMessage(
        'Pega al menos una canción.'
      )

      return
    }


    setBulkSearching(true)

    setBulkResults([])

    setBulkProgress('')

    setMessage('')


    const results = []


    for (
      let i = 0;
      i < parsed.length;
      i++
    ) {

      const item =
        parsed[i]


      setBulkProgress(
        `Buscando ${i + 1} de ${parsed.length}: ${item.title}`
      )


      try {

        const searchQuery =
          `${item.title} ${item.artist}`
            .trim()


        const {
          data,
          error
        } =
          await supabase
            .functions
            .invoke(
              'spotify-search',
              {
                body: {
                  query:
                    searchQuery
                }
              }
            )


        if (error) {
          throw error
        }


        const tracks =
          data?.tracks || []


        const ranked =
          tracks
            .map(
              track => ({
                ...track,

                match_score:
                  getTrackScore(
                    item.title,
                    item.artist,
                    track
                  )
              })
            )
            .sort(
              (a, b) =>
                b.match_score -
                a.match_score
            )


        const best =
          ranked[0] || null


        const alreadyExists =
          best
            ? songs.some(
                song =>
                  song.spotify_id ===
                  best.spotify_id
              )
            : false


        results.push({
          id:
            crypto.randomUUID(),

          requestedTitle:
            item.title,

          requestedArtist:
            item.artist,

          track:
            best,

          confidence:
            best
              ? best.match_score
              : 0,

          duplicate:
            alreadyExists,

          selected:
            Boolean(
              best &&
              best.match_score >=
                0.7 &&
              !alreadyExists
            )
        })


      } catch (error) {

        console.error(
          error
        )


        results.push({
          id:
            crypto.randomUUID(),

          requestedTitle:
            item.title,

          requestedArtist:
            item.artist,

          track:
            null,

          confidence:
            0,

          duplicate:
            false,

          selected:
            false
        })
      }


      /*
      Pequeña pausa para no bombardear
      la Edge Function.
      */

      await delay(180)
    }


    setBulkResults(
      results
    )

    setBulkProgress(
      `Listo: ${results.length} canciones revisadas.`
    )

    setBulkSearching(false)
  }


  function toggleBulkSong(id) {

    setBulkResults(
      current =>
        current.map(
          item =>
            item.id === id
              ? {
                  ...item,
                  selected:
                    !item.selected
                }
              : item
        )
    )
  }


  function removeBulkResult(id) {

    setBulkResults(
      current =>
        current.filter(
          item =>
            item.id !== id
        )
    )
  }


  /*
  =========================================
  IMPORTAR TODAS
  =========================================
  */

  async function importBulkSongs() {

    const selected =
      bulkResults.filter(
        item =>
          item.selected &&
          item.track &&
          !item.duplicate
      )


    if (!selected.length) {

      setMessage(
        'No hay canciones seleccionadas para importar.'
      )

      return
    }


    setBulkSaving(true)

    setMessage('')


    try {

      const payload =
        selected.map(
          item => ({
            title:
              item.track.title,

            artist:
              item.track.artist,

            album_name:
              item.track.album_name ||
              null,

            spotify_id:
              item.track.spotify_id,

            spotify_url:
              item.track.spotify_url ||
              null,

            album_image_url:
              item.track.album_image_url ||
              null,

            language:
              'es',

            genre:
              'Latino',

            year:
              item.track.year
                ? Number(
                    item.track.year
                  )
                : null,

            active:
              true
          })
        )


      const {
        error
      } =
        await supabase
          .from('songs')
          .insert(
            payload
          )


      if (error) {
        throw error
      }


      setMessage(
        `${payload.length} canciones agregadas a Dale Play.`
      )


      setBulkResults([])

      setBulkText('')


      await loadSongs()


    } catch (error) {

      console.error(error)


      setMessage(
        error.message ||
        'No se pudieron importar las canciones.'
      )


    } finally {

      setBulkSaving(false)
    }
  }


  /*
  =========================================
  ELIMINAR
  =========================================
  */

  async function removeSong(song) {

    const confirmed =
      confirm(
        `¿Eliminar “${song.title}”?`
      )


    if (!confirmed) {
      return
    }


    const {
      error
    } =
      await supabase
        .from('songs')
        .delete()
        .eq(
          'id',
          song.id
        )


    setMessage(
      error
        ? error.message
        : 'Canción eliminada.'
    )


    await loadSongs()
  }


  /*
  =========================================
  SIN SUPABASE
  =========================================
  */

  if (!supabaseReady) {

    return (

      <section className="admin-wrap">

        <div className="notice">
          Configura Supabase.
        </div>

      </section>
    )
  }


  /*
  =========================================
  LOGIN
  =========================================
  */

  if (!session) {

    return (

      <section className="admin-wrap narrow">

        <h1>
          Panel de administración
        </h1>


        <form
          className="card form-grid"
          onSubmit={
            login
          }
        >

          <label>

            Email

            <input
              type="email"
              required
              value={
                email
              }
              onChange={
                e =>
                  setEmail(
                    e.target.value
                  )
              }
            />

          </label>


          <label>

            Contraseña

            <input
              type="password"
              required
              value={
                password
              }
              onChange={
                e =>
                  setPassword(
                    e.target.value
                  )
              }
            />

          </label>


          <button
            className="primary"
          >

            <LogIn />

            Entrar

          </button>


          {message && (

            <div className="message">
              {message}
            </div>

          )}

        </form>

      </section>
    )
  }


  /*
  =========================================
  PANEL
  =========================================
  */

  const selectedBulkCount =
    bulkResults.filter(
      item =>
        item.selected
    ).length


  return (

    <section className="admin-wrap">


      <div className="admin-head">

        <div>

          <h1>
            Biblioteca Dale Play
          </h1>

          <p className="muted">
            Agrega canciones latinas individualmente o carga varias de golpe.
          </p>

        </div>


        <button
          onClick={
            logout
          }
        >

          <LogOut />

          Salir

        </button>

      </div>


      {/* =====================================
          CARGA MASIVA
      ===================================== */}

      <div className="card bulk-import-card">

        <div className="bulk-header">

          <div>

            <h2>

              <ListMusic />

              Carga masiva

            </h2>

            <p className="muted">

              Una canción por línea:
              Canción - Artista

            </p>

          </div>


          <button
            type="button"
            className="bulk-starter-btn"
            onClick={
              () =>
                setBulkText(
                  LATIN_STARTER_LIST
                )
            }
          >

            <WandSparkles
              size={17}
            />

            Usar lista latina

          </button>

        </div>


        <textarea
          className="bulk-textarea"
          value={
            bulkText
          }
          placeholder={`Tití Me Preguntó - Bad Bunny
Provenza - Karol G
La Bachata - Manuel Turizo
Vivir Mi Vida - Marc Anthony`}
          onChange={
            e =>
              setBulkText(
                e.target.value
              )
          }
        />


        <button
          type="button"
          className="primary bulk-search-btn"
          disabled={
            bulkSearching
          }
          onClick={
            searchBulkSongs
          }
        >

          <Search />

          {bulkSearching
            ? 'Buscando canciones...'
            : 'Buscar todas'}

        </button>


        {bulkProgress && (

          <div className="bulk-progress">

            {bulkProgress}

          </div>

        )}


        {bulkResults.length > 0 && (

          <div className="bulk-results">

            <div className="bulk-results-head">

              <strong>

                Revisa las coincidencias

              </strong>

              <span>

                {selectedBulkCount}
                {' '}
                seleccionadas

              </span>

            </div>


            {bulkResults.map(
              item => (

                <div
                  className={
                    `bulk-result-row ${
                      item.selected
                        ? 'selected'
                        : ''
                    }`
                  }
                  key={
                    item.id
                  }
                >

                  <button
                    type="button"
                    className="bulk-check"
                    disabled={
                      !item.track ||
                      item.duplicate
                    }
                    onClick={
                      () =>
                        toggleBulkSong(
                          item.id
                        )
                    }
                  >

                    {item.selected && (
                      <Check size={17} />
                    )}

                  </button>


                  {item.track?.album_image_url ? (

                    <img
                      src={
                        item.track
                          .album_image_url
                      }
                      alt=""
                    />

                  ) : (

                    <div className="bulk-no-cover">

                      <Music2 />

                    </div>

                  )}


                  <div className="bulk-result-info">

                    <small>

                      Buscaste:
                      {' '}
                      {item.requestedTitle}

                      {item.requestedArtist
                        ? ` — ${item.requestedArtist}`
                        : ''}

                    </small>


                    {item.track ? (

                      <>

                        <strong>

                          {item.track.title}

                        </strong>

                        <span>

                          {item.track.artist}

                        </span>

                        <em>

                          Coincidencia:
                          {' '}
                          {Math.round(
                            item.confidence *
                            100
                          )}
                          %

                          {item.duplicate
                            ? ' · Ya agregada'
                            : ''}

                        </em>

                      </>

                    ) : (

                      <strong className="bulk-not-found">

                        No encontrada

                      </strong>

                    )}

                  </div>


                  <button
                    type="button"
                    className="bulk-remove"
                    onClick={
                      () =>
                        removeBulkResult(
                          item.id
                        )
                    }
                  >

                    <X size={18} />

                  </button>

                </div>

              )
            )}


            <button
              type="button"
              className="primary bulk-import-btn"
              disabled={
                bulkSaving ||
                selectedBulkCount === 0
              }
              onClick={
                importBulkSongs
              }
            >

              <Plus />

              {bulkSaving
                ? 'Agregando...'
                : `Agregar ${selectedBulkCount} canciones`}

            </button>

          </div>

        )}

      </div>


      <div className="admin-grid">


        {/* =====================================
            AGREGAR UNA
        ===================================== */}

        <div>

          <div className="card spotify-card">

            <h2>

              <Search />

              Agregar una canción

            </h2>


            <form
              className="spotify-search"
              onSubmit={
                searchSpotify
              }
            >

              <input
                value={
                  spotifyQuery
                }
                placeholder="Ej. Provenza Karol G"
                onChange={
                  e =>
                    setSpotifyQuery(
                      e.target.value
                    )
                }
              />


              <button
                className="spotify-search-btn"
                disabled={
                  spotifyLoading
                }
              >

                <Search size={18} />

                {spotifyLoading
                  ? 'Buscando...'
                  : 'Buscar'}

              </button>

            </form>


            {spotifyError && (

              <div className="spotify-error">

                {spotifyError}

              </div>

            )}


            {spotifyResults.length > 0 && (

              <div className="spotify-results">

                {spotifyResults.map(
                  track => (

                    <button
                      type="button"
                      key={
                        track.spotify_id
                      }
                      className="spotify-result"
                      onClick={
                        () =>
                          selectSpotifyTrack(
                            track
                          )
                      }
                    >

                      {track.album_image_url ? (

                        <img
                          src={
                            track.album_image_url
                          }
                          alt=""
                        />

                      ) : (

                        <div className="spotify-cover-placeholder">

                          <Music2 />

                        </div>

                      )}


                      <div className="spotify-result-info">

                        <strong>
                          {track.title}
                        </strong>

                        <span>
                          {track.artist}
                        </span>

                        <small>

                          {track.album_name}

                          {track.year
                            ? ` · ${track.year}`
                            : ''}

                        </small>

                      </div>


                      <Check size={20} />

                    </button>

                  )
                )}

              </div>

            )}

          </div>


          <form
            className="card form-grid song-form"
            onSubmit={
              saveSong
            }
          >

            <h2>

              <Music2 />

              Agregar al juego

            </h2>


            {form.spotify_id ? (

              <>

                <div className="selected-track-preview">

                  {form.album_image_url && (

                    <img
                      src={
                        form.album_image_url
                      }
                      alt=""
                    />

                  )}


                  <div>

                    <span>
                      Canción seleccionada
                    </span>

                    <strong>
                      {form.title}
                    </strong>

                    <p>
                      {form.artist}
                    </p>

                    <small>
                      {form.album_name}
                    </small>

                  </div>

                </div>


                <div className="two-cols">

                  <label>

                    Género

                    <input
                      value={
                        form.genre
                      }
                      placeholder="Ej. Urbano"
                      onChange={
                        e =>
                          setForm({
                            ...form,
                            genre:
                              e.target.value
                          })
                      }
                    />

                  </label>


                  <label>

                    Año

                    <input
                      type="number"
                      value={
                        form.year
                      }
                      onChange={
                        e =>
                          setForm({
                            ...form,
                            year:
                              e.target.value
                          })
                      }
                    />

                  </label>

                </div>


                {form.spotify_url && (

                  <a
                    className="spotify-link"
                    href={
                      form.spotify_url
                    }
                    target="_blank"
                    rel="noreferrer"
                  >

                    <ExternalLink
                      size={17}
                    />

                    Ver referencia

                  </a>

                )}


                <button
                  className="primary"
                  disabled={
                    busy
                  }
                >

                  {busy
                    ? 'Guardando...'
                    : 'Agregar canción'}

                </button>

              </>

            ) : (

              <div className="notice">

                Busca una canción arriba y selecciónala.

              </div>

            )}


            {message && (

              <div className="message">

                {message}

              </div>

            )}

          </form>

        </div>


        {/* =====================================
            BIBLIOTECA
        ===================================== */}

        <div className="card song-list">

          <h2>

            <Music2 />

            Canciones ({songs.length})

          </h2>


          {songs.length === 0 && (

            <p className="muted">

              Todavía no hay canciones.

            </p>

          )}


          {songs.map(
            song => (

              <div
                className="song-row"
                key={
                  song.id
                }
              >

                <div className="song-info">

                  {song.album_image_url ? (

                    <img
                      className="song-thumb"
                      src={
                        song.album_image_url
                      }
                      alt=""
                    />

                  ) : (

                    <div className="song-thumb song-thumb-placeholder">

                      <Music2 />

                    </div>

                  )}


                  <div>

                    <b>
                      {song.title}
                    </b>

                    <span>
                      {song.artist}
                    </span>

                    <span>

                      {song.genre || 'Latino'}

                      {song.year
                        ? ` · ${song.year}`
                        : ''}

                    </span>

                  </div>

                </div>


                <button
                  type="button"
                  className="icon danger"
                  onClick={
                    () =>
                      removeSong(
                        song
                      )
                  }
                >

                  <Trash2 />

                </button>

              </div>

            )
          )}

        </div>

      </div>

    </section>
  )
}