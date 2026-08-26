import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  Play,
  Pause,
  SkipForward
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
  const [songs, setSongs] =
    useState([])

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
  PASAR NIVEL
  =====================================
  */

  function passLevel() {
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

          text:
            isLastLevel
              ? 'Rendirse'
              : 'Pasar nivel',

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


    setMessage('')
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

            <span>
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

                <SkipForward
                  size={17}
                />

                {isLastLevel
                  ? 'Rendirse'
                  : 'Pasar nivel'}

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