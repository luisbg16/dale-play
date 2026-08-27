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
  Search,
  ArrowRight,
  SkipForward
} from 'lucide-react'

import {
  supabase
} from '../lib/supabase'

import {
  loadSpotifyIframeApi
} from '../lib/spotifyIframe'


const LISTEN_LEVELS = [
  { duration: 5, label: '5s' },
  { duration: 10, label: '10s' },
  { duration: 15, label: '15s' },
  { duration: 20, label: '20s' },
  { duration: 30, label: '30s' }
]


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


function isMobileLikeDevice() {
  if (
    typeof window === 'undefined'
  ) {
    return false
  }


  return (
    window.matchMedia?.(
      '(pointer: coarse)'
    )?.matches ||
    navigator.maxTouchPoints > 0
  )
}


export default function OneNoteGamePage() {
  const { code } =
    useParams()

  const navigate =
    useNavigate()


  /*
  =====================================
  DATOS
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

  const [buzzes, setBuzzes] =
    useState([])


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


  /*
  =====================================
  SPOTIFY
  =====================================
  */

  const [
    isPlaying,
    setIsPlaying
  ] = useState(false)

  const [
    spotifyReady,
    setSpotifyReady
  ] = useState(false)

  const [
    needsFirstPlayTap,
    setNeedsFirstPlayTap
  ] = useState(false)


  const iframeApiRef =
    useRef(null)

  const controllerRef =
    useRef(null)

  const stopTimerRef =
    useRef(null)

  const autoPlayKeyRef =
    useRef(null)

  const spotifyPreparingRef =
    useRef(false)

  const firstPlayFallbackTimerRef =
    useRef(null)

  const playbackStartedRef =
    useRef(false)


  /*
  =====================================
  COUNTDOWN DE RONDA
  =====================================
  */

  const [
    countdown,
    setCountdown
  ] = useState(0)

  const [
    roundReady,
    setRoundReady
  ] = useState(false)


  /*
  =====================================
  TIMER PARA RESPONDER
  =====================================
  */

  const [
    answerCountdown,
    setAnswerCountdown
  ] = useState(0)

  const serverOffsetRef =
    useRef(0)

  const timeoutRunningRef =
    useRef(false)


  /*
  =====================================
  ACCIONES
  =====================================
  */

  const [
    buzzing,
    setBuzzing
  ] = useState(false)

  const [
    submitting,
    setSubmitting
  ] = useState(false)

  const [
    skippingSong,
    setSkippingSong
  ] = useState(false)


  /*
  =====================================
  RESULTADOS
  =====================================
  */

  const [
    loadingFinalResults,
    setLoadingFinalResults
  ] = useState(false)

  const finishingRef =
    useRef(false)


  const [message, setMessage] =
    useState('')


  /*
  =====================================
  DERIVADOS
  =====================================
  */

  const listenLevel =
    Number(
      room?.one_note_level || 0
    )


  const currentListen =
    LISTEN_LEVELS[
      listenLevel
    ] || LISTEN_LEVELS[0]


  const activePlayer =
    players.find(
      item =>
        item.id ===
        room?.one_note_active_player_id
    )


  const winnerPlayer =
    players.find(
      item =>
        item.id ===
        room?.one_note_winner_player_id
    )


  const roundFinished =
    Boolean(
      room?.one_note_winner_player_id ||
      room?.one_note_result
    )


  const isMyTurn =
    room?.one_note_active_player_id ===
    player?.player_id


  const currentRoundBuzzes =
    buzzes.filter(
      item =>
        Number(
          item.round_number
        ) ===
        Number(
          room?.current_round
        )
    )


  const currentLevelBuzzes =
    currentRoundBuzzes.filter(
      item =>
        Number(
          item.listen_level
        ) ===
        listenLevel
    )


  const myCurrentBuzz =
    currentLevelBuzzes.find(
      item =>
        item.player_id ===
        player?.player_id
    )


  const failedThisListen =
    myCurrentBuzz?.status ===
    'wrong'


  const failedThisSong =
    currentRoundBuzzes.some(
      item =>
        item.player_id ===
          player?.player_id &&
        item.status ===
          'wrong'
    )


  const queuedThisListen =
    myCurrentBuzz?.status ===
    'queued'


  const canBuzz =
    Boolean(
      room &&
      player &&
      room.status === 'playing' &&
      roundReady &&
      !roundFinished &&
      !isMyTurn &&
      !myCurrentBuzz &&
      (
        room.allow_retries ||
        !failedThisSong
      )
    )


  const orderBuzzes =
    (
      room?.allow_retries
        ? currentLevelBuzzes
        : currentRoundBuzzes.filter(
            item =>
              item.status ===
                'queued' ||
              item.status ===
                'answering' ||
              item.status ===
                'wrong'
          )
    )
      .filter(
        item =>
          item.status !==
          'expired'
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


  /*
  =====================================
  INICIO
  =====================================
  */

  useEffect(() => {
    loadInitial()

    syncServerClock()


    loadSpotifyIframeApi()
      .then(api => {
        iframeApiRef.current =
          api
      })
      .catch(error => {
        console.error(error)
      })


    const clockInterval =
      setInterval(
        syncServerClock,
        60000
      )


    return () => {
      clearInterval(
        clockInterval
      )

      clearTimeout(
        stopTimerRef.current
      )

      clearTimeout(
        firstPlayFallbackTimerRef.current
      )


      try {
        controllerRef.current
          ?.destroy?.()
      } catch {
        // nada
      }
    }
  }, [
    code
  ])


  /*
  =====================================
  RELOJ DEL SERVIDOR
  =====================================
  */

  async function syncServerClock() {
    const started =
      Date.now()


    const {
      data,
      error
    } =
      await supabase
        .rpc(
          'get_server_time'
        )


    const finished =
      Date.now()


    if (
      error ||
      !data
    ) {
      return
    }


    const midpoint =
      started +
      (
        finished -
        started
      ) / 2


    serverOffsetRef.current =
      new Date(
        data
      ).getTime() -
      midpoint
  }


  function serverNow() {
    return (
      Date.now() +
      serverOffsetRef.current
    )
  }


  /*
  =====================================
  CARGA INICIAL
  =====================================
  */

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
        'No estás registrado.'
      )

      return
    }


    let playerSession


    try {
      playerSession =
        JSON.parse(
          session
        )
    } catch {
      setMessage(
        'No pude recuperar tu sesión.'
      )

      return
    }


    setPlayer(
      playerSession
    )


    if (
      roomData.status ===
      'finished'
    ) {
      setLoadingFinalResults(
        true
      )


      const {
        data: finalPlayers,
        error: finalPlayersError
      } =
        await supabase
          .from('room_players')
          .select('*')
          .eq(
            'room_id',
            roomData.id
          )
          .order(
            'score',
            {
              ascending: false
            }
          )


      if (
        !finalPlayersError
      ) {
        setPlayers(
          finalPlayers || []
        )
      }


      await loadSongs()


      setRoom(
        roomData
      )


      setLoadingFinalResults(
        false
      )


      return
    }


    setRoom(
      roomData
    )


    await Promise.all([
      loadPlayers(
        roomData.id
      ),

      loadSongs(),

      loadBuzzes(
        roomData.id,
        roomData.current_round
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
  REFRESH SALA
  =====================================
  */

  async function refreshRoom() {
    if (!room?.id) {
      return null
    }


    const {
      data,
      error
    } =
      await supabase
        .from('rooms')
        .select('*')
        .eq(
          'id',
          room.id
        )
        .single()


    if (
      !error &&
      data
    ) {
      setRoom(
        data
      )

      return data
    }


    return null
  }


  /*
  =====================================
  JUGADORES
  =====================================
  */

  async function loadPlayers(
    roomId
  ) {
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

      return []
    }


    setPlayers(
      data || []
    )


    return data || []
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

      return []
    }


    const cleanSongs =
      (data || [])
        .filter(
          item =>
            Boolean(
              item.spotify_id
            )
        )


    setSongs(
      cleanSongs
    )


    return cleanSongs
  }


  async function loadSong(
    songId
  ) {
    if (!songId) {
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
          'id',
          songId
        )
        .single()


    if (error) {
      console.error(error)

      return
    }


    setSong(
      data
    )
  }


  /*
  =====================================
  BUZZES
  =====================================
  */

  async function loadBuzzes(
    roomId,
    roundNumber
  ) {
    if (!roundNumber) {
      return
    }


    const {
      data,
      error
    } =
      await supabase
        .from('room_buzzes')
        .select('*')
        .eq(
          'room_id',
          roomId
        )
        .eq(
          'round_number',
          roundNumber
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


    setBuzzes(
      data || []
    )
  }


  /*
  =====================================
  COUNTDOWN 3...2...1
  =====================================
  */

  useEffect(() => {
    if (
      !room?.round_started_at ||
      room.status !== 'playing' ||
      roundFinished
    ) {
      setCountdown(0)
      setRoundReady(false)

      return
    }


    const updateCountdown = () => {
      const startTime =
        new Date(
          room.round_started_at
        ).getTime()


      const remainingMs =
        startTime -
        serverNow()


      if (
        remainingMs <= 0
      ) {
        setCountdown(0)
        setRoundReady(true)

        return
      }


      setCountdown(
        Math.min(
          Math.ceil(
            remainingMs /
            1000
          ),
          3
        )
      )


      setRoundReady(false)
    }


    updateCountdown()


    const interval =
      setInterval(
        updateCountdown,
        100
      )


    return () => {
      clearInterval(
        interval
      )
    }
  }, [
    room?.round_started_at,
    room?.current_round,
    room?.status,
    roundFinished
  ])


  /*
  =====================================
  SPOTIFY
  =====================================
  */

  useEffect(() => {
    if (
      !song?.spotify_id ||
      !player?.is_host ||
      room?.status !== 'playing'
    ) {
      return
    }


    let cancelled =
      false


    async function initializeSpotify() {
      await prepareSpotify(
        song.spotify_id
      )


      if (
        !cancelled &&
        !controllerRef.current
      ) {
        setTimeout(
          () => {
            if (
              !cancelled &&
              !controllerRef.current
            ) {
              prepareSpotify(
                song.spotify_id
              )
            }
          },
          250
        )
      }
    }


    initializeSpotify()


    return () => {
      cancelled =
        true
    }

  }, [
    song?.spotify_id,
    player?.is_host,
    room?.status
  ])


  async function prepareSpotify(
    spotifyId
  ) {
    if (
      !spotifyId ||
      spotifyPreparingRef.current
    ) {
      return
    }


    spotifyPreparingRef.current =
      true


    try {
      const api =
        iframeApiRef.current ||
        await loadSpotifyIframeApi()


      iframeApiRef.current =
        api


      const uri =
        `spotify:track:${spotifyId}`


      setSpotifyReady(
        false
      )


      if (
        controllerRef.current
      ) {
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
          450
        )


        return
      }


      let element =
        null


      for (
        let attempt = 0;
        attempt < 10;
        attempt += 1
      ) {
        element =
          document.getElementById(
            'one-note-spotify'
          )


        if (element) {
          break
        }


        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              60
            )
        )
      }


      if (!element) {
        return
      }


      api.createController(
        element,
        {
          width: '100%',
          height: 80,
          uri
        },
        controller => {
          controllerRef.current =
            controller


          controller.addListener(
            'ready',
            () => {
              setSpotifyReady(
                true
              )
            }
          )


          /*
          Este evento nos permite saber
          si Spotify realmente comenzó
          a sonar.

          Es importante para móvil:
          no confiamos solamente en que
          llamamos play().
          */

          controller.addListener(
            'playback_update',
            event => {
              const data =
                event?.data


              if (!data) {
                return
              }


              const actuallyPlaying =
                data.isPaused === false


              if (
                actuallyPlaying
              ) {
                playbackStartedRef.current =
                  true


                setIsPlaying(
                  true
                )


                setNeedsFirstPlayTap(
                  false
                )


                clearTimeout(
                  firstPlayFallbackTimerRef.current
                )
              } else {
                setIsPlaying(
                  false
                )
              }
            }
          )
        }
      )


    } catch (error) {
      console.error(
        error
      )

    } finally {
      spotifyPreparingRef.current =
        false
    }
  }


  /*
  =====================================
  REPRODUCCIÓN
  =====================================
  */

  function playDuration(
    seconds,
    options = {}
  ) {
    const {
      firstPlay = false
    } = options


    if (
      !player?.is_host ||
      !controllerRef.current ||
      !spotifyReady ||
      roundFinished
    ) {
      return false
    }


    clearTimeout(
      stopTimerRef.current
    )


    try {
      /*
      El PRIMER fragmento usa play().

      Repeticiones y Escuchar más
      usan restart(), porque ya sabemos
      que ese flujo funciona bien.
      */

      if (firstPlay) {
        controllerRef.current
          .play()
      } else {
        controllerRef.current
          .restart()
      }


      setIsPlaying(
        true
      )


      stopTimerRef.current =
        setTimeout(
          () => {
            controllerRef.current
              ?.pause()


            setIsPlaying(
              false
            )
          },
          seconds * 1000
        )


      return true

    } catch (error) {
      console.error(error)


      setIsPlaying(
        false
      )


      return false
    }
  }


  function playFragment() {
    /*
    Si estamos en el primer nivel
    y el autoplay móvil fue bloqueado,
    este toque debe funcionar como
    gesto manual válido.
    */

    if (
      listenLevel === 0 &&
      needsFirstPlayTap
    ) {
      manualFirstPlay()

      return
    }


    playDuration(
      currentListen.duration
    )
  }


  function stopFragment() {
    clearTimeout(
      stopTimerRef.current
    )


    controllerRef.current
      ?.pause()


    setIsPlaying(
      false
    )
  }


  /*
  =====================================
  PRIMER PLAY AUTOMÁTICO
  =====================================
  */

  useEffect(() => {
    if (
      !player?.is_host ||
      !roundReady ||
      !spotifyReady ||
      roundFinished ||
      !room?.current_round
    ) {
      return
    }


    const key =
      `${room.current_round}:0`


    if (
      autoPlayKeyRef.current ===
      key
    ) {
      return
    }


    autoPlayKeyRef.current =
      key


    clearTimeout(
      firstPlayFallbackTimerRef.current
    )


    playbackStartedRef.current =
      false


    setNeedsFirstPlayTap(
      false
    )


    /*
    Intentamos autoplay.
    */

    const attempted =
      playDuration(
        LISTEN_LEVELS[0]
          .duration,
        {
          firstPlay: true
        }
      )


    /*
    En desktop no queremos meter ruido.
    El fallback está pensado principalmente
    para móvil/tablet.
    */

    if (
      attempted &&
      isMobileLikeDevice()
    ) {
      firstPlayFallbackTimerRef.current =
        setTimeout(
          () => {
            /*
            Si Spotify nunca confirmó
            que estaba reproduciendo,
            asumimos bloqueo de autoplay.
            */

            if (
              !playbackStartedRef.current
            ) {
              clearTimeout(
                stopTimerRef.current
              )


              setIsPlaying(
                false
              )


              setNeedsFirstPlayTap(
                true
              )
            }
          },
          900
        )
    }

  }, [
    player?.is_host,
    roundReady,
    spotifyReady,
    room?.current_round,
    roundFinished
  ])


  /*
  =====================================
  FALLBACK MÓVIL
  =====================================
  */

  function manualFirstPlay() {
    if (
      !player?.is_host ||
      !controllerRef.current ||
      !spotifyReady ||
      roundFinished
    ) {
      return
    }


    clearTimeout(
      firstPlayFallbackTimerRef.current
    )


    playbackStartedRef.current =
      false


    setNeedsFirstPlayTap(
      false
    )


    /*
    Este sí ocurre directamente
    dentro del toque del usuario.
    */

    try {
      controllerRef.current
        .play()


      setIsPlaying(
        true
      )


      clearTimeout(
        stopTimerRef.current
      )


      stopTimerRef.current =
        setTimeout(
          () => {
            controllerRef.current
              ?.pause()


            setIsPlaying(
              false
            )
          },
          LISTEN_LEVELS[0]
            .duration * 1000
        )

    } catch (error) {
      console.error(error)


      setIsPlaying(
        false
      )


      setNeedsFirstPlayTap(
        true
      )
    }
  }


  /*
  Si alguien responde,
  pausamos audio.
  */

  useEffect(() => {
    if (
      player?.is_host &&
      room?.one_note_active_player_id
    ) {
      stopFragment()
    }
  }, [
    room?.one_note_active_player_id,
    player?.is_host
  ])


  /*
  Si termina ronda,
  pausamos audio.
  */

  useEffect(() => {
    if (
      player?.is_host &&
      roundFinished
    ) {
      stopFragment()


      setNeedsFirstPlayTap(
        false
      )
    }
  }, [
    roundFinished,
    player?.is_host
  ])


  /*
  =====================================
  TIMER PARA RESPONDER
  =====================================
  */

  useEffect(() => {
    if (
      !room?.one_note_active_player_id ||
      !room?.one_note_turn_started_at ||
      roundFinished
    ) {
      setAnswerCountdown(0)

      timeoutRunningRef.current =
        false

      return
    }


    const updateTimer = () => {
      const startedAt =
        new Date(
          room.one_note_turn_started_at
        ).getTime()


      const seconds =
        Number(
          room.one_note_answer_seconds ||
          10
        )


      const endTime =
        startedAt +
        seconds *
        1000


      const remaining =
        Math.max(
          0,
          Math.ceil(
            (
              endTime -
              serverNow()
            ) / 1000
          )
        )


      setAnswerCountdown(
        remaining
      )


      if (
        remaining <= 0 &&
        player?.is_host &&
        !timeoutRunningRef.current
      ) {
        timeoutRunningRef.current =
          true


        timeoutActivePlayer(
          room.one_note_active_player_id
        )
      }
    }


    timeoutRunningRef.current =
      false


    updateTimer()


    const interval =
      setInterval(
        updateTimer,
        150
      )


    return () => {
      clearInterval(
        interval
      )
    }
  }, [
    room?.one_note_active_player_id,
    room?.one_note_turn_started_at,
    room?.one_note_answer_seconds,
    roundFinished,
    player?.is_host
  ])


  async function timeoutActivePlayer(
    activePlayerId
  ) {
    const {
      error
    } =
      await supabase
        .rpc(
          'one_note_timeout_turn',
          {
            p_room_id:
              room.id,

            p_player_id:
              activePlayerId
          }
        )


    if (error) {
      console.error(error)
    }


    await Promise.all([
      refreshRoom(),

      loadBuzzes(
        room.id,
        room.current_round
      )
    ])


    timeoutRunningRef.current =
      false
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
          `one-note-${roomId}`
        )


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


            const songChanged =
              updated.current_song_id !==
              room.current_song_id


            const roundChanged =
              Number(
                updated.current_round
              ) !==
              Number(
                room.current_round
              )


            if (
              updated.status ===
              'finished'
            ) {
              if (
                player?.is_host &&
                finishingRef.current
              ) {
                return
              }


              stopFragment()


              setLoadingFinalResults(
                true
              )


              const {
                data: finalPlayers,
                error: finalPlayersError
              } =
                await supabase
                  .from('room_players')
                  .select('*')
                  .eq(
                    'room_id',
                    updated.id
                  )
                  .order(
                    'score',
                    {
                      ascending: false
                    }
                  )


              if (
                !finalPlayersError
              ) {
                setPlayers(
                  finalPlayers || []
                )
              }


              setRoom(
                updated
              )


              setLoadingFinalResults(
                false
              )


              return
            }


            setRoom(
              updated
            )


            if (
              songChanged &&
              updated.current_song_id
            ) {
              await loadSong(
                updated.current_song_id
              )
            }


            if (
              roundChanged
            ) {
              autoPlayKeyRef.current =
                null


              playbackStartedRef.current =
                false


              setNeedsFirstPlayTap(
                false
              )


              clearTimeout(
                firstPlayFallbackTimerRef.current
              )


              setQuery('')
              setSelectedGuess(null)
              setSearchResults([])
              setMessage('')


              await loadBuzzes(
                updated.id,
                updated.current_round
              )
            }


            if (
              updated.one_note_winner_player_id ||
              updated.one_note_result
            ) {
              await Promise.all([
                loadPlayers(
                  updated.id
                ),

                loadBuzzes(
                  updated.id,
                  updated.current_round
                )
              ])
            }
          }
        )


        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_buzzes',
            filter:
              `room_id=eq.${roomId}`
          },
          async () => {
            await Promise.all([
              loadBuzzes(
                roomId,
                room.current_round
              ),

              refreshRoom()
            ])
          }
        )


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


        .subscribe()


    return () => {
      supabase.removeChannel(
        channel
      )
    }
  }, [
    room?.id,
    room?.current_round,
    room?.current_song_id,
    player?.is_host
  ])


  /*
  =====================================
  SINCRONIZACIÓN DE RESPALDO
  =====================================
  */

  useEffect(() => {
    if (
      !room?.id ||
      !room?.current_round ||
      room?.status === 'finished'
    ) {
      return
    }


    const syncInterval =
      setInterval(
        async () => {
          if (
            player?.is_host &&
            finishingRef.current
          ) {
            return
          }


          const {
            data: freshRoom,
            error
          } =
            await supabase
              .from('rooms')
              .select('*')
              .eq(
                'id',
                room.id
              )
              .single()


          if (
            error ||
            !freshRoom
          ) {
            return
          }


          if (
            freshRoom.status ===
            'finished'
          ) {
            setLoadingFinalResults(
              true
            )


            const {
              data: finalPlayers,
              error: finalPlayersError
            } =
              await supabase
                .from('room_players')
                .select('*')
                .eq(
                  'room_id',
                  freshRoom.id
                )
                .order(
                  'score',
                  {
                    ascending: false
                  }
                )


            if (
              !finalPlayersError
            ) {
              setPlayers(
                finalPlayers || []
              )
            }


            setRoom(
              freshRoom
            )


            setLoadingFinalResults(
              false
            )


            return
          }


          const oldSong =
            room.current_song_id


          setRoom(
            freshRoom
          )


          if (
            freshRoom.current_song_id &&
            freshRoom.current_song_id !==
              oldSong
          ) {
            await loadSong(
              freshRoom.current_song_id
            )
          }


          await Promise.all([
            loadBuzzes(
              freshRoom.id,
              freshRoom.current_round
            ),

            loadPlayers(
              freshRoom.id
            )
          ])
        },
        1000
      )


    return () => {
      clearInterval(
        syncInterval
      )
    }
  }, [
    room?.id,
    room?.current_round,
    room?.current_song_id,
    room?.status,
    player?.is_host
  ])


  /*
  =====================================
  ADIVINAR
  =====================================
  */

  async function buzz() {
    if (
      !canBuzz ||
      buzzing
    ) {
      return
    }


    setBuzzing(
      true
    )

    setMessage('')


    try {
      const {
        data,
        error
      } =
        await supabase
          .rpc(
            'one_note_buzz',
            {
              p_room_id:
                room.id,

              p_player_id:
                player.player_id,

              p_round_number:
                room.current_round,

              p_listen_level:
                listenLevel
            }
          )


      if (error) {
        throw error
      }


      await Promise.all([
        loadBuzzes(
          room.id,
          room.current_round
        ),

        refreshRoom()
      ])


      if (
        data &&
        Number(data) > 1
      ) {
        setMessage(
          `Entraste #${data}`
        )
      }


    } catch (error) {
      console.error(error)


      setMessage(
        error.message ||
        'No se pudo registrar tu intento.'
      )

    } finally {
      setBuzzing(
        false
      )
    }
  }


  /*
  =====================================
  BUSCADOR
  =====================================
  */

  useEffect(() => {
    if (
      !isMyTurn ||
      query.trim().length < 2
    ) {
      setSearchResults([])

      return
    }


    setSearchResults(
      searchLibrary(
        songs,
        query
      )
    )
  }, [
    query,
    isMyTurn,
    songs
  ])


  function selectGuess(
    item
  ) {
    setSelectedGuess(
      item
    )


    setQuery(
      `${item.title} — ${item.artist}`
    )


    setSearchResults([])
  }


  /*
  =====================================
  RESPONDER
  =====================================
  */

  async function submitAnswer() {
    if (
      !isMyTurn ||
      !selectedGuess ||
      submitting
    ) {
      return
    }


    setSubmitting(
      true
    )

    setMessage('')


    try {
      const {
        error
      } =
        await supabase
          .rpc(
            'one_note_submit_answer',
            {
              p_room_id:
                room.id,

              p_player_id:
                player.player_id,

              p_spotify_id:
                selectedGuess.spotify_id
            }
          )


      if (error) {
        throw error
      }


      setQuery('')
      setSelectedGuess(null)
      setSearchResults([])


      await Promise.all([
        loadBuzzes(
          room.id,
          room.current_round
        ),

        refreshRoom(),

        loadPlayers(
          room.id
        )
      ])


    } catch (error) {
      console.error(error)


      setMessage(
        error.message ||
        'No se pudo enviar la respuesta.'
      )

    } finally {
      setSubmitting(
        false
      )
    }
  }


  /*
  =====================================
  ESCUCHAR MÁS
  =====================================
  */

  async function hearMore() {
    if (
      !player?.is_host ||
      roundFinished ||
      room.one_note_active_player_id
    ) {
      return
    }


    stopFragment()

    setMessage('')


    setNeedsFirstPlayTap(
      false
    )


    clearTimeout(
      firstPlayFallbackTimerRef.current
    )


    const {
      data,
      error
    } =
      await supabase
        .rpc(
          'one_note_hear_more',
          {
            p_room_id:
              room.id,

            p_host_player_id:
              player.player_id
          }
        )


    if (error) {
      setMessage(
        error.message
      )

      return
    }


    const nextLevel =
      Number(data)


    await Promise.all([
      refreshRoom(),

      loadBuzzes(
        room.id,
        room.current_round
      )
    ])


    if (
      LISTEN_LEVELS[
        nextLevel
      ]
    ) {
      playDuration(
        LISTEN_LEVELS[
          nextLevel
        ].duration
      )
    }
  }


  /*
  =====================================
  SALTAR
  =====================================
  */

  async function skipSong() {
    if (
      !player?.is_host ||
      roundFinished ||
      skippingSong
    ) {
      return
    }


    stopFragment()


    setSkippingSong(
      true
    )

    setMessage('')


    setNeedsFirstPlayTap(
      false
    )


    clearTimeout(
      firstPlayFallbackTimerRef.current
    )


    try {
      const {
        error
      } =
        await supabase
          .rpc(
            'one_note_skip_song',
            {
              p_room_id:
                room.id,

              p_host_player_id:
                player.player_id
            }
          )


      if (error) {
        throw error
      }


      await Promise.all([
        refreshRoom(),

        loadBuzzes(
          room.id,
          room.current_round
        )
      ])


    } catch (error) {
      console.error(error)


      setMessage(
        error.message ||
        'No se pudo saltar la canción.'
      )

    } finally {
      setSkippingSong(
        false
      )
    }
  }


  /*
  =====================================
  SIGUIENTE RONDA / RESULTADOS
  =====================================
  */


  async function nextRound() {
  if (
    !player?.is_host
  ) {
    return
  }


  stopFragment()


  setNeedsFirstPlayTap(
    false
  )


  clearTimeout(
    firstPlayFallbackTimerRef.current
  )


  /*
  =====================================
  ÚLTIMA RONDA
  =====================================

  IMPORTANTE:

  NO activamos loadingFinalResults.

  Mientras hacemos las consultas,
  el host continúa viendo la tarjeta
  de la última canción.

  Cuando TODO está listo,
  pasamos directamente a resultados.
  =====================================
  */

  if (
    room.current_round >=
    room.total_rounds
  ) {
    if (
      finishingRef.current
    ) {
      return
    }


    finishingRef.current =
      true

    setMessage('')


    try {

      /*
      1. Cargamos primero el ranking.

      Todavía NO cambiamos la sala
      a finished.
      */

      const {
        data: finalPlayers,
        error: playersError
      } =
        await supabase
          .from('room_players')
          .select('*')
          .eq(
            'room_id',
            room.id
          )
          .order(
            'score',
            {
              ascending: false
            }
          )


      if (playersError) {
        throw playersError
      }


      /*
      2. Ahora terminamos la sala.

      Usamos .select().single()
      para recibir inmediatamente
      la versión final de la sala.

      Así no dependemos de Realtime
      para actualizar al host.
      */

      const {
        data: finalRoom,
        error: finishError
      } =
        await supabase
          .from('rooms')
          .update({
            status:
              'finished',

            current_song_id:
              null,

            one_note_turn_started_at:
              null,

            one_note_active_player_id:
              null
          })
          .eq(
            'id',
            room.id
          )
          .select('*')
          .single()


      if (
        finishError ||
        !finalRoom
      ) {
        throw (
          finishError ||
          new Error(
            'No pude cargar los resultados.'
          )
        )
      }


      /*
      3. YA TENEMOS TODO.

      Actualizamos ambos estados
      prácticamente al mismo tiempo.

      React pasa directamente:

      última canción
          ↓
      tabla final

      SIN pantalla intermedia.
      */

      setPlayers(
        finalPlayers || []
      )


      setRoom(
        finalRoom
      )


    } catch (error) {
      console.error(
        'Error mostrando resultados:',
        error
      )


      setMessage(
        error.message ||
        'No se pudieron cargar los resultados.'
      )


    } finally {

      /*
      Esperamos a que React procese
      el cambio antes de permitir
      otro cierre.
      */

      setTimeout(
        () => {
          finishingRef.current =
            false
        },
        500
      )
    }


    return
  }


  /*
  =====================================
  SIGUIENTE RONDA NORMAL
  =====================================
  */

  const candidates =
    songs.filter(
      item =>
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


  autoPlayKeyRef.current =
    null


  playbackStartedRef.current =
    false


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

        one_note_level:
          0,

        one_note_active_player_id:
          null,

        one_note_winner_player_id:
          null,

        one_note_turn_started_at:
          null,

        one_note_result:
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
  }
}

  /*
  =====================================
  JUGAR DE NUEVO
  =====================================
  */

  async function playAgain() {
    if (
      !player?.is_host ||
      loadingFinalResults
    ) {
      return
    }


    let availableSongs =
      songs.filter(
        item =>
          Boolean(
            item.spotify_id
          )
      )


    if (
      !availableSongs.length
    ) {
      availableSongs =
        await loadSongs()
    }


    if (
      !availableSongs.length
    ) {
      setMessage(
        'No hay canciones disponibles.'
      )

      return
    }


    const firstSong =
      availableSongs[
        Math.floor(
          Math.random() *
          availableSongs.length
        )
      ]


    setLoadingFinalResults(
      true
    )

    setMessage('')


    clearTimeout(
      stopTimerRef.current
    )


    clearTimeout(
      firstPlayFallbackTimerRef.current
    )


    try {
      controllerRef.current
        ?.destroy?.()
    } catch (error) {
      console.warn(error)
    }


    controllerRef.current =
      null


    playbackStartedRef.current =
      false


    setNeedsFirstPlayTap(
      false
    )


    setSpotifyReady(
      false
    )


    setIsPlaying(
      false
    )


    autoPlayKeyRef.current =
      null


    setSong(
      null
    )


    const {
      error
    } =
      await supabase
        .rpc(
          'restart_one_note_game',
          {
            p_room_id:
              room.id,

            p_host_player_id:
              player.player_id,

            p_song_id:
              firstSong.id
          }
        )


    if (error) {
      setLoadingFinalResults(
        false
      )


      setMessage(
        error.message
      )


      return
    }


    const {
      data: restartedRoom,
      error: restartedRoomError
    } =
      await supabase
        .from('rooms')
        .select('*')
        .eq(
          'id',
          room.id
        )
        .single()


    if (
      restartedRoomError ||
      !restartedRoom
    ) {
      setLoadingFinalResults(
        false
      )


      setMessage(
        'No pude reiniciar la sala.'
      )


      return
    }


    setBuzzes([])
    setQuery('')
    setSelectedGuess(null)
    setSearchResults([])
    setAnswerCountdown(0)


    await loadPlayers(
      room.id
    )


    setRoom(
      restartedRoom
    )


    setLoadingFinalResults(
      false
    )


    setTimeout(
      async () => {
        await loadSong(
          firstSong.id
        )


        await loadBuzzes(
          restartedRoom.id,
          restartedRoom.current_round
        )
      },
      100
    )
  }


  /*
  =====================================
  LOADING INICIAL
  =====================================
  */

  if (
    !room ||
    !player
  ) {
    return (
      <section className="one-note-game">

        <div className="solo-loading">
          Cargando...
        </div>

      </section>
    )
  }


  /*
  =====================================
  PREPARANDO RESULTADOS
  =====================================
  */

  if (
    loadingFinalResults
  ) {
    return (
      <section className="one-note-game">

        <div className="one-note-result">

          <span>
            EN UNA NOTA
          </span>


          <h1>
            Preparando resultados...
          </h1>


          <p className="muted">
            Un momento...
          </p>

        </div>

      </section>
    )
  }


  /*
  =====================================
  RESULTADO FINAL
  =====================================
  */

  if (
    room.status ===
    'finished'
  ) {
    const ranking =
      [...players]
        .sort(
          (a, b) =>
            b.score -
            a.score
        )


    if (
      !ranking.length
    ) {
      return (
        <section className="one-note-game">

          <div className="one-note-result">

            <span>
              EN UNA NOTA
            </span>

            <h1>
              Preparando resultados...
            </h1>

          </div>

        </section>
      )
    }


    return (
      <section className="one-note-game">

        <div className="one-note-result">

          <span>
            EN UNA NOTA
          </span>


          <h1>
            Resultado final
          </h1>


          <div className="one-note-ranking">

            {ranking.map(
              (
                item,
                index
              ) => (

                <div
                  key={item.id}
                >

                  <span>
                    #{index + 1}
                  </span>


                  <strong>
                    {item.player_name}
                  </strong>


                  <b>
                    {item.score}
                  </b>

                </div>

              )
            )}

          </div>


          {player.is_host && (

            <button
              className="primary"
              onClick={
                playAgain
              }
            >
              Jugar de nuevo
            </button>

          )}


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


          {message && (

            <div className="message">
              {message}
            </div>

          )}

        </div>

      </section>
    )
  }


  /*
  =====================================
  JUEGO
  =====================================
  */

  return (
    <section className="one-note-game">


      {player.is_host && (

        <div className="spotify-hidden-player">

          <div
            id="one-note-spotify"
          />

        </div>

      )}


      <div className="one-note-header">

        <div>

          <span>
            Sala {room.code}
          </span>

          <h1>
            En una nota
          </h1>

        </div>


        <div>
          Ronda {room.current_round}/{room.total_rounds}
        </div>

      </div>


      {roundFinished ? (

        <div className="one-note-winner-card">


          <span>

            {winnerPlayer
              ? `${winnerPlayer.player_name} adivinó`
              : room.one_note_result === 'skipped'
                ? 'Canción saltada'
                : 'Nadie la adivinó'}

          </span>


          {song?.album_image_url && (

            <img
              src={
                song.album_image_url
              }
              alt=""
            />

          )}


          <h2>
            {song?.title}
          </h2>


          <p>
            {song?.artist}
          </p>


          {winnerPlayer ? (

            <strong>
              +1 punto
            </strong>

          ) : (

            <small className="one-note-no-points">
              Sin puntos esta ronda
            </small>

          )}


          {player.is_host ? (

            <button
              className="primary"
              onClick={
                nextRound
              }
            >

              <ArrowRight
                size={18}
              />


              {room.current_round >=
              room.total_rounds
                ? 'Ver resultados'
                : 'Siguiente ronda'}

            </button>

          ) : (

            <p className="muted">
              Esperando al host...
            </p>

          )}

        </div>


      ) : !roundReady ? (

        <div className="one-note-countdown">

          <span>
            PREPÁRENSE
          </span>


          <strong>
            {countdown || 1}
          </strong>

        </div>


      ) : (

        <>


          <div className="one-note-progress">

            {LISTEN_LEVELS.map(
              (
                item,
                index
              ) => (

                <div
                  key={
                    item.duration
                  }
                  className={
                    index ===
                    listenLevel
                      ? 'active'
                      : index <
                        listenLevel
                        ? 'used'
                        : ''
                  }
                >

                  {item.label}

                </div>

              )
            )}

          </div>


          {/*
          =====================================
          HOST
          =====================================
          */}

          {player.is_host && (

            <div className="one-note-host">


              {/*
              =====================================
              FALLBACK PRIMER PLAY EN MÓVIL
              =====================================
              */}

              {needsFirstPlayTap ? (

                <button
                  className="one-note-play one-note-first-play"
                  onClick={
                    manualFirstPlay
                  }
                  disabled={
                    !spotifyReady
                  }
                  title="Tocar para escuchar"
                >

                  <Play
                    size={48}
                    fill="currentColor"
                  />

                </button>

              ) : (

                <button
                  className="one-note-play"
                  onClick={
                    isPlaying
                      ? stopFragment
                      : playFragment
                  }
                  disabled={
                    !spotifyReady ||
                    !roundReady
                  }
                  title={
                    isPlaying
                      ? 'Pausar'
                      : 'Repetir fragmento'
                  }
                >

                  {isPlaying ? (

                    <Pause
                      size={48}
                      fill="currentColor"
                    />

                  ) : (

                    <Play
                      size={48}
                      fill="currentColor"
                    />

                  )}

                </button>

              )}


              {needsFirstPlayTap ? (

                <strong className="one-note-first-play-label">
                  Tocar para escuchar
                </strong>

              ) : (

                <span>
                  {currentListen.duration}s
                </span>

              )}


              <div className="one-note-host-actions">

                {listenLevel < 4 && (

                  <button
                    className="secondary one-note-hear-more"
                    onClick={
                      hearMore
                    }
                    disabled={
                      Boolean(
                        room.one_note_active_player_id
                      )
                    }
                  >
                    Escuchar más
                  </button>

                )}


                <button
                  className="one-note-skip-song"
                  onClick={
                    skipSong
                  }
                  disabled={
                    skippingSong
                  }
                  title="Saltar canción"
                >

                  <SkipForward
                    size={19}
                  />

                </button>

              </div>

            </div>

          )}


          {/*
          =====================================
          ADIVINAR / ESTADOS
          =====================================
          */}

          {!isMyTurn && (

            <div className="one-note-player-action">


              {failedThisListen &&
                room.allow_retries ? (

                <div className="one-note-failed-state">

                  <strong>
                    Fallaste
                  </strong>

                  <span>
                    Esperando la siguiente escucha...
                  </span>

                </div>


              ) : failedThisSong &&
                !room.allow_retries ? (

                <div className="one-note-failed-state">

                  <strong>
                    Fallaste esta canción
                  </strong>

                  <span>
                    Esperando la siguiente ronda...
                  </span>

                </div>


              ) : queuedThisListen ? (

                <div className="one-note-wait-state">

                  <strong>
                    Estás en la fila
                  </strong>

                  <span>
                    Esperando tu turno...
                  </span>

                </div>


              ) : (

                <button
                  className="one-note-buzz"
                  onClick={
                    buzz
                  }
                  disabled={
                    !canBuzz ||
                    buzzing
                  }
                >

                  {buzzing
                    ? 'Entrando...'
                    : 'Adivinar'}

                </button>

              )}

            </div>

          )}


          {/*
          =====================================
          RESPONDER
          =====================================
          */}

          {isMyTurn && (

            <div className="one-note-answer">

              <div className="one-note-answer-heading">

                <strong>
                  Tu turno
                </strong>


                <b>
                  {answerCountdown}
                </b>

              </div>


              <div className="autocomplete">

                <div className="one-note-search">

                  <Search
                    size={19}
                  />


                  <input
                    value={query}
                    placeholder="Busca la canción..."
                    autoFocus
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


                {searchResults.length > 0 && (

                  <div className="suggestions spotify-game-results">

                    {searchResults.map(
                      item => (

                        <button
                          key={item.id}
                          type="button"
                          onClick={
                            () =>
                              selectGuess(
                                item
                              )
                          }
                        >

                          <span className="guess-track-info">

                            <b>
                              {item.title}
                            </b>

                            <small>
                              {item.artist}
                            </small>

                          </span>

                        </button>

                      )
                    )}

                  </div>

                )}

              </div>


              <button
                className="primary"
                onClick={
                  submitAnswer
                }
                disabled={
                  !selectedGuess ||
                  submitting ||
                  answerCountdown <= 0
                }
              >

                {submitting
                  ? 'Comprobando...'
                  : 'Responder'}

              </button>

            </div>

          )}


          {/*
          =====================================
          ORDEN
          =====================================
          */}

          <div className="one-note-queue">

            <h3>
              Orden
            </h3>


            {!orderBuzzes.length && (

              <p className="muted one-note-empty-order">
                Nadie ha intentado todavía.
              </p>

            )}


            {orderBuzzes.map(
              (
                item,
                index
              ) => {
                const queuePlayer =
                  players.find(
                    playerItem =>
                      playerItem.id ===
                      item.player_id
                  )


                return (

                  <div
                    key={item.id}
                    className={
                      `one-note-order-row ${
                        item.status ===
                        'wrong'
                          ? 'wrong'
                          : ''
                      } ${
                        item.status ===
                        'answering'
                          ? 'answering'
                          : ''
                      }`
                    }
                  >

                    <span>
                      #{index + 1}
                    </span>


                    <strong>
                      {queuePlayer
                        ?.player_name ||
                        'Jugador'}
                    </strong>


                    {item.status ===
                      'answering' && (

                      <i />

                    )}

                  </div>

                )
              }
            )}

          </div>


          {message && (

            <div className="message">
              {message}
            </div>

          )}

        </>

      )}


      {activePlayer &&
        !roundFinished &&
        roundReady && (

        <div className="one-note-answer-overlay">

          <div className="one-note-answer-overlay-card">

            <span>

              {isMyTurn
                ? 'Tu turno'
                : `${activePlayer.player_name} está respondiendo`}

            </span>


            <strong className="one-note-overlay-timer">
              {answerCountdown}
            </strong>

          </div>

        </div>

      )}

    </section>
  )
}