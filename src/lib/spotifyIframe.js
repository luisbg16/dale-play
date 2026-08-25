let spotifyApi = null
let spotifyPromise = null


export function loadSpotifyIframeApi() {

  /*
  Si ya guardamos la API,
  devolverla inmediatamente.
  */
  if (spotifyApi) {
    return Promise.resolve(
      spotifyApi
    )
  }


  /*
  Si ya hay una carga en proceso,
  reutilizarla.
  */
  if (spotifyPromise) {
    return spotifyPromise
  }


  spotifyPromise =
    new Promise(
      (resolve, reject) => {

        /*
        IMPORTANTE:

        Si existe un script viejo de Spotify
        pero nosotros no tenemos guardada
        la API, lo eliminamos.

        Esto evita quedarse eternamente
        en "Preparando..."
        */
        const oldScripts =
          document.querySelectorAll(
            'script[src*="open.spotify.com/embed/iframe-api"]'
          )


        oldScripts.forEach(
          script => {
            script.remove()
          }
        )


        window.onSpotifyIframeApiReady =
          IFrameAPI => {

            spotifyApi =
              IFrameAPI

            window.__dalePlaySpotifyApi =
              IFrameAPI

            resolve(
              IFrameAPI
            )
          }


        /*
        Por si ya fue guardada anteriormente.
        */
        if (
          window.__dalePlaySpotifyApi
        ) {

          spotifyApi =
            window.__dalePlaySpotifyApi

          resolve(
            spotifyApi
          )

          return
        }


        const script =
          document.createElement(
            'script'
          )


        script.src =
          'https://open.spotify.com/embed/iframe-api/v1'

        script.async =
          true

        script.dataset.spotifyIframeApi =
          'true'


        script.onerror =
          () => {

            spotifyPromise =
              null

            reject(
              new Error(
                'No se pudo cargar Spotify.'
              )
            )
          }


        document.body.appendChild(
          script
        )
      }
    )


  return spotifyPromise
}