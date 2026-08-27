import {
  useEffect,
  useState
} from 'react'

import {
  useNavigate
} from 'react-router-dom'

import {
  Users,
  Music2,
  ArrowLeft
} from 'lucide-react'

import {
  supabase
} from '../lib/supabase'


const ROUND_OPTIONS = [
  5,
  10,
  15,
  20
]


function generateCode() {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  let result = ''

  for (
    let i = 0;
    i < 5;
    i += 1
  ) {
    result +=
      chars[
        Math.floor(
          Math.random() *
          chars.length
        )
      ]
  }

  return result
}


export default function RoomsPage() {
  const navigate =
    useNavigate()


  /*
  =====================================
  CREAR SALA
  =====================================
  */

  const [hostName, setHostName] =
    useState('')

  const [gameMode, setGameMode] =
    useState(null)

  const [totalRounds, setTotalRounds] =
    useState(5)

  const [
    allowRetries,
    setAllowRetries
  ] = useState(true)

  const [
    creatingRoom,
    setCreatingRoom
  ] = useState(false)


  /*
  =====================================
  UNIRSE
  =====================================
  */

  const [joinName, setJoinName] =
    useState('')

  const [joinCode, setJoinCode] =
    useState('')

  const [
    joiningRoom,
    setJoiningRoom
  ] = useState(false)


  /*
  =====================================
  LOBBY
  =====================================
  */

  const [
    createdRoom,
    setCreatedRoom
  ] = useState(null)

  const [
    lobbyPlayers,
    setLobbyPlayers
  ] = useState([])


  const [message, setMessage] =
    useState('')


  /*
  =====================================
  ELEGIR MODO
  =====================================
  */

  function chooseMode(mode) {
    setGameMode(mode)
    setMessage('')
  }


  function changeMode() {
    setGameMode(null)
    setMessage('')
  }


  /*
  =====================================
  CREAR SALA
  =====================================
  */

  async function createRoom() {
    const cleanName =
      hostName.trim()


    if (!gameMode) {
      setMessage(
        'Elige un modo de juego.'
      )

      return
    }


    if (!cleanName) {
      setMessage(
        'Escribe tu nombre.'
      )

      return
    }


    setCreatingRoom(true)
    setMessage('')


    try {
      let roomData = null


      for (
        let attempt = 0;
        attempt < 5;
        attempt += 1
      ) {
        const code =
          generateCode()


        const {
          data,
          error
        } =
          await supabase
            .from('rooms')
            .insert({
              code,

              host_name:
                cleanName,

              status:
                'waiting',

              total_rounds:
                totalRounds,

              current_round:
                0,

              game_mode:
                gameMode,

              allow_retries:
                gameMode === 'one_note'
                  ? allowRetries
                  : true,

              one_note_level:
                0,

              one_note_active_player_id:
                null,

              one_note_winner_player_id:
                null
            })
            .select()
            .single()


        if (!error) {
          roomData =
            data

          break
        }


        if (
          error.code !==
          '23505'
        ) {
          throw error
        }
      }


      if (!roomData) {
        throw new Error(
          'No pude generar un código de sala.'
        )
      }


      const {
        data: playerData,
        error: playerError
      } =
        await supabase
          .from('room_players')
          .insert({
            room_id:
              roomData.id,

            player_name:
              cleanName,

            score:
              0,

            is_host:
              true
          })
          .select()
          .single()


      if (playerError) {
        throw playerError
      }


      const sessionData = {
        room_id:
          roomData.id,

        player_id:
          playerData.id,

        player_name:
          playerData.player_name,

        is_host:
          true,

        game_mode:
          gameMode
      }


      sessionStorage.setItem(
        `daleplay-room-${roomData.code}`,
        JSON.stringify(
          sessionData
        )
      )


      setCreatedRoom(
        roomData
      )


    } catch (error) {
      console.error(error)

      setMessage(
        error.message ||
        'No se pudo crear la sala.'
      )

    } finally {
      setCreatingRoom(false)
    }
  }


  /*
  =====================================
  LOBBY REALTIME
  =====================================
  */

  useEffect(() => {
    if (
      !createdRoom?.id
    ) {
      return
    }


    loadLobbyPlayers(
      createdRoom.id
    )


    const channel =
      supabase
        .channel(
          `lobby-${createdRoom.id}`
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter:
              `room_id=eq.${createdRoom.id}`
          },
          () => {
            loadLobbyPlayers(
              createdRoom.id
            )
          }
        )

        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter:
              `id=eq.${createdRoom.id}`
          },
          payload => {
            const updated =
              payload.new


            setCreatedRoom(
              updated
            )


            if (
              updated.status ===
              'playing'
            ) {
              goToGame(
                updated
              )
            }
          }
        )

        .subscribe()


    return () => {
      supabase.removeChannel(
        channel
      )
    }
  }, [
    createdRoom?.id
  ])


  async function loadLobbyPlayers(
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
          'joined_at',
          {
            ascending: true
          }
        )


    if (error) {
      console.error(error)

      return
    }


    setLobbyPlayers(
      data || []
    )
  }


  /*
  =====================================
  UNIRSE
  =====================================
  */

  async function joinRoom() {
    const cleanName =
      joinName.trim()

    const cleanCode =
      joinCode
        .trim()
        .toUpperCase()


    if (
      !cleanName ||
      !cleanCode
    ) {
      setMessage(
        'Escribe tu nombre y el código.'
      )

      return
    }


    setJoiningRoom(true)
    setMessage('')


    try {
      const {
        data: roomData,
        error: roomError
      } =
        await supabase
          .from('rooms')
          .select('*')
          .eq(
            'code',
            cleanCode
          )
          .single()


      if (
        roomError ||
        !roomData
      ) {
        throw new Error(
          'No encontré esa sala.'
        )
      }


      if (
        roomData.status !==
        'waiting'
      ) {
        throw new Error(
          'La partida ya comenzó.'
        )
      }


      const {
        data: playerData,
        error: playerError
      } =
        await supabase
          .from('room_players')
          .insert({
            room_id:
              roomData.id,

            player_name:
              cleanName,

            score:
              0,

            is_host:
              false
          })
          .select()
          .single()


      if (playerError) {
        throw playerError
      }


      const sessionData = {
        room_id:
          roomData.id,

        player_id:
          playerData.id,

        player_name:
          playerData.player_name,

        is_host:
          false,

        game_mode:
          roomData.game_mode
      }


      sessionStorage.setItem(
        `daleplay-room-${roomData.code}`,
        JSON.stringify(
          sessionData
        )
      )


      setCreatedRoom(
        roomData
      )


    } catch (error) {
      console.error(error)

      setMessage(
        error.message ||
        'No se pudo entrar.'
      )

    } finally {
      setJoiningRoom(false)
    }
  }


  /*
  =====================================
  INICIAR PARTIDA
  =====================================
  */

  async function startGame() {
    if (!createdRoom) {
      return
    }


    if (
      lobbyPlayers.length < 2
    ) {
      setMessage(
        'Necesitas al menos 2 jugadores.'
      )

      return
    }


    const {
      data: songData,
      error: songsError
    } =
      await supabase
        .from('songs')
        .select(
          'id, spotify_id'
        )
        .eq(
          'active',
          true
        )


    if (songsError) {
      setMessage(
        songsError.message
      )

      return
    }


    const available =
      (songData || [])
        .filter(
          item =>
            Boolean(
              item.spotify_id
            )
        )


    if (!available.length) {
      setMessage(
        'No hay canciones disponibles.'
      )

      return
    }


    const firstSong =
      available[
        Math.floor(
          Math.random() *
          available.length
        )
      ]


    const {
      error
    } =
      await supabase
        .from('rooms')
        .update({
          status:
            'playing',

          current_round:
            1,

          current_song_id:
            firstSong.id,

          one_note_level:
            0,

          one_note_active_player_id:
            null,

          one_note_winner_player_id:
            null,

          round_started_at:
            new Date()
              .toISOString()
        })
        .eq(
          'id',
          createdRoom.id
        )


    if (error) {
      setMessage(
        error.message
      )
    }
  }


  function goToGame(roomData) {
    if (
      roomData.game_mode ===
      'one_note'
    ) {
      navigate(
        `/salas/${roomData.code}/en-una-nota`
      )

      return
    }


    navigate(
      `/salas/${roomData.code}/juego`
    )
  }


  /*
  =====================================
  LOBBY
  =====================================
  */

  if (
    createdRoom
  ) {
    const session =
      sessionStorage.getItem(
        `daleplay-room-${createdRoom.code}`
      )


    let currentPlayer =
      null


    try {
      currentPlayer =
        JSON.parse(
          session
        )
    } catch {
      currentPlayer =
        null
    }


    return (
      <section className="rooms-wrap">

        <div className="room-lobby-card">

          <span className="room-eyebrow">

            {createdRoom.game_mode ===
            'one_note'
              ? 'EN UNA NOTA'
              : 'MODO CLÁSICO'}

          </span>


          <h1>
            Sala {createdRoom.code}
          </h1>


          <p className="muted">
            Comparte este código con tus amigos.
          </p>


          <div className="room-code-box">
            {createdRoom.code}
          </div>


          <div className="room-settings-summary">

            <span>
              {createdRoom.total_rounds} rondas
            </span>


            {createdRoom.game_mode ===
              'one_note' && (

              <span>

                {createdRoom.allow_retries
                  ? 'Reintentos activados'
                  : 'Sin reintentos'}

              </span>

            )}

          </div>


          <div className="room-player-list">

            {lobbyPlayers.map(
              item => (

                <div
                  key={item.id}
                  className="room-player-row"
                >

                  <strong>
                    {item.player_name}
                  </strong>


                  {item.is_host && (
                    <span>
                      Host
                    </span>
                  )}

                </div>

              )
            )}

          </div>


          {currentPlayer?.is_host ? (

            <button
              className="primary"
              onClick={
                startGame
              }
              disabled={
                lobbyPlayers.length < 2
              }
            >
              Iniciar partida
            </button>

          ) : (

            <p className="muted">
              Esperando al host...
            </p>

          )}


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
  CREAR / UNIRSE
  =====================================
  */

  return (
    <section className="rooms-wrap">

      <div className="rooms-heading">

        <h1>
          Juega con amigos
        </h1>

        <p>
          Elige cómo quieren jugar.
        </p>

      </div>


      {/*
      =====================================
      PASO 1: ELEGIR MODO
      =====================================
      */}

      <div className="room-mode-selector">

        <button
          type="button"
          className={
            `room-mode-card ${
              gameMode === 'classic'
                ? 'active'
                : ''
            }`
          }
          onClick={
            () =>
              chooseMode(
                'classic'
              )
          }
        >

          <Users size={26} />

          <strong>
            Modo clásico
          </strong>

          <span>
            Cada quien escucha y responde desde su dispositivo.
          </span>

        </button>


        <button
          type="button"
          className={
            `room-mode-card ${
              gameMode === 'one_note'
                ? 'active'
                : ''
            }`
          }
          onClick={
            () =>
              chooseMode(
                'one_note'
              )
          }
        >

          <Music2 size={26} />

          <strong>
            En una nota
          </strong>

          <span>
            Una sola pantalla reproduce. Todos compiten por responder.
          </span>

        </button>

      </div>


      {/*
      =====================================
      PASO 2: PERSONALIZAR
      =====================================
      */}

      {gameMode && (

        <div className="room-customize-section">


          <div className="room-customize-heading">

            <div>

              <span>
                {gameMode === 'one_note'
                  ? 'EN UNA NOTA'
                  : 'MODO CLÁSICO'}
              </span>

              <h2>
                Personaliza tu sala
              </h2>

            </div>


            <button
              type="button"
              className="room-change-mode"
              onClick={
                changeMode
              }
            >

              <ArrowLeft size={16} />

              Cambiar modo

            </button>

          </div>


          <div className="room-create-card room-create-custom">

            <label className="room-field">

              <span>
                Tu nombre
              </span>


              <input
                value={hostName}
                placeholder="Escribe tu nombre"
                onChange={
                  event =>
                    setHostName(
                      event.target.value
                    )
                }
              />

            </label>


            <div className="room-field">

              <span>
                Cantidad de rondas
              </span>


              <div className="room-round-options">

                {ROUND_OPTIONS.map(
                  option => (

                    <button
                      key={option}
                      type="button"
                      className={
                        totalRounds ===
                        option
                          ? 'active'
                          : ''
                      }
                      onClick={
                        () =>
                          setTotalRounds(
                            option
                          )
                      }
                    >

                      {option}

                    </button>

                  )
                )}

              </div>

            </div>


            {gameMode ===
              'one_note' && (

              <div className="room-retry-setting">

                <div>

                  <strong>
                    Permitir reintentos
                  </strong>


                  <span>

                    {allowRetries
                      ? 'Pueden volver a intentar en la siguiente escucha.'
                      : 'Si fallan, quedan fuera de esa canción.'}

                  </span>

                </div>


                <button
                  type="button"
                  className={
                    `room-switch ${
                      allowRetries
                        ? 'on'
                        : ''
                    }`
                  }
                  onClick={
                    () =>
                      setAllowRetries(
                        current =>
                          !current
                      )
                  }
                  aria-label="Permitir reintentos"
                >

                  <span />

                </button>

              </div>

            )}


            <button
              className="primary room-create-main-btn"
              onClick={
                createRoom
              }
              disabled={
                creatingRoom
              }
            >

              {creatingRoom
                ? 'Creando...'
                : 'Crear sala'}

            </button>

          </div>

        </div>

      )}


      {/*
      =====================================
      ENTRAR A SALA
      =====================================
      */}

      <div className="room-join-section">

        <div className="room-join-heading">

          <span>
            ¿Ya tienes código?
          </span>

          <h2>
            Entrar a una sala
          </h2>

        </div>


        <div className="room-join-card room-join-inline">

          <input
            value={joinName}
            placeholder="Tu nombre"
            onChange={
              event =>
                setJoinName(
                  event.target.value
                )
            }
          />


          <input
            value={joinCode}
            placeholder="Código"
            maxLength={5}
            onChange={
              event =>
                setJoinCode(
                  event.target.value
                    .toUpperCase()
                )
            }
          />


          <button
            className="secondary"
            onClick={
              joinRoom
            }
            disabled={
              joiningRoom
            }
          >

            {joiningRoom
              ? 'Entrando...'
              : 'Entrar'}

          </button>

        </div>

      </div>


      {message && (

        <div className="message">
          {message}
        </div>

      )}

    </section>
  )
}