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
  ArrowLeft,
  Disc3,
  CircleHelp,
  X
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

const ANSWER_TIME_OPTIONS = [
  10,
  15,
  20,
  30
]

const GENRE_OPTIONS = [
  'Urbano / Reggaetón',
  'Rock / Alternativo',
  'Pop',
  'Salsa / Tropical',
  'Balada / Romántica',
  'Regional / Ranchera',
  'Bachata'
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
    answerSeconds,
    setAnswerSeconds
  ] = useState(10)

  const [
    selectedGenres,
    setSelectedGenres
  ] = useState([])

  const [
    genrePanelOpen,
    setGenrePanelOpen
  ] = useState(false)

  const [
    creatingRoom,
    setCreatingRoom
  ] = useState(false)


  const [joinName, setJoinName] =
    useState('')

  const [joinCode, setJoinCode] =
    useState('')

  const [
    joiningRoom,
    setJoiningRoom
  ] = useState(false)


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

  const [
    helpMode,
    setHelpMode
  ] = useState(null)


  function renderHowToModal() {
    if (!helpMode) {
      return null
    }


    const isOneNote =
      helpMode === 'one_note'


    return (

      <div
        onClick={
          () =>
            setHelpMode(null)
        }
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 700,
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

            <div>

              <small
                style={{
                  display: 'block',
                  opacity: 0.48,
                  marginBottom: 4
                }}
              >
                {isOneNote
                  ? 'EN UNA NOTA'
                  : 'MODO CLÁSICO'}
              </small>

              <h2 style={{ margin: 0 }}>
                Cómo jugar
              </h2>

            </div>


            <button
              type="button"
              onClick={
                () =>
                  setHelpMode(null)
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
            {isOneNote
              ? 'Una sola pantalla reproduce la canción. Todos pueden tocar Adivinar para entrar en la fila. Cuando llegue tu turno, busca y responde antes de que termine el tiempo. Cada acierto vale 1 punto.'
              : 'Cada jugador escucha desde su propio dispositivo. Empieza con un fragmento corto y trata de adivinar la canción. Si necesitas más pista, toca Escuchar más: se desbloquea el siguiente fragmento y se reproduce automáticamente. Mientras antes aciertes, más puntos ganas.'}
          </p>

        </div>

      </div>
    )
  }


  function chooseMode(mode) {
    setGameMode(
      current =>
        current === mode
          ? null
          : mode
    )

    setMessage('')
  }


  function changeMode() {
    setGameMode(null)
    setMessage('')
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

    setMessage('')
  }


  function selectAllGenres() {
    setSelectedGenres([])
    setMessage('')
  }


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

              genres:
                selectedGenres.length
                  ? selectedGenres
                  : null,

              allow_retries:
                gameMode === 'one_note'
                  ? allowRetries
                  : true,

              one_note_answer_seconds:
                gameMode === 'one_note'
                  ? answerSeconds
                  : 10,

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
          'id, spotify_id, genre'
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


    const allowedGenres =
      Array.isArray(
        createdRoom.genres
      )
        ? createdRoom.genres
        : []


    const available =
      (songData || [])
        .filter(
          item =>
            Boolean(
              item.spotify_id
            ) &&
            (
              !allowedGenres.length ||
              allowedGenres.includes(
                item.genre
              )
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

          one_note_turn_started_at:
            null,

          one_note_result:
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

        {renderHowToModal()}

        <div className="room-lobby-card">

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 7
            }}
          >

            <span className="room-eyebrow">

              {createdRoom.game_mode ===
              'one_note'
                ? 'EN UNA NOTA'
                : 'MODO CLÁSICO'}

            </span>


            <button
              type="button"
              onClick={
                () =>
                  setHelpMode(
                    createdRoom.game_mode
                  )
              }
              aria-label="Cómo jugar"
              title="Cómo jugar"
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.04)',
                color: 'inherit',
                opacity: 0.78,
                padding: 0,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer'
              }}
            >
              <CircleHelp size={16} />
            </button>

          </div>


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


            <span>
              {Array.isArray(createdRoom.genres) &&
              createdRoom.genres.length
                ? createdRoom.genres.join(' · ')
                : 'Todos los géneros'}
            </span>


            {createdRoom.game_mode ===
              'one_note' && (
              <>
                <span>
                  {createdRoom.allow_retries
                    ? 'Reintentos activados'
                    : 'Sin reintentos'}
                </span>

                <span>
                  {createdRoom.one_note_answer_seconds || 10}s para responder
                </span>
              </>
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


  return (
    <section className="rooms-wrap">

      {renderHowToModal()}

      <div className="rooms-heading">

        <h1>
          Juega con amigos
        </h1>

        <p>
          Elige cómo quieren jugar.
        </p>

      </div>


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


          <span
            role="button"
            tabIndex={0}
            aria-label="Cómo jugar modo clásico"
            title="Cómo jugar"
            onClick={
              event => {
                event.stopPropagation()
                setHelpMode('classic')
              }
            }
            onKeyDown={
              event => {
                if (
                  event.key === 'Enter' ||
                  event.key === ' '
                ) {
                  event.preventDefault()
                  event.stopPropagation()
                  setHelpMode('classic')
                }
              }
            }
            style={{
              marginTop: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              opacity: 0.62,
              fontSize: '.78rem'
            }}
          >
            <CircleHelp size={15} />
            Cómo jugar
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


          <span
            role="button"
            tabIndex={0}
            aria-label="Cómo jugar En una nota"
            title="Cómo jugar"
            onClick={
              event => {
                event.stopPropagation()
                setHelpMode('one_note')
              }
            }
            onKeyDown={
              event => {
                if (
                  event.key === 'Enter' ||
                  event.key === ' '
                ) {
                  event.preventDefault()
                  event.stopPropagation()
                  setHelpMode('one_note')
                }
              }
            }
            style={{
              marginTop: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              opacity: 0.62,
              fontSize: '.78rem'
            }}
          >
            <CircleHelp size={15} />
            Cómo jugar
          </span>

        </button>

      </div>


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



            <div className="room-field">

              <span>
                Géneros
              </span>


              <button
                type="button"
                className="room-change-mode"
                onClick={
                  () =>
                    setGenrePanelOpen(
                      current =>
                        !current
                    )
                }
              >

                <Disc3 size={17} />

                {selectedGenres.length
                  ? `${selectedGenres.length} seleccionados`
                  : 'Todos los géneros'}

              </button>


              {genrePanelOpen && (

                <div className="room-round-options">

                  <button
                    type="button"
                    className={
                      selectedGenres.length === 0
                        ? 'active'
                        : ''
                    }
                    onClick={
                      selectAllGenres
                    }
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
                            ? 'active'
                            : ''
                        }
                        onClick={
                          () =>
                            toggleGenre(
                              genre
                            )
                        }
                      >
                        {genre}
                      </button>

                    )
                  )}

                </div>

              )}


              <small className="muted">
                Puedes elegir uno o varios géneros.
              </small>

            </div>


            {gameMode ===
              'one_note' && (
              <>

                <div className="room-field">

                  <span>
                    Tiempo para responder
                  </span>


                  <div className="room-answer-time-options">

                    {ANSWER_TIME_OPTIONS.map(
                      option => (

                        <button
                          key={option}
                          type="button"
                          className={
                            answerSeconds ===
                            option
                              ? 'active'
                              : ''
                          }
                          onClick={
                            () =>
                              setAnswerSeconds(
                                option
                              )
                          }
                        >
                          {option}s
                        </button>

                      )
                    )}

                  </div>

                </div>


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

              </>
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