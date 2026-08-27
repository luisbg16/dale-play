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


  const iframeApiRef =
    useRef(null)

  const controllerRef =
    useRef(null)

  const stopTimerRef =
    useRef(null)

  const autoPlayKeyRef =
    useRef(null)


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
  RESULTADOS FINALES
  =====================================
  */

  const [
    loadingFinalResults,
    setLoadingFinalResults
  ] = useState(false)


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


  /*
  Mientras alguien responde,
  los demás SÍ pueden entrar a la cola.
  */

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

      controllerRef.current
        ?.destroy?.()
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


    /*
    Si entramos o recargamos una partida
    ya terminada, primero cargamos ranking.
    */

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


      setRoom(
        roomData
      )

      setLoadingFinalResults(
        false
      )

      await loadSongs()

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


    /*
    Si React todavía no había montado
    el contenedor, damos un segundo intento.
    */

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


    const element =
      document.getElementById(
        'one-note-spotify'
      )


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
      }
    )
  }


  /*
  =====================================
  REPRODUCCIÓN
  =====================================
  */

  function playDuration(
    seconds
  ) {
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
      controllerRef.current
        .restart()


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
          seconds *
          1000
        )


      return true

    } catch (error) {
      console.error(error)

      setIsPlaying(false)

      return false
    }
  }


  function playFragment() {
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
  Al terminar el 3...2...1,
  intentamos reproducir automáticamente.
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


    playDuration(
      LISTEN_LEVELS[0]
        .duration
    )

  }, [
    player?.is_host,
    roundReady,
    spotifyReady,
    room?.current_round,
    roundFinished
  ])


  /*
  Cuando alguien responde,
  paramos audio.
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
  Cuando termina la ronda,
  paramos audio.
  */

  useEffect(() => {
    if (
      player?.is_host &&
      roundFinished
    ) {
      stopFragment()
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


            /*
            =====================================
            IMPORTANTE:
            RESULTADOS FINALES

            Primero cargamos players.
            DESPUÉS cambiamos room a finished.

            Esto evita pantalla negra.
            =====================================
            */

            if (
              updated.status ===
              'finished'
            ) {
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


            /*
            Partida normal.
            */

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
    room?.current_song_id
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
            !error &&
            freshRoom
          ) {
            /*
            Si detectamos finished por polling,
            hacemos exactamente lo mismo que Realtime.
            */

            if (
              freshRoom.status ===
              'finished'
            ) {
              setLoadingFinalResults(
                true
              )


              const {
                data: finalPlayers
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


              setPlayers(
                finalPlayers || []
              )


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
          }
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
    room?.status
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


    /*
    Escuchar más reproduce inmediatamente.
    */

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
  SIGUIENTE RONDA
  =====================================
  */

  async function nextRound() {
    if (
      !player?.is_host
    ) {
      return
    }


    stopFragment()


    /*
    =====================================
    ÚLTIMA RONDA
    =====================================
    */

    if (
      room.current_round >=
      room.total_rounds
    ) {
      setLoadingFinalResults(
        true
      )


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

            one_note_turn_started_at:
              null
          })
          .eq(
            'id',
            room.id
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


      /*
      Además de esperar Realtime,
      el propio host carga el ranking
      inmediatamente.
      */

      const {
        data: finalPlayers,
        error: finalPlayersError
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


      if (
        !finalPlayersError
      ) {
        setPlayers(
          finalPlayers || []
        )
      }


      const {
        data: finalRoom,
        error: finalRoomError
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
        !finalRoomError &&
        finalRoom
      ) {
        setRoom(
          finalRoom
        )
      }


      setLoadingFinalResults(
        false
      )


      return
    }


    /*
    =====================================
    SIGUIENTE CANCIÓN
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


  /*
  =====================================
  LIMPIAMOS COMPLETAMENTE SPOTIFY
  =====================================

  El controller anterior estaba unido
  al iframe de la partida anterior.
  */

  clearTimeout(
    stopTimerRef.current
  )


  try {
    controllerRef.current
      ?.destroy?.()
  } catch (error) {
    console.warn(
      'No se pudo destruir el controller anterior',
      error
    )
  }


  controllerRef.current =
    null


  setSpotifyReady(
    false
  )

  setIsPlaying(
    false
  )


  /*
  Evitamos que el autoplay piense
  que esta ronda ya se reprodujo.
  */

  autoPlayKeyRef.current =
    null


  /*
  Dejamos song vacío para garantizar
  que el efecto de Spotify vuelva
  a ejecutarse aunque salga elegida
  la misma canción que antes.
  */

  setSong(
    null
  )


  /*
  =====================================
  REINICIAMOS EN SUPABASE
  =====================================
  */

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


  /*
  =====================================
  TRAEMOS NUEVA SALA
  =====================================
  */

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


  /*
  Limpiamos estado de la partida anterior.
  */

  setBuzzes([])
  setQuery('')
  setSelectedGuess(null)
  setSearchResults([])
  setAnswerCountdown(0)


  await loadPlayers(
    room.id
  )


  /*
  =====================================
  IMPORTANTE

  Primero mostramos nuevamente
  la pantalla del juego.

  Así React vuelve a montar:
  #one-note-spotify
  =====================================
  */

  setRoom(
    restartedRoom
  )


  setLoadingFinalResults(
    false
  )


  /*
  Esperamos un instante a que React
  monte físicamente el nuevo div.

  Después cargamos la canción.
  */

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


    /*
    Protección adicional.
    Nunca mostramos pantalla negra.
    */

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


      {/*
      =====================================
      RESULTADO DE RONDA
      =====================================
      */}

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

        /*
        =====================================
        3...2...1
        =====================================
        */

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


          {/*
          =====================================
          NIVELES
          =====================================
          */}

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


              <span>
                {currentListen.duration}s
              </span>


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


      {/*
      =====================================
      FLOTANTE GLOBAL
      =====================================
      */}

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