import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  useNavigate,
  useParams
} from 'react-router-dom'

import {
  Play,
  Pause,
  SkipForward,
  Trophy,
  ArrowRight,
  X,
  CheckCircle2,
  RotateCcw,
  LogOut
} from 'lucide-react'

import {
  supabase
} from '../lib/supabase'

import {
  loadSpotifyIframeApi
} from '../lib/spotifyIframe'


const ROUND_SECONDS = 60
const PREPARE_SECONDS = 6
const PENALTY_PER_MISTAKE = 50


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


function getPositionMultiplier(position) {
  if (position === 1) return 100
  if (position === 2) return 90
  if (position === 3) return 80
  if (position === 4) return 70

  return 60
}


function formatTime(seconds) {
  const mins =
    Math.floor(
      seconds / 60
    )

  const secs =
    seconds % 60


  return (
    `${String(mins).padStart(2, '0')}:` +
    `${String(secs).padStart(2, '0')}`
  )
}


export default function RoomGamePage() {
  const { code } =
    useParams()

  const navigate =
    useNavigate()


  /*
  =====================================
  SALA
  =====================================
  */

  const [room, setRoom] =
    useState(null)

  const [player, setPlayer] =
    useState(null)

  const [players, setPlayers] =
    useState([])

  const [songs, setSongs] =
    useState([])

  const [song, setSong] =
    useState(null)

  const [answers, setAnswers] =
    useState([])


  /*
  Este ref es MUY importante.

  Nos dice cuál es la ronda verdadera
  ahora mismo, sin depender de closures
  viejos de React/Realtime.
  */

  const currentRoundRef =
    useRef(0)


  /*
  =====================================
  SINCRONIZACIÓN DE HORA
  =====================================
  */

  const serverOffsetRef =
    useRef(0)

  const [
    clockReady,
    setClockReady
  ] = useState(false)


  /*
  =====================================
  JUEGO
  =====================================
  */

  const [levelIndex, setLevelIndex] =
    useState(0)

  const [attempts, setAttempts] =
    useState([])

  const [wrongCount, setWrongCount] =
    useState(0)

  const [roundDone, setRoundDone] =
    useState(false)

  const roundDoneRef =
    useRef(false)

  const [roundPoints, setRoundPoints] =
    useState(0)

  const [
    correctPosition,
    setCorrectPosition
  ] = useState(0)


  /*
  =====================================
  TIEMPO
  =====================================
  */

  const [timeLeft, setTimeLeft] =
    useState(ROUND_SECONDS)

  const [
    preparationLeft,
    setPreparationLeft
  ] = useState(PREPARE_SECONDS)

  const [
    roundActive,
    setRoundActive
  ] = useState(false)

  const [
    roundExpired,
    setRoundExpired
  ] = useState(false)

  const timeoutSubmittedRef =
    useRef(false)


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
  SPOTIFY
  =====================================
  */

  const iframeApiRef =
    useRef(null)

  const controllerRef =
    useRef(null)

  const loadedSpotifyIdRef =
    useRef(null)

  const hasPlayedCurrentSongRef =
    useRef(false)

  const stopTimerRef =
    useRef(null)

  const stoppingRef =
    useRef(false)

  const spotifyLoadTimerRef =
    useRef(null)

  const countdownAudioContextRef =
    useRef(null)

  const lastCountdownSoundRef =
    useRef(null)


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


  const [
    restartingGame,
    setRestartingGame
  ] = useState(false)


  const [message, setMessage] =
    useState('')


  const currentLevel =
    LEVELS[levelIndex]


  const isLastLevel =
    levelIndex ===
    LEVELS.length - 1


  const potentialPoints =
    Math.max(
      0,
      currentLevel.points -
      wrongCount *
        PENALTY_PER_MISTAKE
    )


  /*
  =====================================
  MANTENER REFS ACTUALIZADOS
  =====================================
  */

  useEffect(() => {
    roundDoneRef.current =
      roundDone
  }, [
    roundDone
  ])


  useEffect(() => {
    if (
      room?.current_round
    ) {
      currentRoundRef.current =
        room.current_round
    }
  }, [
    room?.current_round
  ])


  /*
  =====================================
  HORA DEL SERVIDOR
  =====================================
  */

  async function syncServerClock() {
    try {
      /*
      Medimos antes y después para
      compensar un poquito la latencia.
      */

      const before =
        Date.now()


      const {
        data,
        error
      } =
        await supabase
          .rpc(
            'get_server_time'
          )


      const after =
        Date.now()


      if (error) {
        throw error
      }


      const serverMs =
        new Date(data)
          .getTime()


      /*
      Aproximamos el instante local
      en que respondió el servidor
      usando el punto medio.
      */

      const localMiddle =
        before +
        (
          after -
          before
        ) / 2


      serverOffsetRef.current =
        serverMs -
        localMiddle


      setClockReady(
        true
      )


    } catch (error) {
      console.error(
        'No se pudo sincronizar reloj:',
        error
      )


      /*
      Si falla, usamos reloj local
      como fallback.
      */

      serverOffsetRef.current =
        0

      setClockReady(
        true
      )
    }
  }


  function getSyncedNow() {
    return (
      Date.now() +
      serverOffsetRef.current
    )
  }


  /*
  =====================================
  SONIDO DEL CONTEO
  =====================================
  */

  function getCountdownAudioContext() {
    if (
      typeof window === 'undefined'
    ) {
      return null
    }


    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext


    if (!AudioContextClass) {
      return null
    }


    if (
      !countdownAudioContextRef.current
    ) {
      countdownAudioContextRef.current =
        new AudioContextClass()
    }


    return (
      countdownAudioContextRef.current
    )
  }


  function playCountdownTick(value) {
    if (
      !value ||
      value < 1 ||
      value > PREPARE_SECONDS
    ) {
      return
    }


    if (
      lastCountdownSoundRef.current ===
      value
    ) {
      return
    }


    lastCountdownSoundRef.current =
      value


    try {
      const context =
        getCountdownAudioContext()


      if (!context) {
        return
      }


      if (
        context.state === 'suspended'
      ) {
        context.resume().catch(() => {})
      }


      const oscillator =
        context.createOscillator()

      const gain =
        context.createGain()


      oscillator.type =
        'sine'


      oscillator.frequency.value =
        value === 1
          ? 720
          : 560


      const now =
        context.currentTime


      gain.gain.setValueAtTime(
        0.0001,
        now
      )

      gain.gain.exponentialRampToValueAtTime(
        0.055,
        now + 0.01
      )

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.11
      )


      oscillator.connect(gain)
      gain.connect(
        context.destination
      )


      oscillator.start(now)
      oscillator.stop(
        now + 0.12
      )

    } catch (error) {
      console.warn(
        'No se pudo reproducir el conteo:',
        error
      )
    }
  }


  /*
  =====================================
  INICIO
  =====================================
  */

  useEffect(() => {
    syncServerClock()

    loadInitial()


    loadSpotifyIframeApi()
      .then(IFrameAPI => {
        iframeApiRef.current =
          IFrameAPI
      })
      .catch(error => {
        console.error(error)

        setMessage(
          'No se pudo preparar Spotify.'
        )
      })


    /*
    Volvemos a sincronizar cada minuto.

    Así si el navegador estuvo dormido
    o cambió algo en el dispositivo,
    corregimos el desfase.
    */

    const clockInterval =
      setInterval(
        () => {
          syncServerClock()
        },
        60000
      )


    return () => {
      stopSpotify()

      clearInterval(
        clockInterval
      )

      clearTimeout(
        searchTimer.current
      )

      clearTimeout(
        spotifyLoadTimerRef.current
      )

      controllerRef.current
        ?.destroy?.()
    }
  }, [
    code
  ])


  async function loadInitial() {
    const {
      data: roomData,
      error
    } =
      await supabase
        .from('rooms')
        .select('*')
        .eq(
          'code',
          code
        )
        .single()


    if (
      error ||
      !roomData
    ) {
      setMessage(
        'No encontré esta sala.'
      )

      return
    }


    const session =
      sessionStorage.getItem(
        `daleplay-room-${code}`
      )


    if (!session) {
      setMessage(
        'No estás registrado como jugador.'
      )

      return
    }


    let playerSession


    try {
      playerSession =
        JSON.parse(session)

    } catch {
      setMessage(
        'No pude recuperar tu sesión.'
      )

      return
    }


    currentRoundRef.current =
      roomData.current_round || 0


    setPlayer(
      playerSession
    )

    setRoom(
      roomData
    )


    await Promise.all([
      loadPlayers(
        roomData.id
      ),

      loadSongs(),

      loadAnswers(
        roomData.id,
        roomData.current_round,
        playerSession.player_id
      )
    ])


    if (
      roomData.current_song_id
    ) {
      await loadSong(
        roomData.current_song_id
      )
    }
  }


  /*
  =====================================
  CANCIONES
  =====================================
  */

  async function loadSongs() {
    const {
      data,
      error
    } =
      await supabase
        .from('songs')
        .select(
          'id, title, artist, spotify_id, album_image_url'
        )
        .eq(
          'active',
          true
        )


    if (error) {
      console.error(error)

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
  }


  async function loadSong(songId) {
    const {
      data,
      error
    } =
      await supabase
        .from('songs')
        .select('*')
        .eq(
          'id',
          songId
        )
        .single()


    if (error) {
      setMessage(
        error.message
      )

      return
    }


    setSong(
      data
    )
  }


  /*
  =====================================
  JUGADORES
  =====================================
  */

  async function loadPlayers(roomId) {
    const {
      data,
      error
    } =
      await supabase
        .from('room_players')
        .select('*')
        .eq(
          'room_id',
          roomId
        )
        .order(
          'score',
          {
            ascending: false
          }
        )


    if (error) {
      console.error(error)

      return
    }


    setPlayers(
      data || []
    )
  }


  /*
  =====================================
  RESPUESTAS
  =====================================
  */

  async function loadAnswers(
    roomId,
    roundNumber,
    currentPlayerId = null
  ) {
    if (!roundNumber) {
      return
    }


    /*
    Guardamos la ronda que solicitamos.
    */

    const requestedRound =
      Number(roundNumber)


    const {
      data,
      error
    } =
      await supabase
        .from('room_answers')
        .select('*')
        .eq(
          'room_id',
          roomId
        )
        .eq(
          'round_number',
          requestedRound
        )
        .order(
          'created_at',
          {
            ascending: true
          }
        )


    if (error) {
      console.error(error)

      return
    }


    /*
    MUY IMPORTANTE:

    Si mientras esperábamos a Supabase
    ya cambió la ronda, ignoramos esta
    respuesta completamente.

    Esto evita el bug:
    "me apareció como rendido".
    */

    if (
      requestedRound !==
      Number(
        currentRoundRef.current
      )
    ) {
      return
    }


    const list =
      data || []


    setAnswers(
      list
    )


    if (!currentPlayerId) {
      return
    }


    const ownAnswer =
      list.find(
        item =>
          item.player_id ===
            currentPlayerId &&
          Number(
            item.round_number
          ) ===
            requestedRound
      )


    /*
    Solo cerramos la ronda si existe
    una respuesta DEL JUGADOR y DE
    ESTA RONDA EXACTA.
    */

    if (ownAnswer) {
      roundDoneRef.current =
        true

      setRoundDone(
        true
      )

      setRoundPoints(
        ownAnswer.points || 0
      )


      if (
        ownAnswer.correct
      ) {
        const ownTime =
          new Date(
            ownAnswer.created_at
          ).getTime()


        const previous =
          list.filter(
            item =>
              item.correct &&
              new Date(
                item.created_at
              ).getTime() <=
                ownTime
          )


        setCorrectPosition(
          previous.length
        )

      } else {
        setCorrectPosition(
          0
        )
      }


    } else {
      /*
      Antes esto faltaba.

      Si NO hay respuesta propia
      para esta ronda, entonces el
      jugador DEBE poder jugar.
      */

      roundDoneRef.current =
        false

      setRoundDone(
        false
      )

      setRoundPoints(
        0
      )

      setCorrectPosition(
        0
      )
    }
  }


  /*
  =====================================
  SPOTIFY
  =====================================
  */

  useEffect(() => {
    if (
      !song?.spotify_id ||
      !room ||
      !player
    ) {
      return
    }


    clearTimeout(
      spotifyLoadTimerRef.current
    )


    spotifyLoadTimerRef.current =
      setTimeout(
        () => {
          prepareSpotifySong(
            song.spotify_id
          )
        },
        50
      )


    return () => {
      clearTimeout(
        spotifyLoadTimerRef.current
      )
    }
  }, [
    song?.spotify_id,
    room?.id,
    player?.player_id
  ])


  async function prepareSpotifySong(
    spotifyId
  ) {
    stopSpotify()

    setSpotifyReady(
      false
    )


    hasPlayedCurrentSongRef.current =
      false


    try {
      const IFrameAPI =
        iframeApiRef.current ||
        await loadSpotifyIframeApi()


      iframeApiRef.current =
        IFrameAPI


      const uri =
        `spotify:track:${spotifyId}`


      if (
        controllerRef.current
      ) {
        loadedSpotifyIdRef.current =
          spotifyId


        controllerRef.current
          .loadEntity(
            uri,
            false,
            0
          )


        setTimeout(
          () => {
            setSpotifyReady(
              true
            )
          },
          500
        )


        return
      }


      const element =
        document.getElementById(
          'spotify-room-embed'
        )


      if (!element) {
        return
      }


      IFrameAPI.createController(
        element,
        {
          width: '100%',
          height: 80,
          uri
        },
        controller => {
          controllerRef.current =
            controller


          loadedSpotifyIdRef.current =
            spotifyId


          setupSpotifyEvents(
            controller
          )


          controller.loadEntity(
            uri,
            false,
            0
          )
        }
      )


    } catch (error) {
      console.error(error)


      setMessage(
        'No se pudo preparar el audio.'
      )
    }
  }


  function setupSpotifyEvents(
    controller
  ) {
    controller.addListener(
      'ready',
      () => {
        setSpotifyReady(
          true
        )
      }
    )


    controller.addListener(
      'playback_started',
      () => {
        setAudioStarting(
          false
        )

        setIsPlaying(
          true
        )
      }
    )
  }


  /*
  =====================================
  AUDIO
  =====================================
  */

  function stopSpotify() {
    clearTimeout(
      stopTimerRef.current
    )


    const controller =
      controllerRef.current


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
      controllerRef.current


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
      controllerRef.current


    if (
      !controller ||
      !spotifyReady ||
      !roundActive ||
      roundDone
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


    /*
    Esta es la lógica que ya comprobamos
    que funciona bien en iPhone.
    */

    if (
      hasPlayedCurrentSongRef.current
    ) {
      controller.restart()

    } else {
      hasPlayedCurrentSongRef.current =
        true

      controller.play()
    }
  }


  /*
  =====================================
  REALTIME
  =====================================
  */

  useEffect(() => {
    if (!room?.id) {
      return
    }


    const roomId =
      room.id


    const channel =
      supabase
        .channel(
          `daleplay-game-${roomId}`
        )


        /*
        ---------------------------------
        CAMBIOS DE SALA
        ---------------------------------
        */

        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter:
              `id=eq.${roomId}`
          },
          async payload => {
            const updated =
              payload.new


            const newRound =
              Number(
                updated.current_round
              )


            const oldRound =
              Number(
                currentRoundRef.current
              )


            const roundChanged =
              newRound !==
              oldRound


            const songChanged =
              updated.current_song_id !==
              room.current_song_id


            const statusChanged =
              updated.status !==
              room.status


            /*
            ACTUALIZAMOS EL REF PRIMERO.

            Esto evita que una petición vieja
            gane la carrera.
            */

            currentRoundRef.current =
              newRound


            setRoom(
              updated
            )


            if (
              updated.status ===
              'finished'
            ) {
              stopSpotify()


              /*
              Recarga controlada para TODOS.

              Al volver a montar la página,
              loadInitial() encuentra la sala
              ya terminada y renderiza la tabla
              final desde un estado limpio.
              */

              setTimeout(
                () => {
                  window.location.reload()
                },
                120
              )


              return
            }


            if (
              roundChanged ||
              songChanged ||
              statusChanged
            ) {
              resetRound()


              await loadPlayers(
                roomId
              )


              if (
                updated.current_song_id
              ) {
                await loadSong(
                  updated.current_song_id
                )
              }


              /*
              Cargamos SOLO respuestas de
              la nueva ronda.
              */

              await loadAnswers(
                updated.id,
                newRound,
                player?.player_id
              )
            }
          }
        )


        /*
        ---------------------------------
        JUGADORES
        ---------------------------------
        */

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter:
              `room_id=eq.${roomId}`
          },
          () => {
            loadPlayers(
              roomId
            )
          }
        )


        /*
        ---------------------------------
        RESPUESTAS
        ---------------------------------
        */

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_answers',
            filter:
              `room_id=eq.${roomId}`
          },
          payload => {
            /*
            Ignoramos eventos de rondas
            anteriores.
            */

            const eventRound =
              Number(
                payload.new?.round_number ??
                payload.old?.round_number ??
                0
              )


            if (
              eventRound !==
              Number(
                currentRoundRef.current
              )
            ) {
              return
            }


            loadAnswers(
              roomId,
              currentRoundRef.current,
              player?.player_id
            )


            loadPlayers(
              roomId
            )
          }
        )


        .subscribe()


    return () => {
      supabase.removeChannel(
        channel
      )
    }
  }, [
    room?.id,
    room?.current_song_id,
    room?.status,
    player?.player_id
  ])


  /*
  =====================================
  SONIDO SINCRONIZADO DEL CONTEO
  =====================================
  */

  useEffect(() => {
    if (
      room?.status !== 'playing' ||
      preparationLeft <= 0 ||
      roundDone
    ) {
      if (
        preparationLeft <= 0
      ) {
        lastCountdownSoundRef.current =
          null
      }

      return
    }


    playCountdownTick(
      preparationLeft
    )
  }, [
    preparationLeft,
    room?.status,
    room?.current_round,
    roundDone
  ])


  /*
  =====================================
  TIMER SINCRONIZADO
  =====================================
  */

  useEffect(() => {
    if (
      !room?.round_started_at ||
      room.status !== 'playing' ||
      !clockReady
    ) {
      return
    }


    const timer =
      setInterval(
        () => {
          const start =
            new Date(
              room.round_started_at
            ).getTime()


          /*
          AQUÍ ESTÁ LA DIFERENCIA:

          Ya no usamos Date.now() solo.
          Usamos Date.now() corregido contra
          la hora de Supabase.
          */

          const now =
            getSyncedNow()


          const beforeStart =
            start -
            now


          if (
            beforeStart > 0
          ) {
            setRoundActive(
              false
            )

            setRoundExpired(
              false
            )


            setPreparationLeft(
              Math.max(
                1,
                Math.ceil(
                  beforeStart /
                  1000
                )
              )
            )


            setTimeLeft(
              ROUND_SECONDS
            )


            return
          }


          setPreparationLeft(
            0
          )


          setRoundActive(
            true
          )


          const elapsed =
            Math.floor(
              (
                now -
                start
              ) /
              1000
            )


          const remaining =
            Math.max(
              0,
              ROUND_SECONDS -
              elapsed
            )


          setTimeLeft(
            remaining
          )


          if (
            remaining <= 0
          ) {
            setRoundActive(
              false
            )

            setRoundExpired(
              true
            )


            stopSpotify()


            if (
              !roundDoneRef.current &&
              !timeoutSubmittedRef.current
            ) {
              timeoutSubmittedRef.current =
                true


              finishRound(
                false,
                null,
                true
              )
            }
          }
        },
        100
      )


    return () => {
      clearInterval(
        timer
      )
    }
  }, [
    room?.round_started_at,
    room?.status,
    clockReady
  ])


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
      roundDone ||
      !roundActive
    ) {
      setSearchResults([])

      setSearching(
        false
      )

      return
    }


    setSearching(
      true
    )


    searchTimer.current =
      setTimeout(
        () => {
          setSearchResults(
            searchLibrary(
              songs,
              query.trim()
            )
          )


          setSearching(
            false
          )
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
    roundDone,
    roundActive,
    songs
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
      roundDone ||
      !roundActive
    ) {
      return
    }


    const nextWrongCount =
      wrongCount + 1


    setWrongCount(
      nextWrongCount
    )


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


    stopSpotify()


    setQuery('')

    setSelectedGuess(
      null
    )

    setSearchResults([])


    if (
      levelIndex <
      LEVELS.length - 1
    ) {
      setLevelIndex(
        current =>
          current + 1
      )


      setMessage('')

      return
    }


    finishRound(
      false,
      null,
      false,
      nextWrongCount
    )
  }


  function passLevel() {
    registerFailure(
      isLastLevel
        ? 'Rendirse'
        : 'Pasar nivel'
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
      roundDone ||
      !roundActive
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


    finishRound(
      true,
      selectedGuess
    )
  }


  /*
  =====================================
  TERMINAR JUGADOR
  =====================================
  */

  async function finishRound(
    correct,
    guessData = null,
    timeout = false,
    wrongCountOverride = null
  ) {
    if (
      roundDoneRef.current &&
      !timeout
    ) {
      return
    }


    roundDoneRef.current =
      true


    stopSpotify()

    setRoundDone(
      true
    )


    const finalWrongCount =
      wrongCountOverride ??
      wrongCount


    const roundBeingSubmitted =
      Number(
        currentRoundRef.current
      )


    try {
      const {
        data,
        error
      } =
        await supabase
          .rpc(
            'submit_room_answer',
            {
              p_room_id:
                room.id,

              p_player_id:
                player.player_id,

              p_round_number:
                roundBeingSubmitted,

              p_answer_title:
                guessData?.title ||
                null,

              p_answer_artist:
                guessData?.artist ||
                null,

              p_spotify_id:
                guessData?.spotify_id ||
                null,

              p_correct:
                correct,

              p_level:
                currentLevel.label,

              p_wrong_count:
                finalWrongCount
            }
          )


      if (error) {
        throw error
      }


      /*
      Si mientras respondíamos cambió
      la ronda, ya no actualizamos la UI
      con información vieja.
      */

      if (
        roundBeingSubmitted !==
        Number(
          currentRoundRef.current
        )
      ) {
        return
      }


      const result =
        Array.isArray(data)
          ? data[0]
          : data


      const awarded =
        result?.awarded_points ||
        0


      const position =
        result?.correct_position ||
        0


      setRoundPoints(
        awarded
      )


      setCorrectPosition(
        position
      )


      if (timeout) {
        setMessage(
          'Se acabó el tiempo.'
        )

      } else if (
        correct
      ) {
        setMessage(
          `¡Correcto! +${awarded} pts`
        )

      } else {
        setMessage(
          'Terminaste tus intentos.'
        )
      }


      await Promise.all([
        loadAnswers(
          room.id,
          roundBeingSubmitted,
          player.player_id
        ),

        loadPlayers(
          room.id
        )
      ])


    } catch (error) {
      console.error(error)


      /*
      Si falló realmente la respuesta,
      permitimos volver a intentar.
      */

      roundDoneRef.current =
        false

      setRoundDone(
        false
      )


      setMessage(
        error.message ||
        'No se pudo registrar la respuesta.'
      )
    }
  }


  /*
  =====================================
  RESET RONDA
  =====================================
  */

  function resetRound() {
    stopSpotify()


    hasPlayedCurrentSongRef.current =
      false


    roundDoneRef.current =
      false


    timeoutSubmittedRef.current =
      false


    lastCountdownSoundRef.current =
      null


    setLevelIndex(
      0
    )

    setAttempts([])

    setWrongCount(
      0
    )

    setRoundDone(
      false
    )

    setRoundPoints(
      0
    )

    setCorrectPosition(
      0
    )

    setQuery('')

    setSelectedGuess(
      null
    )

    setSearchResults([])

    setMessage('')

    setTimeLeft(
      ROUND_SECONDS
    )

    setPreparationLeft(
      PREPARE_SECONDS
    )

    setRoundActive(
      false
    )

    setRoundExpired(
      false
    )

    setSpotifyReady(
      false
    )
  }


  /*
  =====================================
  SIGUIENTE RONDA
  =====================================
  */

  async function nextRound() {
    if (
      !player?.is_host
    ) {
      return
    }


    stopSpotify()


    if (
      room.current_round >=
      room.total_rounds
    ) {
      const {
        error
      } =
        await supabase
          .from('rooms')
          .update({
            status:
              'finished',

            current_song_id:
              null,

            round_started_at:
              null
          })
          .eq(
            'id',
            room.id
          )


      if (error) {
        setMessage(
          error.message
        )

        return
      }


      /*
      Respaldo para el host por si Realtime
      tarda o el navegador pierde el evento.
      Los invitados se recargan desde el
      listener de Realtime de arriba.
      */

      setTimeout(
        () => {
          window.location.reload()
        },
        220
      )


      return
    }


    const candidates =
      songs.filter(
        item =>
          item.spotify_id &&
          item.id !==
            room.current_song_id
      )


    if (!candidates.length) {
      setMessage(
        'No hay canciones disponibles.'
      )

      return
    }


    const nextSong =
      candidates[
        Math.floor(
          Math.random() *
          candidates.length
        )
      ]


    /*
    No necesitamos calcular hora.

    El trigger de Supabase reemplaza
    round_started_at automáticamente.
    */

    const {
      error
    } =
      await supabase
        .from('rooms')
        .update({
          current_round:
            room.current_round + 1,

          current_song_id:
            nextSong.id,

          /*
          Le mandamos cualquier valor.
          El servidor lo sustituye.
          */

          round_started_at:
            new Date()
              .toISOString()
        })
        .eq(
          'id',
          room.id
        )


    if (error) {
      setMessage(
        error.message
      )
    }
  }


  /*
  =====================================
  JUGAR OTRA VEZ
  =====================================
  */

  async function playAgain() {
    if (
      !player?.is_host ||
      !room ||
      restartingGame
    ) {
      return
    }


    const availableSongs =
      songs.filter(
        item =>
          Boolean(
            item.spotify_id
          )
      )


    if (!availableSongs.length) {
      setMessage(
        'No hay canciones disponibles.'
      )

      return
    }


    setRestartingGame(
      true
    )


    setMessage('')


    try {
      const firstSong =
        availableSongs[
          Math.floor(
            Math.random() *
            availableSongs.length
          )
        ]


      /*
      La función vieja todavía pide
      fecha.

      Está bien: el trigger de Supabase
      la reemplazará por la hora oficial.
      */

      const dummyStart =
        new Date()
          .toISOString()


      const {
        error
      } =
        await supabase
          .rpc(
            'restart_room_game',
            {
              p_room_id:
                room.id,

              p_host_player_id:
                player.player_id,

              p_song_id:
                firstSong.id,

              p_round_started_at:
                dummyStart
            }
          )


      if (error) {
        throw error
      }


    } catch (error) {
      console.error(error)


      setMessage(
        error.message ||
        'No se pudo reiniciar la partida.'
      )

    } finally {
      setRestartingGame(
        false
      )
    }
  }


  /*
  =====================================
  DERIVADOS
  =====================================
  */

  const correctAnswers =
    answers
      .filter(
        item =>
          Number(
            item.round_number
          ) ===
            Number(
              currentRoundRef.current
            ) &&
          item.correct
      )
      .sort(
        (a, b) =>
          new Date(
            a.created_at
          ) -
          new Date(
            b.created_at
          )
      )


  const currentRoundAnswers =
    answers.filter(
      item =>
        Number(
          item.round_number
        ) ===
          Number(
            currentRoundRef.current
          )
    )


  const everyoneFinished =
    players.length > 0 &&
    currentRoundAnswers.length >=
      players.length


  const effectiveRoundActive =
    roundActive &&
    !everyoneFinished


  const hostCanContinue =
    everyoneFinished ||
    roundExpired ||
    timeLeft <= 0


  const ownScore =
    players.find(
      item =>
        item.id ===
        player?.player_id
    )?.score || 0


  /*
  =====================================
  TODOS TERMINARON
  =====================================
  */

  useEffect(() => {
    if (
      everyoneFinished
    ) {
      stopSpotify()

      setRoundActive(
        false
      )
    }
  }, [
    everyoneFinished
  ])


  /*
  =====================================
  FINAL
  =====================================
  */

  if (
    room?.status ===
    'finished'
  ) {
    const ranking =
      [...players]
        .sort(
          (a, b) =>
            b.score -
            a.score
        )


    return (
      <section className="solo-game">

        <div className="game-final-card">

          <Trophy size={48} />

          <h1>
            Resultados finales
          </h1>


          <div className="multiplayer-ranking">

            {ranking.map(
              (
                item,
                index
              ) => (

                <div
                  className="multiplayer-rank-row"
                  key={item.id}
                >

                  <span>
                    {index === 0
                      ? '🥇'
                      : index === 1
                        ? '🥈'
                        : index === 2
                          ? '🥉'
                          : `#${index + 1}`}
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


          {message && (

            <div className="message">
              {message}
            </div>

          )}


          {player?.is_host ? (

            <div className="final-game-actions">

              <button
                className="primary"
                onClick={
                  playAgain
                }
                disabled={
                  restartingGame
                }
              >

                <RotateCcw size={18} />

                {restartingGame
                  ? 'Preparando...'
                  : 'Jugar otra vez'}

              </button>


              <button
                className="secondary"
                onClick={
                  () =>
                    navigate(
                      '/salas'
                    )
                }
              >

                <LogOut size={18} />

                Salir

              </button>

            </div>

          ) : (

            <>

              <p className="muted">
                Esperando al host...
              </p>


              <button
                className="secondary"
                onClick={
                  () =>
                    navigate(
                      '/salas'
                    )
                }
              >
                Salir
              </button>

            </>

          )}

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
    <section className="solo-game room-unified-game">


      {/*
      Spotify siempre montado.
      */}

      <div className="spotify-hidden-player">

        <div
          id="spotify-room-embed"
        />

      </div>


      {(
        !room ||
        !song ||
        !player
      ) ? (

        <div className="solo-loading">

          {message ||
            'Cargando partida...'}

        </div>

      ) : (

        <>


          {/*
          =====================================
          CABECERA
          =====================================
          */}

          <div className="room-unified-top">

            <div>

              <span className="room-unified-code">
                Sala {room.code}
              </span>

              <h1>
                Adivina la canción
              </h1>

            </div>


            <div className="room-unified-meta">

              <span>
                Ronda {room.current_round}/{room.total_rounds}
              </span>

              <strong>
                {ownScore} pts
              </strong>

            </div>

          </div>


          {/*
          =====================================
          PREPARACIÓN GRANDE
          =====================================
          */}

          {preparationLeft > 0 &&
            !roundDone ? (

            <div className="room-countdown-screen">

              <span>
                RONDA {room.current_round}
              </span>

              <small>
                EMPIEZA EN
              </small>

              <strong
                key={
                  preparationLeft
                }
              >
                {preparationLeft}
              </strong>

            </div>

          ) : (

            <>


              {/*
              =====================================
              TIMER DE RONDA
              =====================================
              */}

              {!roundDone && (

                <div
                  className={
                    `room-unified-timer ${
                      timeLeft <= 10 &&
                      effectiveRoundActive
                        ? 'danger'
                        : ''
                    }`
                  }
                >

                  {formatTime(
                    timeLeft
                  )}

                </div>

              )}


              {/*
              =====================================
              JUGANDO
              =====================================
              */}

              {!roundDone && (

                <>


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
                      !spotifyReady ||
                      !effectiveRoundActive
                    }
                  >

                    {isPlaying ? (

                      <Pause
                        size={52}
                        fill="currentColor"
                      />

                    ) : (

                      <Play
                        size={52}
                        fill="currentColor"
                      />

                    )}

                  </button>


                  <div className="solo-duration">

                    {!spotifyReady
                      ? 'Preparando audio...'
                      : `${currentLevel.duration}s · ${potentialPoints} pts`}

                  </div>


                  <div className="solo-controls">

                    <div className="autocomplete">

                      <input
                        className="solo-search"
                        value={query}
                        placeholder="Busca una canción..."
                        disabled={
                          !effectiveRoundActive
                        }
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
                          !effectiveRoundActive ||
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
                        disabled={
                          !effectiveRoundActive
                        }
                      >

                        <SkipForward size={17} />

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

              )}


              {/*
              =====================================
              RESULTADO
              =====================================
              */}

              {roundDone && (

                <div className="round-result-card">

                  {song.album_image_url && (

                    <img
                      src={
                        song.album_image_url
                      }
                      alt=""
                    />

                  )}


                  {roundPoints > 0 ? (

                    <>

                      <CheckCircle2
                        size={30}
                      />

                      <h2>
                        {song.title}
                      </h2>

                      <p>
                        {song.artist}
                      </p>

                      <strong className="round-earned">
                        +{roundPoints} pts
                      </strong>


                      {correctPosition > 0 && (

                        <div className="room-finish-position">

                          #{correctPosition}
                          {' · '}
                          {getPositionMultiplier(
                            correctPosition
                          )}
                          %

                        </div>

                      )}

                    </>

                  ) : (

                    <>

                      <X size={30} />

                      <h2>
                        {song.title}
                      </h2>

                      <p>
                        {song.artist}
                      </p>

                    </>

                  )}


                  <div className="round-waiting">

                    {currentRoundAnswers.length}
                    {' de '}
                    {players.length}
                    {' terminaron'}

                  </div>


                  {player.is_host ? (

                    <button
                      className="primary room-next-round-btn"
                      disabled={
                        !hostCanContinue
                      }
                      onClick={
                        nextRound
                      }
                    >

                      <ArrowRight size={18} />

                      {
                        room.current_round >=
                        room.total_rounds
                          ? 'Ver resultados'
                          : hostCanContinue
                            ? 'Siguiente ronda'
                            : `Esperando (${currentRoundAnswers.length}/${players.length})`
                      }

                    </button>

                  ) : (

                    <p className="muted">

                      {hostCanContinue
                        ? 'Esperando al host...'
                        : 'Esperando a los demás...'}

                    </p>

                  )}

                </div>

              )}

            </>

          )}


          {/*
          =====================================
          ACERTARON
          =====================================
          */}

          {preparationLeft === 0 && (

            <>

              <div className="room-correct-list">

                <h3>
                  Acertaron esta ronda
                </h3>


                {!correctAnswers.length && (

                  <p className="muted">
                    Todavía nadie.
                  </p>

                )}


                {correctAnswers.map(
                  (
                    answer,
                    index
                  ) => {
                    const answerPlayer =
                      players.find(
                        item =>
                          item.id ===
                          answer.player_id
                      )


                    return (

                      <div
                        className="room-correct-row"
                        key={answer.id}
                      >

                        <span>
                          #{index + 1}
                        </span>

                        <strong>
                          {answerPlayer
                            ?.player_name ||
                            'Jugador'}
                        </strong>

                        <b>
                          +{answer.points}
                        </b>

                      </div>

                    )
                  }
                )}

              </div>


              <div className="live-scoreboard">

                <h3>
                  Marcador
                </h3>


                {[...players]
                  .sort(
                    (a, b) =>
                      b.score -
                      a.score
                  )
                  .map(
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

            </>

          )}

        </>

      )}

    </section>
  )
}