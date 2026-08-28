import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  Disc3,
  CircleHelp,
  X
} from 'lucide-react'

import {
  supabase
} from '../lib/supabase'

import {
  loadSpotifyIframeApi
} from '../lib/spotifyIframe'


const GENRE_OPTIONS = [
  'Urbano / Reggaetón',
  'Rock / Alternativo',
  'Pop',
  'Salsa / Tropical',
  'Balada / Romántica',
  'Regional / Ranchera',
  'Bachata'
]


const LEVELS = [
  {
    id: 'imposible',
    label: 'Imposible',
    duration: 2,
    points: 500
  },
  {
    id: 'experto',
    label: 'Experto',
    duration: 4,
    points: 400
  },
  {
    id: 'dificil',
    label: 'Difícil',
    duration: 8,
    points: 300
  },
  {
    id: 'media',
    label: 'Media',
    duration: 15,
    points: 200
  },
  {
    id: 'facil',
    label: 'Fácil',
    duration: 25,
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
  const [allSongs, setAllSongs] =
    useState([])

  const [songs, setSongs] =
    useState([])

  const [
    selectedGenres,
    setSelectedGenres
  ] = useState([])

  const [
    genrePanelOpen,
    setGenrePanelOpen
  ] = useState(false)

  const [
    showHowTo,
    setShowHowTo
  ] = useState(false)

  const [song, setSong] =
    useState(null)

  const [nextSongData, setNextSongData] =
    useState(null)

  const [loading, setLoading] =
    useState(true)


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
  SPOTIFY DOBLE PLAYER
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

  const stopTimerRef =
    useRef(null)

  const stoppingRef =
    useRef(false)


  const [
    spotifyReady,
    setSpotifyReady
  ] = useState(false)

  const [
    isPlaying,
    setIsPlaying
  ] = useState(false)

  const [
    audioStarting,
    setAudioStarting
  ] = useState(false)


  const currentLevel =
    LEVELS[levelIndex]

  const isLastLevel =
    levelIndex ===
    LEVELS.length - 1


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


      setAllSongs(
        library
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


      /*
      Los DIV de Spotify existen
      desde el primer render.
      */

      createSpotifyControllers(
        IFrameAPI,
        firstSong,
        upcoming
      )


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


  function getGenreLibrary(
    source = allSongs,
    genres = selectedGenres
  ) {
    if (
      !Array.isArray(source) ||
      !source.length
    ) {
      return []
    }


    if (
      !genres.length
    ) {
      return source
    }


    return source.filter(
      item =>
        genres.includes(
          item.genre
        )
    )
  }


  function toggleGenre(genre) {
    setSelectedGenres(
      current =>
        current.includes(genre)
          ? current.filter(
              item =>
                item !== genre
            )
          : [
              ...current,
              genre
            ]
    )
  }


  function selectAllGenres() {
    setSelectedGenres([])
  }


  /*
  =====================================
  SPOTIFY
  =====================================
  */

  function createSpotifyControllers(
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
      console.error(
        'No se encontraron los reproductores de Spotify.'
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


    setIsPlaying(false)

    setAudioStarting(false)

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


    setIsPlaying(false)

    setAudioStarting(false)


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


    setAudioStarting(true)

    setIsPlaying(true)


    stopTimerRef.current =
      setTimeout(
        () => {
          hardStopSpotify()
        },
        durationMs
      )


    /*
    ESTA ES LA LÓGICA QUE YA
    NOS FUNCIONABA BIEN.
    */

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
  BUSCADOR
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
  ESCUCHAR MÁS
  =====================================
  */

  function playNextLevelAutomatically(
    duration
  ) {
    const controller =
      getActiveController()


    if (!controller) {
      return
    }


    clearTimeout(
      stopTimerRef.current
    )


    const startPlayback = () => {
      try {
        stoppingRef.current =
          false

        markActiveAsPlayed()

        controller.restart()

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
            duration * 1000
          )

      } catch (error) {
        console.error(error)

        setAudioStarting(
          false
        )

        setIsPlaying(
          false
        )
      }
    }


    if (
      stoppingRef.current
    ) {
      setTimeout(
        startPlayback,
        480
      )

      return
    }


    startPlayback()
  }


  function passLevel() {
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

          text:
            isLastLevel
              ? 'Rendirse'
              : 'Escuchar más',

          correct:
            false
        }
      ]
    )


    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])


    if (
      isLastLevel
    ) {
      finishLost()

      return
    }


    const nextIndex =
      levelIndex + 1

    const nextLevel =
      LEVELS[nextIndex]


    setLevelIndex(
      nextIndex
    )


    setMessage('')


    playNextLevelAutomatically(
      nextLevel.duration
    )
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
      return
    }


    stopSpotify()


    const correct =
      sameSong(
        song,
        selectedGuess
      )


    if (!correct) {
      setAttempts(
        current => [
          ...current,
          {
            level:
              currentLevel.label,

            text:
              `${selectedGuess.title} — ${selectedGuess.artist}`,

            correct:
              false
          }
        ]
      )


      setQuery('')

      setSelectedGuess(null)

      setSearchResults([])


      if (
        isLastLevel
      ) {
        finishLost()

        return
      }


      setLevelIndex(
        current =>
          current + 1
      )


      return
    }


    const points =
      currentLevel.points


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


    setMessage('')


    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])
  }


  function finishLost() {
    stopSpotify()

    setEarnedPoints(
      0
    )

    setStatus(
      'lost'
    )

    setMessage('')

    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])
  }


  /*
  =====================================
  SIGUIENTE CANCIÓN
  =====================================
  */

  function nextSong() {
    if (
      status === 'playing'
    ) {
      return
    }


    stopSpotify()


    const filteredLibrary =
      getGenreLibrary()


    const library =
      filteredLibrary.length
        ? filteredLibrary
        : allSongs


    setSongs(
      library
    )


    const preloadedStillValid =
      Boolean(
        nextSongData &&
        library.some(
          item =>
            item.id ===
            nextSongData.id
        )
      )


    const newCurrent =
      preloadedStillValid
        ? nextSongData
        : pickRandomSong(
            library,
            song?.id
          )


    const newUpcoming =
      pickRandomSong(
        library,
        newCurrent?.id
      )


    const nextSlot =
      activeSlotRef.current === 'A'
        ? 'B'
        : 'A'


    activeSlotRef.current =
      nextSlot


    const activeController =
      nextSlot === 'A'
        ? controllerARef.current
        : controllerBRef.current


    if (
      !preloadedStillValid &&
      activeController &&
      newCurrent?.spotify_id
    ) {
      const uri =
        `spotify:track:${newCurrent.spotify_id}`


      setSpotifyReady(
        false
      )


      if (
        nextSlot === 'A'
      ) {
        readyARef.current =
          false

        playedARef.current =
          false
      } else {
        readyBRef.current =
          false

        playedBRef.current =
          false
      }


      activeController.loadEntity(
        uri,
        false,
        0
      )


      setTimeout(
        () => {
          if (
            nextSlot ===
            activeSlotRef.current
          ) {
            if (
              nextSlot === 'A'
            ) {
              readyARef.current =
                true
            } else {
              readyBRef.current =
                true
            }

            setSpotifyReady(
              true
            )
          }
        },
        500
      )
    }


    setSong(
      newCurrent
    )

    setNextSongData(
      newUpcoming
    )

    setLevelIndex(0)

    setAttempts([])

    setStatus(
      'playing'
    )

    setEarnedPoints(
      0
    )

    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])

    setMessage('')


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
      } else {
        readyARef.current =
          false

        playedARef.current =
          false
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
  UI
  =====================================
  */

  return (
    <section className="solo-game">


      {showHowTo && (

        <div
          onClick={
            () =>
              setShowHowTo(false)
          }
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 600,
            background: 'rgba(0,0,0,.72)',
            display: 'grid',
            placeItems: 'center',
            padding: 20
          }}
        >

          <div
            onClick={
              event =>
                event.stopPropagation()
            }
            style={{
              width: 'min(440px, 100%)',
              background: '#151517',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 22,
              padding: 24,
              boxShadow: '0 24px 70px rgba(0,0,0,.55)'
            }}
          >

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16
              }}
            >

              <h2 style={{ margin: 0 }}>
                Cómo jugar
              </h2>

              <button
                type="button"
                onClick={
                  () =>
                    setShowHowTo(false)
                }
                aria-label="Cerrar"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  opacity: 0.65,
                  padding: 4,
                  display: 'inline-flex',
                  cursor: 'pointer'
                }}
              >
                <X size={20} />
              </button>

            </div>


            <p
              className="muted"
              style={{
                lineHeight: 1.65,
                marginBottom: 0
              }}
            >
              Escucha un fragmento y trata de adivinar
              la canción. Si fallas o pasas de nivel,
              tendrás más segundos, pero ganarás menos
              puntos. Tienes cinco intentos por canción.
            </p>

          </div>

        </div>

      )}


      {genrePanelOpen && (

        <div
          onClick={
            () =>
              setGenrePanelOpen(false)
          }
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 590,
            background: 'rgba(0,0,0,.68)',
            display: 'grid',
            placeItems: 'center',
            padding: 20
          }}
        >

          <div
            onClick={
              event =>
                event.stopPropagation()
            }
            style={{
              width: 'min(480px, 100%)',
              background: '#151517',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 22,
              padding: 24,
              boxShadow: '0 24px 70px rgba(0,0,0,.55)'
            }}
          >

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                marginBottom: 8
              }}
            >

              <div>
                <small
                  style={{
                    display: 'block',
                    opacity: 0.48,
                    marginBottom: 4
                  }}
                >
                  FILTRO
                </small>

                <h2 style={{ margin: 0 }}>
                  Géneros
                </h2>
              </div>

              <button
                type="button"
                onClick={
                  () =>
                    setGenrePanelOpen(false)
                }
                aria-label="Cerrar"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  opacity: 0.65,
                  padding: 4,
                  display: 'inline-flex',
                  cursor: 'pointer'
                }}
              >
                <X size={20} />
              </button>

            </div>


            <p
              className="muted"
              style={{
                marginTop: 0,
                lineHeight: 1.5
              }}
            >
              Elige uno o varios. El cambio se aplica
              desde la siguiente canción.
            </p>


            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 18
              }}
            >

              <button
                type="button"
                className={
                  selectedGenres.length === 0
                    ? 'primary'
                    : 'secondary'
                }
                onClick={
                  selectAllGenres
                }
                style={{
                  width: 'auto',
                  minHeight: 38,
                  padding: '0 14px'
                }}
              >
                Todos
              </button>


              {GENRE_OPTIONS.map(
                genre => (

                  <button
                    key={genre}
                    type="button"
                    className={
                      selectedGenres.includes(
                        genre
                      )
                        ? 'primary'
                        : 'secondary'
                    }
                    onClick={
                      () =>
                        toggleGenre(
                          genre
                        )
                    }
                    style={{
                      width: 'auto',
                      minHeight: 38,
                      padding: '0 14px'
                    }}
                  >
                    {genre}
                  </button>

                )
              )}

            </div>

          </div>

        </div>

      )}


      {/*
      SIEMPRE montados.
      Este era el bug del audio.
      */}

      <div className="spotify-hidden-player">

        <div
          id="spotify-player-a"
        />

        <div
          id="spotify-player-b"
        />

      </div>


      {loading ? (

        <div className="solo-loading">
          Cargando...
        </div>

      ) : !song ? (

        <div className="solo-loading">

          {message ||
            'No hay canciones disponibles.'}

        </div>

      ) : status === 'playing' ? (

        <>


        <div className="solo-top">

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >

            <h1>
              Adivina la canción
            </h1>


            <button
              type="button"
              onClick={
                () =>
                  setShowHowTo(true)
              }
              aria-label="Cómo jugar"
              title="Cómo jugar"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                opacity: 0.58,
                padding: 3,
                display: 'inline-flex',
                cursor: 'pointer'
              }}
            >
              <CircleHelp size={18} />
            </button>


            <button
              type="button"
              onClick={
                () =>
                  setGenrePanelOpen(true)
              }
              aria-label="Filtrar por género"
              title="Filtrar por género"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                opacity:
                  selectedGenres.length
                    ? 1
                    : 0.58,
                padding: 3,
                display: 'inline-flex',
                cursor: 'pointer'
              }}
            >
              <Disc3 size={18} />
            </button>

          </div>


          <span className="solo-score">
            {score} pts
          </span>

        </div>


          <div className="solo-levels">

            {LEVELS.map(
              (
                level,
                index
              ) => (

                <div
                  key={level.id}
                  className={
                    `solo-level ${
                      index === levelIndex
                        ? 'active'
                        : ''
                    } ${
                      index < levelIndex
                        ? 'used'
                        : ''
                    }`
                  }
                >

                  <strong>
                    {level.label}
                  </strong>

                  <small>
                    {level.duration}s
                  </small>

                </div>

              )
            )}

          </div>


          <button
            className="solo-play"
            onClick={
              togglePlay
            }
            disabled={
              !spotifyReady
            }
          >

            {isPlaying ? (

              <Pause
                size={46}
                fill="currentColor"
              />

            ) : (

              <Play
                size={46}
                fill="currentColor"
              />

            )}

          </button>


          <div className="solo-duration">

            {!spotifyReady
              ? 'Preparando audio...'
              : `${currentLevel.duration}s · ${currentLevel.points} pts`}

          </div>


          <div className="solo-controls">

            <div className="autocomplete">

              <input
                className="solo-search"
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


              {searching && (

                <div className="spotify-searching">

                  Buscando...

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


            <div className="solo-actions">

              <button
                className="guess-btn"
                onClick={
                  guess
                }
                disabled={
                  !selectedGuess
                }
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

                {isLastLevel ? (
                  <SkipForward
                    size={17}
                  />
                ) : (
                  <Volume2
                    size={17}
                  />
                )}

                {isLastLevel
                  ? 'Rendirse'
                  : 'Escuchar más'}

              </button>

            </div>

          </div>


          {attempts.length > 0 && (

            <div className="solo-attempts">

              {attempts.map(
                (
                  item,
                  index
                ) => (

                  <div
                    key={index}
                    className={
                      item.correct
                        ? 'correct'
                        : ''
                    }
                  >

                    <span>
                      {item.correct
                        ? '✓'
                        : '×'}
                    </span>

                    <span>
                      {item.text}
                    </span>

                  </div>

                )
              )}

            </div>

          )}

        </>

      ) : (

        <div className="solo-result">


          {song.album_image_url && (

            <img
              src={
                song.album_image_url
              }
              alt=""
            />

          )}


          <h2>
            {song.title}
          </h2>


          <p>
            {song.artist}
          </p>


          {status === 'won' && (

            <strong>
              +{earnedPoints} pts
            </strong>

          )}


          <button
            className="primary"
            onClick={
              nextSong
            }
          >
            Siguiente canción
          </button>


          <small>
            Total: {score} pts
          </small>

        </div>

      )}

    </section>
  )
}