# Archivos vacíos, a propósito

Los `.flac` de este directorio y los `.wav` de `recordings/` **están vacíos**.
No es una descarga corrupta: son marcadores de posición generados por
`tools/make_placeholders.py` para que las rutas que el motor espera existan y
puedan referenciarse, sin arrastrar 725 archivos de audio al
repositorio.

## Qué falta y de dónde sale

| Ruta | Qué es | Cómo se obtiene |
|---|---|---|
| `corpus/audible/` | 261 clips a 48 kHz | `python3 tools/build_corpus.py` |
| `corpus/expanded/` | 69 clips expandidos ×8 | idem |
| `corpus/grains/` | 116 granos de 2 s | idem |
| `corpus/stems/` | 279 stems por dominio | idem |
| `recordings/*.wav` | 2 sesiones del motor | se graban con `11_recording_system.scd` |

El original del corpus son grabaciones AudioMoth a 384 kHz de La Luna /
Planeta Rica; `corpus/manifest.json` —que sí está completo— lleva los metadatos
de los 261 clips y es lo que el motor lee para decidir qué suena cada día.

## Las dos sesiones grabadas

- `recordings/eth_sonification_20260922_111301.wav` — 415 s · 4 canales · 24 bit / 48 kHz  \n  composiciones: lecho (95-155 s) · enjambre (160-220 s) · ascenso (285-345 s)
- `recordings/eth_sonification_20260922_112003.wav` — 397 s · 4 canales · 24 bit / 48 kHz  \n  composiciones: meseta (165-225 s) · retorno (260-320 s)

De ahí salen las cinco composiciones de `web/`, cortadas donde el análisis de
RMS, centroide y flujo mostró comportamientos distintos del motor. Los cortes
exactos están en `web/build_media.sh`.

## Regenerar este árbol

```bash
python3 tools/make_placeholders.py          # crea lo que falte
python3 tools/make_placeholders.py --check  # sólo informa
```
