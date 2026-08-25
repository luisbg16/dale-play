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
    song.spotify_id ===
      guess.spotify_id
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


function dedupeTracks(tracks = []) {

  const map =
    new Map()


  for (const track of tracks) {

    const key =
      `${normalizeText(track.title)}::${normalizeArtist(track.artist)}`


    if (!map.has(key)) {

      map.set(
        key,
        track
      )
    }
  }


  return Array.from(
    map.values()
  )
}


export default function GamePage() {

  /*
  ==========================================
  JUEGO
  ==========================================
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

  const [isPlaying, setIsPlaying] =
    useState(false)

  const [audioStarting, setAudioStarting] =
    useState(false)

  const [spotifyReady, setSpotifyReady] =
    useState(false)


  /*
  ==========================================
  DOBLE SPOTIFY CONTROLLER
  ==========================================

  A = canción actual
  B = próxima canción

  Luego se intercambian.
  */

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
  ==========================================
  CONTROL DE TIEMPO
  ==========================================
  */

  const fallbackTimerRef =
    useRef(null)

  const targetDurationRef =
    useRef(null)

  const startedPositionRef =
    useRef(null)

  const stoppingRef =
    useRef(false)

  const playingRequestRef =
    useRef(false)


  /*
  ==========================================
  BUSCADOR
  ==========================================
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
  ==========================================
  RESULTADOS
  ==========================================
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
  ==========================================
  HELPERS CONTROLLERS
  ==========================================
  */

  function getActiveController() {

    return activeSlotRef.current === 'A'
      ? controllerARef.current
      : controllerBRef.current
  }


  function getStandbyController() {

    return activeSlotRef.current === 'A'
      ? controllerBRef.current
      : controllerARef.current
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
  ==========================================
  INICIO
  ==========================================
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

        console.error(
          'Spotify API:',
          error
        )

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


      controllerARef.current =
        null

      controllerBRef.current =
        null
    }

  }, [])


  /*
  ==========================================
  CREAR CONTROLLERS
  ==========================================
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


    /*
    CONTROLLER A
    */

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


    /*
    CONTROLLER B
    */

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

        /*
        Ignorar eventos del reproductor
        que está precargando.
        */

        if (
          slot !==
          activeSlotRef.current
        ) {
          return
        }


        if (
          !playingRequestRef.current
        ) {
          return
        }


        setAudioStarting(false)

        setIsPlaying(true)


        clearTimeout(
          fallbackTimerRef.current
        )


        fallbackTimerRef.current =
          setTimeout(
            () => {

              forceStopSpotify()

            },
            (
              targetDurationRef.current ||
              1000
            ) + 1200
          )
      }
    )


    controller.addListener(
      'playback_update',
      event => {

        if (
          slot !==
          activeSlotRef.current
        ) {
          return
        }


        const data =
          event?.data


        if (!data) {
          return
        }


        const position =
          Number(
            data.position || 0
          )


        if (
          playingRequestRef.current &&
          startedPositionRef.current ===
            null &&
          !data.isPaused &&
          !data.isBuffering
        ) {

          startedPositionRef.current =
            position
        }


        if (
          !playingRequestRef.current ||
          targetDurationRef.current ===
            null ||
          startedPositionRef.current ===
            null ||
          stoppingRef.current
        ) {
          return
        }


        const played =
          position -
          startedPositionRef.current


        if (
          played >=
          targetDurationRef.current
        ) {

          forceStopSpotify()
        }
      }
    )
  }


  /*
  ==========================================
  PRECARGAR EN SLOT
  ==========================================
  */

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
  ==========================================
  AUDIO
  ==========================================
  */

  function forceStopSpotify() {

    if (
      stoppingRef.current
    ) {
      return
    }


    stoppingRef.current =
      true


    clearTimeout(
      fallbackTimerRef.current
    )


    getActiveController()
      ?.pause()


    playingRequestRef.current =
      false

    targetDurationRef.current =
      null

    startedPositionRef.current =
      null


    setAudioStarting(false)

    setIsPlaying(false)


    setTimeout(
      () => {

        stoppingRef.current =
          false

      },
      200
    )
  }


  function stopSpotify() {

    clearTimeout(
      fallbackTimerRef.current
    )


    playingRequestRef.current =
      false

    targetDurationRef.current =
      null

    startedPositionRef.current =
      null

    stoppingRef.current =
      false


    controllerARef.current
      ?.pause()

    controllerBRef.current
      ?.pause()


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


    /*
    Si ya está arrancando o sonando,
    el clic significa PAUSA.
    */

    if (
      audioStarting ||
      isPlaying
    ) {

      stopSpotify()

      return
    }


    clearTimeout(
      fallbackTimerRef.current
    )


    stoppingRef.current =
      false

    startedPositionRef.current =
      null

    playingRequestRef.current =
      true

    targetDurationRef.current =
      currentLevel.duration *
      1000


    setAudioStarting(true)

    setIsPlaying(true)


    /*
    CLAVE:

    Primera reproducción de una canción
    precargada = solo play().

    Si ya se escuchó antes,
    reiniciamos el fragmento.
    */

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
  ==========================================
  BIBLIOTECA
  ==========================================
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
        .select('*')
        .eq(
          'active',
          true
        )


    if (error) {

      setMessage(
        error.message
      )


    } else {

      setSongs(
        (data || [])
          .filter(
            item =>
              Boolean(
                item.spotify_id
              )
          )
      )
    }


    setLoading(false)
  }


  /*
  ==========================================
  PRIMERA CANCIÓN
  ==========================================
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
      songs[
        Math.floor(
          Math.random() *
          songs.length
        )
      ]


    const alternatives =
      songs.filter(
        item =>
          item.id !==
          first.id
      )


    const second =
      alternatives.length
        ? alternatives[
            Math.floor(
              Math.random() *
              alternatives.length
            )
          ]
        : first


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


  /*
  ==========================================
  ELEGIR PRÓXIMA
  ==========================================
  */

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
  ==========================================
  SIGUIENTE CANCIÓN
  ==========================================
  */

  function pickSong() {

    stopSpotify()


    if (
      !songs.length
    ) {
      return
    }


    /*
    Si hay una precargada,
    esa se convierte inmediatamente
    en la canción actual.
    */

    const incoming =
      nextSong ||
      chooseRandomSong([
        song?.id
      ])


    if (!incoming) {
      return
    }


    /*
    Intercambiamos reproductores.
    */

    activeSlotRef.current =
      activeSlotRef.current === 'A'
        ? 'B'
        : 'A'


    /*
    El controller que antes estaba
    precargando ahora es el activo.
    */

    setSpotifyReady(
      activeIsReady() ||
      Boolean(
        getActiveController()
      )
    )


    const newUpcoming =
      chooseRandomSong([
        incoming.id,
        song?.id
      ])


    setSong(incoming)

    setNextSong(
      newUpcoming
    )


    /*
    Reset de ronda.
    */

    setLevelIndex(0)

    setAttempts([])

    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])

    setMessage('')

    setStatus('playing')

    setScoreSaved(false)


    /*
    El reproductor que quedó libre
    empieza a cargar la próxima canción.
    */

    setTimeout(
      () => {

        const standbySlot =
          activeSlotRef.current === 'A'
            ? 'B'
            : 'A'


        preloadSongIntoSlot(
          standbySlot,
          newUpcoming
        )

      },
      50
    )
  }


  /*
  ==========================================
  BUSCADOR
  ==========================================
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

      return
    }


    searchTimer.current =
      setTimeout(
        () => {

          searchSongs(
            query.trim()
          )

        },
        350
      )


    return () =>

      clearTimeout(
        searchTimer.current
      )

  }, [
    query,
    status
  ])


  async function searchSongs(search) {

    setSearching(true)


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
                query: search
              }
            }
          )


      if (error) {
        throw error
      }


      setSearchResults(
        dedupeTracks(
          data?.tracks || []
        )
      )


    } catch (error) {

      console.error(error)

      setSearchResults([])

    } finally {

      setSearching(false)
    }
  }


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
  ==========================================
  JUEGO
  ==========================================
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
  ==========================================
  RANKING
  ==========================================
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
  ==========================================
  UI
  ==========================================
  */

  return (

    <section className="game-wrap">


      {/*
      DOS EMBEDS.

      Uno reproduce la canción actual.
      El otro tiene preparada la próxima.
      */}

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
              key={
                level.id
              }
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
            onClick={
              togglePlay
            }
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
                        key={
                          track.spotify_id
                        }
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
                    disabled={
                      scoreSaved
                    }
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