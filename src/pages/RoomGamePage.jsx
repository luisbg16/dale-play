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
  Search,
  ArrowRight,
  Clock3,
  X,
  CheckCircle2,
  LoaderCircle
} from 'lucide-react'

import {
  supabase
} from '../lib/supabase'

import {
  loadSpotifyIframeApi
} from '../lib/spotifyIframe'


const ROUND_SECONDS = 60

const PREPARE_SECONDS = 3

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
    .slice(
      0,
      8
    )
    .map(
      item =>
        item.song
    )
}


function getPositionMultiplier(position) {

  if (position === 1) {
    return 100
  }

  if (position === 2) {
    return 90
  }

  if (position === 3) {
    return 80
  }

  if (position === 4) {
    return 70
  }

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
  =====================================
  RONDA
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

  const [roundPoints, setRoundPoints] =
    useState(0)

  const [
    correctPosition,
    setCorrectPosition
  ] = useState(0)


  /*
  =====================================
  TIMER
  =====================================
  */

  const [timeLeft, setTimeLeft] =
    useState(ROUND_SECONDS)

  const [
    preparationLeft,
    setPreparationLeft
  ] = useState(0)

  const [roundActive, setRoundActive] =
    useState(false)

  const [roundExpired, setRoundExpired] =
    useState(false)

  const timeoutSubmittedRef =
    useRef(false)


  /*
  =====================================
  BUSCADOR LOCAL
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
  SPOTIFY
  =====================================
  */

  const iframeApiRef =
    useRef(null)

  const controllerRef =
    useRef(null)

  const hasPlayedCurrentSongRef =
    useRef(false)

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


  const [spotifyReady, setSpotifyReady] =
    useState(false)

  const [isPlaying, setIsPlaying] =
    useState(false)

  const [audioStarting, setAudioStarting] =
    useState(false)


  /*
  =====================================
  MENSAJES
  =====================================
  */

  const [message, setMessage] =
    useState('')


  const currentLevel =
    LEVELS[levelIndex]


  const potentialPoints =
    Math.max(
      0,
      currentLevel.points -
      wrongCount *
        PENALTY_PER_MISTAKE
    )


  /*
  =====================================
  INICIO
  =====================================
  */

  useEffect(() => {

    loadInitial()


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
        'No estás registrado como jugador de esta sala.'
      )

      return
    }


    const playerSession =
      JSON.parse(session)


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


    if (
      playerSession.is_host &&
      roomData.status === 'playing' &&
      roomData.current_round > 0 &&
      !roomData.round_started_at
    ) {

      await setRoundStart(
        roomData.id
      )
    }
  }


  /*
  =====================================
  BIBLIOTECA LOCAL
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


  /*
  =====================================
  INICIO SINCRONIZADO
  =====================================
  */

  async function setRoundStart(
    roomId
  ) {

    const startAt =
      new Date(
        Date.now() +
        PREPARE_SECONDS *
          1000
      )
        .toISOString()


    await supabase
      .from('rooms')
      .update({
        round_started_at:
          startAt
      })
      .eq(
        'id',
        roomId
      )
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


    const channel =
      supabase
        .channel(
          `daleplay-game-${room.id}`
        )

        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter:
              `id=eq.${room.id}`
          },
          async payload => {

            const updated =
              payload.new


            const songChanged =
              updated.current_song_id !==
              room.current_song_id


            const roundChanged =
              updated.current_round !==
              room.current_round


            setRoom(updated)


            if (
              updated.status ===
              'finished'
            ) {

              stopSpotify()

              await loadPlayers(
                updated.id
              )

              return
            }


            if (
              songChanged ||
              roundChanged
            ) {

              resetRound()


              if (
                updated.current_song_id
              ) {

                await loadSong(
                  updated.current_song_id
                )
              }


              await loadAnswers(
                updated.id,
                updated.current_round,
                player?.player_id
              )
            }
          }
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter:
              `room_id=eq.${room.id}`
          },
          () => {

            loadPlayers(
              room.id
            )
          }
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_answers',
            filter:
              `room_id=eq.${room.id}`
          },
          () => {

            loadAnswers(
              room.id,
              room.current_round,
              player?.player_id
            )

            loadPlayers(
              room.id
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
    player?.player_id
  ])


  /*
  =====================================
  TIMER
  =====================================
  */

  useEffect(() => {

    if (
      !room?.round_started_at ||
      room.status !== 'playing'
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


          const now =
            Date.now()


          const msUntilStart =
            start - now


          if (
            msUntilStart > 0
          ) {

            setRoundActive(false)

            setRoundExpired(false)


            setPreparationLeft(
              Math.max(
                1,
                Math.ceil(
                  msUntilStart /
                  1000
                )
              )
            )


            setTimeLeft(
              ROUND_SECONDS
            )

            return
          }


          setPreparationLeft(0)

          setRoundActive(true)


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

            setRoundActive(false)

            setRoundExpired(true)

            stopSpotify()


            if (
              !roundDone &&
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
        250
      )


    return () => {

      clearInterval(timer)
    }

  }, [
    room?.round_started_at,
    room?.status,
    roundDone
  ])


  /*
  =====================================
  DATOS
  =====================================
  */

  async function loadPlayers(roomId) {

    const {
      data
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


    setPlayers(
      data || []
    )
  }


  async function loadAnswers(
    roomId,
    roundNumber,
    currentPlayerId = null
  ) {

    if (!roundNumber) {

      setAnswers([])

      return
    }


    const {
      data
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
          roundNumber
        )
        .order(
          'created_at',
          {
            ascending: true
          }
        )


    const list =
      data || []


    setAnswers(list)


    if (
      currentPlayerId
    ) {

      const ownAnswer =
        list.find(
          item =>
            item.player_id ===
            currentPlayerId
        )


      if (ownAnswer) {

        setRoundDone(true)

        setRoundPoints(
          ownAnswer.points || 0
        )


        if (
          ownAnswer.correct
        ) {

          const correctBefore =
            list.filter(
              item =>
                item.correct &&
                new Date(
                  item.created_at
                ) <=
                new Date(
                  ownAnswer.created_at
                )
            )


          setCorrectPosition(
            correctBefore.length
          )
        }
      }
    }
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


    setSong(data)


    if (
      data?.spotify_id
    ) {

      prepareSpotifySong(
        data.spotify_id
      )
    }
  }


  /*
  =====================================
  SPOTIFY
  =====================================
  */

  async function prepareSpotifySong(
    spotifyId
  ) {

    stopSpotify()

    setSpotifyReady(false)


    const IFrameAPI =
      iframeApiRef.current ||
      await loadSpotifyIframeApi()


    iframeApiRef.current =
      IFrameAPI


    hasPlayedCurrentSongRef.current =
      false


    if (
      controllerRef.current
    ) {

      controllerRef.current
        .loadEntity(
          `spotify:track:${spotifyId}`
        )


      setSpotifyReady(true)

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

        uri:
          `spotify:track:${spotifyId}`
      },
      controller => {

        controllerRef.current =
          controller


        setupSpotifyEvents(
          controller
        )
      }
    )
  }


  function setupSpotifyEvents(
    controller
  ) {

    controller.addListener(
      'ready',
      () => {

        setSpotifyReady(true)
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


        playbackStartedAtRef.current =
          performance.now()


        setAudioStarting(false)

        setIsPlaying(true)


        clearInterval(
          playbackWatchdogRef.current
        )

        clearTimeout(
          fallbackTimerRef.current
        )


        playbackWatchdogRef.current =
          setInterval(
            () => {

              if (
                !playingRequestRef.current ||
                playbackStartedAtRef.current ===
                  null ||
                targetDurationRef.current ===
                  null
              ) {
                return
              }


              const elapsed =
                performance.now() -
                playbackStartedAtRef.current


              if (
                elapsed >=
                targetDurationRef.current
              ) {

                forceStopSpotify()
              }

            },
            50
          )


        fallbackTimerRef.current =
          setTimeout(
            () => {

              forceStopSpotify()

            },
            (
              targetDurationRef.current ||
              1000
            ) + 350
          )
      }
    )
  }


  function forceStopSpotify() {

    if (
      stoppingRef.current
    ) {
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


    playbackStartedAtRef.current =
      null

    playingRequestRef.current =
      false

    targetDurationRef.current =
      null


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
      220
    )


    setAudioStarting(false)

    setIsPlaying(false)


    setTimeout(
      () => {

        stoppingRef.current =
          false

      },
      300
    )
  }


  function stopSpotify() {

    clearInterval(
      playbackWatchdogRef.current
    )

    clearTimeout(
      fallbackTimerRef.current
    )


    playbackStartedAtRef.current =
      null

    playingRequestRef.current =
      false

    targetDurationRef.current =
      null

    stoppingRef.current =
      false


    controllerRef.current
      ?.pause()


    setAudioStarting(false)

    setIsPlaying(false)
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


    playbackStartedAtRef.current =
      null

    playingRequestRef.current =
      true

    stoppingRef.current =
      false


    targetDurationRef.current =
      currentLevel.duration *
      1000


    setAudioStarting(true)

    setIsPlaying(true)


    if (
      hasPlayedCurrentSongRef.current
    ) {

      controller.restart()

      controller.play()

    } else {

      hasPlayedCurrentSongRef.current =
        true

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
      roundDone ||
      !roundActive
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
  FALLO / SALTO
  =====================================
  */

  function registerFailure(
    text
  ) {

    if (
      roundDone ||
      !roundActive
    ) {
      return
    }


    setWrongCount(
      current =>
        current + 1
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
    }


    setMessage(
      `−${PENALTY_PER_MISTAKE} pts potenciales`
    )
  }


  function skip() {

    registerFailure(
      'Saltado'
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

      if (!selectedGuess) {

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


    finishRound(
      true,
      selectedGuess,
      false
    )
  }


  /*
  =====================================
  TERMINAR RONDA
  =====================================
  */

  async function finishRound(
    correct,
    guessData = null,
    timeout = false
  ) {

    if (
      roundDone &&
      !timeout
    ) {
      return
    }


    stopSpotify()

    setRoundDone(true)


    if (timeout) {

      setMessage(
        'Se acabó el tiempo.'
      )

    } else if (correct) {

      setMessage(
        '¡Correcto!'
      )
    }


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
                room.current_round,

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
                wrongCount
            }
          )


      if (error) {
        throw error
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


      if (correct) {

        setMessage(
          position > 0
            ? `¡Correcto! #${position} · +${awarded} pts`
            : `¡Correcto! +${awarded} pts`
        )
      }


      await Promise.all([

        loadAnswers(
          room.id,
          room.current_round,
          player.player_id
        ),

        loadPlayers(
          room.id
        )

      ])


    } catch (error) {

      console.error(error)

      setMessage(
        error.message ||
        'No se pudo registrar tu respuesta.'
      )
    }
  }


  /*
  =====================================
  RESET
  =====================================
  */

  function resetRound() {

    stopSpotify()


    setLevelIndex(0)

    setAttempts([])

    setWrongCount(0)

    setRoundDone(false)

    setRoundPoints(0)

    setCorrectPosition(0)

    setQuery('')

    setSelectedGuess(null)

    setSearchResults([])

    setMessage('')

    setTimeLeft(
      ROUND_SECONDS
    )

    setPreparationLeft(
      PREPARE_SECONDS
    )

    setRoundActive(false)

    setRoundExpired(false)

    setSpotifyReady(false)


    timeoutSubmittedRef.current =
      false


    hasPlayedCurrentSongRef.current =
      false
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


      return
    }


    const usable =
      songs.filter(
        item =>
          Boolean(
            item.spotify_id
          )
      )


    if (!usable.length) {

      setMessage(
        'No hay canciones disponibles.'
      )

      return
    }


    let candidates =
      usable.filter(
        item =>
          item.id !==
          room.current_song_id
      )


    if (!candidates.length) {

      candidates =
        usable
    }


    const nextSong =
      candidates[
        Math.floor(
          Math.random() *
          candidates.length
        )
      ]


    const startAt =
      new Date(
        Date.now() +
        PREPARE_SECONDS *
          1000
      )
        .toISOString()


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

          round_started_at:
            startAt

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
  DERIVADOS
  =====================================
  */

  const correctAnswers =
    answers
      .filter(
        item =>
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


  const everyoneFinished =
    players.length > 0 &&
    answers.length >=
      players.length


  const hostCanContinue =
    everyoneFinished ||
    roundExpired ||
    timeLeft <= 0


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

      <section className="room-game-wrap">

        <div className="game-final-card">

          <Trophy size={58} />

          <span className="room-eyebrow">
            Partida finalizada
          </span>

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


          <button
            className="primary"
            onClick={
              () =>
                navigate(
                  '/salas'
                )
            }
          >

            Volver a salas

          </button>

        </div>

      </section>
    )
  }


  /*
  =====================================
  CARGANDO
  =====================================
  */

  if (
    !room ||
    !song ||
    !player
  ) {

    return (

      <section className="room-game-wrap">

        <div className="notice">

          {message ||
            'Cargando partida...'}

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

    <section className="room-game-wrap">


      <div className="spotify-hidden-player">

        <div
          id="spotify-room-embed"
        />

      </div>


      <div className="room-game-top">

        <div>

          <span className="room-eyebrow">

            Sala {room.code}

          </span>

          <h2>

            Ronda {room.current_round}
            {' '}
            de
            {' '}
            {room.total_rounds}

          </h2>

        </div>


        <div className="room-score-mini">

          <Trophy size={18} />

          {
            players.find(
              item =>
                item.id ===
                player.player_id
            )?.score || 0
          }

          pts

        </div>

      </div>


      <div
        className={
          `room-round-timer ${
            timeLeft <= 10 &&
            roundActive
              ? 'danger'
              : ''
          }`
        }
      >

        <Clock3 size={22} />

        {preparationLeft > 0 ? (

          <>

            Preparando ronda
            {' '}
            {preparationLeft}...

          </>

        ) : (

          formatTime(
            timeLeft
          )

        )}

      </div>


      {preparationLeft > 0 &&
        !roundDone && (

        <div className="room-preparing-card">

          <LoaderCircle
            className="room-spin"
            size={34}
          />

          <strong>
            Preparando canción...
          </strong>

          <span>
            La ronda comenzará para todos al mismo tiempo.
          </span>

        </div>

      )}


      {!roundDone &&
        preparationLeft === 0 && (

        <>

          <div className="room-level-card">

            <span>
              NIVEL ACTUAL
            </span>

            <strong>
              {currentLevel.label}
            </strong>

            <small>

              {currentLevel.duration}
              s de canción

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
                      index ===
                      levelIndex
                        ? 'current'
                        : ''
                    } ${
                      index <
                      levelIndex
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
              {potentialPoints} pts
            </strong>

            <span>
              potenciales
            </span>


            {wrongCount > 0 && (

              <em>

                {wrongCount}
                {' '}
                {wrongCount === 1
                  ? 'fallo'
                  : 'fallos'}

                {' · '}

                −
                {wrongCount *
                  PENALTY_PER_MISTAKE}
                {' '}
                pts

              </em>

            )}

          </div>


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
              !roundActive
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


          <div className="guess-area">

            <div className="autocomplete">

              <div className="spotify-game-search">

                <Search size={20} />

                <input
                  value={query}
                  placeholder="Busca una canción..."
                  disabled={
                    !roundActive
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
                  !roundActive
                }
              >

                Adivinar

              </button>


              <button
                className="skip-inline-btn"
                onClick={skip}
                disabled={
                  !roundActive
                }
              >

                <SkipForward />

                Saltar

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
                size={31}
              />

              <span>
                ¡La pegaste!
              </span>


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

                  Fuiste
                  {' '}

                  <strong>
                    #{correctPosition}
                  </strong>

                  {' '}

                  en acertarla ·
                  {' '}

                  {getPositionMultiplier(
                    correctPosition
                  )}
                  %

                </div>

              )}

            </>

          ) : (

            <>

              <X size={31} />

              <span>

                {roundExpired
                  ? 'Se acabó el tiempo'
                  : 'No hubo puntos'}

              </span>

              <h2>
                {song.title}
              </h2>

              <p>
                {song.artist}
              </p>

            </>

          )}


          <div className="round-waiting">

            {answers.length}
            {' '}
            de
            {' '}
            {players.length}
            {' '}
            terminaron

          </div>


          {player.is_host ? (

            <button
              className="primary room-next-round-btn"
              disabled={
                !hostCanContinue
              }
              onClick={nextRound}
            >

              <ArrowRight />

              {
                room.current_round >=
                room.total_rounds

                  ? 'Ver resultados'

                  : hostCanContinue

                    ? 'Siguiente ronda'

                    : `Esperando jugadores (${answers.length}/${players.length})`
              }

            </button>

          ) : (

            <p className="muted">

              {hostCanContinue
                ? 'Esperando que el host continúe...'
                : 'Esperando a los demás jugadores...'}

            </p>

          )}

        </div>

      )}


      <div className="room-correct-list">

        <h3>
          ⚡ Acertaron esta ronda
        </h3>


        {!correctAnswers.length && (

          <p className="muted">

            Todavía nadie la ha adivinado.

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

                  {index === 0
                    ? '🥇'
                    : index === 1
                      ? '🥈'
                      : index === 2
                        ? '🥉'
                        : `#${index + 1}`}

                </span>


                <strong>

                  {answerPlayer
                    ?.player_name ||
                    'Jugador'}

                </strong>


                <b>

                  +{answer.points} pts

                </b>

              </div>
            )
          }
        )}

      </div>


      <div className="live-scoreboard">

        <h3>

          <Trophy size={19} />

          Marcador general

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

    </section>
  )
}