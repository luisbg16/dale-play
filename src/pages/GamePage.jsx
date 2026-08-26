import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  Play,
  Pause,
  Search,
  SkipForward,
  ArrowRight,
  CheckCircle2,
  X,
  Trophy
} from 'lucide-react'

import {
  supabase
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
      songArtist.includes(guessArtist) ||
      guessArtist.includes(songArtist)
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

  return library
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
    .slice(0, 8)
    .map(
      item =>
        item.song
    )
}


export default function GamePage() {

  /*
  =====================================
  BIBLIOTECA / CANCIÓN
  =====================================
  */

  const [songs, setSongs] =
    useState([])

  const [song, setSong] =
    useState(null)

  const [nextSongData, setNextSongData] =
    useState(null)

  const [loading, setLoading] =
    useState(true)


  /*
  =====================================
  JUEGO
  =====================================
  */

  const [levelIndex, setLevelIndex] =
    useState(0)

  const [attempts, setAttempts] =
    useState([])

  const [status, setStatus] =
    useState('playing')

  const [message, setMessage] =
    useState('')

  const [score, setScore] =
    useState(0)

  const [earnedPoints, setEarnedPoints] =
    useState(0)


  const currentLevel =
    LEVELS[levelIndex]


  const isLastLevel =
    levelIndex ===
    LEVELS.length - 1


  /*
  =====================================
  BUSCADOR
  =====================================
  */

  const [query, setQuery] =
    useState('')

  const [
    selectedGuess,
    setSelectedGuess
  ] = useState(null)

  const [
    searchResults,
    setSearchResults
  ] = useState([])

  const [searching, setSearching] =
    useState(false)

  const searchTimer =
    useRef(null)

  const skipNextSearchRef =
    useRef(false)


  /*
  =====================================
  NOMBRE / SCORE
  =====================================
  */

  const [playerName, setPlayerName] =
    useState('')

  const [scoreSaved, setScoreSaved] =
    useState(false)

  const [savingScore, setSavingScore] =
    useState(false)

  const [leaderboard, setLeaderboard] =
    useState([])


  /*
  =====================================
  SPOTIFY DOBLE CONTROLLER
  =====================================
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

  const playedARef =
    useRef(false)

  const playedBRef =
    useRef(false)

  const spotifyIdARef =
    useRef(null)

  const spotifyIdBRef =
    useRef(null)


  const stopTimerRef =
    useRef(null)

  const stoppingRef =
    useRef(false)


  const [spotifyReady, setSpotifyReady] =
    useState(false)

  const [isPlaying, setIsPlaying] =
    useState(false)

  const [audioStarting, setAudioStarting] =
    useState(false)


  /*
  =====================================
  INICIO
  =====================================
  */

  useEffect(() => {
    initializeGame()

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


  async function initializeGame() {
    setLoading(true)


    try {
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
        throw error
      }


      const library =
        (data || [])
          .filter(
            item =>
              Boolean(
                item.spotify_id
              )
          )


      setSongs(
        library
      )


      if (!library.length) {
        setMessage(
          'No hay canciones disponibles.'
        )

        setLoading(false)

        return
      }


      const firstSong =
        pickRandomSong(
          library
        )


      const upcoming =
        pickRandomSong(
          library,
          firstSong.id
        )


      setSong(
        firstSong
      )

      setNextSongData(
        upcoming
      )


      const IFrameAPI =
        await loadSpotifyIframeApi()


      iframeApiRef.current =
        IFrameAPI


      await createSpotifyControllers(
        IFrameAPI,
        firstSong,
        upcoming
      )


      await loadLeaderboard()


    } catch (error) {
      console.error(error)

      setMessage(
        error.message ||
        'No se pudo cargar el juego.'
      )

    } finally {
      setLoading(false)
    }
  }


  function pickRandomSong(
    library,
    excludeId = null
  ) {
    let candidates =
      library.filter(
        item =>
          item.id !==
          excludeId
      )


    if (!candidates.length) {
      candidates =
        library
    }


    return candidates[
      Math.floor(
        Math.random() *
        candidates.length
      )
    ]
  }


  /*
  =====================================
  SPOTIFY
  =====================================
  */

  async function createSpotifyControllers(
    IFrameAPI,
    currentSong,
    upcomingSong
  ) {
    const elementA =
      document.getElementById(
        'spotify-player-a'
      )

    const elementB =
      document.getElementById(
        'spotify-player-b'
      )


    if (
      !elementA ||
      !elementB
    ) {
      setMessage(
        'No se pudo montar Spotify.'
      )

      return
    }


    IFrameAPI.createController(
      elementA,
      {
        width: '100%',
        height: 80,
        uri:
          `spotify:track:${currentSong.spotify_id}`
      },
      controller => {
        controllerARef.current =
          controller

        spotifyIdARef.current =
          currentSong.spotify_id

        activeSlotRef.current =
          'A'

        setupControllerEvents(
          controller,
          'A'
        )
      }
    )


    IFrameAPI.createController(
      elementB,
      {
        width: '100%',
        height: 80,
        uri:
          `spotify:track:${upcomingSong.spotify_id}`
      },
      controller => {
        controllerBRef.current =
          controller

        spotifyIdBRef.current =
          upcomingSong.spotify_id

        setupControllerEvents(
          controller,
          'B'
        )
      }
    )
  }


  function setupControllerEvents(
    controller,
    slot
  ) {
    controller.addListener(
      'ready',
      () => {
        if (
          slot === 'A'
        ) {
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
          setSpotifyReady(
            true
          )
        }
      }
    )


    controller.addListener(
      'playback_started',
      () => {
        if (
          slot !==
          activeSlotRef.current
        ) {
          return
        }


        setAudioStarting(
          false
        )

        setIsPlaying(
          true
        )
      }
    )
  }


  function getActiveController() {
    return activeSlotRef.current === 'A'
      ? controllerARef.current
      : controllerBRef.current
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


  function stopSpotify() {
    clearTimeout(
      stopTimerRef.current
    )


    const controller =
      getActiveController()


    controller?.pause()


    setTimeout(
      () => {
        controller?.pause()
      },
      100
    )


    setIsPlaying(
      false
    )

    setAudioStarting(
      false
    )


    stoppingRef.current =
      false
  }


  function hardStopSpotify() {
    if (
      stoppingRef.current
    ) {
      return
    }


    stoppingRef.current =
      true


    clearTimeout(
      stopTimerRef.current
    )


    const controller =
      getActiveController()


    controller?.pause()


    setTimeout(
      () => {
        controller?.pause()
      },
      80
    )


    setTimeout(
      () => {
        controller?.pause()
      },
      180
    )


    setTimeout(
      () => {
        controller?.pause()
      },
      350
    )


    setIsPlaying(
      false
    )

    setAudioStarting(
      false
    )


    setTimeout(
      () => {
        stoppingRef.current =
          false
      },
      450
    )
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
      isPlaying ||
      audioStarting
    ) {
      hardStopSpotify()

      return
    }


    clearTimeout(
      stopTimerRef.current
    )


    stoppingRef.current =
      false


    const durationMs =
      currentLevel.duration *
      1000


    setAudioStarting(
      true
    )

    setIsPlaying(
      true
    )


    stopTimerRef.current =
      setTimeout(
        () => {
          hardStopSpotify()
        },
        durationMs
      )


    if (
      activeAlreadyPlayed()
    ) {
      controller.restart()

    } else {
      markActiveAsPlayed()

      controller.play()
    }
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
          setSearchResults(
            searchLibrary(
              songs,
              query.trim()
            )
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
    songs,
    status
  ])


  function selectGuess(track) {
    skipNextSearchRef.current =
      true


    setSelectedGuess(
      track
    )


    setQuery(
      `${track.title} — ${track.artist}`
    )


    setSearchResults([])
  }


  /*
  =====================================
  PASAR NIVEL / RENDIRSE
  =====================================
  */

  function registerFailure(text) {
    if (
      status !== 'playing'
    ) {
      return
    }


    stopSpotify()


    setAttempts(
      current => [
        ...current,
        {
          level:
            currentLevel.label,

          text,

          correct:
            false
        }
      ]
    )


    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])


    /*
    Todavía hay otro nivel.
    */

    if (
      levelIndex <
      LEVELS.length - 1
    ) {
      setLevelIndex(
        current =>
          current + 1
      )


      setMessage(
        'Pasaste al siguiente nivel.'
      )


      return
    }


    /*
    Ya estaba en Fácil:
    termina la canción.
    */

    giveUp()
  }


  function passLevel() {
    if (
      isLastLevel
    ) {
      registerFailure(
        'Rendirse'
      )

    } else {
      registerFailure(
        'Pasar nivel'
      )
    }
  }


  /*
  =====================================
  ADIVINAR
  =====================================
  */

  function guess() {
    if (
      !selectedGuess ||
      !song ||
      status !== 'playing'
    ) {
      if (
        !selectedGuess
      ) {
        setMessage(
          'Selecciona una canción.'
        )
      }

      return
    }


    stopSpotify()


    const correct =
      sameSong(
        song,
        selectedGuess
      )


    if (!correct) {
      registerFailure(
        `${selectedGuess.title} — ${selectedGuess.artist}`
      )

      return
    }


    setAttempts(
      current => [
        ...current,
        {
          level:
            currentLevel.label,

          text:
            `${selectedGuess.title} — ${selectedGuess.artist}`,

          correct:
            true
        }
      ]
    )


    const points =
      currentLevel.points


    setEarnedPoints(
      points
    )


    setScore(
      current =>
        current + points
    )


    setStatus(
      'won'
    )


    setMessage(
      `¡Correcto! +${points} pts`
    )


    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])

    setScoreSaved(false)
  }


  function giveUp() {
    stopSpotify()


    setEarnedPoints(
      0
    )


    setStatus(
      'lost'
    )


    setMessage(
      'Te rendiste.'
    )


    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])

    setScoreSaved(false)
  }


  /*
  =====================================
  SIGUIENTE CANCIÓN
  =====================================
  */

  async function nextSong() {
    if (
      status === 'playing'
    ) {
      return
    }


    stopSpotify()


    const newCurrent =
      nextSongData ||
      pickRandomSong(
        songs,
        song?.id
      )


    const newUpcoming =
      pickRandomSong(
        songs,
        newCurrent?.id
      )


    /*
    Cambiamos al controller que ya
    estaba precargado.
    */

    const nextSlot =
      activeSlotRef.current === 'A'
        ? 'B'
        : 'A'


    activeSlotRef.current =
      nextSlot


    setSong(
      newCurrent
    )


    setNextSongData(
      newUpcoming
    )


    setLevelIndex(
      0
    )

    setAttempts([])

    setStatus(
      'playing'
    )

    setMessage('')

    setEarnedPoints(
      0
    )

    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])

    setScoreSaved(false)


    /*
    El nuevo slot activo ya contiene
    la canción que estaba precargada.
    */

    if (
      nextSlot === 'A'
    ) {
      playedARef.current =
        false


      setSpotifyReady(
        readyARef.current
      )

    } else {
      playedBRef.current =
        false


      setSpotifyReady(
        readyBRef.current
      )
    }


    /*
    Ahora cargamos la próxima canción
    en el controller que quedó libre.
    */

    const standbyController =
      nextSlot === 'A'
        ? controllerBRef.current
        : controllerARef.current


    if (
      standbyController &&
      newUpcoming?.spotify_id
    ) {
      const uri =
        `spotify:track:${newUpcoming.spotify_id}`


      if (
        nextSlot === 'A'
      ) {
        readyBRef.current =
          false

        playedBRef.current =
          false

        spotifyIdBRef.current =
          newUpcoming.spotify_id

      } else {
        readyARef.current =
          false

        playedARef.current =
          false

        spotifyIdARef.current =
          newUpcoming.spotify_id
      }


      standbyController
        .loadEntity(
          uri,
          false,
          0
        )
    }
  }


  /*
  =====================================
  SCORE
  =====================================
  */

  async function saveScore() {
    if (
      !playerName.trim() ||
      scoreSaved ||
      savingScore
    ) {
      return
    }


    setSavingScore(
      true
    )


    try {
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
              song?.title ||
              null,

            song_artist:
              song?.artist ||
              null,

            difficulty:
              currentLevel.label
          })


      if (error) {
        throw error
      }


      setScoreSaved(
        true
      )


      await loadLeaderboard()


    } catch (error) {
      console.error(error)


      setMessage(
        error.message ||
        'No se pudo guardar el puntaje.'
      )

    } finally {
      setSavingScore(
        false
      )
    }
  }


  async function loadLeaderboard() {
    const {
      data,
      error
    } =
      await supabase
        .from('scores')
        .select(
          'id, player_name, score, created_at'
        )
        .order(
          'score',
          {
            ascending: false
          }
        )
        .limit(10)


    if (error) {
      console.error(error)

      return
    }


    setLeaderboard(
      data || []
    )
  }


  /*
  =====================================
  LOADING
  =====================================
  */

  if (
    loading
  ) {
    return (
      <section className="game-wrap">

        <div className="notice">
          Cargando juego...
        </div>

      </section>
    )
  }


  if (!song) {
    return (
      <section className="game-wrap">

        <div className="notice">

          {message ||
            'No hay canciones disponibles.'}

        </div>

      </section>
    )
  }


  /*
  =====================================
  UI
  =====================================
  */

  return (
    <section className="game-wrap">


      {/*
      Los dos embeds permanecen montados
      para poder precargar la canción
      siguiente.
      */}

      <div className="spotify-hidden-player">

        <div
          id="spotify-player-a"
        />

        <div
          id="spotify-player-b"
        />

      </div>


      <div className="game-header">

        <div>

          <span className="game-eyebrow">
            DALE PLAY
          </span>

          <h1>
            ¿Qué canción es?
          </h1>

        </div>


        <div className="game-score">

          <Trophy size={18} />

          {score} pts

        </div>

      </div>


      {/*
      =====================================
      JUGANDO
      =====================================
      */}

      {status === 'playing' && (

        <>

          <div className="room-main-play-area">

            <div className="room-level-card">

              <span>
                NIVEL ACTUAL
              </span>

              <strong>
                {currentLevel.label}
              </strong>

              <small>
                {currentLevel.duration}s de canción
              </small>

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


            <div className="room-potential-score">

              <strong>
                {currentLevel.points} pts
              </strong>

              <span>
                disponibles
              </span>

            </div>


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
                !spotifyReady
              }
            >

              {isPlaying ? (

                <Pause
                  size={58}
                  fill="currentColor"
                />

              ) : (

                <Play
                  size={58}
                  fill="currentColor"
                />

              )}

            </button>


            <div className="seconds">

              {!spotifyReady
                ? 'Preparando audio...'
                : `${currentLevel.duration}s`}

            </div>

          </div>


          {/*
          =====================================
          BUSCADOR + ACCIONES
          =====================================
          */}

          <div className="guess-area room-mobile-controls">

            <div className="autocomplete">

              <div className="spotify-game-search">

                <Search size={20} />


                <input
                  value={query}
                  placeholder="Busca una canción..."
                  onChange={
                    event => {
                      setQuery(
                        event.target.value
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
                        key={track.id}
                        type="button"
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
              >
                Adivinar
              </button>


              <button
                className={
                  `skip-inline-btn ${
                    isLastLevel
                      ? 'give-up'
                      : ''
                  }`
                }
                onClick={
                  passLevel
                }
              >

                <SkipForward />


                {isLastLevel
                  ? 'Rendirse'
                  : 'Pasar nivel'}

              </button>

            </div>

          </div>


          {message && (

            <div className="message">

              {message}

            </div>

          )}


          {attempts.length > 0 && (

            <div className="attempt-history">

              <h3>
                Tus intentos
              </h3>


              {attempts.map(
                (
                  item,
                  index
                ) => (

                  <div
                    className={
                      `attempt-row ${
                        item.correct
                          ? 'correct'
                          : ''
                      }`
                    }
                    key={index}
                  >

                    <span className="attempt-number">

                      {item.correct
                        ? '✓'
                        : '✕'}

                    </span>


                    <strong>
                      {item.level}
                    </strong>


                    <span className="attempt-answer">

                      {item.text}

                    </span>

                  </div>

                )
              )}

            </div>

          )}

        </>

      )}


      {/*
      =====================================
      RESULTADO
      =====================================
      */}

      {status !== 'playing' && (

        <div className="game-result-card">


          {song.album_image_url && (

            <img
              src={
                song.album_image_url
              }
              alt=""
            />

          )}


          {status === 'won' ? (

            <CheckCircle2
              size={34}
            />

          ) : (

            <X
              size={34}
            />

          )}


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


          {status === 'won' && (

            <strong className="round-earned">

              +{earnedPoints} pts

            </strong>

          )}


          {/*
          LO PRIMERO DESPUÉS DEL RESULTADO:
          siguiente canción.
          */}

          <button
            className="primary next-song-immediate"
            onClick={
              nextSong
            }
          >

            <ArrowRight />

            Siguiente canción

          </button>


          {attempts.length > 0 && (

            <div className="attempt-history">

              <h3>
                Tus intentos
              </h3>


              {attempts.map(
                (
                  item,
                  index
                ) => (

                  <div
                    className={
                      `attempt-row ${
                        item.correct
                          ? 'correct'
                          : ''
                      }`
                    }
                    key={index}
                  >

                    <span className="attempt-number">

                      {item.correct
                        ? '✓'
                        : '✕'}

                    </span>


                    <strong>
                      {item.level}
                    </strong>


                    <span className="attempt-answer">

                      {item.text}

                    </span>

                  </div>

                )
              )}

            </div>

          )}


          <div className="save-score-card">

            <h3>
              Guardar puntaje
            </h3>


            <p>

              Puntaje acumulado:
              {' '}

              <strong>
                {score} pts
              </strong>

            </p>


            <input
              value={playerName}
              maxLength={30}
              placeholder="Tu nombre"
              disabled={
                scoreSaved
              }
              onChange={
                event =>
                  setPlayerName(
                    event.target.value
                  )
              }
            />


            <button
              className="primary"
              onClick={
                saveScore
              }
              disabled={
                !playerName.trim() ||
                scoreSaved ||
                savingScore
              }
            >

              {savingScore
                ? 'Guardando...'
                : scoreSaved
                  ? 'Puntaje guardado'
                  : 'Guardar puntaje'}

            </button>

          </div>


          {leaderboard.length > 0 && (

            <div className="live-scoreboard">

              <h3>

                <Trophy size={19} />

                Mejores puntajes

              </h3>


              {leaderboard.map(
                (
                  item,
                  index
                ) => (

                  <div
                    className="live-score-row"
                    key={item.id}
                  >

                    <span>
                      #{index + 1}
                    </span>


                    <strong>
                      {item.player_name}
                    </strong>


                    <b>
                      {item.score} pts
                    </b>

                  </div>

                )
              )}

            </div>

          )}

        </div>

      )}

    </section>
  )
}