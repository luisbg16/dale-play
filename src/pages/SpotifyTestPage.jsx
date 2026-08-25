import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  Play,
  Pause
} from 'lucide-react'


const TEST_TRACK_ID =
  '0VjIjW4GlUZAMYd2vXMi3b'


const TEST_LEVELS = [
  {
    label: 'Imposible',
    seconds: 1
  },
  {
    label: 'Experto',
    seconds: 2
  },
  {
    label: 'Difícil',
    seconds: 5
  },
  {
    label: 'Media',
    seconds: 10
  },
  {
    label: 'Fácil',
    seconds: 15
  }
]


export default function SpotifyTestPage() {

  const controllerRef =
    useRef(null)

  const fallbackTimerRef =
    useRef(null)

  const targetStopRef =
    useRef(null)

  const startedPositionRef =
    useRef(null)

  const stoppingRef =
    useRef(false)

  const [ready, setReady] =
    useState(false)

  const [playing, setPlaying] =
    useState(false)

  const [message, setMessage] =
    useState(
      'Cargando reproductor...'
    )

  const [position, setPosition] =
    useState(0)


  useEffect(() => {

    let script =
      document.querySelector(
        'script[data-spotify-iframe-api]'
      )


    window.onSpotifyIframeApiReady =
      (IFrameAPI) => {

        const element =
          document.getElementById(
            'spotify-test-embed'
          )


        if (!element) {
          return
        }


        const options = {
          width: '100%',
          height: 152,

          uri:
            `spotify:track:${TEST_TRACK_ID}`
        }


        IFrameAPI.createController(
          element,
          options,
          (controller) => {

            controllerRef.current =
              controller


            /*
            ==============================
            READY
            ==============================
            */

            controller.addListener(
              'ready',
              () => {

                setReady(true)

                setMessage(
                  'Spotify listo. Probemos los nuevos tiempos.'
                )
              }
            )


            /*
            ==============================
            PLAYBACK STARTED
            ==============================
            */

            controller.addListener(
              'playback_started',
              () => {

                setPlaying(true)

                setMessage(
                  'Audio reproduciéndose...'
                )
              }
            )


            /*
            ==============================
            CONTROL REAL DE POSICIÓN
            ==============================
            */

            controller.addListener(
              'playback_update',
              (event) => {

                const data =
                  event?.data

                if (!data) {
                  return
                }


                const currentPosition =
                  Number(
                    data.position || 0
                  )


                setPosition(
                  currentPosition
                )


                if (
                  data.isPaused
                ) {

                  setPlaying(false)
                }


                /*
                Guardamos la posición
                exacta desde donde Spotify
                realmente comenzó.
                */

                if (
                  startedPositionRef.current === null &&
                  !data.isPaused
                ) {

                  startedPositionRef.current =
                    currentPosition
                }


                if (
                  targetStopRef.current === null ||
                  startedPositionRef.current === null ||
                  stoppingRef.current
                ) {

                  return
                }


                const played =
                  currentPosition -
                  startedPositionRef.current


                /*
                targetStopRef se guarda
                en milisegundos.
                */

                if (
                  played >=
                  targetStopRef.current
                ) {

                  stoppingRef.current =
                    true

                  controller.pause()

                  clearTimeout(
                    fallbackTimerRef.current
                  )

                  targetStopRef.current =
                    null

                  startedPositionRef.current =
                    null

                  setPlaying(false)

                  setMessage(
                    'Fragmento terminado.'
                  )


                  setTimeout(
                    () => {

                      stoppingRef.current =
                        false

                    },
                    250
                  )
                }
              }
            )
          }
        )
      }


    if (!script) {

      script =
        document.createElement(
          'script'
        )

      script.src =
        'https://open.spotify.com/embed/iframe-api/v1'

      script.async =
        true

      script.dataset.spotifyIframeApi =
        'true'

      document.body.appendChild(
        script
      )
    }


    return () => {

      clearTimeout(
        fallbackTimerRef.current
      )

      if (
        controllerRef.current
      ) {

        controllerRef.current.pause()
      }
    }

  }, [])


  /*
  =====================================
  PARAR
  =====================================
  */

  function stopPlayback() {

    clearTimeout(
      fallbackTimerRef.current
    )

    targetStopRef.current =
      null

    startedPositionRef.current =
      null

    stoppingRef.current =
      false


    controllerRef.current
      ?.pause()


    setPlaying(false)

    setMessage(
      'Audio pausado.'
    )
  }


  /*
  =====================================
  REPRODUCIR FRAGMENTO
  =====================================
  */

  function playFragment(
    seconds
  ) {

    const controller =
      controllerRef.current


    if (
      !controller ||
      !ready
    ) {

      setMessage(
        'Spotify todavía no está listo.'
      )

      return
    }


    clearTimeout(
      fallbackTimerRef.current
    )


    stoppingRef.current =
      false

    startedPositionRef.current =
      null

    targetStopRef.current =
      seconds * 1000


    setMessage(
      `Preparando ${seconds} segundos...`
    )


    /*
    Reinicia la canción.
    */

    controller.restart()


    /*
    Inicia reproducción.
    */

    controller.play()


    /*
    Respaldo extra.

    Si por algún motivo Spotify
    no manda suficientes playback_update,
    este timer fuerza el pause.

    Le damos un pequeño margen.
    */

    fallbackTimerRef.current =
      setTimeout(
        () => {

          if (
            targetStopRef.current !==
            null
          ) {

            controller.pause()

            targetStopRef.current =
              null

            startedPositionRef.current =
              null

            setPlaying(false)

            setMessage(
              'Fragmento terminado.'
            )
          }

        },
        (
          seconds * 1000
        ) + 1200
      )
  }


  return (

    <section
      style={{
        width:
          'min(760px, calc(100% - 32px))',

        margin:
          '40px auto',

        textAlign:
          'center'
      }}
    >

      <h1>

        Prueba Spotify Embed

      </h1>


      <p
        style={{
          opacity: 0.7
        }}
      >

        Blinding Lights — The Weeknd

      </p>


      <div
        style={{
          margin:
            '28px 0'
        }}
      >

        <div
          id="spotify-test-embed"
        />

      </div>


      <div
        style={{
          display:
            'flex',

          flexWrap:
            'wrap',

          justifyContent:
            'center',

          gap:
            '10px'
        }}
      >

        {TEST_LEVELS.map(
          level => (

            <button
              key={
                level.label
              }
              className="primary"
              disabled={!ready}
              onClick={
                () =>
                  playFragment(
                    level.seconds
                  )
              }
            >

              <Play
                size={18}
              />

              {level.seconds}s

            </button>

          )
        )}


        <button
          onClick={
            stopPlayback
          }
        >

          <Pause
            size={18}
          />

          Pausar

        </button>

      </div>


      <div
        className="message"
        style={{
          marginTop:
            '25px'
        }}
      >

        {message}

      </div>


      <div
        style={{
          marginTop:
            '10px',

          opacity:
            0.55,

          fontSize:
            '12px'
        }}
      >

        Posición Spotify:
        {' '}
        {position}

      </div>


      <div
        style={{
          marginTop:
            '28px',

          padding:
            '18px',

          border:
            '1px solid #292930',

          borderRadius:
            '16px',

          textAlign:
            'left'
        }}
      >

        <strong>
          Tiempos propuestos para Dale Play
        </strong>

        <p>
          Imposible: 1 segundo
        </p>

        <p>
          Experto: 2 segundos
        </p>

        <p>
          Difícil: 5 segundos
        </p>

        <p>
          Media: 10 segundos
        </p>

        <p>
          Fácil: 15 segundos
        </p>

      </div>

    </section>
  )
}