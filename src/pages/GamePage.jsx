import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  Play,
  Pause,
  SkipForward,
  Flag,
  RotateCcw,
  Trophy,
  Search
} from 'lucide-react'

import {
  supabase,
  supabaseReady
} from '../lib/supabase'

import {
  loadSpotifyIframeApi
} from '../lib/spotifyIframe'


const LEVELS = [
  {
    id: 'imposible',
    label: 'Imposible',
    duration: 1,
    points: 500
  },
  {
    id: 'experto',
    label: 'Experto',
    duration: 2,
    points: 400
  },
  {
    id: 'dificil',
    label: 'Difícil',
    duration: 5,
    points: 300
  },
  {
    id: 'media',
    label: 'Media',
    duration: 10,
    points: 200
  },
  {
    id: 'facil',
    label: 'Fácil',
    duration: 15,
    points: 100
  }
]


function normalizeText(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(
      /\b(remaster(ed)?|deluxe|explicit|clean|version|edit|single)\b/g,
      ''
    )
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}


function normalizeArtist(value = '') {
  return normalizeText(value)
    .replace(/\bfeat\b.*$/g, '')
    .replace(/\bft\b.*$/g, '')
    .trim()
}


function sameSong(song, guess) {

  if (!song || !guess) {
    return false
  }


  if (
    song.spotify_id &&
    guess.spotify_id &&
    song.spotify_id === guess.spotify_id
  ) {
    return true
  }


  const songTitle =
    normalizeText(song.title)

  const guessTitle =
    normalizeText(guess.title)

  const songArtist =
    normalizeArtist(song.artist)

  const guessArtist =
    normalizeArtist(guess.artist)

  const hardStopAtRef =
  useRef(null)

const stopFrameRef =
  useRef(null)

const pauseHammerRef =
  useRef(null)    

  return (
    songTitle === guessTitle &&
    (
      songArtist === guessArtist ||
      songArtist.includes(
        guessArtist
      ) ||
      guessArtist.includes(
        songArtist
      )
    )
  )
}


function searchLibrary(
  library,
  search
) {

  const needle =
    normalizeText(search)


  if (!needle) {
    return []
  }


  /*
  Primero priorizamos coincidencias
  que empiezan con lo escrito.
  */

  const ranked =
    library
      .map(song => {

        const title =
          normalizeText(song.title)

        const artist =
          normalizeText(song.artist)

        const combined =
          `${title} ${artist}`


        let score = 0


        if (title === needle) {
          score = 100

        } else if (
          title.startsWith(needle)
        ) {
          score = 90

        } else if (
          artist.startsWith(needle)
        ) {
          score = 80

        } else if (
          title.includes(needle)
        ) {
          score = 70

        } else if (
          artist.includes(needle)
        ) {
          score = 60

        } else if (
          combined.includes(needle)
        ) {
          score = 50
        }


        return {
          song,
          score
        }
      })
      .filter(
        item =>
          item.score > 0
      )
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(
        0,
        8
      )


  return ranked.map(
    item =>
      item.song
  )
}


