# Sesiones grabadas del motor

Los `.wav` de este directorio **no están en el repositorio**: son 4 canales a
24 bits y 48 kHz, unos 220 MB cada uno. Aquí quedan sus nombres para poder
referenciarlos, que es lo que hace `web/build_media.sh` al derivar el audio de
la web.

A diferencia del corpus, aquí no hay archivos vacíos con esos nombres: los
reales ocupan esas mismas rutas en la máquina donde se grabaron, y un
placeholder los habría pisado.

| Archivo | Duración | Formato | Composiciones que salen de ahí |
|---|---|---|---|
| `eth_sonification_20260922_111301.wav` | 415 s | 4 ch · 24 bit · 48 kHz | `lecho` 95–155 s · `enjambre` 160–220 s · `ascenso` 285–345 s |
| `eth_sonification_20260922_112003.wav` | 397 s | 4 ch · 24 bit · 48 kHz | `meseta` 165–225 s · `retorno` 260–320 s |

Los cortes no se eligieron a oído. Se midió RMS, centroide espectral y flujo
segundo a segundo sobre las dos sesiones, y cada composición aísla un
comportamiento distinto del motor — el flujo más alto de ambas está en
`enjambre` (0.190), y en `ascenso` el centroide sube de 666 a 3399 Hz mientras
el nivel cae. Las cifras y los tiempos exactos están en `web/build_media.sh`.

## Cómo se graban

El sistema de grabación multicanal vive en `11_recording_system.scd` y escribe
aquí mientras el motor corre. El nombre lo pone él:
`eth_sonification_AAAAMMDD_HHMMSS.wav`.

## Cómo se regenera el audio de la web

Con los `.wav` presentes:

```bash
cd web && ./build_media.sh --force
```

Sin ellos el script avisa y omite esas pistas en lugar de fallar, para que el
resto de los medios se pueda construir igual.