export default function GamePage() {

  /*
  =====================================
  JUEGO
  =====================================
  */

  const [songs, setSongs] =
    useState([])

  const [song, setSong] =
    useState(null)

  const [nextSong, setNextSong] =
    useState(null)

  const [levelIndex, setLevelIndex] =
    useState(0)

  const [status, setStatus] =
    useState('playing')

  const [score, setScore] =
    useState(0)

  const [message, setMessage] =
    useState('')

  const [loading, setLoading] =
    useState(true)


  /*
  =====================================
  SPOTIFY
  =====================================
  */

  const [spotifyReady, setSpotifyReady] =
    useState(false)

  const [isPlaying, setIsPlaying] =
    useState(false)

  const [audioStarting, setAudioStarting] =
    useState(false)


  const iframeApiRef =
    useRef(null)

  const controllerARef =
    useRef(null)

  const controllerBRef =
    useRef(null)

  const activeSlotRef =
    useRef('A')

  const readyARef =
    useRef(false)

  const readyBRef =
    useRef(false)

  const loadedARef =
    useRef(null)

  const loadedBRef =
    useRef(null)

  const playedARef =
    useRef(false)

  const playedBRef =
    useRef(false)


  /*
  =====================================
  CONTROL DE AUDIO
  =====================================
  */

  const targetDurationRef =
    useRef(null)

  const playingRequestRef =
    useRef(false)

  const stoppingRef =
    useRef(false)

  const playbackWatchdogRef =
    useRef(null)

  const playbackStartedAtRef =
    useRef(null)

  const fallbackTimerRef =
    useRef(null)


  /*
  =====================================
  BUSCADOR LOCAL
  =====================================
  */

  const [query, setQuery] =
    useState('')

  const [
    searchResults,
    setSearchResults
  ] = useState([])

  const [
    selectedGuess,
    setSelectedGuess
  ] = useState(null)

  const [
    searching,
    setSearching
  ] = useState(false)

  const searchTimer =
    useRef(null)

  const skipNextSearchRef =
    useRef(false)


  /*
  =====================================
  RESULTADOS
  =====================================
  */

  const [attempts, setAttempts] =
    useState([])

  const [playerName, setPlayerName] =
    useState('')

  const [
    leaderboard,
    setLeaderboard
  ] = useState([])

  const [
    scoreSaved,
    setScoreSaved
  ] = useState(false)


  const currentLevel =
    LEVELS[levelIndex]


  /*
  =====================================
  HELPERS SPOTIFY
  =====================================
  */

  function getActiveController() {

    return activeSlotRef.current === 'A'
      ? controllerARef.current
      : controllerBRef.current
  }


  function activeIsReady() {

    return activeSlotRef.current === 'A'
      ? readyARef.current
      : readyBRef.current
  }


  function activeAlreadyPlayed() {

    return activeSlotRef.current === 'A'
      ? playedARef.current
      : playedBRef.current
  }


  function markActiveAsPlayed() {

    if (
      activeSlotRef.current === 'A'
    ) {

      playedARef.current =
        true

    } else {

      playedBRef.current =
        true
    }
  }


  /*
  =====================================
  INICIO
  =====================================
  */

  useEffect(() => {

    loadSongs()
    loadLeaderboard()


    loadSpotifyIframeApi()
      .then(IFrameAPI => {

        iframeApiRef.current =
          IFrameAPI

      })
      .catch(error => {

        console.error(error)

        setMessage(
          'No se pudo preparar el reproductor.'
        )
      })


    return () => {

      stopSpotify()

      clearTimeout(
        searchTimer.current
      )


      controllerARef.current
        ?.destroy?.()

      controllerBRef.current
        ?.destroy?.()
    }

  }, [])


  /*
  =====================================
  CARGAR CANCIONES
  =====================================
  */

  async function loadSongs() {

    setLoading(true)


    if (!supabaseReady) {

      setLoading(false)

      return
    }


    const {
      data,
      error
    } =
      await supabase
        .from('songs')
        .select(
          'id, title, artist, spotify_id, album_image_url, album_name, year, genre'
        )
        .eq(
          'active',
          true
        )


    if (error) {

      setMessage(
        error.message
      )

      setLoading(false)

      return
    }


    setSongs(
      (data || [])
        .filter(
          item =>
            Boolean(
              item.spotify_id
            )
        )
    )


    setLoading(false)
  }


  /*
  =====================================
  PRIMERA CANCIÓN
  =====================================
  */

  useEffect(() => {

    if (
      loading ||
      !songs.length ||
      song
    ) {
      return
    }


    const first =
      chooseRandomSong([])


    const second =
      chooseRandomSong([
        first?.id
      ])


    setSong(first)

    setNextSong(second)


    setTimeout(
      () => {

        ensureControllers(
          first,
          second
        )

      },
      0
    )

  }, [
    loading,
    songs.length
  ])


  function chooseRandomSong(
    excludeIds = []
  ) {

    const available =
      songs.filter(
        item =>
          !excludeIds.includes(
            item.id
          )
      )


    const pool =
      available.length
        ? available
        : songs


    if (!pool.length) {
      return null
    }


    return pool[
      Math.floor(
        Math.random() *
        pool.length
      )
    ]
  }


  /*
  =====================================
  CREAR DOBLE CONTROLLER
  =====================================
  */

  async function ensureControllers(
    current,
    upcoming
  ) {

    if (
      !current?.spotify_id
    ) {
      return
    }


    const IFrameAPI =
      iframeApiRef.current ||
      await loadSpotifyIframeApi()


    iframeApiRef.current =
      IFrameAPI


    if (
      !controllerARef.current
    ) {

      const elementA =
        document.getElementById(
          'spotify-game-embed-a'
        )


      if (elementA) {

        IFrameAPI.createController(
          elementA,
          {
            width: '100%',
            height: 80,
            uri:
              `spotify:track:${current.spotify_id}`
          },
          controller => {

            controllerARef.current =
              controller

            loadedARef.current =
              current.spotify_id

            playedARef.current =
              false


            setupControllerEvents(
              controller,
              'A'
            )
          }
        )
      }
    }


    if (
      upcoming?.spotify_id &&
      !controllerBRef.current
    ) {

      const elementB =
        document.getElementById(
          'spotify-game-embed-b'
        )


      if (elementB) {

        IFrameAPI.createController(
          elementB,
          {
            width: '100%',
            height: 80,
            uri:
              `spotify:track:${upcoming.spotify_id}`
          },
          controller => {

            controllerBRef.current =
              controller

            loadedBRef.current =
              upcoming.spotify_id

            playedBRef.current =
              false


            setupControllerEvents(
              controller,
              'B'
            )
          }
        )
      }
    }
  }


  function setupControllerEvents(
    controller,
    slot
  ) {

    controller.addListener(
      'ready',
      () => {

        if (slot === 'A') {

          readyARef.current =
            true

        } else {

          readyBRef.current =
            true
        }


        if (
          slot ===
          activeSlotRef.current
        ) {

          setSpotifyReady(true)
        }
      }
    )


   controller.addListener(
  'playback_started',
  () => {

    if (
      !playingRequestRef.current
    ) {
      return
    }


    /*
    Spotify acaba de confirmar
    que comenzó la reproducción.
    */

    const now =
      performance.now()


    playbackStartedAtRef.current =
      now


    hardStopAtRef.current =
      now +
      (
        targetDurationRef.current ||
        1000
      )


    setAudioStarting(false)

    setIsPlaying(true)


    clearInterval(
      playbackWatchdogRef.current
    )

    clearTimeout(
      fallbackTimerRef.current
    )

    cancelAnimationFrame(
      stopFrameRef.current
    )


    /*
    ===================================
    RELOJ DE ALTA PRECISIÓN
    ===================================
    */

    const watchPlayback = () => {

      if (
        !playingRequestRef.current ||
        hardStopAtRef.current === null
      ) {
        return
      }


      if (
        performance.now() >=
        hardStopAtRef.current
      ) {

        forceStopSpotify()

        return
      }


      stopFrameRef.current =
        requestAnimationFrame(
          watchPlayback
        )
    }


    stopFrameRef.current =
      requestAnimationFrame(
        watchPlayback
      )


    /*
    ===================================
    SEGUNDO RELOJ DE RESPALDO
    ===================================
    */

    fallbackTimerRef.current =
      setTimeout(
        () => {

          forceStopSpotify()

        },
        (
          targetDurationRef.current ||
          1000
        ) + 80
      )
  }
)
  }


  function preloadSongIntoSlot(
    slot,
    targetSong
  ) {

    if (
      !targetSong?.spotify_id
    ) {
      return
    }


    const uri =
      `spotify:track:${targetSong.spotify_id}`


    if (slot === 'A') {

      if (
        controllerARef.current &&
        loadedARef.current !==
          targetSong.spotify_id
      ) {

        readyARef.current =
          false

        playedARef.current =
          false

        loadedARef.current =
          targetSong.spotify_id


        controllerARef.current
          .loadEntity(uri)
      }


    } else {

      if (
        controllerBRef.current &&
        loadedBRef.current !==
          targetSong.spotify_id
      ) {

        readyBRef.current =
          false

        playedBRef.current =
          false

        loadedBRef.current =
          targetSong.spotify_id


        controllerBRef.current
          .loadEntity(uri)
      }
    }
  }


  /*
  =====================================
  AUDIO
  =====================================
  */

function forceStopSpotify() {

  /*
  Ya estamos cortando.
  No iniciar otro proceso.
  */

  if (stoppingRef.current) {
    return
  }


  stoppingRef.current =
    true


  clearInterval(
    playbackWatchdogRef.current
  )

  clearTimeout(
    fallbackTimerRef.current
  )

  cancelAnimationFrame(
    stopFrameRef.current
  )

  clearInterval(
    pauseHammerRef.current
  )


  hardStopAtRef.current =
    null

  playbackStartedAtRef.current =
    null

  playingRequestRef.current =
    false

  targetDurationRef.current =
    null


  const controller =
    typeof getActiveController === 'function'
      ? getActiveController()
      : controllerRef.current


  /*
  PRIMER PAUSE
  */

  controller?.pause()


  /*
  SPOTIFY a veces tarda en obedecer.
  Durante un segundo seguimos
  enviando PAUSE.
  */

  let attempts = 0


  pauseHammerRef.current =
    setInterval(
      () => {

        controller?.pause()

        attempts += 1


        if (attempts >= 10) {

          clearInterval(
            pauseHammerRef.current
          )

          pauseHammerRef.current =
            null
        }

      },
      100
    )


  setAudioStarting(false)

  setIsPlaying(false)


  /*
  Dejamos desbloquear otro Play
  después de que Spotify haya tenido
  tiempo para detenerse.
  */

  setTimeout(
    () => {

      stoppingRef.current =
        false

    },
    1100
  )
}


function stopSpotify() {

  clearInterval(
    playbackWatchdogRef.current
  )

  clearTimeout(
    fallbackTimerRef.current
  )

  cancelAnimationFrame(
    stopFrameRef.current
  )

  clearInterval(
    pauseHammerRef.current
  )


  hardStopAtRef.current =
    null

  playbackStartedAtRef.current =
    null

  playingRequestRef.current =
    false

  targetDurationRef.current =
    null


  const controller =
    typeof getActiveController === 'function'
      ? getActiveController()
      : controllerRef.current


  controller?.pause()


  /*
  Segunda orden rápida de seguridad.
  */

  setTimeout(
    () => {

      controller?.pause()

    },
    100
  )


  setAudioStarting(false)

  setIsPlaying(false)
}


  function togglePlay() {

    const controller =
      getActiveController()


    if (
      !controller ||
      !spotifyReady ||
      status !== 'playing'
    ) {
      return
    }


    if (
      audioStarting ||
      isPlaying
    ) {

      stopSpotify()

      return
    }


    clearInterval(
      playbackWatchdogRef.current
    )

    clearTimeout(
      fallbackTimerRef.current
    )


    stoppingRef.current =
      false

    playbackStartedAtRef.current =
      null

    playingRequestRef.current =
      true


    targetDurationRef.current =
      currentLevel.duration *
      1000


    setAudioStarting(true)

    setIsPlaying(true)


    if (
      activeAlreadyPlayed()
    ) {

      controller.restart()
      controller.play()

    } else {

      markActiveAsPlayed()

      controller.play()
    }
  }


  /*
  =====================================
  SIGUIENTE CANCIÓN
  =====================================
  */

  function pickSong() {

    stopSpotify()


    if (!songs.length) {
      return
    }


    const incoming =
      nextSong ||
      chooseRandomSong([
        song?.id
      ])


    if (!incoming) {
      return
    }


    activeSlotRef.current =
      activeSlotRef.current === 'A'
        ? 'B'
        : 'A'


    setSpotifyReady(
      activeIsReady() ||
      Boolean(
        getActiveController()
      )
    )


    const upcoming =
      chooseRandomSong([
        incoming.id,
        song?.id
      ])


    setSong(incoming)

    setNextSong(upcoming)


    setLevelIndex(0)

    setAttempts([])

    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])

    setMessage('')

    setStatus('playing')

    setScoreSaved(false)


    setTimeout(
      () => {

        const standbySlot =
          activeSlotRef.current === 'A'
            ? 'B'
            : 'A'


        preloadSongIntoSlot(
          standbySlot,
          upcoming
        )

      },
      50
    )
  }


  /*
  =====================================
  BUSCADOR LOCAL
  =====================================
  */

  useEffect(() => {

    clearTimeout(
      searchTimer.current
    )


    if (
      skipNextSearchRef.current
    ) {

      skipNextSearchRef.current =
        false

      return
    }


    if (
      query.trim().length < 2 ||
      status !== 'playing'
    ) {

      setSearchResults([])

      setSearching(false)

      return
    }


    setSearching(true)


    searchTimer.current =
      setTimeout(
        () => {

          const results =
            searchLibrary(
              songs,
              query.trim()
            )


          setSearchResults(
            results
          )

          setSearching(false)

        },
        90
      )


    return () => {

      clearTimeout(
        searchTimer.current
      )
    }

  }, [
    query,
    status,
    songs
  ])


  function selectGuess(track) {

    skipNextSearchRef.current =
      true


    setSelectedGuess(track)


    setQuery(
      `${track.title} — ${track.artist}`
    )


    setSearchResults([])
  }


  /*
  =====================================
  JUEGO
  =====================================
  */

  function advanceLevel() {

    stopSpotify()

    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])


    if (
      levelIndex <
      LEVELS.length - 1
    ) {

      setLevelIndex(
        current =>
          current + 1
      )

      return
    }


    loseGame()
  }


  function skip() {

    if (
      status !== 'playing'
    ) {
      return
    }


    setAttempts(
      current => [
        ...current,
        {
          level:
            currentLevel.label,

          duration:
            currentLevel.duration,

          result:
            'Saltado',

          correct:
            false
        }
      ]
    )


    advanceLevel()
  }


  function guess() {

    if (
      !selectedGuess ||
      !song ||
      status !== 'playing'
    ) {

      setMessage(
        'Selecciona una canción de la lista.'
      )

      return
    }


    stopSpotify()


    const correct =
      sameSong(
        song,
        selectedGuess
      )


    setAttempts(
      current => [
        ...current,
        {
          level:
            currentLevel.label,

          duration:
            currentLevel.duration,

          result:
            `${selectedGuess.title} — ${selectedGuess.artist}`,

          correct
        }
      ]
    )


    if (correct) {

      const points =
        currentLevel.points


      setScore(
        current =>
          current + points
      )


      setStatus('won')


      setMessage(
        `¡Correcto! +${points} puntos`
      )

      return
    }


    setMessage(
      'No es esa. Pasamos al siguiente nivel.'
    )


    setTimeout(
      () => {

        advanceLevel()

      },
      550
    )
  }


  function loseGame() {

    stopSpotify()

    setStatus('lost')


    setMessage(
      `Era “${song.title}” — ${song.artist}`
    )
  }


  function giveUp() {

    if (
      status !== 'playing'
    ) {
      return
    }


    loseGame()
  }


  /*
  =====================================
  RANKING
  =====================================
  */

  async function loadLeaderboard() {

    if (!supabaseReady) {
      return
    }


    const {
      data
    } =
      await supabase
        .from('scores')
        .select('*')
        .order(
          'score',
          {
            ascending: false
          }
        )
        .limit(10)


    setLeaderboard(
      data || []
    )
  }


  async function saveScore() {

    if (
      !playerName.trim()
    ) {

      setMessage(
        'Escribe tu nombre.'
      )

      return
    }


    if (scoreSaved) {
      return
    }


    const {
      error
    } =
      await supabase
        .from('scores')
        .insert({

          player_name:
            playerName
              .trim()
              .slice(
                0,
                30
              ),

          score,

          song_title:
            song.title,

          song_artist:
            song.artist,

          difficulty:
            currentLevel.label
        })


    if (error) {

      setMessage(
        error.message
      )

      return
    }


    setScoreSaved(true)


    setMessage(
      'Puntuación guardada.'
    )


    await loadLeaderboard()
  }


  /*
  =====================================
  UI
  =====================================
  */

  return (

    <section className="game-wrap">


      <div className="spotify-hidden-player">

        <div
          id="spotify-game-embed-a"
        />

        <div
          id="spotify-game-embed-b"
        />

      </div>


      <div className="score-pill">

        <Trophy size={18} />

        {score} pts

      </div>


      <div className="difficulty-row">

        {LEVELS.map(
          (
            level,
            index
          ) => (

            <div
              key={level.id}
              className={
                `level-pill ${level.id} ${
                  index === levelIndex
                    ? 'current'
                    : ''
                } ${
                  index < levelIndex
                    ? 'used'
                    : ''
                }`
              }
            >

              {level.label}

              <small>
                {level.duration}s
              </small>

            </div>

          )
        )}

      </div>


      <div className="progress">

        <span
          style={{
            width:
              `${
                (
                  (levelIndex + 1) /
                  LEVELS.length
                ) * 100
              }%`
          }}
        />

      </div>


      {!loading &&
        !song && (

        <div className="notice">

          No hay canciones disponibles.

        </div>

      )}


      {song && (

        <>

          <button
            className={
              `play-button ${
                audioStarting
                  ? 'audio-starting'
                  : ''
              }`
            }
            onClick={togglePlay}
            disabled={
              !spotifyReady ||
              status !== 'playing'
            }
          >

            {isPlaying ? (

              <Pause
                size={62}
                fill="currentColor"
              />

            ) : (

              <Play
                size={62}
                fill="currentColor"
              />

            )}

          </button>


          <div className="seconds">

            {!spotifyReady
              ? 'Preparando...'
              : `${currentLevel.duration}s`}

          </div>


          <div className="guess-area">

            <div className="autocomplete">

              <div className="spotify-game-search">

                <Search size={20} />

                <input
                  value={query}
                  placeholder="Busca una canción..."
                  disabled={
                    status !== 'playing'
                  }
                  onChange={
                    e => {

                      setQuery(
                        e.target.value
                      )

                      setSelectedGuess(
                        null
                      )
                    }
                  }
                />

              </div>


              {searching && (

                <div className="spotify-searching">

                  Buscando canciones...

                </div>

              )}


              {searchResults.length > 0 && (

                <div className="suggestions spotify-game-results">

                  {searchResults.map(
                    track => (

                      <button
                        type="button"
                        key={track.id}
                        onClick={
                          () =>
                            selectGuess(
                              track
                            )
                        }
                      >

                        {track.album_image_url && (

                          <img
                            src={
                              track.album_image_url
                            }
                            alt=""
                          />

                        )}


                        <span className="guess-track-info">

                          <b>
                            {track.title}
                          </b>

                          <small>
                            {track.artist}
                          </small>

                        </span>

                      </button>

                    )
                  )}

                </div>

              )}

            </div>


            <div className="guess-actions">

              <button
                className="guess-btn"
                onClick={guess}
                disabled={
                  status !== 'playing'
                }
              >

                Adivinar

              </button>


              <button
                className="skip-inline-btn"
                onClick={skip}
                disabled={
                  status !== 'playing'
                }
              >

                <SkipForward />

                Saltar

              </button>

            </div>

          </div>


          <div className="single-action">

            <button
              onClick={giveUp}
              disabled={
                status !== 'playing'
              }
            >

              <Flag />

              Rendirse

            </button>

          </div>


          {message && (

            <div
              className={
                `message ${status}`
              }
            >

              {message}

            </div>

          )}


          {status !== 'playing' && (

            <button
              className="next-btn next-song-immediate"
              onClick={pickSong}
            >

              <RotateCcw />

              Siguiente canción

            </button>

          )}


          {attempts.length > 0 && (

            <div className="attempt-history">

              <h3>
                Intentos
              </h3>


              {attempts.map(
                (
                  attempt,
                  index
                ) => (

                  <div
                    className={
                      `attempt-row ${
                        attempt.correct
                          ? 'correct'
                          : ''
                      }`
                    }
                    key={index}
                  >

                    <span className="attempt-number">

                      {index + 1}

                    </span>


                    <span>

                      <strong>
                        {attempt.level}
                      </strong>

                      <small>
                        {attempt.duration}s
                      </small>

                    </span>


                    <span className="attempt-answer">

                      {attempt.result}

                    </span>

                  </div>

                )
              )}

            </div>

          )}


          {status !== 'playing' && (

            <>

              <div className="song-reveal">

                {song.album_image_url && (

                  <img
                    src={
                      song.album_image_url
                    }
                    alt=""
                  />

                )}


                <div>

                  <span>

                    {status === 'won'
                      ? '¡La pegaste!'
                      : 'La canción era'}

                  </span>

                  <h2>
                    {song.title}
                  </h2>

                  <p>
                    {song.artist}
                  </p>

                </div>

              </div>


              <div className="save-score-card">

                <h3>
                  Guardar puntuación
                </h3>


                <div className="save-score-form">

                  <input
                    maxLength={30}
                    placeholder="Tu nombre"
                    value={playerName}
                    onChange={
                      e =>
                        setPlayerName(
                          e.target.value
                        )
                    }
                  />


                  <button
                    className="primary"
                    onClick={saveScore}
                    disabled={scoreSaved}
                  >

                    {scoreSaved
                      ? 'Guardado ✓'
                      : `Guardar ${score} pts`}

                  </button>

                </div>

              </div>

            </>

          )}


          {leaderboard.length > 0 && (

            <div className="leaderboard">

              <h3>
                🏆 Mejores puntuaciones
              </h3>


              {leaderboard.map(
                (
                  item,
                  index
                ) => (

                  <div
                    className="leaderboard-row"
                    key={item.id}
                  >

                    <span>
                      #{index + 1}
                    </span>

                    <strong>
                      {item.player_name}
                    </strong>

                    <span>
                      {item.score} pts
                    </span>

                  </div>

                )
              )}

            </div>

          )}

        </>

      )}

    </section>
  )
}